/**
 * Reverse mapping: Tally reserved/parent groups → our ERP primary group.
 * Used by the reconciliation sync + bulk-import routes to (a) route incoming
 * Tally ledgers into the correct ERP primary group, and (b) cross-validate that
 * a manual link doesn't map (say) an ERP Asset onto a Tally Expense.
 *
 * Anything not in the dictionary falls back to "Uncategorized" - a real primary
 * group bucket for ledgers whose Tally parent we can't classify.
 */
const tallyToErpPrimaryMap = {
  'Bank Accounts': 'Assets',
  'Cash-in-Hand': 'Assets',
  'Sundry Debtors': 'Assets',
  'Current Assets': 'Assets',
  'Fixed Assets': 'Assets',
  'Stock-in-Hand': 'Assets',
  'Deposits (Asset)': 'Assets',
  'Loans & Advances (Asset)': 'Assets',
  'Investments': 'Assets',
  'Sundry Creditors': 'Liabilities',
  'Duties & Taxes': 'Liabilities',
  'Current Liabilities': 'Liabilities',
  'Provisions': 'Liabilities',
  'Loans (Liability)': 'Liabilities',
  'Sales Accounts': 'Income',
  'Direct Incomes': 'Income',
  'Indirect Incomes': 'Income',
  'Purchase Accounts': 'Expenses',
  'Direct Expenses': 'Expenses',
  'Indirect Expenses': 'Expenses',
  'Capital Account': 'Equity',
  'Reserves & Surplus': 'Equity',
  'Primary': 'Uncategorized' // Tally's reserved root - no clear ERP primary
};

// Case-insensitive lookup index.
const _byLower = {};
for (const [k, v] of Object.entries(tallyToErpPrimaryMap)) _byLower[k.toLowerCase()] = v;

/** The ERP primary group for a Tally parent string (case-insensitive). Unknown → "Uncategorized". */
function tallyParentToErpPrimary(parent) {
  const p = (parent || '').trim().toLowerCase();
  if (!p) return 'Uncategorized';
  return _byLower[p] || 'Uncategorized';
}

// The full set of ERP primary groups, including the Uncategorized bucket.
const ERP_PRIMARY_GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity', 'Uncategorized'];

module.exports = { tallyToErpPrimaryMap, tallyParentToErpPrimary, ERP_PRIMARY_GROUPS };
