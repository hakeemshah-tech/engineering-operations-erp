const express = require('express');
const SalesClaim = require('../../models/SalesClaim');
const JournalEntry = require('../../models/JournalEntry');
const VoucherSyncTrack = require('../../models/VoucherSyncTrack');
const Project = require('../../models/Project');
const auth = require('../../middleware/auth');
const { requireAccountsRole, requirePostingRole } = require('../../middleware/requireAccountsRole');
const { toDecimal128, toNumber } = require('../../utils/accounts/decimalHelpers');
const { nextClaimNumber } = require('../../utils/accounts/claimNumber');
const { nextJournalEntryNumber } = require('../../utils/accounts/entryNumber');
const { findSystemAccount } = require('../../utils/accounts/expenseAccountResolver');
const { getCompanyTaxContext } = require('../../utils/accounts/companyContext');
const buildSalesVoucher = require('../../utils/tally/buildSalesVoucher');

const router = express.Router();

const REVENUE_DEFAULT_CODE = '4100-REV-CONTRACTING';
const AR_TRADE_CODE = '1300-AR-TRADE';
const AR_RETENTION_CODE = '1310-AR-RETENTION';
const OUTPUT_VAT_CODE = '2300-OUTPUT-VAT-5';

function computeClaimTotals({ lines = [], vatRate = 5, retentionRate = 0 }) {
  const grossAmount = lines.reduce((s, l) => s + toNumber(l.amount), 0);
  const vatAmount = grossAmount * (toNumber(vatRate) / 100);
  const totalInclVat = grossAmount + vatAmount;
  const retention = grossAmount * (toNumber(retentionRate) / 100);
  // Net receivable (i.e. what customer actually owes now) = total invoice minus retention held back.
  const netInvoiceAmount = totalInclVat - retention;
  return { grossAmount, vatAmount, totalInclVat, retention, netInvoiceAmount };
}


/** Projects eligible for sales claims: active or completed, populated with customer info. */
router.get('/eligible-projects', auth, requireAccountsRole, async (req, res) => {
  try {
    const projects = await Project.find({ status: { $in: ['active', 'completed'] } })
      .select('name budget labourBudgetAmount leadId status')
      .populate('leadId', 'customerName enquiryNumber')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    // Annotate with YTD claim totals
    const projectIds = projects.map(p => p._id);
    const priorClaims = await SalesClaim.aggregate([
      { $match: { projectId: { $in: projectIds }, status: { $in: ['approved', 'journalized', 'collected'] } } },
      { $group: { _id: '$projectId', claimedGross: { $sum: { $toDouble: '$grossAmount' } }, claimedCount: { $sum: 1 } } }
    ]);
    const ytdMap = new Map(priorClaims.map(c => [String(c._id), c]));
    const decorated = projects.map(p => ({
      ...p,
      customerName: p.leadId?.customerName || '',
      priorClaimed: ytdMap.get(String(p._id))?.claimedGross || 0,
      priorClaimCount: ytdMap.get(String(p._id))?.claimedCount || 0
    }));
    res.json(decorated);
  } catch (err) {
    console.error('Error fetching eligible projects:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, requireAccountsRole, async (req, res) => {
  try {
    const { status, projectId, search, limit, skip } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (projectId) filter.projectId = projectId;
    if (search && search.trim()) filter.claimNumber = { $regex: search.trim(), $options: 'i' };

    const pageLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const pageSkip = parseInt(skip, 10) || 0;

    const [items, total] = await Promise.all([
      SalesClaim.find(filter)
        .populate('projectId', 'name leadId budget')
        .populate('journalEntry', 'entryNumber status tallySyncStatus')
        .sort({ claimDate: -1, createdAt: -1 })
        .skip(pageSkip)
        .limit(pageLimit)
        .lean(),
      SalesClaim.countDocuments(filter)
    ]);
    res.json({ items, total, limit: pageLimit, skip: pageSkip });
  } catch (err) {
    console.error('Error listing sales claims:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, requireAccountsRole, async (req, res) => {
  try {
    const claim = await SalesClaim.findById(req.params.id)
      .populate({ path: 'projectId', select: 'name leadId budget', populate: { path: 'leadId', select: 'customerName enquiryNumber' } })
      .populate('journalEntry', 'entryNumber status tallySyncStatus postedAt')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('edits.editedBy', 'name email');
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    res.json(claim);
  } catch (err) {
    console.error('Error fetching claim:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/** Create a draft sales claim. */
router.post('/', auth, requirePostingRole, async (req, res) => {
  try {
    const {
      projectId, claimPeriod, claimDate, percentComplete,
      lines, vatRate = 5, retentionRate = 0, customerTRN, notes
    } = req.body;

    if (!projectId) return res.status(400).json({ message: 'Project is required' });
    if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ message: 'At least one line is required' });
    if (!claimPeriod?.from || !claimPeriod?.to) return res.status(400).json({ message: 'Claim period from/to is required' });

    const project = await Project.findById(projectId).select('name leadId budget').populate('leadId', 'customerName');
    if (!project) return res.status(400).json({ message: 'Project not found' });

    const totals = computeClaimTotals({ lines, vatRate, retentionRate });

    const claim = await SalesClaim.create({
      claimNumber: await nextClaimNumber(claimDate ? new Date(claimDate) : new Date()),
      projectId,
      claimPeriod: { from: new Date(claimPeriod.from), to: new Date(claimPeriod.to) },
      claimDate: claimDate ? new Date(claimDate) : new Date(),
      percentComplete: toDecimal128(percentComplete || 0),
      lines: lines.map(l => ({
        description: (l.description || '').trim(),
        milestoneRef: l.milestoneRef?.trim(),
        amount: toDecimal128(l.amount),
        revenueAccount: l.revenueAccount || undefined
      })),
      grossAmount: toDecimal128(totals.grossAmount),
      vatAmount: toDecimal128(totals.vatAmount),
      retentionRate: toDecimal128(retentionRate),
      retention: toDecimal128(totals.retention),
      netInvoiceAmount: toDecimal128(totals.netInvoiceAmount),
      customerName: project.leadId?.customerName || '',
      customerTRN: customerTRN || '',
      status: 'draft',
      notes: notes?.trim(),
      createdBy: req.user.userId
    });

    await claim.populate('projectId', 'name leadId');
    res.status(201).json(claim);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Claim number conflict — retry' });
    console.error('Error creating claim:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** Edit a draft claim (cannot edit after approval). */
router.put('/:id', auth, requirePostingRole, async (req, res) => {
  try {
    const claim = await SalesClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    if (claim.status !== 'draft') {
      return res.status(400).json({ message: `Cannot edit a ${claim.status} claim. Cancel and re-create instead.` });
    }

    const { claimPeriod, claimDate, percentComplete, lines, vatRate, retentionRate, customerTRN, notes } = req.body;
    const changes = [];

    if (Array.isArray(lines)) {
      claim.lines = lines.map(l => ({
        description: (l.description || '').trim(),
        milestoneRef: l.milestoneRef?.trim(),
        amount: toDecimal128(l.amount),
        revenueAccount: l.revenueAccount || undefined
      }));
      changes.push({ field: 'lines', from: '...', to: `${lines.length} lines` });
    }
    if (claimPeriod?.from) claim.claimPeriod.from = new Date(claimPeriod.from);
    if (claimPeriod?.to) claim.claimPeriod.to = new Date(claimPeriod.to);
    if (claimDate) claim.claimDate = new Date(claimDate);
    if (percentComplete !== undefined) claim.percentComplete = toDecimal128(percentComplete);
    if (customerTRN !== undefined) claim.customerTRN = customerTRN;
    if (notes !== undefined) claim.notes = notes?.trim();

    const effectiveVat = vatRate !== undefined ? vatRate : 5;
    const effectiveRetention = retentionRate !== undefined ? retentionRate : toNumber(claim.retentionRate);
    const totals = computeClaimTotals({
      lines: claim.lines.map(l => ({ amount: toNumber(l.amount) })),
      vatRate: effectiveVat,
      retentionRate: effectiveRetention
    });
    claim.grossAmount = toDecimal128(totals.grossAmount);
    claim.vatAmount = toDecimal128(totals.vatAmount);
    claim.retentionRate = toDecimal128(effectiveRetention);
    claim.retention = toDecimal128(totals.retention);
    claim.netInvoiceAmount = toDecimal128(totals.netInvoiceAmount);

    if (changes.length) claim.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });

    await claim.save();
    res.json(claim);
  } catch (err) {
    console.error('Error updating claim:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** Approve a draft claim. Admin/Manager only (not account_manager). */
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.some(r => ['admin', 'manager'].includes(r))) {
      return res.status(403).json({ message: 'Approval requires Admin or Manager role' });
    }
    const claim = await SalesClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    if (claim.status !== 'draft') {
      return res.status(400).json({ message: `Cannot approve a ${claim.status} claim` });
    }
    claim.status = 'approved';
    claim.approvedBy = req.user.userId;
    claim.approvedAt = new Date();
    await claim.save();
    res.json({ message: 'Claim approved', claim });
  } catch (err) {
    console.error('Error approving claim:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/** Invoice + generate Tally Sales Voucher XML. Transitions approved -> journalized. */
router.post('/:id/invoice-and-generate-xml', auth, requirePostingRole, async (req, res) => {
  try {
    const claim = await SalesClaim.findById(req.params.id)
      .populate({ path: 'projectId', select: 'name leadId', populate: { path: 'leadId', select: 'customerName' } });
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    if (claim.status !== 'approved') {
      return res.status(400).json({ message: `Only approved claims can be invoiced (current: ${claim.status})` });
    }

    // Ledger lookups
    const arTrade = await findSystemAccount(AR_TRADE_CODE);
    const arRetention = await findSystemAccount(AR_RETENTION_CODE);
    const outputVat = await findSystemAccount(OUTPUT_VAT_CODE);
    if (!arTrade || !outputVat) {
      return res.status(500).json({ message: 'Missing AR/VAT ledgers in Chart of Accounts' });
    }

    const grossAmount = toNumber(claim.grossAmount);
    const vatAmount = toNumber(claim.vatAmount);
    const retention = toNumber(claim.retention);
    const totalInclVat = grossAmount + vatAmount;
    const debtorsPortion = totalInclVat - retention;

    if (retention > 0 && !arRetention) {
      return res.status(500).json({ message: 'Retention configured but Retention Receivable ledger missing' });
    }

    // Per-line revenue accounts - group debits by account
    const revenueBuckets = new Map();
    for (const line of claim.lines) {
      let acctId = line.revenueAccount;
      if (!acctId) {
        const defaultRev = await findSystemAccount(REVENUE_DEFAULT_CODE);
        if (!defaultRev) return res.status(500).json({ message: 'Default revenue ledger missing' });
        acctId = defaultRev._id;
      }
      const key = String(acctId);
      revenueBuckets.set(key, (revenueBuckets.get(key) || 0) + toNumber(line.amount));
    }

    const entryNumber = await nextJournalEntryNumber(new Date());

    const lines = [
      // Debit the customer's debtor ledger for the non-retention portion
      {
        account: arTrade._id,
        debit: toDecimal128(debtorsPortion),
        credit: toDecimal128(0),
        description: `Invoice: ${claim.customerName || 'Customer'}`
      }
    ];
    if (retention > 0) {
      lines.push({
        account: arRetention._id,
        debit: toDecimal128(retention),
        credit: toDecimal128(0),
        description: `Retention (${toNumber(claim.retentionRate)}%)`
      });
    }
    // Credit each revenue bucket (carries cost center = project)
    for (const [acctId, amt] of revenueBuckets.entries()) {
      lines.push({
        account: acctId,
        debit: toDecimal128(0),
        credit: toDecimal128(amt),
        costCenter: claim.projectId._id,
        description: `Revenue: ${claim.projectId.name}`
      });
    }
    // Credit output VAT
    if (vatAmount > 0) {
      lines.push({
        account: outputVat._id,
        debit: toDecimal128(0),
        credit: toDecimal128(vatAmount),
        vatCode: 'STD-5',
        vatAmount: toDecimal128(vatAmount),
        description: 'Output VAT 5%'
      });
    }

    const narration = `Sales invoice - Claim ${claim.claimNumber} - Project ${claim.projectId.name}${retention > 0 ? ` (Retention ${toNumber(claim.retentionRate)}%)` : ''}`;

    const journal = new JournalEntry({
      entryNumber,
      entryDate: claim.claimDate,
      narration,
      voucherType: 'SALES',
      lines,
      source: {
        kind: 'SALES_CLAIM',
        salesClaim: claim._id,
        project: claim.projectId._id
      },
      status: 'POSTED',
      postedBy: req.user.userId,
      postedAt: new Date(),
      createdBy: req.user.userId
    });

    await journal.save();

    claim.status = 'journalized';
    claim.journalEntry = journal._id;
    await claim.save();

    await journal.populate('lines.account', 'code name tallyLedgerName');
    await journal.populate({ path: 'lines.costCenter', select: 'name' });

    const company = await getCompanyTaxContext();

    const { xml, checksum } = buildSalesVoucher(journal, {
      customer: { name: claim.customerName || '', trn: claim.customerTRN || '' },
      project: { name: claim.projectId.name },
      salesClaim: { claimNumber: claim.claimNumber },
      company
    });

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
    res.setHeader('Content-Disposition', `attachment; filename="SV-${journal.entryNumber}.xml"`);
    res.send(xml);
  } catch (err) {
    console.error('Error invoicing claim:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** Cancel a draft or approved claim (cannot cancel journalized). */
router.post('/:id/cancel', auth, requirePostingRole, async (req, res) => {
  try {
    const claim = await SalesClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    if (claim.status === 'journalized' || claim.status === 'collected') {
      return res.status(400).json({ message: `Cannot cancel a ${claim.status} claim. Reverse the journal instead.` });
    }
    claim.status = 'cancelled';
    await claim.save();
    res.json({ claim });
  } catch (err) {
    console.error('Error cancelling claim:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
