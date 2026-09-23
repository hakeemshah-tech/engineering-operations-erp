const express = require('express');
const jwt = require('jsonwebtoken');
const SystemSettings = require('../models/SystemSettings');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const { validateAllowListEntry, ipMatchesAny } = require('../utils/networkMatch');

const PO_TYPES = ['material', 'manpower', 'subcontracting', 'machine_rental', 'other'];
const router = express.Router();

// Auth middleware
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Check if user is admin or manager
const isAdminOrManager = (roles) => roles.includes('admin') || roles.includes('manager');

// Get system settings (public for read, restricted for write)
router.get('/', auth, async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update system settings (inventory = admin/manager; accounts = admin/manager/account_manager)
router.put('/', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    const canEditInventory = isAdminOrManager(roles);
    const canEditAccounts = isAdminOrManager(roles) || roles.includes('account_manager');

    const settings = await SystemSettings.getSettings();

    // Inventory block
    if (req.body.inventory !== undefined) {
      if (!canEditInventory) {
        return res.status(403).json({ message: 'Only admins and managers can update inventory settings.' });
      }
      if (typeof req.body.inventory.storeCreationEnabled === 'boolean') {
        settings.inventory.storeCreationEnabled = req.body.inventory.storeCreationEnabled;
      }
    }

    // Accounts block
    if (req.body.accounts !== undefined) {
      if (!canEditAccounts) {
        return res.status(403).json({ message: 'Accounts settings require admin/manager/account_manager.' });
      }
      const a = req.body.accounts;
      const current = settings.accounts || {};
      const numField = (key, min, max) => {
        if (a[key] === undefined) return;
        const n = Number(a[key]);
        if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
          throw Object.assign(new Error(`Invalid value for ${key}`), { status: 400 });
        }
        current[key] = n;
      };
      numField('price3WayTolerancePct', 0, 100);
      numField('qty3WayToleranceAbs', 0);
      numField('vat3WayTolerancePct', 0, 100);
      numField('otWeekdayMultiplier', 1);
      numField('otRestDayMultiplier', 1);
      numField('workingHoursPerDay', 1, 24);

      // PO type → expense-ledger code mapping. Each value is a ChartOfAccounts
      // code (or '' to clear). Validate the supplied codes exist and are active
      // before persisting so PO creation never auto-selects a dead ledger.
      if (a.poTypeAccountMap !== undefined) {
        if (typeof a.poTypeAccountMap !== 'object' || a.poTypeAccountMap === null) {
          throw Object.assign(new Error('poTypeAccountMap must be an object'), { status: 400 });
        }
        const incoming = {};
        for (const key of PO_TYPES) {
          if (a.poTypeAccountMap[key] === undefined) continue;
          const code = String(a.poTypeAccountMap[key] || '').trim().toUpperCase();
          incoming[key] = code;
        }
        const codesToCheck = [...new Set(Object.values(incoming).filter(Boolean))];
        if (codesToCheck.length > 0) {
          const found = await ChartOfAccounts.find({ code: { $in: codesToCheck }, isActive: true }).select('code').lean();
          const valid = new Set(found.map(d => d.code));
          const missing = codesToCheck.filter(c => !valid.has(c));
          if (missing.length > 0) {
            throw Object.assign(new Error(`Unknown or inactive account code(s): ${missing.join(', ')}`), { status: 400 });
          }
        }
        const currentMap = (current.poTypeAccountMap && current.poTypeAccountMap.toObject)
          ? current.poTypeAccountMap.toObject()
          : { ...(current.poTypeAccountMap || {}) };
        current.poTypeAccountMap = { ...currentMap, ...incoming };
        // Nested-path assignment - mark modified so Mongoose reliably persists it.
        settings.markModified('accounts.poTypeAccountMap');
      }

      settings.accounts = current;
    }

    // Attendance block - admin/manager only.
    if (req.body.attendance !== undefined) {
      if (!isAdminOrManager(roles)) {
        return res.status(403).json({ message: 'Only admins and managers can update attendance settings.' });
      }
      const a = req.body.attendance;
      const current = settings.attendance || {};

      if (a.allowedOfficeNetworks !== undefined) {
        if (!Array.isArray(a.allowedOfficeNetworks)) {
          return res.status(400).json({ message: 'allowedOfficeNetworks must be an array of IPs/CIDRs.' });
        }
        const entries = a.allowedOfficeNetworks.map(e => String(e || '').trim()).filter(Boolean);
        const badEntry = entries.map(validateAllowListEntry).find(err => err !== null);
        if (badEntry) {
          return res.status(400).json({ message: `Invalid office network entry: ${badEntry}` });
        }
        current.allowedOfficeNetworks = entries;
      }

      // Remote/WFH allowlist - structured entries with optional label + userId
      if (a.allowedRemoteNetworks !== undefined) {
        if (!Array.isArray(a.allowedRemoteNetworks)) {
          return res.status(400).json({ message: 'allowedRemoteNetworks must be an array.' });
        }
        const cleaned = [];
        for (const raw of a.allowedRemoteNetworks) {
          if (!raw || typeof raw !== 'object') continue;
          const cidr = String(raw.cidr || '').trim();
          if (!cidr) continue;
          const err = validateAllowListEntry(cidr);
          if (err) return res.status(400).json({ message: `Invalid remote network entry: ${err}` });
          cleaned.push({
            cidr,
            label:  String(raw.label || '').trim().slice(0, 80),
            userId: raw.userId || null,
            addedAt: raw.addedAt ? new Date(raw.addedAt) : new Date(),
            addedBy: req.user.userId
          });
        }
        current.allowedRemoteNetworks = cleaned;
      }

      // User exemptions
      if (a.ipLockExemptUserIds !== undefined) {
        if (!Array.isArray(a.ipLockExemptUserIds)) {
          return res.status(400).json({ message: 'ipLockExemptUserIds must be an array of user IDs.' });
        }
        current.ipLockExemptUserIds = a.ipLockExemptUserIds.filter(Boolean);
      }

      // Master switch - explicit safety guard: cannot turn ON if no networks
      // and no exempt users are configured (saves the org from a hard lockout).
      if (typeof a.ipLockEnabled === 'boolean') {
        if (a.ipLockEnabled === true) {
          const officeCount = (current.allowedOfficeNetworks || []).length;
          const remoteCount = (current.allowedRemoteNetworks || []).length;
          const exemptCount = (current.ipLockExemptUserIds || []).length;
          if (officeCount === 0 && remoteCount === 0 && exemptCount === 0) {
            return res.status(400).json({
              code: 'IP_LOCK_EMPTY',
              message: 'Cannot enable IP Lock with no allowed networks and no exempt users. Add at least one entry first to avoid blocking the entire workforce.'
            });
          }
        }
        current.ipLockEnabled = a.ipLockEnabled;
      }

      if (typeof a.selfieRequired === 'boolean') current.selfieRequired = a.selfieRequired;
      if (a.selfieMaxBytes !== undefined) {
        const n = Number(a.selfieMaxBytes);
        if (!Number.isFinite(n) || n < 1024 || n > 5 * 1024 * 1024) {
          return res.status(400).json({ message: 'selfieMaxBytes must be between 1KB and 5MB.' });
        }
        current.selfieMaxBytes = n;
      }
      if (a.standardWorkdayHours !== undefined) {
        const n = Number(a.standardWorkdayHours);
        if (!Number.isFinite(n) || n < 1 || n > 24) {
          return res.status(400).json({ message: 'standardWorkdayHours must be between 1 and 24.' });
        }
        current.standardWorkdayHours = n;
      }
      if (a.selfieRetentionDays !== undefined) {
        const n = Number(a.selfieRetentionDays);
        if (!Number.isFinite(n) || n < 7 || n > 3650) {
          return res.status(400).json({ message: 'selfieRetentionDays must be between 7 and 3650.' });
        }
        current.selfieRetentionDays = Math.floor(n);
      }
      if (typeof a.selfieAutoCleanupEnabled === 'boolean') {
        current.selfieAutoCleanupEnabled = a.selfieAutoCleanupEnabled;
      }

      // ---- Lunch / break-skipped controls (Attendance v3) ----
      if (typeof a.autoDeductLunch === 'boolean')   current.autoDeductLunch = a.autoDeductLunch;
      if (typeof a.flagBreakSkipped === 'boolean')  current.flagBreakSkipped = a.flagBreakSkipped;
      if (a.lunchDeductionMinutes !== undefined) {
        const n = Number(a.lunchDeductionMinutes);
        if (!Number.isFinite(n) || n < 0 || n > 180) {
          return res.status(400).json({ message: 'lunchDeductionMinutes must be 0..180.' });
        }
        current.lunchDeductionMinutes = Math.round(n);
      }
      if (a.lunchDeductionThresholdHours !== undefined) {
        const n = Number(a.lunchDeductionThresholdHours);
        if (!Number.isFinite(n) || n < 1 || n > 24) {
          return res.status(400).json({ message: 'lunchDeductionThresholdHours must be 1..24.' });
        }
        current.lunchDeductionThresholdHours = n;
      }
      if (a.breakSkippedThresholdHours !== undefined) {
        const n = Number(a.breakSkippedThresholdHours);
        if (!Number.isFinite(n) || n < 1 || n > 24) {
          return res.status(400).json({ message: 'breakSkippedThresholdHours must be 1..24.' });
        }
        current.breakSkippedThresholdHours = n;
      }

      // ---- Manual GPS acquire escape hatches (Attendance v3) ----
      if (typeof a.allowApproximatePunch === 'boolean')   current.allowApproximatePunch = a.allowApproximatePunch;
      if (typeof a.ipLockSatisfiesGeofence === 'boolean') current.ipLockSatisfiesGeofence = a.ipLockSatisfiesGeofence;
      if (a.maxPunchAccuracyMeters !== undefined) {
        const n = Number(a.maxPunchAccuracyMeters);
        if (!Number.isFinite(n) || n < 50 || n > 5000) {
          return res.status(400).json({ message: 'maxPunchAccuracyMeters must be 50..5000.' });
        }
        current.maxPunchAccuracyMeters = Math.round(n);
      }

      // ---- Attendance v3: status engine toggles + schedule cards ----
      const boolField = (k) => {
        if (typeof a[k] === 'boolean') current[k] = a[k];
      };
      boolField('autoStatusEnabled');
      boolField('blockPunchOnHoliday');
      boolField('blockPunchOnWeekend');
      boolField('enforcePunchWindow');
      boolField('enforceGeofence');
      boolField('autoClassifyLate');
      boolField('integrateLeaveRequests');

      if (a.endOfDayCutoff !== undefined) {
        const v = String(a.endOfDayCutoff || '');
        if (!/^\d{1,2}:\d{2}$/.test(v)) {
          return res.status(400).json({ message: 'endOfDayCutoff must be "HH:MM".' });
        }
        const [h, m] = v.split(':').map(Number);
        if (h < 0 || h > 23 || m < 0 || m > 59) {
          return res.status(400).json({ message: 'endOfDayCutoff out of range.' });
        }
        current.endOfDayCutoff = v;
      }

      const validateSchedule = (label, sched) => {
        if (!sched || typeof sched !== 'object') return `${label} must be an object.`;
        if (sched.workdays !== undefined) {
          if (!Array.isArray(sched.workdays)) return `${label}.workdays must be an array.`;
          for (const d of sched.workdays) {
            if (!Number.isInteger(d) || d < 0 || d > 6) {
              return `${label}.workdays must contain integers 0..6 (Sun..Sat).`;
            }
          }
        }
        const timeFields = ['startTime', 'endTime', 'earliestPunchIn', 'latestPunchOut'];
        for (const f of timeFields) {
          if (sched[f] !== undefined) {
            const v = String(sched[f] || '');
            if (!/^\d{1,2}:\d{2}$/.test(v)) return `${label}.${f} must be "HH:MM".`;
            const [h, m] = v.split(':').map(Number);
            if (h < 0 || h > 23 || m < 0 || m > 59) return `${label}.${f} out of range.`;
          }
        }
        if (sched.graceMinutes !== undefined) {
          const n = Number(sched.graceMinutes);
          if (!Number.isFinite(n) || n < 0 || n > 120) {
            return `${label}.graceMinutes must be 0..120.`;
          }
        }
        return null;
      };

      const mergeSchedule = (target, incoming) => {
        const fields = ['workdays', 'startTime', 'endTime', 'graceMinutes', 'earliestPunchIn', 'latestPunchOut'];
        const next = { ...(target || {}) };
        for (const f of fields) {
          if (incoming[f] !== undefined) next[f] = incoming[f];
        }
        return next;
      };

      if (a.office !== undefined) {
        const err = validateSchedule('office', a.office);
        if (err) return res.status(400).json({ message: err });
        current.office = mergeSchedule(current.office, a.office);
      }
      if (a.site !== undefined) {
        const err = validateSchedule('site', a.site);
        if (err) return res.status(400).json({ message: err });
        current.site = mergeSchedule(current.site, a.site);
      }

      settings.attendance = current;
    }

    // ---- Sync standardWorkdayHours ↔ workingHoursPerDay ----
    // Attendance OT math and payroll OT math read different field names for
    // the same concept ("what counts as a full day?"). Mirror writes here so
    // updating one always updates the other - admins never have to remember
    // to keep two numbers in step. Whichever side the caller touched wins
    // when both are sent in the same PUT.
    try {
      const attTouched = req.body.attendance && req.body.attendance.standardWorkdayHours !== undefined;
      const accTouched = req.body.accounts    && req.body.accounts.workingHoursPerDay   !== undefined;
      if (attTouched && !accTouched && settings.attendance?.standardWorkdayHours !== undefined) {
        if (!settings.accounts) settings.accounts = {};
        settings.accounts.workingHoursPerDay = settings.attendance.standardWorkdayHours;
      } else if (accTouched && !attTouched && settings.accounts?.workingHoursPerDay !== undefined) {
        if (!settings.attendance) settings.attendance = {};
        settings.attendance.standardWorkdayHours = settings.accounts.workingHoursPerDay;
      }
    } catch (err) {
      console.warn('[settings.sync] workday-cap mirror failed:', err.message);
    }

    settings.updatedBy = req.user.userId;
    await settings.save();

    // Invalidate the settings cache so the next compute picks up the change immediately
    try { require('../utils/accounts/settingsProvider').invalidateSettingsCache(); } catch {}

    res.json(settings);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Return the caller's apparent public IP. Used by the Settings UI's
// "What's my current IP?" helper so an admin can one-click add the network
// they're sitting on. Also returns whether the current draft (or saved)
// allowlist would let that IP through - for the "Test this entry" preview.
router.get('/my-ip', auth, async (req, res) => {
  try {
    const ip = req.ip;
    res.json({
      ip,
      // Helpful so the UI can surface CIDR suggestions:
      isIpv4: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip || '')
    });
  } catch (err) {
    console.error('Error returning my-ip:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Test whether a given IP (or req.ip if omitted) would pass the SAVED allowlist.
// Lets the admin verify *before* enabling that their config behaves as expected.
router.get('/attendance/test-ip', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!isAdminOrManager(roles)) {
      return res.status(403).json({ message: 'Only admins and managers can test the IP allowlist.' });
    }
    const ip = (req.query.ip && String(req.query.ip).trim()) || req.ip;
    const settings = await SystemSettings.getSettings();
    const a = (settings.attendance && settings.attendance.toObject) ? settings.attendance.toObject() : (settings.attendance || {});
    const office = Array.isArray(a.allowedOfficeNetworks) ? a.allowedOfficeNetworks : [];
    const remote = Array.isArray(a.allowedRemoteNetworks) ? a.allowedRemoteNetworks.map(r => r.cidr).filter(Boolean) : [];
    const combined = [...office, ...remote];
    const matched = ipMatchesAny(ip, combined);
    res.json({
      ip,
      ipLockEnabled: a.ipLockEnabled === true,
      matched,
      matchedAgainstOffice: office.filter(c => ipMatchesAny(ip, [c])),
      matchedAgainstRemote: remote.filter(c => ipMatchesAny(ip, [c])),
      totalEntries: combined.length
    });
  } catch (err) {
    console.error('Error testing IP:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  Selfie storage stats - total bytes + file count under the
 *  attendance/ upload root, broken down by YYYY-MM folder. Used by the
 *  Settings → Attendance → Storage panel so admins can see what's
 *  building up before deciding to enable auto-cleanup.
 * ------------------------------------------------------------------ */
router.get('/attendance/selfie-stats', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!isAdminOrManager(roles)) {
      return res.status(403).json({ message: 'Only admins and managers can view selfie storage stats.' });
    }
    const fs = require('fs');
    const path = require('path');
    const { UPLOAD_ROOT } = require('../utils/selfieStorage');

    const exists = fs.existsSync(UPLOAD_ROOT);
    if (!exists) {
      return res.json({ totalFiles: 0, totalBytes: 0, folders: [] });
    }

    const folderEntries = await fs.promises.readdir(UPLOAD_ROOT, { withFileTypes: true });
    const folders = [];
    let totalFiles = 0;
    let totalBytes = 0;

    for (const ent of folderEntries) {
      if (!ent.isDirectory()) continue;
      const folderPath = path.join(UPLOAD_ROOT, ent.name);
      const files = await fs.promises.readdir(folderPath);
      let folderBytes = 0;
      for (const f of files) {
        try {
          const s = await fs.promises.stat(path.join(folderPath, f));
          folderBytes += s.size;
        } catch {}
      }
      folders.push({ name: ent.name, fileCount: files.length, bytes: folderBytes });
      totalFiles += files.length;
      totalBytes += folderBytes;
    }

    folders.sort((a, b) => a.name < b.name ? 1 : -1);  // newest first

    const settings = await SystemSettings.getSettings();
    const a = (settings.attendance && settings.attendance.toObject) ? settings.attendance.toObject() : (settings.attendance || {});

    res.json({
      totalFiles,
      totalBytes,
      folders,
      policy: {
        autoCleanupEnabled: a.selfieAutoCleanupEnabled === true,
        retentionDays:      Number(a.selfieRetentionDays) || 365
      }
    });
  } catch (err) {
    console.error('Error fetching selfie stats:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  POST /api/system-settings/attendance/selfie-cleanup
 *  Admin-only on-demand trigger for the retention sweep. Useful when
 *  auto-cleanup is disabled but the admin wants to free disk space
 *  before turning it on permanently. Pass {force:true} to ignore the
 *  selfieAutoCleanupEnabled flag for this run only.
 * ------------------------------------------------------------------ */
router.post('/attendance/selfie-cleanup', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('admin')) {
      return res.status(403).json({ message: 'Only admins can run the selfie cleanup sweep.' });
    }
    const force = req.body && req.body.force === true;
    const { runSelfieRetentionSweep } = require('../utils/hrCron');
    const result = await runSelfieRetentionSweep({ force });
    res.json(result);
  } catch (err) {
    console.error('Error running selfie cleanup:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get inventory settings (for inventory users to check store creation status)
router.get('/inventory', auth, async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    res.json({
      storeCreationEnabled: settings.inventory?.storeCreationEnabled ?? true
    });
  } catch (error) {
    console.error('Error fetching inventory settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
