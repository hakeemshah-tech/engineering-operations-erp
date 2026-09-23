const Company = require('../../models/Company');

let cache = { value: null, at: 0 };
const TTL_MS = 60 * 1000; // 1 minute - the company record changes rarely

/**
 * Return the company's own tax identity for inclusion in outgoing Tally vouchers.
 *   { name, trn, legalName }
 *
 * Cached for 60s to avoid hammering the DB on every XML generation.
 */
async function getCompanyTaxContext() {
  const now = Date.now();
  if (cache.value && (now - cache.at) < TTL_MS) return cache.value;

  const company = await Company.findOne({})
    .select('legalName tradingName trn')
    .lean();

  const value = company
    ? { name: company.tradingName || company.legalName, legalName: company.legalName, trn: company.trn || '' }
    : { name: '', legalName: '', trn: '' };

  cache = { value, at: now };
  return value;
}

/** Force-evict the cache (call after a Company update). */
function invalidateCompanyCache() {
  cache = { value: null, at: 0 };
}

module.exports = { getCompanyTaxContext, invalidateCompanyCache };
