const cron = require('node-cron');
const Employee = require('../models/Employee');
const Project = require('../models/Project');
const Attendance = require('../models/Attendance');
const HRAlert = require('../models/HRAlert');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');
const SystemSettings = require('../models/SystemSettings');
const { deleteSelfie } = require('./selfieStorage');
const {
  pickSchedule,
  isWorkday,
  findHolidayFor
} = require('./attendanceSchedule');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DOC_FIELDS = [
  { key: 'passport', label: 'Passport', path: 'documents.passport.expiryDate' },
  { key: 'visa', label: 'Visa', path: 'documents.visa.expiryDate' },
  { key: 'labourCard', label: 'Labour Card', path: 'documents.labourCard.expiryDate' },
  { key: 'emiratesId', label: 'Emirates ID', path: 'documents.emiratesId.expiryDate' },
  { key: 'insurance', label: 'Insurance', path: 'documents.insurance.expiryDate' },
  { key: 'medical', label: 'Medical', path: 'documents.medical.expiryDate' }
];

const EXPIRY_BUCKETS = [90, 60, 30, 14, 7, 0];

function bucketOf(daysUntil) {
  if (daysUntil < 0) return -1;
  for (const b of EXPIRY_BUCKETS) {
    if (daysUntil <= b) return b;
  }
  return null;
}

function severityFor(daysUntil) {
  if (daysUntil < 0) return 'critical';
  if (daysUntil <= 7) return 'critical';
  if (daysUntil <= 30) return 'warning';
  return 'info';
}

function getByPath(obj, pathStr) {
  return pathStr.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

async function runDocumentExpirySweep() {
  const employees = await Employee.find({
    status: { $in: ['onboarding', 'active', 'on_leave'] }
  });

  const now = new Date();
  let created = 0;

  for (const emp of employees) {
    for (const doc of DOC_FIELDS) {
      const expiryDate = getByPath(emp.toObject(), doc.path);
      if (!expiryDate) continue;

      const daysUntil = Math.floor((new Date(expiryDate).getTime() - now.getTime()) / MS_PER_DAY);
      const bucket = bucketOf(daysUntil);
      if (bucket === null) continue;

      const existing = await HRAlert.findOne({
        employee: emp._id,
        alertType: 'document_expiry',
        relatedDocument: doc.key,
        status: 'open'
      });
      if (existing) continue;

      const msg = daysUntil < 0
        ? `${doc.label} for ${emp.fullName} expired ${Math.abs(daysUntil)} day(s) ago`
        : daysUntil === 0
          ? `${doc.label} for ${emp.fullName} expires today`
          : `${doc.label} for ${emp.fullName} expires in ${daysUntil} day(s)`;

      await HRAlert.create({
        alertType: 'document_expiry',
        severity: severityFor(daysUntil),
        employee: emp._id,
        relatedDocument: doc.key,
        daysUntilEvent: daysUntil,
        message: msg,
        status: 'open'
      });
      created += 1;
    }
  }

  console.log(`[HR Cron] Document expiry sweep completed. ${created} new alert(s) created.`);
}

async function runBudgetOverrunSweep() {
  const projects = await Project.find({
    status: 'active',
    labourBudgetAmount: { $gt: 0 }
  });

  let created = 0;

  for (const project of projects) {
    const result = await Attendance.aggregate([
      { $match: { 'projectAllocations.projectId': project._id } },
      { $unwind: '$projectAllocations' },
      { $match: { 'projectAllocations.projectId': project._id } },
      {
        $lookup: {
          from: 'employees',
          localField: 'employee',
          foreignField: '_id',
          as: 'emp'
        }
      },
      { $unwind: '$emp' },
      {
        $group: {
          _id: null,
          totalCost: {
            $sum: {
              $multiply: [
                '$projectAllocations.hours',
                { $divide: [{ $ifNull: ['$emp.offerLetter.totalGrossSalary', 0] }, 240] }
              ]
            }
          }
        }
      }
    ]);

    const totalCost = result[0]?.totalCost || 0;
    if (totalCost <= project.labourBudgetAmount) continue;

    const existing = await HRAlert.findOne({
      project: project._id,
      alertType: 'budget_overrun',
      status: 'open'
    });
    if (existing) continue;

    await HRAlert.create({
      alertType: 'budget_overrun',
      severity: 'critical',
      project: project._id,
      message: `Labour cost for project "${project.name}" has exceeded the budget (AED ${totalCost.toFixed(2)} / ${project.labourBudgetAmount.toFixed(2)})`,
      status: 'open'
    });
    created += 1;
  }

  console.log(`[HR Cron] Budget overrun sweep completed. ${created} new alert(s) created.`);
}

async function runProbationAndContractSweep() {
  const employees = await Employee.find({ status: 'active' });
  const now = new Date();
  let created = 0;

  for (const emp of employees) {
    if (emp.probationEndDate) {
      const days = Math.floor((new Date(emp.probationEndDate).getTime() - now.getTime()) / MS_PER_DAY);
      if (days >= 0 && days <= 7) {
        const existing = await HRAlert.findOne({
          employee: emp._id,
          alertType: 'probation_ending',
          status: 'open'
        });
        if (!existing) {
          await HRAlert.create({
            alertType: 'probation_ending',
            severity: 'warning',
            employee: emp._id,
            daysUntilEvent: days,
            message: `Probation for ${emp.fullName} ends in ${days} day(s)`,
            status: 'open'
          });
          created += 1;
        }
      }
    }

    if (emp.contract?.endDate) {
      const days = Math.floor((new Date(emp.contract.endDate).getTime() - now.getTime()) / MS_PER_DAY);
      if (days >= 0 && days <= 30) {
        const existing = await HRAlert.findOne({
          employee: emp._id,
          alertType: 'contract_ending',
          status: 'open'
        });
        if (!existing) {
          await HRAlert.create({
            alertType: 'contract_ending',
            severity: days <= 7 ? 'critical' : 'warning',
            employee: emp._id,
            daysUntilEvent: days,
            message: `Contract for ${emp.fullName} ends in ${days} day(s)`,
            status: 'open'
          });
          created += 1;
        }
      }
    }
  }

  console.log(`[HR Cron] Probation/contract sweep completed. ${created} new alert(s) created.`);
}

/**
 * Selfie retention sweep - deletes attendance selfie image files older than
 * the configured retention window. Run nightly; no-op when
 * settings.attendance.selfieAutoCleanupEnabled is false.
 *
 * The audit trail (timeLog metadata, distance, IP) stays intact - only the
 * URL field is cleared and the file is unlinked from disk. Worst-case if the
 * file is already gone, deleteSelfie() is a no-op.
 */
async function runSelfieRetentionSweep({ force = false } = {}) {
  const settings = await SystemSettings.getSettings();
  const att = settings.attendance || {};
  const enabled = att.selfieAutoCleanupEnabled === true;
  if (!enabled && !force) {
    console.log('[HR Cron] Selfie retention sweep skipped (auto-cleanup disabled).');
    return { scanned: 0, cleared: 0, filesDeleted: 0, skipped: true };
  }
  const days = Number(att.selfieRetentionDays) || 365;
  const cutoff = new Date(Date.now() - days * MS_PER_DAY);

  // Find rows that have at least one timeLog older than cutoff with a selfie URL.
  // Indexed via {'timeLogs.timeOut':1,'timeLogs.timeIn':1} so this stays cheap.
  const rows = await Attendance.find({
    'timeLogs.timeIn': { $lt: cutoff },
    $or: [
      { 'timeLogs.inSelfieUrl':  { $exists: true, $nin: [null, ''] } },
      { 'timeLogs.outSelfieUrl': { $exists: true, $nin: [null, ''] } }
    ]
  });

  let cleared = 0;
  let filesDeleted = 0;

  for (const row of rows) {
    let mutated = false;
    for (const log of (row.timeLogs || [])) {
      // Only purge logs whose timeIn is past the cutoff. A young log on an
      // otherwise-old row stays intact.
      if (!log.timeIn || new Date(log.timeIn) >= cutoff) continue;
      if (log.inSelfieUrl) {
        if (await deleteSelfie(log.inSelfieUrl)) filesDeleted += 1;
        log.inSelfieUrl = undefined;
        mutated = true;
        cleared += 1;
      }
      if (log.outSelfieUrl) {
        if (await deleteSelfie(log.outSelfieUrl)) filesDeleted += 1;
        log.outSelfieUrl = undefined;
        mutated = true;
        cleared += 1;
      }
    }
    if (mutated) {
      try {
        await row.save();
      } catch (err) {
        console.error(`[HR Cron] Could not save retention update for attendance ${row._id}:`, err.message);
      }
    }
  }

  console.log(`[HR Cron] Selfie retention sweep: scanned ${rows.length} rows, cleared ${cleared} URLs, deleted ${filesDeleted} files (cutoff: ${cutoff.toISOString()}).`);
  return { scanned: rows.length, cleared, filesDeleted, cutoff, skipped: false };
}

function normalizeDateLocal(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Daily status sweep - fills in attendance status for every active employee
 * at end-of-day. Walks employees once and decides:
 *
 *   holiday (block)  → status='holiday'
 *   not a workday    → status='weekend'
 *   approved leave   → status='leave'   (only if no punch happened)
 *   any closed log   → leave alone (punch already set 'present' or 'late')
 *   nothing          → status='absent'
 *
 * Skipped entirely when SystemSettings.attendance.autoStatusEnabled is OFF
 * OR autoMarkAbsentAtEOD logic is implied off (we just use the master).
 * This is the only cron in v3.
 */
async function runDailyStatusSweep({ asOf } = {}) {
  const settings = await SystemSettings.getSettings();
  const a = settings?.attendance?.toObject?.() || settings?.attendance || {};
  if (a.autoStatusEnabled !== true) {
    console.log('[HR Cron] Daily status sweep skipped (autoStatusEnabled=false).');
    return { skipped: true };
  }

  const today = normalizeDateLocal(asOf || new Date());
  const employees = await Employee.find({ status: 'active' }).select('_id userId category');

  // One Holiday query covers everyone (date + recurring).
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const holidays = await Holiday.find({
    $or: [
      { date: { $gte: dayStart, $lt: dayEnd } },
      { recurringYearly: true }
    ]
  }).lean();

  // One Leave query covers everyone with approved leave overlapping today.
  const leaves = await LeaveRequest.find({
    status: 'approved',
    startDate: { $lte: today },
    endDate:   { $gte: today }
  }).select('employee').lean();
  const leaveEmpIds = new Set(leaves.map(l => String(l.employee)));

  let created = 0, marked = 0, kept = 0;

  for (const emp of employees) {
    const empId = emp._id;
    const schedule = pickSchedule(emp, { attendance: a });
    const holiday = findHolidayFor(emp, today, holidays);
    const workdayToday = isWorkday(schedule, today);
    const onLeave = leaveEmpIds.has(String(empId));

    // Derive what the row SHOULD be.
    let derivedStatus;
    if (holiday)               derivedStatus = 'holiday';
    else if (!workdayToday)    derivedStatus = 'weekend';
    else if (onLeave)          derivedStatus = 'leave';
    else                       derivedStatus = 'absent';

    const existing = await Attendance.findOne({ employee: empId, date: today });
    if (existing) {
      // Punch wins. Don't touch rows that have time logs.
      const hasLogs = Array.isArray(existing.timeLogs) && existing.timeLogs.length > 0;
      if (hasLogs) { kept += 1; continue; }

      // Only overwrite the auto-set / not_marked states. Manual overrides
      // (already 'late', 'present', etc. set by HR) stay put.
      const overridable = ['not_marked', 'absent', 'weekend', 'holiday', 'leave'];
      if (!overridable.includes(existing.status)) { kept += 1; continue; }
      if (existing.status === derivedStatus) { kept += 1; continue; }

      existing.status = derivedStatus;
      await existing.save();
      marked += 1;
    } else {
      await Attendance.create({
        employee: empId,
        date: today,
        source: emp.category === 'office' ? 'office' : 'site',
        status: derivedStatus,
        entryMethod: 'AUTO_SWEEP'
      });
      created += 1;
    }
  }

  console.log(`[HR Cron] Daily status sweep: scanned ${employees.length} employees · created ${created} · marked ${marked} · kept ${kept}.`);
  return { scanned: employees.length, created, marked, kept };
}

function safeRun(label, fn) {
  return async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[HR Cron] ${label} failed:`, err.message);
    }
  };
}

// Schedules
cron.schedule('0 2 * * *', safeRun('document-expiry', runDocumentExpirySweep));
cron.schedule('15 2 * * *', safeRun('budget-overrun', runBudgetOverrunSweep));
cron.schedule('0 3 * * MON', safeRun('probation-contract', runProbationAndContractSweep));
cron.schedule('30 2 * * *', safeRun('selfie-retention', runSelfieRetentionSweep));
// Daily status sweep - fires after end-of-day cutoff. Gated by the
// autoStatusEnabled toggle, so safe to register unconditionally.
cron.schedule('55 23 * * *', safeRun('daily-status', runDailyStatusSweep));

console.log('[HR Cron] Scheduled: document-expiry (02:00 daily), budget-overrun (02:15 daily), selfie-retention (02:30 daily), daily-status (23:55 daily), probation/contract (03:00 Mon)');

module.exports = {
  runDocumentExpirySweep,
  runBudgetOverrunSweep,
  runProbationAndContractSweep,
  runSelfieRetentionSweep,
  runDailyStatusSweep
};
