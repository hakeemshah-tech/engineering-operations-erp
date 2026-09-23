const { escapeXml, tallyDate, ledgerEntryXml, buildEnvelope, companyTaxFields, checksum } = require('./xmlBuilder');
const { toNumber } = require('../accounts/decimalHelpers');
const { AR_CONTROL_CODE, resolveLedgerNameByCode } = require('./controlLedgers');

/**
 * Build a Tally Sales Voucher XML for an AR progress claim.
 *
 * Expects JournalEntry.lines to be already populated with account + costCenter refs.
 *
 * context.customer:     { name, trn } - party/debtor ledger
 * context.project:      { name } - used for narration
 * context.salesClaim:   { claimNumber, claimPeriod }
 * context.costCenterName - optional single override for cost center
 */
function buildSalesVoucher(journalEntry, context = {}) {
  if (!journalEntry) throw new Error('buildSalesVoucher: journalEntry required');
  const { customer = {}, project = {}, salesClaim = {} } = context;

  // No customer on the claim? Fall back to the trade-debtor control ledger's
  // CURRENT Tally name, resolved by its immutable code (never a hardcoded string
  // or a group name), so a future rename can't break voucher output.
  const partyLedger = customer.name
    ? `${customer.name}`
    : resolveLedgerNameByCode(journalEntry.lines, AR_CONTROL_CODE, 'Sundry Debtors');
  const refNumber = salesClaim.claimNumber || journalEntry.entryNumber;

  // For Sales voucher Tally convention: PARTYLEDGERNAME is the debtor; the debit entry
  // to that ledger is the "party" entry. Put it first for readability.
  const DEBTOR_CODES = new Set([AR_CONTROL_CODE, '1310-AR-RETENTION']);
  const isDebtorLine = line => (
    toNumber(line.debit) > 0 && (
      DEBTOR_CODES.has(line.account?.code) ||
      /Sundry Debtors|Retention Receivable/i.test(line.account?.tallyLedgerName || '')
    )
  );

  const debtorLines = journalEntry.lines.filter(isDebtorLine);
  const otherLines = journalEntry.lines.filter(l => !debtorLines.includes(l));

  function costCenterFor(line) {
    if (line?.costCenter?.name) return line.costCenter.name;
    if (line?.costCenter?.projectTitle) return line.costCenter.projectTitle;
    if (line?.costCenter && context.costCenterName) return context.costCenterName;
    return null;
  }

  // Debtor lines get the customer's ledger name (or fall back to generic Sundry Debtors bucket)
  const ledgerEntries = [
    ...debtorLines.map((l, _idx) => ledgerEntryXml({
      // For the main trade debtor line, route to the customer's own ledger.
      // For the retention sub-account line, keep its native tallyLedgerName (Retention Receivable).
      ledgerName: (l.account?.code === AR_CONTROL_CODE)
        ? partyLedger
        : (l.account?.tallyLedgerName || l.account?.name || 'Retention Receivable'),
      debit: toNumber(l.debit),
      credit: 0
    })),
    ...otherLines.map(l => ledgerEntryXml({
      ledgerName: l.account?.tallyLedgerName || l.account?.name || 'Unknown',
      debit: toNumber(l.debit),
      credit: toNumber(l.credit),
      narration: l.description,
      costCenterName: toNumber(l.credit) > 0 ? costCenterFor(l) : null
    }))
  ].join('\n');

  const narration = journalEntry.narration
    || `Sales - Claim ${salesClaim.claimNumber || ''} - ${project.name || ''}`.trim();

  const voucherXml = `          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${tallyDate(journalEntry.entryDate)}</DATE>
            <NARRATION>${escapeXml(narration)}</NARRATION>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(journalEntry.entryNumber)}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(refNumber)}</REFERENCE>
            <PARTYLEDGERNAME>${escapeXml(partyLedger)}</PARTYLEDGERNAME>
            <PARTYNAME>${escapeXml(customer.name || '')}</PARTYNAME>
            <BASICBASEPARTYNAME>${escapeXml(customer.name || '')}</BASICBASEPARTYNAME>
            <PARTYGSTIN>${escapeXml(customer.trn || '')}</PARTYGSTIN>
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

module.exports = buildSalesVoucher;
