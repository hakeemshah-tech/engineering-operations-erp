const express = require('express');
const SalaryRun = require('../../models/SalaryRun');
const JournalEntry = require('../../models/JournalEntry');
const VoucherSyncTrack = require('../../models/VoucherSyncTrack');
const auth = require('../../middleware/auth');
const { requireAccountsRole, requirePostingRole } = require('../../middleware/requireAccountsRole');
const { toDecimal128 } = require('../../utils/accounts/decimalHelpers');
const { nextJournalEntryNumber } = require('../../utils/accounts/entryNumber');
const { formatRunNumber } = require('../../utils/accounts/runNumber');
const { computeSalaryRun, labourAccountCodeForCategory } = require('../../utils/accounts/salaryCompute');
const { findSystemAccount } = require('../../utils/accounts/expenseAccountResolver');
const { getCompanyTaxContext } = require('../../utils/accounts/companyContext');
const buildJournalVoucher = require('../../utils/tally/buildJournalVoucher');

const router = express.Router();

const SALARY_PAYABLE_CODE = '2200-SALARY-PAYABLE';

function decimalize(line) {
  return {
    employeeId: line.employeeId,
    employeeCode: line.employeeCode,
    employeeName: line.employeeName,
    category: line.category,
    workingDays: line.workingDays,
    presentDays: line.presentDays,
    absentDays: line.absentDays,
    leaveDays: line.leaveDays,
    regularHours: toDecimal128(line.regularHours),
    otHours: toDecimal128(line.otHours),
    basic: toDecimal128(line.basic),
    housing: toDecimal128(line.housing),
    transport: toDecimal128(line.transport),
    otherAllowances: toDecimal128(line.otherAllowances),
    otAmount: toDecimal128(line.otAmount),
    grossPay: toDecimal128(line.grossPay),
    deductions: (line.deductions || []).map(d => ({ ...d, amount: toDecimal128(d.amount) })),
    totalDeductions: toDecimal128(line.totalDeductions),
    netPay: toDecimal128(line.netPay),
    projectAllocations: (line.projectAllocations || []).map(a => ({
      projectId: a.projectId,
      regularHours: toDecimal128(a.regularHours),
      otHours: toDecimal128(a.otHours),
      allocatedAmount: toDecimal128(a.allocatedAmount)
    }))
  };
}

function decimalizeAlert(a) {
  return {
    projectId: a.projectId,
    severity: a.severity,
    kind: a.kind,
    labourBudget: toDecimal128(a.labourBudget),
    labourSpentYTD: toDecimal128(a.labourSpentYTD),
    forecastTotal: toDecimal128(a.forecastTotal),
    message: a.message
  };
}

router.get('/', auth, requireAccountsRole, async (req, res) => {
  try {
    const { status, year, limit, skip } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (year) filter['period.year'] = parseInt(year, 10);
    const pageLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const pageSkip = parseInt(skip, 10) || 0;

    const [items, total] = await Promise.all([
      SalaryRun.find(filter)
        .select('runNumber period status totals createdAt approvedAt journalEntry budgetVarianceAlerts')
        .populate('journalEntry', 'entryNumber status tallySyncStatus')
        .sort({ 'period.year': -1, 'period.month': -1 })
        .skip(pageSkip)
        .limit(pageLimit)
        .lean(),
      SalaryRun.countDocuments(filter)
    ]);
    res.json({ items, total, limit: pageLimit, skip: pageSkip });
  } catch (err) {
    console.error('Error listing salary runs:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, requireAccountsRole, async (req, res) => {
  try {
    const run = await SalaryRun.findById(req.params.id)
      .populate('journalEntry', 'entryNumber status tallySyncStatus postedAt')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate({ path: 'lines.projectAllocations.projectId', select: 'name' })
      .populate({ path: 'budgetVarianceAlerts.projectId', select: 'name labourBudgetAmount' })
      .lean();
    if (!run) return res.status(404).json({ message: 'Salary run not found' });
    res.json(run);
  } catch (err) {
    console.error('Error fetching run:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/** Create or re-compute a run for { year, month }. */
router.post('/', auth, requirePostingRole, async (req, res) => {
  try {
    const { year, month } = req.body;
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: 'year and month (1-12) are required' });
    }

    const existing = await SalaryRun.findOne({ 'period.year': year, 'period.month': month });
    if (existing && ['approved', 'journalized', 'paid'].includes(existing.status)) {
      return res.status(400).json({ message: `A ${existing.status} run already exists for ${year}-${month}` });
    }

    const computed = await computeSalaryRun({ year, month });

    const runNumber = formatRunNumber(year, month);
    const lines = computed.lines.map(decimalize);
    const alerts = computed.budgetVarianceAlerts.map(decimalizeAlert);
    const totals = {
      employeeCount: computed.totals.employeeCount,
      grossPay: toDecimal128(computed.totals.grossPay),
      totalDeductions: toDecimal128(computed.totals.totalDeductions),
      netPay: toDecimal128(computed.totals.netPay),
      otAmount: toDecimal128(computed.totals.otAmount)
    };

    let run;
    if (existing) {
      existing.lines = lines;
      existing.totals = totals;
      existing.budgetVarianceAlerts = alerts;
      existing.status = 'computed';
      existing.computedAt = new Date();
      await existing.save();
      run = existing;
    } else {
      run = await SalaryRun.create({
        runNumber,
        period: { year, month },
        status: 'computed',
        lines,
        totals,
        budgetVarianceAlerts: alerts,
        computedAt: new Date(),
        createdBy: req.user.userId
      });
    }

    res.status(201).json({
      run,
      workingDays: computed.workingDays,
      alertSummary: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length
      }
    });
  } catch (err) {
    console.error('Error computing salary run:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** Re-compute an existing run (fetch fresh attendance + budget data). */
router.post('/:id/recompute', auth, requirePostingRole, async (req, res) => {
  try {
    const run = await SalaryRun.findById(req.params.id);
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (['approved', 'journalized', 'paid'].includes(run.status)) {
      return res.status(400).json({ message: `Cannot recompute a ${run.status} run` });
    }

    const { year, month } = run.period;
    const computed = await computeSalaryRun({ year, month });
    run.lines = computed.lines.map(decimalize);
    run.totals = {
      employeeCount: computed.totals.employeeCount,
      grossPay: toDecimal128(computed.totals.grossPay),
      totalDeductions: toDecimal128(computed.totals.totalDeductions),
      netPay: toDecimal128(computed.totals.netPay),
      otAmount: toDecimal128(computed.totals.otAmount)
    };
    run.budgetVarianceAlerts = computed.budgetVarianceAlerts.map(decimalizeAlert);
    run.status = 'computed';
    run.computedAt = new Date();
    await run.save();

    res.json({ run, workingDays: computed.workingDays });
  } catch (err) {
    console.error('Error recomputing run:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** Approve a computed run. Manager/Admin only. */
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.some(r => ['admin', 'manager'].includes(r))) {
      return res.status(403).json({ message: 'Approval requires Admin or Manager role' });
    }
    const run = await SalaryRun.findById(req.params.id);
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (run.status !== 'computed') {
      return res.status(400).json({ message: `Only computed runs can be approved (current: ${run.status})` });
    }

    const critical = (run.budgetVarianceAlerts || []).filter(a => a.severity === 'critical');
    if (critical.length > 0 && !req.body?.acknowledgeCriticalAlerts) {
      return res.status(400).json({
        message: `${critical.length} critical budget variance alert(s). POST with { acknowledgeCriticalAlerts: true } to override.`,
        alerts: critical
      });
    }

    run.status = 'approved';
    run.approvedBy = req.user.userId;
    run.approvedAt = new Date();
    await run.save();
    res.json({ message: 'Run approved', run });
  } catch (err) {
    console.error('Error approving run:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/** Post the approved run: build summary JE, generate Tally Journal XML, stream as download. */
router.post('/:id/post-and-generate-xml', auth, requirePostingRole, async (req, res) => {
  try {
    const run = await SalaryRun.findById(req.params.id);
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (run.status !== 'approved') {
      return res.status(400).json({ message: `Only approved runs can be posted (current: ${run.status})` });
    }

    // Resolve shared ledgers
    const salaryPayable = await findSystemAccount(SALARY_PAYABLE_CODE);
    if (!salaryPayable) return res.status(500).json({ message: 'Salary Payable ledger missing from Chart of Accounts' });

    // Need the labour ledgers too (resolve lazily per distinct code)
    const accountCache = new Map();
    async function getAccount(code) {
      if (accountCache.has(code)) return accountCache.get(code);
      const doc = await findSystemAccount(code);
      accountCache.set(code, doc);
      return doc;
    }

    // Group debits by (account code, costCenter projectId OR null)
    // Key: `${code}:${projectId || 'null'}`
    const debitBuckets = new Map();
    const { toNumber } = require('../../utils/accounts/decimalHelpers');

    for (const line of run.lines) {
      const accountCode = labourAccountCodeForCategory(line.category);
      const allocations = (line.projectAllocations || []).length
        ? line.projectAllocations
        : [{ projectId: null, allocatedAmount: toNumber(line.grossPay) }];

      for (const alloc of allocations) {
        const projectKey = alloc.projectId ? String(alloc.projectId) : 'null';
        const bucketKey = `${accountCode}:${projectKey}`;
        const cur = debitBuckets.get(bucketKey) || { accountCode, projectId: alloc.projectId, amount: 0 };
        cur.amount += toNumber(alloc.allocatedAmount);
        debitBuckets.set(bucketKey, cur);
      }
    }

    const totalGross = toNumber(run.totals.grossPay);
    const totalDebits = Array.from(debitBuckets.values()).reduce((s, b) => s + b.amount, 0);

    // Guard: the allocation buckets should sum close to totalGross
    if (Math.abs(totalDebits - totalGross) > 0.01) {
      // Difference likely due to employees with no attendance; add a "__NO_PROJECT__" bucket
      // to the default direct-labour account so the journal balances.
      const residual = totalGross - totalDebits;
      const defaultCode = '5200-DIRECT-LABOUR';
      const k = `${defaultCode}:null`;
      const cur = debitBuckets.get(k) || { accountCode: defaultCode, projectId: null, amount: 0 };
      cur.amount += residual;
      debitBuckets.set(k, cur);
    }

    const lines = [];
    for (const bucket of debitBuckets.values()) {
      if (bucket.amount <= 0) continue;
      const acct = await getAccount(bucket.accountCode);
      if (!acct) return res.status(500).json({ message: `Labour ledger ${bucket.accountCode} missing` });
      lines.push({
        account: acct._id,
        debit: toDecimal128(bucket.amount),
        credit: toDecimal128(0),
        costCenter: bucket.projectId || undefined,
        description: bucket.projectId ? `Labour - project cost center` : `Labour - indirect`
      });
    }

    // Credit Salary Payable for the total
    lines.push({
      account: salaryPayable._id,
      debit: toDecimal128(0),
      credit: toDecimal128(totalGross),
      description: `Salary payable - ${run.runNumber}`
    });

    const periodDate = new Date(run.period.year, run.period.month, 0); // last day of the month

    const narration = `Salary Preparation - ${run.period.year}-${String(run.period.month).padStart(2, '0')} - ${run.totals.employeeCount} staff`;
    const entryNumber = await nextJournalEntryNumber(periodDate);

    const journal = new JournalEntry({
      entryNumber,
      entryDate: periodDate,
      narration,
      voucherType: 'JOURNAL',
      lines,
      source: { kind: 'SALARY_RUN', salaryRun: run._id },
      status: 'POSTED',
      postedBy: req.user.userId,
      postedAt: new Date(),
      createdBy: req.user.userId
    });

    await journal.save();

    run.status = 'journalized';
    run.journalEntry = journal._id;
    await run.save();

    await journal.populate('lines.account', 'code name tallyLedgerName');
    await journal.populate({ path: 'lines.costCenter', select: 'name' });

    const company = await getCompanyTaxContext();

    const { xml, checksum } = buildJournalVoucher(journal, { reference: run.runNumber, company });

    const priorAttempts = await VoucherSyncTrack.countDocuments({ journalEntry: journal._id });
    await VoucherSyncTrack.create({
      journalEntry: journal._id,
      attemptNo: priorAttempts + 1,
      action: 'DOWNLOADED',
      xmlPayload: xml,
      xmlChecksum: checksum,
      performedBy: req.user.userId
    });
    journal.tallySyncStatus = 'DOWNLOADED';
    await journal.save();

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="JV-${journal.entryNumber}.xml"`);
    res.send(xml);
  } catch (err) {
    console.error('Error posting salary run:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** Cancel a draft or computed run. Approved runs must be reversed at the JE level. */
router.post('/:id/cancel', auth, requirePostingRole, async (req, res) => {
  try {
    const run = await SalaryRun.findById(req.params.id);
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (['journalized', 'paid'].includes(run.status)) {
      return res.status(400).json({ message: `Cannot cancel a ${run.status} run. Reverse the journal entry instead.` });
    }
    run.status = 'cancelled';
    await run.save();
    res.json({ run });
  } catch (err) {
    console.error('Error cancelling run:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
