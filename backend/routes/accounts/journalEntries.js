const express = require('express');
const JournalEntry = require('../../models/JournalEntry');
const ChartOfAccounts = require('../../models/ChartOfAccounts');
const auth = require('../../middleware/auth');
const { requireAccountsRole, requirePostingRole } = require('../../middleware/requireAccountsRole');
const { toDecimal128 } = require('../../utils/accounts/decimalHelpers');
const { nextJournalEntryNumber } = require('../../utils/accounts/entryNumber');

const router = express.Router();

const VOUCHER_TYPES = ['PURCHASE', 'SALES', 'PAYMENT', 'RECEIPT', 'JOURNAL', 'CONTRA'];

function buildLineSubset(rawLines = []) {
  return rawLines.map(l => ({
    account: l.account,
    debit: toDecimal128(l.debit || 0),
    credit: toDecimal128(l.credit || 0),
    costCenter: l.costCenter || undefined,
    vatCode: l.vatCode || null,
    vatAmount: toDecimal128(l.vatAmount || 0),
    description: l.description?.trim()
  }));
}

router.get('/', auth, requireAccountsRole, async (req, res) => {
  try {
    const { status, voucherType, tallySyncStatus, from, to, search, limit, skip } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (voucherType) filter.voucherType = voucherType;
    if (tallySyncStatus) filter.tallySyncStatus = tallySyncStatus;
    if (from || to) {
      filter.entryDate = {};
      if (from) filter.entryDate.$gte = new Date(from);
      if (to) filter.entryDate.$lte = new Date(to);
    }
    if (search && search.trim()) {
      const rx = { $regex: search.trim(), $options: 'i' };
      filter.$or = [{ entryNumber: rx }, { narration: rx }];
    }

    const pageLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const pageSkip = parseInt(skip, 10) || 0;

    const [items, total] = await Promise.all([
      JournalEntry.find(filter)
        .populate('createdBy', 'name email')
        .populate('postedBy', 'name email')
        .sort({ entryDate: -1, createdAt: -1 })
        .skip(pageSkip)
        .limit(pageLimit)
        .lean(),
      JournalEntry.countDocuments(filter)
    ]);
    res.json({ items, total, limit: pageLimit, skip: pageSkip });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, requireAccountsRole, async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('postedBy', 'name email')
      .populate('reversedBy', 'name email')
      .populate('reversalOf', 'entryNumber status')
      .populate('lines.account', 'code name group subGroup tallyLedgerName')
      .populate('lines.costCenter', 'projectTitle')
      .populate('edits.editedBy', 'name email');
    if (!entry) return res.status(404).json({ message: 'Journal entry not found' });
    res.json(entry);
  } catch (error) {
    console.error('Error fetching journal entry:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST: create a manual draft journal entry (source.kind = MANUAL)
router.post('/', auth, requirePostingRole, async (req, res) => {
  try {
    const { voucherType, entryDate, narration, lines, source } = req.body;

    if (!VOUCHER_TYPES.includes(voucherType)) {
      return res.status(400).json({ message: `voucherType must be one of: ${VOUCHER_TYPES.join(', ')}` });
    }
    if (!Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ message: 'A journal entry must have at least two lines' });
    }

    // Validate all account refs resolve
    const accountIds = lines.map(l => l.account).filter(Boolean);
    const accountDocs = await ChartOfAccounts.find({ _id: { $in: accountIds } }).select('_id isActive').lean();
    if (accountDocs.length !== new Set(accountIds.map(String)).size) {
      return res.status(400).json({ message: 'One or more line accounts do not exist' });
    }
    const inactive = accountDocs.find(a => !a.isActive);
    if (inactive) {
      return res.status(400).json({ message: 'One or more line accounts are inactive' });
    }

    const effectiveSource = source && source.kind ? source : { kind: 'MANUAL' };
    if (effectiveSource.kind !== 'MANUAL') {
      return res.status(400).json({
        message: 'Only MANUAL source is accepted via this endpoint. Use the dedicated flow (supplier-bills, sales-claims, salary-runs) for other sources.'
      });
    }

    const entryNumber = await nextJournalEntryNumber(entryDate ? new Date(entryDate) : new Date());

    const entry = new JournalEntry({
      entryNumber,
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      narration: narration?.trim(),
      voucherType,
      lines: buildLineSubset(lines),
      source: { kind: 'MANUAL' },
      createdBy: req.user.userId
    });

    await entry.save();
    await entry.populate('lines.account', 'code name tallyLedgerName');
    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating journal entry:', error);
    res.status(400).json({ message: error.message || 'Server error' });
  }
});

// PUT: update a DRAFT entry (cannot update posted entries)
router.put('/:id', auth, requirePostingRole, async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Journal entry not found' });
    if (entry.status !== 'DRAFT') {
      return res.status(400).json({ message: `Cannot edit a ${entry.status} journal entry. Reverse it instead.` });
    }
    if (entry.source?.kind !== 'MANUAL') {
      return res.status(400).json({ message: 'Only MANUAL journal entries can be edited here. Use the source flow.' });
    }

    const { voucherType, entryDate, narration, lines } = req.body;
    const changes = [];

    if (voucherType && voucherType !== entry.voucherType) {
      if (!VOUCHER_TYPES.includes(voucherType)) {
        return res.status(400).json({ message: `Invalid voucherType: ${voucherType}` });
      }
      changes.push({ field: 'voucherType', from: entry.voucherType, to: voucherType });
      entry.voucherType = voucherType;
    }
    if (entryDate) {
      const d = new Date(entryDate);
      if (d.getTime() !== entry.entryDate.getTime()) {
        changes.push({ field: 'entryDate', from: entry.entryDate, to: d });
        entry.entryDate = d;
      }
    }
    if (narration !== undefined && narration.trim() !== (entry.narration || '')) {
      changes.push({ field: 'narration', from: entry.narration, to: narration.trim() });
      entry.narration = narration.trim();
    }
    if (Array.isArray(lines)) {
      if (lines.length < 2) {
        return res.status(400).json({ message: 'A journal entry must have at least two lines' });
      }
      const accountIds = lines.map(l => l.account).filter(Boolean);
      const accountDocs = await ChartOfAccounts.find({ _id: { $in: accountIds } }).select('_id isActive').lean();
      if (accountDocs.length !== new Set(accountIds.map(String)).size) {
        return res.status(400).json({ message: 'One or more line accounts do not exist' });
      }
      if (accountDocs.some(a => !a.isActive)) {
        return res.status(400).json({ message: 'One or more line accounts are inactive' });
      }
      changes.push({ field: 'lines', from: entry.lines.length, to: lines.length });
      entry.lines = buildLineSubset(lines);
    }

    if (changes.length > 0) {
      entry.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
    }

    await entry.save();
    await entry.populate('lines.account', 'code name tallyLedgerName');
    res.json(entry);
  } catch (error) {
    console.error('Error updating journal entry:', error);
    res.status(400).json({ message: error.message || 'Server error' });
  }
});

// POST /:id/post -> DRAFT -> POSTED
router.post('/:id/post', auth, requirePostingRole, async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Journal entry not found' });
    if (entry.status !== 'DRAFT') {
      return res.status(400).json({ message: `Only DRAFT entries can be posted (current: ${entry.status})` });
    }

    entry.status = 'POSTED';
    entry.postedBy = req.user.userId;
    entry.postedAt = new Date();
    // Re-run validation to ensure the entry is still balanced
    await entry.save();

    res.json({ message: 'Journal entry posted', entry });
  } catch (error) {
    console.error('Error posting journal entry:', error);
    res.status(400).json({ message: error.message || 'Server error' });
  }
});

// POST /:id/reverse -> creates a reversing journal entry
// Sequential writes (no transaction) - standalone MongoDB doesn't support multi-doc txns.
// If the parent flip fails after reversal insert, the reversal's `reversalOf` link still
// makes the pair reconcilable; a retry simply marks the parent REVERSED.
router.post('/:id/reverse', auth, requirePostingRole, async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Journal entry not found' });
    if (entry.status !== 'POSTED') {
      return res.status(400).json({ message: `Only POSTED entries can be reversed (current: ${entry.status})` });
    }

    const reversalDate = req.body?.reversalDate ? new Date(req.body.reversalDate) : new Date();
    const reversalNumber = await nextJournalEntryNumber(reversalDate);

    const swappedLines = entry.lines.map(l => ({
      account: l.account,
      debit: l.credit,
      credit: l.debit,
      costCenter: l.costCenter,
      vatCode: l.vatCode,
      vatAmount: l.vatAmount,
      description: l.description
    }));

    const reversal = new JournalEntry({
      entryNumber: reversalNumber,
      entryDate: reversalDate,
      narration: `Reversal of ${entry.entryNumber}${req.body?.notes ? ' - ' + req.body.notes.trim() : ''}`,
      voucherType: entry.voucherType,
      lines: swappedLines,
      source: { kind: 'MANUAL' },
      status: 'POSTED',
      postedBy: req.user.userId,
      postedAt: new Date(),
      reversalOf: entry._id,
      createdBy: req.user.userId
    });
    await reversal.save();

    entry.status = 'REVERSED';
    entry.reversedBy = req.user.userId;
    entry.reversedAt = new Date();
    await entry.save();

    res.json({ message: 'Journal entry reversed', reversal });
  } catch (error) {
    console.error('Error reversing journal entry:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// DELETE a DRAFT only
router.delete('/:id', auth, requirePostingRole, async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Journal entry not found' });
    if (entry.status !== 'DRAFT') {
      return res.status(400).json({ message: `Cannot delete a ${entry.status} entry. Use reverse instead.` });
    }
    await JournalEntry.deleteOne({ _id: entry._id });
    res.json({ message: 'Draft journal entry deleted' });
  } catch (error) {
    console.error('Error deleting journal entry:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
