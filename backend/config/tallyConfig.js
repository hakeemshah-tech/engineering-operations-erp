/**
 * Tally structural-hierarchy configuration.
 *
 * Tally Prime OWNS the group / sub-group hierarchy; the ERP owns ledgers. New
 * sub-groups are therefore never created by hand in the ERP - they are ingested
 * automatically from a Tally masters XML sync, but ONLY when their Tally PARENT
 * is one of these whitelisted operational parents. A sub-group under any other
 * parent (Equity, Fixed Assets, Depreciation, Investments, …) is dropped, so the
 * sync can never pull the accountant's pure-accounting structure into the ERP.
 *
 * This is the single source of truth for which Tally parents may spawn ERP
 * sub-groups; keep it aligned with utils/accounts/operationalScope.js.
 */
const ALLOWED_TALLY_PARENTS = [
  'Sundry Debtors',
  'Sundry Creditors',
  'Bank Accounts',
  'Cash-in-Hand',
  'Duties & Taxes',
  'Direct Expenses',
  'Direct Incomes',
  'Current Assets',
  'Current Liabilities'
];

const _allowedLower = new Set(ALLOWED_TALLY_PARENTS.map(p => p.toLowerCase()));

/** Case-insensitive membership test for an incoming Tally group's <PARENT>. */
function isAllowedTallyParent(parent) {
  return _allowedLower.has(String(parent || '').trim().toLowerCase());
}

module.exports = { ALLOWED_TALLY_PARENTS, isAllowedTallyParent };
