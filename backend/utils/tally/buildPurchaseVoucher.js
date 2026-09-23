const { escapeXml, tallyDate, ledgerEntryXml, buildEnvelope, companyTaxFields, checksum } = require('./xmlBuilder');
const { toNumber } = require('../accounts/decimalHelpers');
const { AP_CONTROL_CODE, resolveLedgerNameByCode } = require('./controlLedgers');

/**
 * Build a Tally Purchase Voucher XML from a populated JournalEntry.
 *
 * Pure function - no DB access. Caller must pre-populate:
 *   - journalEntry.lines[].account  (with code, name, tallyLedgerName)
 *   - journalEntry.lines[].costCenter (with projectTitle, optional)
 *
 * context.supplier:  { name, trn, address, email } - party ledger for the voucher
 * context.purchaseOrder: { poNumber, grnNumber, ... } - used for reference + narration
 *
 * Returns { xml: String, checksum: String }.
 */
function buildPurchaseVoucher(journalEntry, context = {}) {
  if (!journalEntry) throw new Error('buildPurchaseVoucher: journalEntry required');
  const { supplier = {}, purchaseOrder = {}, supplierBill = {} } = context;

  // No supplier on the bill? Fall back to the trade-creditor control ledger's
  // CURRENT Tally name, resolved by its immutable code (never a hardcoded string
  // or a group name), so a future rename can't break voucher output.
  const partyLedger = supplier.name
    ? `${supplier.name}`
    : resolveLedgerNameByCode(journalEntry.lines, AP_CONTROL_CODE, 'Sundry Creditors');
  const refNumber = supplierBill.billNumber || purchaseOrder.poNumber || journalEntry.entryNumber;

  // Build ledger entries: all non-creditor (expense + VAT) lines first, then party-ledger credit last.
  const sundryCreditorTallyName = 'Sundry Creditors';
  const isCreditorLine = line => {
    const ledger = line.account?.tallyLedgerName || line.account?.name || '';
    return toNumber(line.credit) > 0 && (
      ledger === sundryCreditorTallyName ||
      line.account?.code === AP_CONTROL_CODE
    );
  };

  const creditorLine = journalEntry.lines.find(isCreditorLine);
  const otherLines = journalEntry.lines.filter(l => l !== creditorLine);

  // Per-line cost center: line.costCenter may be a populated Project document or null.
  // Fallback to context.costCenterName if caller wants a single override.
  function costCenterFor(line) {
    if (line?.costCenter?.projectTitle) return line.costCenter.projectTitle;
    if (line?.costCenter?.name) return line.costCenter.name;
    if (line?.costCenter && typeof line.costCenter === 'object' && context.costCenterName) return context.costCenterName;
    return null;
  }

  const ledgerEntries = [
    ...otherLines.map(l => ledgerEntryXml({
      ledgerName: l.account?.tallyLedgerName || l.account?.name || 'Unknown',
      debit: toNumber(l.debit),
      credit: toNumber(l.credit),
      narration: l.description,
      costCenterName: costCenterFor(l)
    })),
    creditorLine ? ledgerEntryXml({
      ledgerName: partyLedger,
      debit: 0,
      credit: toNumber(creditorLine.credit)
    }) : ''
  ].filter(Boolean).join('\n');

  const narration = journalEntry.narration
    || `Purchase - PO ${purchaseOrder.poNumber || ''} - GRN ${purchaseOrder.grnNumber || ''} - Bill ${supplierBill.billNumber || ''}`.trim();

  const voucherXml = `          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${tallyDate(journalEntry.entryDate)}</DATE>
            <NARRATION>${escapeXml(narration)}</NARRATION>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(journalEntry.entryNumber)}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(refNumber)}</REFERENCE>
            <PARTYLEDGERNAME>${escapeXml(partyLedger)}</PARTYLEDGERNAME>
            <PARTYNAME>${escapeXml(supplier.name || '')}</PARTYNAME>
            <BASICBUYERNAME>${escapeXml(supplier.name || '')}</BASICBUYERNAME>
            <PARTYGSTIN>${escapeXml(supplier.trn || '')}</PARTYGSTIN>
            <CMPGSTREGISTRATIONTYPE>Regular</CMPGSTREGISTRATIONTYPE>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <ISINVOICE>Yes</ISINVOICE>
            <EFFECTIVEDATE>${tallyDate(journalEntry.entryDate)}</EFFECTIVEDATE>
            <ALTEREDON>${tallyDate(new Date())}</ALTEREDON>${companyTaxFields(context.company)}
${ledgerEntries}
          </VOUCHER>`;

  const xml = buildEnvelope({ voucherXml });
  return { xml, checksum: checksum(xml) };
}

module.exports = buildPurchaseVoucher;
