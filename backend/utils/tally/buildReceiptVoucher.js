const { escapeXml, tallyDate, ledgerEntryXml, buildEnvelope, companyTaxFields, checksum } = require('./xmlBuilder');
const { toNumber } = require('../accounts/decimalHelpers');
const { AR_CONTROL_CODE, resolveLedgerNameByCode } = require('./controlLedgers');

/**
 * Build a Tally Receipt Voucher XML (inflow from a customer).
 *
 * Typical structure:
 *   Dr Bank / Cash - the funds destination
 *   Cr Sundry Debtors - settling the customer's receivable
 *
 * context.customer: { name, trn } - used for PARTYLEDGERNAME when a customer receipt
 * context.reference: String - payment reference (optional)
 */
function buildReceiptVoucher(journalEntry, context = {}) {
  if (!journalEntry) throw new Error('buildReceiptVoucher: journalEntry required');
  const { customer = {}, reference } = context;

  // The party line in a receipt is whichever line is being CREDITED (the debtor that's settling).
  const DEBTOR_CODES = new Set([AR_CONTROL_CODE, '1310-AR-RETENTION']);
  const isPartyLine = l => toNumber(l.credit) > 0 && (
    DEBTOR_CODES.has(l.account?.code) ||
    /Sundry Debtors|Retention Receivable/i.test(l.account?.tallyLedgerName || '')
  );

  const partyLine = journalEntry.lines.find(isPartyLine);
  const otherLines = journalEntry.lines.filter(l => l !== partyLine);

  const partyLedgerName = customer.name && partyLine?.account?.code === AR_CONTROL_CODE
    ? customer.name
    : (partyLine?.account?.tallyLedgerName || partyLine?.account?.name
       || resolveLedgerNameByCode(journalEntry.lines, AR_CONTROL_CODE, 'Sundry Debtors'));

  function costCenterFor(line) {
    if (line?.costCenter?.name) return line.costCenter.name;
    if (line?.costCenter && context.costCenterName) return context.costCenterName;
    return null;
  }

  const ledgerEntries = [
    partyLine ? ledgerEntryXml({
      ledgerName: partyLedgerName,
      debit: 0,
      credit: toNumber(partyLine.credit),
      narration: partyLine.description
    }) : '',
    ...otherLines.map(l => ledgerEntryXml({
      ledgerName: l.account?.tallyLedgerName || l.account?.name || 'Unknown',
      debit: toNumber(l.debit),
      credit: toNumber(l.credit),
      narration: l.description,
      costCenterName: costCenterFor(l)
    }))
  ].filter(Boolean).join('\n');

  const narration = journalEntry.narration || `Receipt ${journalEntry.entryNumber}`;
  const ref = reference || journalEntry.entryNumber;

  const voucherXml = `          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>${tallyDate(journalEntry.entryDate)}</DATE>
            <NARRATION>${escapeXml(narration)}</NARRATION>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(journalEntry.entryNumber)}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(ref)}</REFERENCE>
            <PARTYLEDGERNAME>${escapeXml(partyLedgerName)}</PARTYLEDGERNAME>
            ${customer.trn ? `<PARTYGSTIN>${escapeXml(customer.trn)}</PARTYGSTIN>` : ''}
            <EFFECTIVEDATE>${tallyDate(journalEntry.entryDate)}</EFFECTIVEDATE>
            <ALTEREDON>${tallyDate(new Date())}</ALTEREDON>${companyTaxFields(context.company)}
${ledgerEntries}
          </VOUCHER>`;

  const xml = buildEnvelope({ voucherXml });
  return { xml, checksum: checksum(xml) };
}

module.exports = buildReceiptVoucher;
