const { escapeXml, tallyDate, ledgerEntryXml, buildEnvelope, companyTaxFields, checksum } = require('./xmlBuilder');
const { toNumber } = require('../accounts/decimalHelpers');

/**
 * Build a Tally Journal Voucher XML from a populated JournalEntry.
 *
 * Used by Salary Preparation and any other free-form journal posting. Unlike
 * Purchase / Sales vouchers, Journal vouchers in Tally don't designate a
 * single party ledger - every line is treated equally.
 *
 * Expects:
 *   journalEntry.lines[].account.tallyLedgerName  (populated)
 *   journalEntry.lines[].costCenter.name           (populated, optional)
 */
function buildJournalVoucher(journalEntry, context = {}) {
  if (!journalEntry) throw new Error('buildJournalVoucher: journalEntry required');

  function costCenterFor(line) {
    if (line?.costCenter?.name) return line.costCenter.name;
    if (line?.costCenter?.projectTitle) return line.costCenter.projectTitle;
    if (line?.costCenter && context.costCenterName) return context.costCenterName;
    return null;
  }

  const ledgerEntries = journalEntry.lines.map(l => ledgerEntryXml({
    ledgerName: l.account?.tallyLedgerName || l.account?.name || 'Unknown',
    debit: toNumber(l.debit),
    credit: toNumber(l.credit),
    narration: l.description,
    costCenterName: costCenterFor(l)
  })).join('\n');

  const narration = journalEntry.narration || `Journal ${journalEntry.entryNumber}`;
  const reference = context.reference || journalEntry.entryNumber;

  const voucherXml = `          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <DATE>${tallyDate(journalEntry.entryDate)}</DATE>
            <NARRATION>${escapeXml(narration)}</NARRATION>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(journalEntry.entryNumber)}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(reference)}</REFERENCE>
            <EFFECTIVEDATE>${tallyDate(journalEntry.entryDate)}</EFFECTIVEDATE>
            <ALTEREDON>${tallyDate(new Date())}</ALTEREDON>${companyTaxFields(context.company)}
${ledgerEntries}
          </VOUCHER>`;

  const xml = buildEnvelope({ voucherXml });
  return { xml, checksum: checksum(xml) };
}

module.exports = buildJournalVoucher;
