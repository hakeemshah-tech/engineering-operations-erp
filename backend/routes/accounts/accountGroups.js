const express = require('express');
const AccountGroup = require('../../models/AccountGroup');
const ChartOfAccounts = require('../../models/ChartOfAccounts');
const auth = require('../../middleware/auth');
const { requireAccountsRole, requirePostingRole } = require('../../middleware/requireAccountsRole');
const { isOperationalSubGroup } = require('../../utils/accounts/operationalScope');

const router = express.Router();

const PRIMARY_GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity', 'Uncategorized'];

// Predefined sub-groups per primary classification - the MINIMAL operational set
// the ERP actually transacts in (see utils/accounts/operationalScope.js). Pure
// accounting groups (Equity, Fixed Assets, Depreciation, Investments, Loans,
// Provisions, Purchase/Direct Incomes …) are deliberately NOT seeded - they're
// the accountant's domain and must stay out of our sync. Seeded once so the
// cascading dropdown has sensible options out of the box; the Account Manager can
// still add more (which will also sync, being non-pure-accounting by intent).
const DEFAULT_GROUPS = {
  Assets: ['Cash-in-Hand', 'Bank Accounts', 'Sundry Debtors', 'Current Assets', 'Stock-in-Hand'],
  Liabilities: ['Sundry Creditors', 'Current Liabilities', 'Duties & Taxes'],
  Income: ['Sales Accounts', 'Indirect Incomes'],
  Expenses: ['Direct Expenses', 'Indirect Expenses']
};

/**
 * Seed the defaults once, and migrate any distinct sub-group names already used
 * by existing ledgers so every ledger's parent group resolves during export.
 * Idempotent-ish: only runs the heavy work when the collection is empty.
 */
async function ensureSeeded() {
  const count = await AccountGroup.countDocuments();
  if (count > 0) return;

  const seen = new Set();
  const docs = [];
  for (const group of PRIMARY_GROUPS) {
    for (const name of (DEFAULT_GROUPS[group] || [])) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      docs.push({ name, group, isSystem: true });
    }
  }

  // Migrate sub-groups already used by existing ledgers (dedupe by name; the
  // predefined defaults above win, keeping names globally unique for Tally).
  // Skip non-operational sub-groups so pure-accounting buckets (Equity, Fixed
  // Assets, …) are never re-introduced from legacy data.
  const existing = await ChartOfAccounts.find({ subGroup: { $nin: [null, ''] } })
    .select('group subGroup').lean();
  for (const acc of existing) {
    const name = (acc.subGroup || '').trim();
    if (!name || !isOperationalSubGroup(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({ name, group: PRIMARY_GROUPS.includes(acc.group) ? acc.group : 'Expenses', isSystem: true });
  }

  if (docs.length) {
    try { await AccountGroup.insertMany(docs, { ordered: false }); } catch { /* races/dupes ok */ }
  }
}

/** GET / - list sub-groups, optionally filtered by primary group (for the cascade). */
router.get('/', auth, requireAccountsRole, async (req, res) => {
  try {
    await ensureSeeded();
    const { group, includeInactive } = req.query;
    const filter = {};
    if (group && PRIMARY_GROUPS.includes(group)) filter.group = group;
    if (includeInactive !== 'true') filter.isActive = true;
    const groups = await AccountGroup.find(filter).sort({ group: 1, name: 1 }).lean();
    res.json(groups);
  } catch (err) {
    console.error('Error listing account groups:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST / - DEPRECATED / DISABLED. Sub-groups are no longer created by hand in the
 * ERP: Tally Prime owns the group hierarchy, and sub-groups are ingested
 * automatically during a Tally masters XML sync - but only under a whitelisted
 * operational parent (see config/tallyConfig.js and the import-tally-masters
 * route). Kept as an explicit 403 so any stale client / API caller gets a clear
 * message instead of silently introducing unmanaged structure.
 */
router.post('/', auth, requirePostingRole, (req, res) => {
  res.status(403).json({
    message: 'Manual sub-group creation is disabled. Tally Prime owns the account hierarchy — sub-groups are ingested automatically when you reconcile your Tally masters XML.'
  });
});

/** PUT /:id - rename / re-classify / (de)activate a sub-group. */
router.put('/:id', auth, requirePostingRole, async (req, res) => {
  try {
    const g = await AccountGroup.findById(req.params.id);
    if (!g) return res.status(404).json({ message: 'Sub-group not found' });

    const { name, group, isActive } = req.body;

    if (group !== undefined && !PRIMARY_GROUPS.includes(group)) {
      return res.status(400).json({ message: `Group must be one of: ${PRIMARY_GROUPS.join(', ')}` });
    }

    const oldName = g.name;
    if (name && name.trim() && name.trim() !== g.name) {
      const newName = name.trim();
      const dup = await AccountGroup.findOne({
        _id: { $ne: g._id },
        name: new RegExp(`^${newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      });
      if (dup) return res.status(400).json({ message: `A sub-group named "${newName}" already exists` });
      // Track the Tally-known name for an in-place Alter rename (first change only).
      if (!g.previousName) g.previousName = oldName;
      if (g.previousName === newName) g.previousName = '';
      g.name = newName;
      // Keep ledgers pointing at the new sub-group name.
      await ChartOfAccounts.updateMany({ subGroup: oldName }, { $set: { subGroup: newName } });
    }
    if (group !== undefined) g.group = group;
    if (isActive !== undefined) g.isActive = !!isActive;

    await g.save();
    res.json(g);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Duplicate sub-group name' });
    console.error('Error updating account group:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/** DELETE /:id - remove a sub-group only if no ledger still uses it. */
router.delete('/:id', auth, requirePostingRole, async (req, res) => {
  try {
    const g = await AccountGroup.findById(req.params.id);
    if (!g) return res.status(404).json({ message: 'Sub-group not found' });

    const inUse = await ChartOfAccounts.findOne({ subGroup: g.name }).select('_id code').lean();
    if (inUse) {
      return res.status(400).json({ message: `Cannot delete: sub-group "${g.name}" is used by one or more ledgers. Reassign them first, or set it inactive.` });
    }
    await AccountGroup.deleteOne({ _id: g._id });
    res.json({ message: 'Sub-group deleted' });
  } catch (err) {
    console.error('Error deleting account group:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
module.exports.ensureSeeded = ensureSeeded;
