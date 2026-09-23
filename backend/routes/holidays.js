const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Holiday = require('../models/Holiday');
const GeneralAuditLog = require('../models/GeneralAuditLog');
const auth = require('../middleware/auth');
const { requireAnyRole } = require('../middleware/rbac');
const { effectiveWeight, canOverwrite } = require('../utils/roleWeight');

const router = express.Router();

// HR runs the holiday calendar day-to-day; Admin always can. Manager has
// org-wide oversight so it's included by convention.
const WRITE_ROLES  = ['admin', 'manager', 'hr'];
const DELETE_ROLES = ['admin', 'manager', 'hr'];

const PRESETS_DIR = path.join(__dirname, '..', 'data', 'holidayPresets');

async function audit(action, entityId, userId, details = {}) {
  try {
    await GeneralAuditLog.create({
      action,
      module: 'hr_management',
      entityType: 'holiday',
      entityId,
      performedBy: userId,
      performedAt: new Date(),
      details,
      success: true
    });
  } catch (err) {
    console.error('[holiday audit]', err.message);
  }
}

function normalizeDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  // Store as midnight UTC of the calendar date - the resolver compares
  // year/month/day directly, so this dodges DST/timezone surprises.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function validateScope(scope) {
  return ['all', 'office', 'site'].includes(scope);
}

/* ------------------------------------------------------------------ *
 *  GET /api/holidays
 *  Optional query: ?year=2026 - filters to that calendar year (plus all
 *  recurring entries, which apply to every year).
 * ------------------------------------------------------------------ */
router.get('/', auth, async (req, res) => {
  try {
    const year = req.query.year ? Number(req.query.year) : null;
    const filter = {};
    if (Number.isFinite(year)) {
      const start = new Date(Date.UTC(year, 0, 1));
      const end   = new Date(Date.UTC(year + 1, 0, 1));
      filter.$or = [
        { date: { $gte: start, $lt: end } },
        { recurringYearly: true }
      ];
    }
    const items = await Holiday.find(filter)
      .sort({ date: 1 })
      .populate('createdBy', 'name email')
      .lean();
    res.json(items);
  } catch (err) {
    console.error('[holidays.list]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  GET /api/holidays/presets - list available preset files
 *  GET /api/holidays/presets/:key - preview a preset's contents
 * ------------------------------------------------------------------ */
router.get('/presets', auth, async (_req, res) => {
  try {
    if (!fs.existsSync(PRESETS_DIR)) return res.json([]);
    const files = await fs.promises.readdir(PRESETS_DIR);
    const items = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.promises.readFile(path.join(PRESETS_DIR, f), 'utf8');
        const data = JSON.parse(raw);
        items.push({
          key:   data.key,
          label: data.label,
          year:  data.year,
          count: Array.isArray(data.holidays) ? data.holidays.length : 0
        });
      } catch (err) {
        console.warn('[holidays.presets] skip', f, err.message);
      }
    }
    res.json(items);
  } catch (err) {
    console.error('[holidays.presets]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/presets/:key', auth, async (req, res) => {
  try {
    const key = String(req.params.key || '').replace(/[^a-z0-9_-]/gi, '');
    if (!key) return res.status(400).json({ message: 'Bad preset key.' });
    const file = path.join(PRESETS_DIR, `${key}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ message: 'Preset not found.' });
    const raw = await fs.promises.readFile(file, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('[holidays.preset.read]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  POST /api/holidays - create a single holiday
 * ------------------------------------------------------------------ */
router.post('/', auth, requireAnyRole(...WRITE_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'name is required.' });

    const date = normalizeDate(body.date);
    if (!date) return res.status(400).json({ message: 'A valid date is required.' });

    const scope = body.scope || 'all';
    if (!validateScope(scope)) {
      return res.status(400).json({ message: "scope must be 'all', 'office', or 'site'." });
    }

    const doc = await Holiday.create({
      name,
      date,
      scope,
      recurringYearly: body.recurringYearly === true,
      paid: body.paid !== false,
      notes: body.notes ? String(body.notes).trim() : undefined,
      source: 'manual',
      createdBy: req.user.userId,
      lockedByRoleWeight: effectiveWeight(req)
    });

    await audit('holiday_created', doc._id, req.user.userId, { name, date, scope });
    res.status(201).json(doc);
  } catch (err) {
    console.error('[holidays.create]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  POST /api/holidays/import-preset { key, year?, overwriteExisting? }
 *  Bulk-imports every holiday from a preset. Skips dates that already
 *  have a Holiday row unless overwriteExisting is true.
 * ------------------------------------------------------------------ */
router.post('/import-preset', auth, requireAnyRole(...WRITE_ROLES), async (req, res) => {
  try {
    const key = String(req.body?.key || '').replace(/[^a-z0-9_-]/gi, '');
    if (!key) return res.status(400).json({ message: 'preset key is required.' });

    const file = path.join(PRESETS_DIR, `${key}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ message: 'Preset not found.' });
    const raw = await fs.promises.readFile(file, 'utf8');
    const preset = JSON.parse(raw);
    const list = Array.isArray(preset.holidays) ? preset.holidays : [];
    const overwrite = req.body?.overwriteExisting === true;

    let created = 0, skipped = 0, updated = 0;
    const callerWeight = effectiveWeight(req);

    for (const h of list) {
      const d = normalizeDate(h.date);
      if (!d) { skipped += 1; continue; }
      const scope = validateScope(h.scope) ? h.scope : 'all';

      const existing = await Holiday.findOne({ date: d, scope, name: h.name });
      if (existing) {
        if (!overwrite) { skipped += 1; continue; }
        // Honor hierarchy lock on overwrite.
        if (!canOverwrite(req, existing.lockedByRoleWeight)) { skipped += 1; continue; }
        existing.recurringYearly = h.recurringYearly === true;
        existing.paid = h.paid !== false;
        existing.notes = h.notes;
        existing.presetKey = preset.key;
        existing.source = 'preset';
        existing.lockedByRoleWeight = callerWeight;
        await existing.save();
        updated += 1;
        continue;
      }

      await Holiday.create({
        name: String(h.name || '').trim() || 'Holiday',
        date: d,
        scope,
        recurringYearly: h.recurringYearly === true,
        paid: h.paid !== false,
        notes: h.notes,
        source: 'preset',
        presetKey: preset.key,
        createdBy: req.user.userId,
        lockedByRoleWeight: callerWeight
      });
      created += 1;
    }

    await audit('holidays_preset_imported', null, req.user.userId, { key, created, updated, skipped });
    res.json({ key, created, updated, skipped });
  } catch (err) {
    console.error('[holidays.import-preset]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  PUT /api/holidays/:id
 * ------------------------------------------------------------------ */
router.put('/:id', auth, requireAnyRole(...WRITE_ROLES), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Bad id.' });
    }
    const doc = await Holiday.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Holiday not found.' });

    if (!canOverwrite(req, doc.lockedByRoleWeight)) {
      return res.status(403).json({
        message: 'This holiday is locked by a higher-ranked reviewer.',
        code: 'locked',
        lockedByRoleWeight: doc.lockedByRoleWeight
      });
    }

    const body = req.body || {};
    const changes = [];

    if (body.name !== undefined) {
      const v = String(body.name).trim();
      if (!v) return res.status(400).json({ message: 'name cannot be empty.' });
      if (v !== doc.name) { changes.push({ field: 'name', from: doc.name, to: v }); doc.name = v; }
    }
    if (body.date !== undefined) {
      const d = normalizeDate(body.date);
      if (!d) return res.status(400).json({ message: 'Invalid date.' });
      if (d.toISOString() !== doc.date.toISOString()) {
        changes.push({ field: 'date', from: doc.date, to: d });
        doc.date = d;
      }
    }
    if (body.scope !== undefined) {
      if (!validateScope(body.scope)) {
        return res.status(400).json({ message: "scope must be 'all', 'office', or 'site'." });
      }
      if (body.scope !== doc.scope) {
        changes.push({ field: 'scope', from: doc.scope, to: body.scope });
        doc.scope = body.scope;
      }
    }
    if (body.recurringYearly !== undefined) {
      const v = body.recurringYearly === true;
      if (v !== doc.recurringYearly) {
        changes.push({ field: 'recurringYearly', from: doc.recurringYearly, to: v });
        doc.recurringYearly = v;
      }
    }
    if (body.paid !== undefined) {
      const v = body.paid !== false;
      if (v !== doc.paid) {
        changes.push({ field: 'paid', from: doc.paid, to: v });
        doc.paid = v;
      }
    }
    if (body.notes !== undefined) {
      const v = body.notes ? String(body.notes).trim() : undefined;
      if (v !== doc.notes) {
        changes.push({ field: 'notes', from: doc.notes, to: v });
        doc.notes = v;
      }
    }

    if (changes.length > 0) {
      doc.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
      doc.lockedByRoleWeight = effectiveWeight(req);
    }

    await doc.save();
    await audit('holiday_updated', doc._id, req.user.userId, { changesCount: changes.length });
    res.json(doc);
  } catch (err) {
    console.error('[holidays.update]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------ *
 *  DELETE /api/holidays/:id
 * ------------------------------------------------------------------ */
router.delete('/:id', auth, requireAnyRole(...DELETE_ROLES), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Bad id.' });
    }
    const doc = await Holiday.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Holiday not found.' });
    if (!canOverwrite(req, doc.lockedByRoleWeight)) {
      return res.status(403).json({
        message: 'This holiday is locked by a higher-ranked reviewer.',
        code: 'locked',
        lockedByRoleWeight: doc.lockedByRoleWeight
      });
    }
    await doc.deleteOne();
    await audit('holiday_deleted', req.params.id, req.user.userId, { name: doc.name, date: doc.date });
    res.json({ ok: true });
  } catch (err) {
    console.error('[holidays.delete]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
