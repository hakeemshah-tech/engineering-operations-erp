/**
 * Universal Math for Attendance v2 multi-log timeline.
 *
 * Pure functions - no DB I/O. Re-run every time a timeLog is CLOSED:
 *   - on /api/attendance/punch (action='OUT')
 *   - on supervisor manual save (PUT /api/attendance/:id, bulk-manual)
 *
 * Rules (per the master plan):
 *   - Total logged time = sum of (timeOut - timeIn) across all CLOSED logs
 *   - Breaks = sum of gaps between consecutive closed logs (next.timeIn - prev.timeOut)
 *     If gap is negative or zero, it contributes 0 minutes (overlapping logs do not
 *     subtract from break time - they are flagged as overlap by validateTimeLogs).
 *   - Regular hours = min(totalHours, standardWorkdayHours)
 *   - OT hours     = max(0, totalHours - standardWorkdayHours)
 *
 * Open logs (timeOut === null) are IGNORED by math but still surfaced by
 * findOpenLog() so the Geofence Trap can reject new IN punches.
 */

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toMs(d) {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

function isClosed(log) {
  return log && log.timeIn && log.timeOut;
}

/**
 * Find the most recent open log in a timeLogs array. Returns null if all
 * closed (or array is empty). The Geofence Trap blocks any new IN punch when
 * this returns non-null.
 */
function findOpenLog(timeLogs) {
  if (!Array.isArray(timeLogs) || timeLogs.length === 0) return null;
  // The most recent open log is the one with the latest timeIn and null timeOut.
  // We don't assume the array is sorted, so we scan.
  let best = null;
  for (const log of timeLogs) {
    if (log && log.timeIn && !log.timeOut) {
      if (!best || toMs(log.timeIn) > toMs(best.timeIn)) {
        best = log;
      }
    }
  }
  return best;
}

/**
 * Recompute regularHours / otHours / breakMinutes / timeIn / timeOut from a
 * timeLogs array. Returns plain numbers; caller assigns them onto the row.
 *
 * standardWorkdayHours comes from SystemSettings.attendance.standardWorkdayHours
 * (default 8) - caller resolves and passes in.
 *
 * `opts` carries the Attendance v3 lunch controls:
 *   autoDeductLunch - boolean, default false
 *   lunchDeductionMinutes - number,  default 60
 *   lunchDeductionThresholdHours - number,  default 6
 *   flagBreakSkipped - boolean, default false
 *   breakSkippedThresholdHours - number,  default 6
 *
 * Behaviour when autoDeductLunch is on:
 *   - If the longest CLOSED log ≥ deductThreshold, subtract `deductMinutes`
 *     from totalMinutes and add the same amount to breakMinutes. This
 *     simulates "they took a lunch break they didn't punch out for".
 *   - Only ONE deduction per recompute (the longest session). Multi-shift
 *     days with two over-threshold sessions are an edge case we don't
 *     handle in v1.
 *
 * Behaviour when flagBreakSkipped is on:
 *   - Compute `breakSkipped = true` when REAL breakMinutes (gap-based,
 *     before any auto-deduction) is zero AND the longest closed log
 *     exceeds breakSkippedThresholdHours. Independent of the deduction
 *     - even when (A) silently moved an hour into break, (B) still
 *     records that the worker never punched out for lunch.
 */
function recomputeFromTimeLogs(timeLogs, standardWorkdayHours = 8, opts = {}) {
  const {
    autoDeductLunch              = false,
    lunchDeductionMinutes        = 60,
    lunchDeductionThresholdHours = 6,
    flagBreakSkipped             = false,
    breakSkippedThresholdHours   = 6
  } = opts;

  const closed = (Array.isArray(timeLogs) ? timeLogs : [])
    .filter(isClosed)
    .slice()
    .sort((a, b) => toMs(a.timeIn) - toMs(b.timeIn));

  let totalMinutes = 0;
  let realBreakMinutes = 0;
  let maxSessionMinutes = 0;

  for (let i = 0; i < closed.length; i++) {
    const log = closed[i];
    const dur = (toMs(log.timeOut) - toMs(log.timeIn)) / 60000;
    if (dur > 0) {
      totalMinutes += dur;
      if (dur > maxSessionMinutes) maxSessionMinutes = dur;
    }

    if (i > 0) {
      const prev = closed[i - 1];
      const gap = (toMs(log.timeIn) - toMs(prev.timeOut)) / 60000;
      if (gap > 0) realBreakMinutes += gap;
      // negative or zero gaps = overlap; validateTimeLogs() surfaces these
    }
  }

  // (A) Auto-deduct lunch when enabled and the longest session is long
  // enough to plausibly include lunch. The deduction is treated as
  // unrecorded break time: subtracted from worked total, added to break.
  let autoDeductedMinutes = 0;
  if (autoDeductLunch
      && closed.length > 0
      && maxSessionMinutes >= lunchDeductionThresholdHours * 60) {
    autoDeductedMinutes = Math.min(lunchDeductionMinutes, totalMinutes);
  }

  const effectiveTotalMinutes = totalMinutes - autoDeductedMinutes;
  const finalBreakMinutes     = realBreakMinutes + autoDeductedMinutes;

  const totalHours = effectiveTotalMinutes / 60;
  const cap = Number.isFinite(standardWorkdayHours) && standardWorkdayHours > 0
    ? standardWorkdayHours : 8;

  // (B) Flag pattern based on REAL break time. The auto-deduction may
  // have fixed payroll, but HR still needs to see that the worker never
  // punched out for lunch.
  const breakSkipped = flagBreakSkipped
    && closed.length > 0
    && realBreakMinutes === 0
    && maxSessionMinutes >= breakSkippedThresholdHours * 60;

  return {
    regularHours:        round2(Math.min(totalHours, cap)),
    otHours:             round2(Math.max(0, totalHours - cap)),
    breakMinutes:        Math.round(finalBreakMinutes),
    // Convenience projections for the legacy root fields:
    timeIn:              closed[0]?.timeIn || null,
    timeOut:             closed[closed.length - 1]?.timeOut || null,
    totalLoggedMinutes:  Math.round(effectiveTotalMinutes),
    closedLogCount:      closed.length,
    // Audit/diagnostic surface - callers can stamp these on the row so
    // grid tooltips can explain why hours look the way they do.
    breakSkipped,
    autoDeductedMinutes: Math.round(autoDeductedMinutes),
    realBreakMinutes:    Math.round(realBreakMinutes),
    longestSessionMinutes: Math.round(maxSessionMinutes)
  };
}

/**
 * Structural validation of a timeLogs array prior to save. Returns an array of
 * error strings (empty if clean). The supervisor manual-entry handler should
 * surface these to the UI; the punch endpoint shouldn't see most of these.
 */
function validateTimeLogs(timeLogs) {
  const errors = [];
  if (!Array.isArray(timeLogs)) return ['timeLogs must be an array'];

  const sorted = timeLogs.slice().sort((a, b) => toMs(a.timeIn) - toMs(b.timeIn));
  let openCount = 0;
  for (let i = 0; i < sorted.length; i++) {
    const log = sorted[i];
    if (!log.timeIn) {
      errors.push(`Log ${i + 1}: timeIn is required`);
      continue;
    }
    if (log.timeOut) {
      if (toMs(log.timeOut) <= toMs(log.timeIn)) {
        errors.push(`Log ${i + 1}: timeOut must be after timeIn`);
      }
    } else {
      openCount++;
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.timeOut && toMs(log.timeIn) < toMs(prev.timeOut)) {
        errors.push(`Log ${i + 1}: overlaps the previous log`);
      }
    }
    if (!log.type || !['Project', 'Office', 'Travel'].includes(log.type)) {
      errors.push(`Log ${i + 1}: type must be Project, Office, or Travel`);
    }
    if (!log.referenceId || !log.referenceModel) {
      // Travel may have a null reference in some workflows, but for v1 we keep
      // it required to avoid orphan logs.
      errors.push(`Log ${i + 1}: referenceId and referenceModel are required`);
    }
  }
  if (openCount > 1) {
    errors.push(`At most one open log is allowed per day (found ${openCount})`);
  }
  return errors;
}

/**
 * Derive a legacy `projectAllocations` array from timeLogs so the existing
 * Project Cost Report aggregation pipeline (server/routes/attendance.js
 * /project/:id/cost-report) keeps working without changes. Groups closed
 * Project-type logs by referenceId and sums hours.
 *
 * Only Project-type logs contribute (Office and Travel are excluded - they
 * don't belong to any project's labour budget).
 */
function deriveProjectAllocations(timeLogs) {
  const byProject = new Map();
  for (const log of Array.isArray(timeLogs) ? timeLogs : []) {
    if (!log || log.type !== 'Project') continue;
    if (!log.referenceId || !isClosed(log)) continue;
    const minutes = (toMs(log.timeOut) - toMs(log.timeIn)) / 60000;
    if (minutes <= 0) continue;
    const key = String(log.referenceId);
    const cur = byProject.get(key) || { projectId: log.referenceId, hours: 0, notes: '' };
    cur.hours += minutes / 60;
    byProject.set(key, cur);
  }
  return Array.from(byProject.values()).map(a => ({
    projectId: a.projectId,
    hours: round2(a.hours),
    notes: a.notes || ''
  }));
}

module.exports = {
  recomputeFromTimeLogs,
  findOpenLog,
  validateTimeLogs,
  deriveProjectAllocations
};
