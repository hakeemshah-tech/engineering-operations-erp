const { escapeXml, tallyDate, ledgerEntryXml, buildEnvelope, companyTaxFields, checksum } = require('./xmlBuilder');
const { toNumber } = require('../accounts/decimalHelpers');
const { AP_CONTROL_CODE, resolveLedgerNameByCode } = require('./controlLedgers');

/**
 * Build a Tally Payment Voucher XML (outflow to a supplier).
 *
 * Typical structure:
 *   Dr Sundry Creditors (or specific supplier ledger) - the party leg
 *   Cr Bank / Cash - the funds source
 *
 * context.supplier: { name, trn } - used for PARTYLEDGERNAME when a supplier payment
 * context.reference: String - cheque number / transfer reference (optional)
 */
function buildPaymentVoucher(journalEntry, context = {}) {
  if (!journalEntry) throw new Error('buildPaymentVoucher: journalEntry required');
  const { supplier = {}, reference } = context;

  // Payment voucher's party ledger is whatever line is being DEBITED (the creditor we're paying).
  const CREDITOR_CODES = new Set([AP_CONTROL_CODE, '2200-SALARY-PAYABLE']);
  const isPartyLine = l => toNumber(l.debit) > 0 && (
    CREDITOR_CODES.has(l.account?.code) ||
    /Sundry Creditors|Salary Payable|Retention Payable/i.test(l.account?.tallyLedgerName || '')
  );

  const partyLine = journalEntry.lines.find(isPartyLine);
  const otherLines = journalEntry.lines.filter(l => l !== partyLine);

  // If we have supplier context, route the party-side Tally ledger to the supplier's own name.
  const partyLedgerName = supplier.name && partyLine?.account?.code === AP_CONTROL_CODE
    ? supplier.name
    : (partyLine?.account?.tallyLedgerName || partyLine?.account?.name
       || resolveLedgerNameByCode(journalEntry.lines, AP_CONTROL_CODE, 'Sundry Creditors'));

  function costCenterFor(line) {
    if (line?.costCenter?.name) return line.costCenter.name;
    if (line?.costCenter && context.costCenterName) return context.costCenterName;
    return null;
  }

  const ledgerEntries = [
    partyLine ? ledgerEntryXml({
      ledgerName: partyLedgerName,
      debit: toNumber(partyLine.debit),
      credit: 0,
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

  const narration = journalEntry.narration || `Payment ${journalEntry.entryNumber}`;
  const ref = reference || journalEntry.entryNumber;

  const voucherXml = `          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>${tallyDate(journalEntry.entryDate)}</DATE>
            <NARRATION>${escapeXml(narration)}</NARRATION>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(journalEntry.entryNumber)}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(ref)}</REFERENCE>
            <PARTYLEDGERNAME>${escapeXml(partyLedgerName)}</PARTYLEDGERNAME>
            ${supplier.trn ? `<PARTYGSTIN>${escapeXml(supplier.trn)}</PARTYGSTIN>` : ''}
            <EFFECTIVEDATE>${tallyDate(journalEntry.entryDate)}</EFFECTIVEDATE>
            <ALTEREDON>${tallyDate(new Date())}</ALTEREDON>${companyTaxFields(context.company)}
${ledgerEntries}
          </VOUCHER>`;

  const xml = buildEnvelope({ voucherXml });
  return { xml, checksum: checksum(xml) };
}

module.exports = buildPaymentVoucher;
