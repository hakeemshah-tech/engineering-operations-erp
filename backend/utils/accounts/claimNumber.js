const SalesClaim = require('../../models/SalesClaim');

async function nextClaimNumber(date = new Date()) {
  const year = date.getFullYear();
  const prefix = `CL-${year}-`;
  const last = await SalesClaim.findOne({ claimNumber: { $regex: `^${prefix}` } })
    .sort({ claimNumber: -1 })
    .select('claimNumber')
    .lean();

  let nextSeq = 1;
  if (last && last.claimNumber) {
    const parts = last.claimNumber.split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(seq)) nextSeq = seq + 1;
  }
  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

module.exports = { nextClaimNumber };
