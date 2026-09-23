const ChartOfAccounts = require('../../models/ChartOfAccounts');
const { getAccountsSettings } = require('./settingsProvider');

// Hardcoded fallback expense-account code per PO type, used when neither the PO
// carries an explicit accountHead NOR the Account Manager has configured a
// mapping in Chart of Accounts (SystemSettings.accounts.poTypeAccountMap).
const PO_TYPE_DEFAULT_CODE = {
  material: '5100-COGS-MATERIALS',
  manpower: '5200-DIRECT-LABOUR',
  subcontracting: '5300-SUBCONTRACTING',
  machine_rental: '5400-MACHINE-RENTAL',
  other: '6900-MISC-EXP'
};

/**
 * The default ChartOfAccounts code for a PO type, preferring the admin-configured
 * mapping (SystemSettings.accounts.poTypeAccountMap) and falling back to the
 * hardcoded PO_TYPE_DEFAULT_CODE. Only ever returns a code that resolves to an
 * ACTIVE account - so a stale mapping (ledger renamed/retired) or an un-seeded
 * chart self-heals to the hardcoded default, and never hands back a dead code.
 * Returns '' when no candidate maps to an active account.
 */
async function getPoTypeDefaultCode(poType) {
  let configured = '';
  try {
    const settings = await getAccountsSettings();
    const map = settings && settings.poTypeAccountMap;
    if (map && typeof map[poType] === 'string') configured = map[poType].trim();
  } catch {
    // settings unavailable (first boot) - fall through to hardcoded defaults
  }
  const candidates = [configured, PO_TYPE_DEFAULT_CODE[poType], PO_TYPE_DEFAULT_CODE.other];
  for (const code of candidates) {
    if (!code) continue;
    const hit = await ChartOfAccounts.findOne({ code: code.toUpperCase(), isActive: true }).select('code').lean();
    if (hit) return hit.code;
  }
  return '';
}

async function findByCodeOrLedgerName(token) {
  if (!token || typeof token !== 'string') return null;
  const t = token.trim();
  if (!t) return null;
  const rx = new RegExp(`^${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i');
  return ChartOfAccounts.findOne({
    isActive: true,
    $or: [{ code: rx }, { tallyLedgerName: rx }]
  });
}

/**
 * Resolve the expense ChartOfAccounts document for a PO.
 * Preference order:
 *   1. po.accountingDetails.overallAccountHead (string) matched against code/tallyLedgerName
 *   2. First item's accountHead (otherItems only)
 *   3. Default by po.poType (from PO_TYPE_DEFAULT_CODE)
 *
 * Returns a ChartOfAccounts document or null if nothing matches.
 */
async function resolveExpenseAccount(po) {
  if (!po) return null;

  const candidates = [];
  if (po.accountingDetails?.overallAccountHead) candidates.push(po.accountingDetails.overallAccountHead);
  if (Array.isArray(po.otherItems)) {
    for (const it of po.otherItems) {
      if (it.accountHead) candidates.push(it.accountHead);
    }
  }
  for (const c of candidates) {
    const hit = await findByCodeOrLedgerName(c);
    if (hit) return hit;
  }

  const defaultCode = await getPoTypeDefaultCode(po.poType);
  return ChartOfAccounts.findOne({ code: defaultCode, isActive: true });
}

/** Lookup a well-known system account. Returns the doc or null. */
async function findSystemAccount(code) {
  return ChartOfAccounts.findOne({ code, isActive: true });
}

module.exports = {
  resolveExpenseAccount,
  findSystemAccount,
  getPoTypeDefaultCode,
  PO_TYPE_DEFAULT_CODE
};
