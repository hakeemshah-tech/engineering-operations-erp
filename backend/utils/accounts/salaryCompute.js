const Employee = require('../../models/Employee');
const Attendance = require('../../models/Attendance');
const Project = require('../../models/Project');
const SalaryRun = require('../../models/SalaryRun');
const { toNumber } = require('./decimalHelpers');
const { getAccountsSettings } = require('./settingsProvider');

// UAE has adopted Sat/Sun weekend for the private sector since 2022. Treat Sun+Sat as weekend.
// UAE Labour Law Art. 65: OT 1.25x on weekdays, 1.5x on rest/holiday days (configurable via SystemSettings).
const WEEKEND_DAYS = new Set([0, 6]); // Sunday = 0, Saturday = 6 (JS Date.getDay convention)
const OT_WEEKDAY_MULTIPLIER = 1.25;
const OT_RESTDAY_MULTIPLIER = 1.5;
const WORKING_HOURS_PER_DAY = 8;

function workingDaysInMonth(year, month /* 1-12 */) {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (!WEEKEND_DAYS.has(dow)) count++;
  }
  return count;
}

function monthBounds(year, month) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from, to };
}

/**
 * Compute salary line for one employee.
 *
 * Returns a plain object - caller wraps values with Decimal128 before persisting.
 */
function computeEmployeeLine(employee, attendances, workingDays, settings = {}) {
  const otWeekday = settings.otWeekdayMultiplier ?? OT_WEEKDAY_MULTIPLIER;
  const otRestDay = settings.otRestDayMultiplier ?? OT_RESTDAY_MULTIPLIER;
  const hoursPerDay = settings.workingHoursPerDay ?? WORKING_HOURS_PER_DAY;

  const basic = toNumber(employee.offerLetter?.basicSalary);
  const housing = toNumber(employee.offerLetter?.housingAllowance);
  const transport = toNumber(employee.offerLetter?.transportAllowance);
  const otherAllow = toNumber(employee.offerLetter?.otherAllowances);
  const monthlyGross = basic + housing + transport + otherAllow;
  const hourlyBase = workingDays > 0 ? basic / (workingDays * hoursPerDay) : 0;

  let regularHours = 0;
  let otHours = 0;
  let presentDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let otAmount = 0;
  const projectHours = new Map(); // projectId -> hours
  const otByDay = []; // [{ hours, isRestDay }]

  for (const att of attendances) {
    const dow = new Date(att.date).getDay();
    const isRestDay = WEEKEND_DAYS.has(dow);
    regularHours += toNumber(att.regularHours);
    otHours += toNumber(att.otHours);

    if (att.status === 'present') presentDays++;
    else if (att.status === 'absent') absentDays++;
    else if (att.status === 'leave') leaveDays++;

    // Sum project hours (for cost-center split). If no projectAllocations, attribute to
    // a synthetic null bucket (office/HQ).
    if (Array.isArray(att.projectAllocations) && att.projectAllocations.length) {
      for (const alloc of att.projectAllocations) {
        const key = alloc.projectId ? String(alloc.projectId) : '__NO_PROJECT__';
        projectHours.set(key, (projectHours.get(key) || 0) + toNumber(alloc.hours));
      }
    } else {
      const bucket = toNumber(att.regularHours) + toNumber(att.otHours);
      if (bucket > 0) projectHours.set('__NO_PROJECT__', (projectHours.get('__NO_PROJECT__') || 0) + bucket);
    }

    if (toNumber(att.otHours) > 0) otByDay.push({ hours: toNumber(att.otHours), isRestDay });
  }

  // OT amount - only if employee is ot-eligible and has a basic salary
  if (employee.otEligible && hourlyBase > 0) {
    for (const { hours, isRestDay } of otByDay) {
      otAmount += hours * hourlyBase * (isRestDay ? otRestDay : otWeekday);
    }
  }

  // Unpaid-leave proration: reduce basic by absentDays / workingDays
  const prorationDeductible = workingDays > 0 ? (absentDays / workingDays) : 0;
  const basicAfterProration = basic * (1 - prorationDeductible);
  const allowanceAfterProration = (housing + transport + otherAllow) * (1 - prorationDeductible);

  const grossPay = basicAfterProration + allowanceAfterProration + otAmount;
  const deductions = []; // Phase 1: no statutory deductions
  const totalDeductions = 0;
  const netPay = grossPay - totalDeductions;

  // Project allocation amounts: distribute the grossPay proportionally to hours logged per project.
  const totalHours = Array.from(projectHours.values()).reduce((s, h) => s + h, 0);
  const projectAllocations = [];
  for (const [key, hrs] of projectHours.entries()) {
    if (key === '__NO_PROJECT__') continue;
    const allocated = totalHours > 0 ? (grossPay * hrs / totalHours) : 0;
    projectAllocations.push({ projectId: key, regularHours: hrs, otHours: 0, allocatedAmount: allocated });
  }

  return {
    employeeId: employee._id,
    employeeCode: employee.employeeId,
    employeeName: employee.fullName,
    category: employee.category,
    workingDays,
    presentDays,
    absentDays,
    leaveDays,
    regularHours,
    otHours,
    basic: basicAfterProration,
    housing: housing * (1 - prorationDeductible),
    transport: transport * (1 - prorationDeductible),
    otherAllowances: otherAllow * (1 - prorationDeductible),
    otAmount,
    grossPay,
    deductions,
    totalDeductions,
    netPay,
    projectAllocations,
    monthlyGross
  };
}

/** Category -> labour-account code mapping. */
function labourAccountCodeForCategory(category) {
  return (category === 'office') ? '6100-SALARY-WAGES' : '5200-DIRECT-LABOUR';
}

/**
 * Assemble budget-variance alerts for a salary run.
 * For each project touched by the run:
 *   - sum direct-labour allocations across all prior *journalized* runs (YTD)
 *   - compare (YTD + this run) against `Project.labourBudgetAmount`
 *   - severity: >100% → critical, 80-100% → warning, else info
 *
 * Returns an array of alert plain-objects (caller wraps Decimal128 before saving).
 */
async function computeBudgetVarianceAlerts({ runLines, period }) {
  const thisRunByProject = new Map();
  for (const line of runLines) {
    for (const alloc of line.projectAllocations || []) {
      const key = String(alloc.projectId);
      thisRunByProject.set(key, (thisRunByProject.get(key) || 0) + toNumber(alloc.allocatedAmount));
    }
  }

  if (thisRunByProject.size === 0) return [];

  const projectIds = Array.from(thisRunByProject.keys());
  const projects = await Project.find({ _id: { $in: projectIds } })
    .select('name labourBudgetAmount status')
    .lean();

  // Pull prior journalized runs this calendar year for YTD calculation
  const priorRuns = await SalaryRun.find({
    status: { $in: ['journalized', 'paid'] },
    'period.year': period.year,
    $or: [
      { 'period.month': { $lt: period.month } },
      // Exclude the run itself; same month+year shouldn't repeat but safeguard anyway.
    ]
  }).select('lines.projectAllocations').lean();

  const ytdByProject = new Map();
  for (const run of priorRuns) {
    for (const line of run.lines || []) {
      for (const alloc of line.projectAllocations || []) {
        const key = String(alloc.projectId);
        ytdByProject.set(key, (ytdByProject.get(key) || 0) + toNumber(alloc.allocatedAmount));
      }
    }
  }

  const alerts = [];
  for (const proj of projects) {
    const projectId = String(proj._id);
    const ytd = ytdByProject.get(projectId) || 0;
    const thisRun = thisRunByProject.get(projectId) || 0;
    const cumulative = ytd + thisRun;
    const budget = toNumber(proj.labourBudgetAmount);

    // No budget set - info-only
    if (budget === 0) {
      alerts.push({
        projectId,
        severity: 'info',
        kind: 'MONTHLY_THRESHOLD',
        labourBudget: 0,
        labourSpentYTD: ytd,
        forecastTotal: cumulative,
        message: `${proj.name}: no labour budget configured. YTD + this run = AED ${cumulative.toFixed(2)}.`
      });
      continue;
    }

    const ratio = cumulative / budget;
    let severity = 'info';
    let kind = 'MONTHLY_THRESHOLD';
    if (ratio > 1.0) {
      severity = 'critical';
      kind = 'YTD_EXCEEDED';
    } else if (ratio >= 0.8) {
      severity = 'warning';
      kind = 'MONTHLY_THRESHOLD';
    }

    // Forecast: run-rate × remaining months
    const monthsElapsed = period.month; // include current month
    const runRate = cumulative / monthsElapsed;
    const forecastTotal = runRate * 12;
    if (forecastTotal > budget && severity === 'info') {
      severity = 'warning';
      kind = 'FORECAST_EXCEEDED';
    }

    alerts.push({
      projectId,
      severity,
      kind,
      labourBudget: budget,
      labourSpentYTD: cumulative,
      forecastTotal,
      message: severity === 'critical'
        ? `${proj.name}: labour cost AED ${cumulative.toFixed(2)} EXCEEDS budget AED ${budget.toFixed(2)} (${(ratio * 100).toFixed(1)}%).`
        : severity === 'warning' && kind === 'FORECAST_EXCEEDED'
          ? `${proj.name}: at current run rate (AED ${runRate.toFixed(2)}/mo) will reach AED ${forecastTotal.toFixed(2)} vs budget AED ${budget.toFixed(2)}.`
          : severity === 'warning'
            ? `${proj.name}: labour at ${(ratio * 100).toFixed(1)}% of budget (AED ${cumulative.toFixed(2)} of AED ${budget.toFixed(2)}).`
            : `${proj.name}: labour ${(ratio * 100).toFixed(1)}% of budget.`
    });
  }

  return alerts;
}

/**
 * Main entry: compute a salary run for a given month.
 *
 * Returns { lines, totals, budgetVarianceAlerts } - caller converts numeric fields
 * to Decimal128 before persisting.
 */
async function computeSalaryRun({ year, month }) {
  if (!year || !month || month < 1 || month > 12) throw new Error('Invalid period');

  const settings = await getAccountsSettings();
  const workingDays = workingDaysInMonth(year, month);
  const { from, to } = monthBounds(year, month);

  const employees = await Employee.find({
    status: { $in: ['active', 'on_leave'] }
  }).lean();

  if (employees.length === 0) {
    return {
      lines: [],
      totals: { employeeCount: 0, grossPay: 0, totalDeductions: 0, netPay: 0, otAmount: 0 },
      budgetVarianceAlerts: [],
      workingDays
    };
  }

  const employeeIds = employees.map(e => e._id);
  const attendances = await Attendance.find({
    employee: { $in: employeeIds },
    date: { $gte: from, $lte: to }
  }).lean();

  // Group attendance by employee
  const byEmployee = new Map();
  for (const att of attendances) {
    const key = String(att.employee);
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key).push(att);
  }

  const lines = employees.map(emp =>
    computeEmployeeLine(emp, byEmployee.get(String(emp._id)) || [], workingDays, settings)
  );

  const totals = {
    employeeCount: lines.length,
    grossPay: lines.reduce((s, l) => s + l.grossPay, 0),
    totalDeductions: lines.reduce((s, l) => s + l.totalDeductions, 0),
    netPay: lines.reduce((s, l) => s + l.netPay, 0),
    otAmount: lines.reduce((s, l) => s + l.otAmount, 0)
  };

  const budgetVarianceAlerts = await computeBudgetVarianceAlerts({
    runLines: lines,
    period: { year, month }
  });

  return { lines, totals, budgetVarianceAlerts, workingDays };
}

module.exports = {
  computeSalaryRun,
  computeEmployeeLine,
  computeBudgetVarianceAlerts,
  workingDaysInMonth,
  labourAccountCodeForCategory,
  OT_WEEKDAY_MULTIPLIER,
  OT_RESTDAY_MULTIPLIER,
  WORKING_HOURS_PER_DAY
};
