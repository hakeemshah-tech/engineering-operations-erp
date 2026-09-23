/**
 * THE BOUNDED OPERATIONAL CHART-OF-ACCOUNTS SCOPE.
 *
 * This ERP only ever SEEDS, DISPLAYS, and SYNCS (export / import / reconcile) the
 * accounts below - the ones its own workflows actually read or write:
 *   - Procurement  → Sundry Creditors, Input VAT, Direct/Indirect Expenses
 *   - Sales/Billing→ Sundry Debtors, Retention (Current Assets), Sales Accounts, Output VAT
 *   - Payroll      → Salary/Retention Payable (Current Liabilities), Direct/Indirect Expenses
 *   - Settlement   → Bank Accounts, Cash-in-Hand
 *   - Inventory    → Stock-in-Hand ; Other income → Indirect Incomes
 *
 * Everything else - Equity (Capital Account, Reserves & Surplus / Retained
 * Earnings), Fixed Assets, Depreciation, Investments, Loans, Provisions, Purchase
 * Accounts, Direct Incomes, etc. - is PURE ACCOUNTING owned by the client's
 * accountant. We must NEVER seed, export, import, or reconcile those, so our sync
 * can't act as a bulk importer/exporter that overwrites the accountant's
 * independent data in Tally.
 *
 * Single source of truth: seeding, the CoA UI, and all three Tally engines read
 * from here. To widen/narrow the boundary, edit ONLY these two lists.
 */

// The four primary groups the ERP transacts in. Equity is intentionally absent.
const OPERATIONAL_PRIMARY_GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses'];

// The operational sub-groups (Tally group names). A ledger / Tally parent outside
// this set is treated as out-of-scope (the accountant's domain).
const OPERATIONAL_SUBGROUPS = [
  // Assets
  'Bank Accounts', 'Cash-in-Hand', 'Sundry Debtors', 'Current Assets', 'Stock-in-Hand',
  // Assets/Liabilities (VAT lives here)
  'Duties & Taxes',
  // Liabilities
  'Sundry Creditors', 'Current Liabilities',
  // Income
  'Sales Accounts', 'Indirect Incomes',
  // Expenses
  'Direct Expenses', 'Indirect Expenses'
];

const _primarySet = new Set(OPERATIONAL_PRIMARY_GROUPS);
const _subLower = new Set(OPERATIONAL_SUBGROUPS.map(s => s.toLowerCase()));

// --- Dynamic scope: sub-groups auto-ingested from Tally ---------------------
// Beyond the static defaults above, any AccountGroup ingested from a Tally XML
// sync (its `tallyParent` is a whitelisted operational parent - see
// config/tallyConfig.js) is ALSO operational, so ledgers placed under it must
// export/reconcile. The scope predicates are synchronous and used in hot filters,
// so we hold the ingested sub-group names in a small in-process set that
// scope-sensitive routes refresh (await) up front.
const { isAllowedTallyParent } = require('../../config/tallyConfig');
let _ingestedSet = new Set();

/**
 * Reload the ingested-sub-group set from the DB. Call (await) this at the start of
 * any request that then relies on the synchronous scope predicates below (export,
 * summary, import/reconcile, sync, bulk-import). Cheap - one lean projection.
 */
async function refreshOperationalScope() {
  const AccountGroup = require('../../models/AccountGroup');
  const rows = await AccountGroup.find({ isActive: true, tallyParent: { $nin: [null, ''] } })
    .select('name tallyParent').lean();
  const next = new Set();
  for (const g of rows) {
    if (isAllowedTallyParent(g.tallyParent)) next.add(String(g.name || '').trim().toLowerCase());
  }
  _ingestedSet = next;
  return _ingestedSet;
}

/** Is this ERP primary group (Assets/Liabilities/Income/Expenses) in operational scope? */
function isOperationalPrimary(group) {
  return _primarySet.has(String(group || '').trim());
}

/** Is this sub-group / Tally parent-group name one the ERP operates in? (case-insensitive)
 *  True for a static default OR a sub-group ingested from Tally (see the cache above). */
function isOperationalSubGroup(name) {
  const key = String(name || '').trim().toLowerCase();
  return _subLower.has(key) || _ingestedSet.has(key);
}

/** A ChartOfAccounts ledger is operational when its sub-group is in scope. */
function isOperationalAccount(acc) {
  return !!acc && isOperationalSubGroup(acc.subGroup);
}

/** An AccountGroup (sub-group record) is operational when its name is in scope. */
function isOperationalGroup(g) {
  return !!g && isOperationalSubGroup(g.name);
}

/** A Tally ledger (identified by its PARENT group name) is in ERP scope when that parent is operational. */
function isOperationalTallyParent(parent) {
  return isOperationalSubGroup(parent);
}

module.exports = {
  OPERATIONAL_PRIMARY_GROUPS,
  OPERATIONAL_SUBGROUPS,
  isOperationalPrimary,
  isOperationalSubGroup,
  isOperationalAccount,
  isOperationalGroup,
  isOperationalTallyParent,
  refreshOperationalScope
};
