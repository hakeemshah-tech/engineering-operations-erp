const buildPurchaseVoucher = require('./buildPurchaseVoucher');
const buildSalesVoucher = require('./buildSalesVoucher');
const buildPaymentVoucher = require('./buildPaymentVoucher');
const buildReceiptVoucher = require('./buildReceiptVoucher');
const buildJournalVoucher = require('./buildJournalVoucher');

const BUILDERS = {
  PURCHASE: buildPurchaseVoucher,
  SALES: buildSalesVoucher,
  PAYMENT: buildPaymentVoucher,
  RECEIPT: buildReceiptVoucher,
  JOURNAL: buildJournalVoucher,
  CONTRA: buildJournalVoucher // Contra looks identical to Journal in Tally XML terms
};

function buildForVoucherType(voucherType, journalEntry, context = {}) {
  const build = BUILDERS[voucherType];
  if (!build) throw new Error(`No builder registered for voucherType "${voucherType}"`);
  return build(journalEntry, context);
}

module.exports = { buildForVoucherType, BUILDERS };
