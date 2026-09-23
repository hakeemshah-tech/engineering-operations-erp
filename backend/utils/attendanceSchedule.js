/**
 * Attendance v3 - pure schedule + holiday helpers.
 *
 * No mongoose, no I/O. Callers pass settings + Holiday rows + Employee
 * and these functions answer "what shift applies?", "is today a workday?",
 * "is this punch early/on-time/late?", and "is today a holiday?". The
 * punch endpoint, the live status endpoint, and the EOD cron all share
 * this one source of truth.
 */

/* ------------------------------------------------------------------ *
 *  Time helpers - string "HH:MM" <-> minutes-from-midnight Number.
 * ------------------------------------------------------------------ */

function parseHHMM(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  if (!Number.isInteger(mm) || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function minutesOf(d) {
  return d.getHours() * 60 + d.getMinutes();
}

function formatHHMM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/* ------------------------------------------------------------------ *
 *  Schedule resolution - Office vs Site, picked off the employee's
 *  category. Everything that isn't 'office' or starting with 'site_'
 *  falls back to office (the safer default).
 * ------------------------------------------------------------------ */

function isSiteCategory(category) {
  return typeof category === 'string' && category.startsWith('site_');
}

function pickSchedule(employee, settings) {
  const cat = employee?.category;
  const isSite = isSiteCategory(cat);
  const att = (settings && settings.attendance) || {};
  const fallback = {
    workdays: [0, 1, 2, 3, 4],
    startTime: '09:00',
    endTime: '18:00',
    graceMinutes: 10,
    earliestPunchIn: '08:00',
    latestPunchOut: '20:00'
  };
  const cfg = isSite ? (att.site || fallback) : (att.office || fallback);
  // Toughen against partial objects from mongoose toObject quirks.
  return {
    kind: isSite ? 'site' : 'office',
    workdays:        Array.isArray(cfg.workdays) ? cfg.workdays : fallback.workdays,
    startTime:       cfg.startTime || fallback.startTime,
    endTime:         cfg.endTime   || fallback.endTime,
    graceMinutes:    Number.isFinite(Number(cfg.graceMinutes))    ? Number(cfg.graceMinutes)    : fallback.graceMinutes,
    earliestPunchIn: cfg.earliestPunchIn || fallback.earliestPunchIn,
    latestPunchOut:  cfg.latestPunchOut  || fallback.latestPunchOut
  };
}

function isWorkday(schedule, date) {
  const dow = date.getDay();   // 0=Sun..6=Sat
  return Array.isArray(schedule.workdays) && schedule.workdays.includes(dow);
}

/* ------------------------------------------------------------------ *
 *  Punch-time classification - answers "what is this punch?"
 *
 *  Returns:
 *    { kind, allowed, minutes, message }
 *
 *  kind:
 *    'too-early'  → before earliestPunchIn; only allowed if enforce=false
 *    'early'      → between earliestPunchIn and startTime
 *    'on-time'    → from startTime through startTime+grace
 *    'late'       → past startTime+grace
 *  allowed:
 *    true except when kind='too-early' AND enforce=true
 *  minutes:
 *    signed minutes vs scheduled startTime (negative=early, positive=late)
 * ------------------------------------------------------------------ */

function classifyPunchIn(now, schedule, { enforce = false } = {}) {
  const nowM   = minutesOf(now);
  const startM = parseHHMM(schedule.startTime);
  const earlyM = parseHHMM(schedule.earliestPunchIn);
  const grace  = Number(schedule.graceMinutes) || 0;
  const minutes = nowM - startM;

  if (nowM < earlyM) {
    return {
      kind: 'too-early',
      allowed: !enforce,
      minutes,
      message: `Punch-in opens at ${schedule.earliestPunchIn} (${earlyM - nowM} min from now).`
    };
  }
  if (nowM < startM) {
    return {
      kind: 'early',
      allowed: true,
      minutes,
      message: `Early by ${Math.abs(minutes)} min — shift starts at ${schedule.startTime}.`
    };
  }
  if (nowM <= startM + grace) {
    return {
      kind: 'on-time',
      allowed: true,
      minutes,
      message: minutes === 0
        ? 'On time.'
        : `On time (within ${grace}m grace).`
    };
  }
  return {
    kind: 'late',
    allowed: true,
    minutes,
    message: `Late by ${minutes} min.`
  };
}

/**
 * Classify a punch-OUT. Returns { kind, message, otCapMinutes }.
 *   'early-leave' → before endTime
 *   'on-time'     → endTime..latestPunchOut
 *   'past-cap'    → after latestPunchOut (OT only credited up to latestPunchOut)
 */
function classifyPunchOut(now, schedule) {
  const nowM   = minutesOf(now);
  const endM   = parseHHMM(schedule.endTime);
  const lateM  = parseHHMM(schedule.latestPunchOut);

  if (nowM < endM) {
    return {
      kind: 'early-leave',
      message: `Early leave — ${endM - nowM} min before shift end (${schedule.endTime}).`,
      otCapMinutes: null
    };
  }
  if (nowM <= lateM) {
    return {
      kind: 'on-time',
      message: nowM === endM ? 'On time.' : `${nowM - endM} min after shift end.`,
      otCapMinutes: null
    };
  }
  return {
    kind: 'past-cap',
    message: `Past OT cap — overtime credited only up to ${schedule.latestPunchOut}.`,
    otCapMinutes: lateM - endM
  };
}

/* ------------------------------------------------------------------ *
 *  Holiday matching.
 *  `holidays` is an array of plain objects (caller does the DB query).
 *  The scope check is intentionally trivial: 'all' matches everyone,
 *  'office' matches category='office', 'site' matches category^='site_'.
 * ------------------------------------------------------------------ */

function isHolidayApplicable(holiday, employee) {
  if (!holiday) return false;
  const scope = holiday.scope || 'all';
  if (scope === 'all') return true;
  if (scope === 'office') return employee?.category === 'office';
  if (scope === 'site')   return isSiteCategory(employee?.category);
  return false;
}

function holidayMatchesDate(holiday, date) {
  if (!holiday?.date) return false;
  const hd = new Date(holiday.date);
  if (Number.isNaN(hd.getTime())) return false;
  if (holiday.recurringYearly) {
    return hd.getUTCMonth() === date.getUTCMonth() && hd.getUTCDate() === date.getUTCDate();
  }
  return hd.getUTCFullYear() === date.getUTCFullYear()
      && hd.getUTCMonth()    === date.getUTCMonth()
      && hd.getUTCDate()     === date.getUTCDate();
}

function findHolidayFor(employee, date, holidays) {
  for (const h of (holidays || [])) {
    if (holidayMatchesDate(h, date) && isHolidayApplicable(h, employee)) return h;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 *  Status derivation chain.
 *  Priority: holiday > weekend > leave > late/present (if punched) >
 *  absent (if EOD passed) > not_marked.
 *
 *  `context` carries:
 *    holiday - Holiday doc if today is one, else null
 *    isWorkdayToday - boolean
 *    hasApprovedLeave - boolean
 *    hasClosedLog - true if any punch closed today
 *    hasOpenLog - true if any punch open
 *    lateMinutes - number or null
 *    graceMinutes - number
 *    isEOD - true after end-of-day cutoff
 *
 *  Returns { status, reason }.
 * ------------------------------------------------------------------ */

function deriveStatus(context) {
  const {
    holiday, isWorkdayToday, hasApprovedLeave,
    hasClosedLog, hasOpenLog,
    lateMinutes, graceMinutes,
    isEOD
  } = context;

  if (holiday) {
    return { status: 'holiday', reason: `Holiday: ${holiday.name}` };
  }
  if (!isWorkdayToday) {
    return { status: 'weekend', reason: 'Non-working day per schedule' };
  }
  if (hasApprovedLeave && !hasClosedLog && !hasOpenLog) {
    return { status: 'leave', reason: 'Approved leave' };
  }
  if (hasClosedLog || hasOpenLog) {
    if (Number.isFinite(lateMinutes) && lateMinutes > (graceMinutes || 0)) {
      return { status: 'late', reason: `Late by ${lateMinutes} min (grace ${graceMinutes || 0})` };
    }
    return { status: 'present', reason: hasOpenLog ? 'Punched in — still open' : 'Punched in' };
  }
  if (isEOD) {
    return { status: 'absent', reason: 'End of day reached with no punch' };
  }
  return { status: 'not_marked', reason: '' };
}

module.exports = {
  parseHHMM,
  minutesOf,
  formatHHMM,
  pickSchedule,
  isWorkday,
  isSiteCategory,
  classifyPunchIn,
  classifyPunchOut,
  isHolidayApplicable,
  holidayMatchesDate,
  findHolidayFor,
  deriveStatus
};
