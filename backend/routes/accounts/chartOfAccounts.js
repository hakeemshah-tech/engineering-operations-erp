const express = require('express');
const ChartOfAccounts = require('../../models/ChartOfAccounts');
const JournalEntry = require('../../models/JournalEntry');
const auth = require('../../middleware/auth');
const { requireAccountsRole, requirePostingRole } = require('../../middleware/requireAccountsRole');
const { toDecimal128 } = require('../../utils/accounts/decimalHelpers');
const { isReservedTallyGroup } = require('../../utils/tally/buildLedgerMaster');

const router = express.Router();

const GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity', 'Uncategorized'];

// Normalise ERP-only classification tags: trimmed, de-duplicated (case-insensitive),
// no empties, capped. These are for internal filtering and are never sent to Tally.
function sanitizeTags(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const t of v) {
    const s = String(t == null ? '' : t).trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 30) break;
  }
  return out;
}

// Account-head lookups are needed by PO actors (procurement engineers picking an
// expense ledger on an Other PO) as well as accounts staff - a broader gate than
// the accounts-only COA CRUD below.
const ACCOUNT_HEAD_ROLES = ['admin', 'manager', 'account_manager', 'procurement_engineer'];
function requireAccountHeadAccess(req, res, next) {
  const roles = req.user?.roles || [];
  if (!roles.some(r => ACCOUNT_HEAD_ROLES.includes(r))) {
    return res.status(403).json({ message: 'Not authorized to list account heads' });
  }
  next();
}

// Lightweight, paginated, searchable list of ledgers for the Account Head
// dropdown. Returns only active accounts and a minimal projection. Must be
// declared before '/:id' so the literal path isn't captured as an id.
router.get('/options', auth, requireAccountHeadAccess, async (req, res) => {
  try {
    const { search, group } = req.query;
    const filter = { isActive: true };
    if (group && GROUPS.includes(group)) filter.group = group;
    if (search && search.trim()) {
      const rx = { $regex: search.trim(), $options: 'i' };
      filter.$or = [{ code: rx }, { name: rx }, { tallyLedgerName: rx }, { subGroup: rx }];
    }
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const [items, total] = await Promise.all([
      ChartOfAccounts.find(filter)
        .select('code name group subGroup')
        .sort({ group: 1, code: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      ChartOfAccounts.countDocuments(filter)
    ]);
    res.json({ items, total, page: pageNum, limit: limitNum, pages: Math.max(1, Math.ceil(total / limitNum)) });
  } catch (error) {
    console.error('Error fetching account head options:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bird's-eye counts for the Chart of Accounts header cards. Declared before
// '/:id' so the literal path isn't captured as an id.
router.get('/stats', auth, requireAccountsRole, async (req, res) => {
  try {
    const [totalLedgers, groups, subGroups] = await Promise.all([
      ChartOfAccounts.countDocuments({}),
      ChartOfAccounts.distinct('group'),
      ChartOfAccounts.distinct('subGroup')
    ]);
    res.json({
      totalLedgers,
      totalGroups: groups.filter(Boolean).length,
      totalSubGroups: subGroups.filter(Boolean).length
    });
  } catch (error) {
    console.error('Error fetching CoA stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, requireAccountsRole, async (req, res) => {
  try {
    const { search, group, isActive, page, limit } = req.query;
    const filter = {};
    if (group && GROUPS.includes(group)) filter.group = group;
    if (isActive === 'true') filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;
    if (search && search.trim()) {
      const rx = { $regex: search.trim(), $options: 'i' };
      filter.$or = [{ code: rx }, { name: rx }, { tallyLedgerName: rx }, { subGroup: rx }];
    }

    // Opt-in pagination: when `page` or `limit` is supplied, return a paginated
    // envelope { items, total, page, pages, limit }. Otherwise keep the legacy
    // flat-array response that existing callers (COA list, Journal form) rely on.
    if (page !== undefined || limit !== undefined) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const [items, total] = await Promise.all([
        ChartOfAccounts.find(filter)
          .populate('createdBy', 'name email')
          .sort({ group: 1, code: 1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        ChartOfAccounts.countDocuments(filter)
      ]);
      return res.json({
        items,
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.max(1, Math.ceil(total / limitNum))
      });
    }

    const accounts = await ChartOfAccounts.find(filter)
      .populate('createdBy', 'name email')
      .sort({ group: 1, code: 1 })
      .lean();

    res.json(accounts);
  } catch (error) {
    console.error('Error fetching chart of accounts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, requireAccountsRole, async (req, res) => {
  try {
    const account = await ChartOfAccounts.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('edits.editedBy', 'name email');
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json(account);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, requirePostingRole, async (req, res) => {
  try {
    const { code, name, group, subGroup, tallyLedgerName, vatApplicable, vatRate, currency, description, tags } = req.body;

    if (!code || !code.trim()) return res.status(400).json({ message: 'Account code is required' });
    if (!name || !name.trim()) return res.status(400).json({ message: 'Account name is required' });
    if (!GROUPS.includes(group)) return res.status(400).json({ message: `Group must be one of: ${GROUPS.join(', ')}` });
    if (!subGroup || !subGroup.trim()) return res.status(400).json({ message: 'Sub-group is required' });

    const duplicate = await ChartOfAccounts.findOne({ code: code.trim().toUpperCase() });
    if (duplicate) return res.status(400).json({ message: `Account with code "${code.trim()}" already exists` });

    // Rule 5: the Tally ledger name is optional. When not provided, auto-generate
    // a unique name as `${code} - ${name}` and flag it so future code/name edits
    // keep it in sync.
    const codeUpper = code.trim().toUpperCase();
    const displayName = name.trim();
    const provided = (tallyLedgerName || '').trim();

    // A ledger's Tally name must never equal a reserved Tally group (e.g. "Sundry
    // Debtors"): Tally can't create a ledger named after a built-in group, so it
    // would silently never sync. The auto-name (`${code} - ${name}`) is always safe.
    const finalTally = provided || `${codeUpper} - ${displayName}`;
    if (isReservedTallyGroup(finalTally)) {
      return res.status(400).json({ message: `"${finalTally}" is a reserved Tally group name, so a ledger can't use it. Pick a different name (e.g. add "Control").` });
    }

    const account = await ChartOfAccounts.create({
      code: codeUpper,
      name: displayName,
      group,
      subGroup: subGroup.trim(),
      tallyLedgerName: provided || `${codeUpper} - ${displayName}`,
      tallyLedgerNameAuto: !provided,
      vatApplicable: !!vatApplicable,
      vatRate: toDecimal128(vatRate || 0),
      currency: (currency || 'AED').toUpperCase().trim(),
      description: description?.trim(),
      tags: sanitizeTags(tags),
      createdBy: req.user.userId
    });

    await account.populate('createdBy', 'name email');
    res.status(201).json(account);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Duplicate account code' });
    console.error('Error creating account:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.put('/:id', auth, requirePostingRole, async (req, res) => {
  try {
    const account = await ChartOfAccounts.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const { code, name, group, subGroup, tallyLedgerName, vatApplicable, vatRate, currency, description, isActive, tags } = req.body;

    // GUID-mapped ledgers (reconciled to a pre-existing Tally ledger) have their
    // Tally ledger name PERMANENTLY locked to that GUID. The ERP code/name remain
    // freely editable for internal filtering, but they must never overwrite the
    // mapped Tally name or the GUID. (Ledgers WITHOUT a GUID keep auto-generating
    // their Tally name from code+name, propagated to Tally as a rename on export.)
    const isGuidMapped = !!account.tallyGuid;
    if (isGuidMapped && tallyLedgerName !== undefined && tallyLedgerName.trim() !== (account.tallyLedgerName || '')) {
      return res.status(409).json({
        message: 'This ledger is mapped to Tally by GUID, so its Tally ledger name is locked. You can still rename the ERP code/name for internal use — the mapping is unaffected.'
      });
    }

    // A ledger's Tally name must never equal a reserved Tally group (see POST).
    if (tallyLedgerName !== undefined && isReservedTallyGroup(tallyLedgerName.trim())) {
      return res.status(400).json({ message: `"${tallyLedgerName.trim()}" is a reserved Tally group name — choose a different ledger name (e.g. add "Control").` });
    }

    if (group !== undefined && !GROUPS.includes(group)) {
      return res.status(400).json({ message: `Group must be one of: ${GROUPS.join(', ')}` });
    }

    if (code && code.trim().toUpperCase() !== account.code) {
      const dup = await ChartOfAccounts.findOne({
        code: code.trim().toUpperCase(),
        _id: { $ne: account._id }
      });
      if (dup) return res.status(400).json({ message: `Account with code "${code.trim()}" already exists` });
    }

    // Snapshot the Tally-facing names BEFORE applying edits, so we can record
    // what Tally currently knows this ledger/group by (for rename-not-duplicate).
    const oldTallyLedgerName = account.tallyLedgerName;
    const oldSubGroup = account.subGroup;

    const changes = [];
    const fieldMap = {
      code: code ? code.trim().toUpperCase() : undefined,
      name: name?.trim(),
      group,
      subGroup: subGroup?.trim(),
      tallyLedgerName: tallyLedgerName?.trim(),
      vatApplicable: vatApplicable !== undefined ? !!vatApplicable : undefined,
      currency: currency ? currency.toUpperCase().trim() : undefined,
      description: description?.trim(),
      isActive: isActive !== undefined ? !!isActive : undefined
    };
    for (const [field, value] of Object.entries(fieldMap)) {
      if (value !== undefined && String(value) !== String(account[field] ?? '')) {
        changes.push({ field, from: account[field], to: value });
        account[field] = value;
      }
    }
    if (vatRate !== undefined) {
      const newRate = toDecimal128(vatRate);
      if (String(account.vatRate) !== String(newRate)) {
        changes.push({ field: 'vatRate', from: account.vatRate, to: newRate });
        account.vatRate = newRate;
      }
    }
    if (tags !== undefined) {
      const cleanTags = sanitizeTags(tags);
      if (String(account.tags || []) !== String(cleanTags)) {
        changes.push({ field: 'tags', from: account.tags, to: cleanTags });
        account.tags = cleanTags;
      }
    }

    // Rule 5: keep an auto-generated Tally name in sync with code/name. If the
    // user hand-entered a name in this edit, stop auto-managing it; otherwise
    // regenerate `${code} - ${name}` (the change flows into rename tracking below).
    const providedTallyName = (tallyLedgerName || '').trim();
    if (isGuidMapped) {
      // The GUID mapping owns the Tally ledger name - never regenerate it from
      // code/name. Editing the ERP code/name leaves the mapped name + GUID intact.
    } else if (providedTallyName) {
      account.tallyLedgerNameAuto = false;
    } else if (account.tallyLedgerNameAuto || !account.tallyLedgerName) {
      account.tallyLedgerName = `${account.code} - ${account.name}`;
      account.tallyLedgerNameAuto = true;
    }

    // --- Tally rename tracking -------------------------------------------
    // Remember the name Tally currently knows so the masters export can emit an
    // ACTION="Alter" rename (NAME=old, <NAME>new). Capture only the FIRST change
    // since the last sync (so multiple edits before a sync still point Tally at
    // the name it actually holds); clear the marker if the user renames back.
    if (account.tallyLedgerName !== oldTallyLedgerName) {
      if (!account.previousTallyLedgerName) account.previousTallyLedgerName = oldTallyLedgerName;
      if (account.previousTallyLedgerName === account.tallyLedgerName) account.previousTallyLedgerName = '';
    }
    if (account.subGroup !== oldSubGroup) {
      if (!account.previousSubGroup) account.previousSubGroup = oldSubGroup;
      if (account.previousSubGroup === account.subGroup) account.previousSubGroup = '';
    }

    if (changes.length > 0) {
      account.edits.push({ editedBy: req.user.userId, editedAt: new Date(), changes });
    }

    await account.save();
    await account.populate('createdBy', 'name email');
    await account.populate('edits.editedBy', 'name email');
    res.json(account);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Duplicate account code' });
    console.error('Error updating account:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.delete('/:id', auth, requirePostingRole, async (req, res) => {
  try {
    const account = await ChartOfAccounts.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const linked = await JournalEntry.findOne({ 'lines.account': account._id }).select('_id entryNumber').lean();
    if (linked) {
      return res.status(400).json({
        message: `Cannot delete: account is referenced by journal entry ${linked.entryNumber}. Set isActive=false to retire it instead.`
      });
    }

    await ChartOfAccounts.deleteOne({ _id: account._id });
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
