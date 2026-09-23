const crypto = require('crypto');

/** Escape a string for safe inclusion as XML text content. */
function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Tally's XML parser is strict about control chars; drop everything below space.
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\u0000-\u001F\u007F]/g, '');
}

/** Tally requires dates in YYYYMMDD format. */
function tallyDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** AED amount with 2 decimals - Tally expects fixed-point strings. */
function tallyAmount(value, decimals = 2) {
  const n = value instanceof Object && value.$numberDecimal !== undefined
    ? parseFloat(value.$numberDecimal)
    : parseFloat(value);
  if (!Number.isFinite(n)) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}

/**
 * Wrap one <VOUCHER> element in the Tally import envelope.
 * `voucherXml` must already be an escaped, well-formed XML string.
 */
function buildEnvelope({ voucherXml, requestDesc = 'Vouchers' }) {
  return buildMultiVoucherEnvelope({ voucherXmls: [voucherXml], requestDesc });
}

/**
 * Wrap multiple <VOUCHER> elements in a single Tally import envelope.
 * Each voucher gets its own <TALLYMESSAGE> sibling - matches Tally's import convention
 * and lets the user import a whole day's run in one operation.
 */
function buildMultiVoucherEnvelope({ voucherXmls = [], requestDesc = 'Vouchers' }) {
  const messages = voucherXmls
    .filter(v => v && v.trim())
    .map(v => `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${v}\n        </TALLYMESSAGE>`)
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ENVELOPE>',
    '  <HEADER>',
    '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
    '  </HEADER>',
    '  <BODY>',
    '    <IMPORTDATA>',
    '      <REQUESTDESC>',
    `        <REPORTNAME>${escapeXml(requestDesc)}</REPORTNAME>`,
    '      </REQUESTDESC>',
    '      <REQUESTDATA>',
            messages,
    '      </REQUESTDATA>',
    '    </IMPORTDATA>',
    '  </BODY>',
    '</ENVELOPE>'
  ].join('\n');
}

/**
 * Extract just the inner <VOUCHER>...</VOUCHER> portion from a full envelope.
 * Used to re-bundle individual voucher XMLs into a multi-voucher envelope.
 */
function extractVoucherFromEnvelope(fullXml) {
  if (!fullXml) return '';
  const m = fullXml.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/);
  return m ? m[0] : '';
}

/**
 * Render a <ALLLEDGERENTRIES.LIST> entry.
 * In Tally convention:
 *   - Debit  → ISDEEMEDPOSITIVE=Yes, AMOUNT negative
 *   - Credit → ISDEEMEDPOSITIVE=No,  AMOUNT positive
 */
function ledgerEntryXml({ ledgerName, debit, credit, narration, costCenterName }) {
  const d = parseFloat(debit) || 0;
  const c = parseFloat(credit) || 0;
  const isDebit = d > 0;
  const amount = isDebit ? -Math.abs(d) : Math.abs(c);

  const costCenter = costCenterName
    ? `
            <CATEGORYALLOCATIONS.LIST>
              <CATEGORY>Primary Cost Category</CATEGORY>
              <COSTCENTREALLOCATIONS.LIST>
                <NAME>${escapeXml(costCenterName)}</NAME>
                <AMOUNT>${tallyAmount(amount)}</AMOUNT>
              </COSTCENTREALLOCATIONS.LIST>
            </CATEGORYALLOCATIONS.LIST>`
    : '';

  return `          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
            <AMOUNT>${tallyAmount(amount)}</AMOUNT>${narration ? `
            <NARRATION>${escapeXml(narration)}</NARRATION>` : ''}${costCenter}
          </ALLLEDGERENTRIES.LIST>`;
}

/**
 * SHA-256 of the XML string - used to let the Phase 2 Windows agent ACK
 * the exact payload it imported.
 */
function checksum(xml) {
  return crypto.createHash('sha256').update(xml).digest('hex');
}

/**
 * Render optional company-side tax fields for inclusion near the top of a voucher.
 * Emits CMPGSTIN (the company's own TRN) when supplied.
 */
function companyTaxFields(company = {}) {
  if (!company || !company.trn) return '';
  return `
            <CMPGSTIN>${escapeXml(company.trn)}</CMPGSTIN>`;
}

module.exports = {
  escapeXml,
  tallyDate,
  tallyAmount,
  buildEnvelope,
  buildMultiVoucherEnvelope,
  extractVoucherFromEnvelope,
  ledgerEntryXml,
  companyTaxFields,
  checksum
};
