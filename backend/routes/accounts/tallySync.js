const express = require('express');
const JournalEntry = require('../../models/JournalEntry');
const VoucherSyncTrack = require('../../models/VoucherSyncTrack');
const SupplierBill = require('../../models/SupplierBill');
const SalesClaim = require('../../models/SalesClaim');
const auth = require('../../middleware/auth');
const { requireAccountsRole, requirePostingRole } = require('../../middleware/requireAccountsRole');
const { buildForVoucherType } = require('../../utils/tally/dispatch');
const { buildMultiVoucherEnvelope, extractVoucherFromEnvelope } = require('../../utils/tally/xmlBuilder');
const { getCompanyTaxContext } = require('../../utils/accounts/companyContext');

const router = express.Router();

/**
 * Gather the context object the right builder needs for a given JournalEntry.
 * Kept inline here (not in a dedicated util) because it's coupled to the
 * shape each builder expects + each source kind.
 */
async function resolveContext(journal) {
  const ctx = { company: await getCompanyTaxContext() };
  const src = journal.source || {};

  if (src.kind === 'SUPPLIER_BILL' && src.supplierBill) {
    const bill = await SupplierBill.findById(src.supplierBill)
      .populate('supplierId', 'name trn address')
      .populate('purchaseOrderId', 'poNumber')
      .lean();
    if (bill) {
      ctx.supplier = { name: bill.supplierId?.name, trn: bill.supplierId?.trn || bill.supplierTRN, address: bill.supplierId?.address };
      ctx.purchaseOrder = bill.purchaseOrderId ? { poNumber: bill.purchaseOrderId.poNumber, grnNumber: bill.grnNumber } : {};
      ctx.supplierBill = { billNumber: bill.billNumber };
    }
  } else if (src.kind === 'SALES_CLAIM' && src.salesClaim) {
    const claim = await SalesClaim.findById(src.salesClaim)
      .populate({ path: 'projectId', select: 'name' })
      .lean();
    if (claim) {
      ctx.customer = { name: claim.customerName, trn: claim.customerTRN };
      ctx.project = { name: claim.projectId?.name };
      ctx.salesClaim = { claimNumber: claim.claimNumber };
    }
  } else if (src.kind === 'SALARY_RUN' && src.salaryRun) {
    // Journal voucher - narration + reference carry the context
    const SalaryRun = require('../../models/SalaryRun');
    const run = await SalaryRun.findById(src.salaryRun).select('runNumber').lean();
    ctx.reference = run?.runNumber;
  }

  return ctx;
}

/** Ensure a JE's lines have populated account + costCenter refs for the builders. */
async function populateForBuilder(journal) {
  await journal.populate('lines.account', 'code name tallyLedgerName');
  await journal.populate({ path: 'lines.costCenter', select: 'name' });
  return journal;
}

/**
 * GET /pending - Journal entries that still need to flow to Tally.
 * By default returns PENDING + DOWNLOADED so the AM sees both
 * (downloaded but not yet confirmed + never touched).
 */
router.get('/pending', auth, requireAccountsRole, async (req, res) => {
  try {
    const { syncStatus, voucherType, from, to, limit, skip } = req.query;
    const filter = { status: 'POSTED' };
    if (syncStatus) {
      filter.tallySyncStatus = syncStatus;
    } else {
      filter.tallySyncStatus = { $in: ['PENDING', 'DOWNLOADED'] };
    }
    if (voucherType) filter.voucherType = voucherType;
    if (from || to) {
      filter.entryDate = {};
      if (from) filter.entryDate.$gte = new Date(from);
      if (to) filter.entryDate.$lte = new Date(to);
    }

    const pageLimit = Math.min(parseInt(limit, 10) || 100, 500);
    const pageSkip = parseInt(skip, 10) || 0;

    const [items, total, counts] = await Promise.all([
      JournalEntry.find(filter)
        .select('entryNumber entryDate voucherType narration tallySyncStatus source lines status postedAt')
        .sort({ entryDate: -1 })
        .skip(pageSkip)
        .limit(pageLimit)
        .lean(),
      JournalEntry.countDocuments(filter),
      JournalEntry.aggregate([
        { $match: { status: 'POSTED' } },
        { $group: { _id: '$tallySyncStatus', count: { $sum: 1 } } }
      ])
    ]);

    const summary = { PENDING: 0, DOWNLOADED: 0, SYNCED: 0, FAILED: 0 };
    counts.forEach(c => { summary[c._id] = c.count; });

    res.json({ items, total, summary, limit: pageLimit, skip: pageSkip });
  } catch (err) {
    console.error('Error listing pending sync:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /:id/xml - Download the XML for a specific (POSTED) journal entry.
 * Re-generating an already-downloaded entry is allowed and produces a new VoucherSyncTrack attempt.
 */
router.get('/:id/xml', auth, requireAccountsRole, async (req, res) => {
  try {
    const journal = await JournalEntry.findById(req.params.id);
    if (!journal) return res.status(404).json({ message: 'Journal entry not found' });
    if (journal.status !== 'POSTED') {
      return res.status(400).json({ message: `Only POSTED entries produce XML (current: ${journal.status})` });
    }

    await populateForBuilder(journal);
    const ctx = await resolveContext(journal);
    const { xml, checksum } = buildForVoucherType(journal.voucherType, journal, ctx);

    const priorAttempts = await VoucherSyncTrack.countDocuments({ journalEntry: journal._id });
    await VoucherSyncTrack.create({
      journalEntry: journal._id,
      attemptNo: priorAttempts + 1,
      action: 'DOWNLOADED',
      xmlPayload: xml,
      xmlChecksum: checksum,
      performedBy: req.user.userId
    });

    if (journal.tallySyncStatus !== 'SYNCED') {
      journal.tallySyncStatus = 'DOWNLOADED';
      await journal.save();
    }

    const prefixByType = { PURCHASE: 'PV', SALES: 'SV', PAYMENT: 'PYT', RECEIPT: 'RCT', JOURNAL: 'JV', CONTRA: 'CV' };
    const prefix = prefixByType[journal.voucherType] || 'V';

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}-${journal.entryNumber}.xml"`);
    res.send(xml);
  } catch (err) {
    console.error('Error generating XML:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/**
 * POST /:id/ack - Phase 2 agent acknowledges a successful import.
 * Accepts { checksum, agentId? } and flips the JE to SYNCED.
 * Validates the checksum matches a prior DOWNLOADED attempt.
 *
 * In Phase 1 this is gated by the accounts role; in Phase 2 it will be
 * gated by an agent API key / dedicated role instead.
 */
router.post('/:id/ack', auth, requirePostingRole, async (req, res) => {
  try {
    const { checksum, agentId } = req.body || {};
    if (!checksum) return res.status(400).json({ message: 'checksum is required' });

    const journal = await JournalEntry.findById(req.params.id);
    if (!journal) return res.status(404).json({ message: 'Journal entry not found' });

    // Find the download attempt that matches the checksum
    const attempt = await VoucherSyncTrack.findOne({
      journalEntry: journal._id,
      action: 'DOWNLOADED',
      xmlChecksum: checksum
    }).sort({ attemptNo: -1 });
    if (!attempt) {
      return res.status(400).json({ message: `No prior DOWNLOADED attempt matches checksum ${checksum.substring(0, 16)}...` });
    }

    const priorAttempts = await VoucherSyncTrack.countDocuments({ journalEntry: journal._id });
    await VoucherSyncTrack.create({
      journalEntry: journal._id,
      attemptNo: priorAttempts + 1,
      action: 'ACK_SYNCED',
      xmlChecksum: checksum,
      agentId: agentId || undefined,
      performedBy: req.user.userId
    });
    journal.tallySyncStatus = 'SYNCED';
    await journal.save();

    res.json({ message: 'Sync acknowledged', journal: { _id: journal._id, entryNumber: journal.entryNumber, tallySyncStatus: journal.tallySyncStatus } });
  } catch (err) {
    console.error('Error acknowledging sync:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/**
 * GET /bundle - Aggregate all PENDING (and optionally DOWNLOADED) entries into a
 * single multi-voucher Tally XML envelope. Produces one file the AM can hand
 * to Tally's Import Masters/Vouchers flow in one operation.
 *
 * Query: ?syncStatus=PENDING (default) | DOWNLOADED | both
 */
router.get('/bundle', auth, requireAccountsRole, async (req, res) => {
  try {
    const { syncStatus, from, to } = req.query;
    const filter = { status: 'POSTED' };
    if (syncStatus === 'DOWNLOADED') filter.tallySyncStatus = 'DOWNLOADED';
    else if (syncStatus === 'both') filter.tallySyncStatus = { $in: ['PENDING', 'DOWNLOADED'] };
    else filter.tallySyncStatus = 'PENDING';
    if (from || to) {
      filter.entryDate = {};
      if (from) filter.entryDate.$gte = new Date(from);
      if (to) filter.entryDate.$lte = new Date(to);
    }

    const journals = await JournalEntry.find(filter).sort({ entryDate: 1 });
    if (journals.length === 0) {
      return res.status(404).json({ message: 'No entries match the bundle filter' });
    }

    const voucherBodies = [];
    const bundledIds = [];
    for (const journal of journals) {
      await populateForBuilder(journal);
      const ctx = await resolveContext(journal);
      const { xml, checksum } = buildForVoucherType(journal.voucherType, journal, ctx);

      voucherBodies.push(extractVoucherFromEnvelope(xml));

      const priorAttempts = await VoucherSyncTrack.countDocuments({ journalEntry: journal._id });
      await VoucherSyncTrack.create({
        journalEntry: journal._id,
        attemptNo: priorAttempts + 1,
        action: 'DOWNLOADED',
        xmlPayload: xml,
        xmlChecksum: checksum,
        performedBy: req.user.userId
      });
      if (journal.tallySyncStatus !== 'SYNCED') {
        journal.tallySyncStatus = 'DOWNLOADED';
        await journal.save();
      }
      bundledIds.push(journal.entryNumber);
    }

    const bundledXml = buildMultiVoucherEnvelope({ voucherXmls: voucherBodies });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="Tally-Bundle-${stamp}.xml"`);
    res.setHeader('X-Bundle-Count', String(bundledIds.length));
    res.setHeader('X-Bundle-Entries', bundledIds.join(','));
    res.send(bundledXml);
  } catch (err) {
    console.error('Error building bundle:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/**
 * GET /:id/history - Retrieve all sync attempts for a journal entry, for the UI.
 */
router.get('/:id/history', auth, requireAccountsRole, async (req, res) => {
  try {
    const attempts = await VoucherSyncTrack.find({ journalEntry: req.params.id })
      .select('-xmlPayload')
      .populate('performedBy', 'name email')
      .sort({ attemptNo: -1 })
      .lean();
    res.json(attempts);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
