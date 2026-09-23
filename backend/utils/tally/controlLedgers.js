/**
 * Trade control-ledger resolution for voucher building.
 *
 * These ERP ledger CODES are immutable: the Chart-of-Accounts edit route locks a
 * ledger's name/code the moment it's synced with Tally (and these are seeded
 * system ledgers). So the code - never the display name - is the stable key.
 *
 * Voucher builders must therefore resolve a control ledger's CURRENT Tally name
 * by CODE, never hardcode the name string. That way renaming the ledger (e.g.
 * "Sundry Debtors" → "Trade Debtors (Control)") can never break voucher output.
 */

// Trade Debtors (Control) - party bucket for AR, sits under the Sundry Debtors group.
const AR_CONTROL_CODE = '1300-AR-TRADE';
// Trade Creditors (Control) - party bucket for AP, sits under the Sundry Creditors group.
const AP_CONTROL_CODE = '2100-AP-TRADE';

/**
 * Resolve a ledger's live Tally name from a populated JournalEntry line set,
 * keyed by its immutable `code`. Builders receive lines with `.account` already
 * populated (their documented contract), so this reads the current name straight
 * off that account - no DB round-trip, and rename-proof.
 *
 * `fallbackName` is a last resort used only when the ledger isn't on any line
 * (a degenerate voucher that doesn't touch this control account at all).
 *
 * @param {Array}  lines        journalEntry.lines, each with a populated `account`
 * @param {String} code         the immutable ledger code to look up
 * @param {String} fallbackName last-resort name if the ledger isn't on any line
 * @returns {String}
 */
function resolveLedgerNameByCode(lines, code, fallbackName) {
  const line = (lines || []).find(l => l && l.account && l.account.code === code);
  return (line && (line.account.tallyLedgerName || line.account.name)) || fallbackName;
}

module.exports = { AR_CONTROL_CODE, AP_CONTROL_CODE, resolveLedgerNameByCode };
