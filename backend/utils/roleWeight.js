const DEFAULT_WEIGHT = 10;

function effectiveWeight(req) {
  const w = req?.user?.roleWeight;
  return Number.isFinite(w) ? w : 0;
}

function canOverwrite(req, existingLockWeight) {
  return (existingLockWeight ?? 0) <= effectiveWeight(req);
}

function maxWeight(roleDocs = []) {
  if (!Array.isArray(roleDocs) || roleDocs.length === 0) return 0;
  return roleDocs.reduce((m, r) => {
    if (!r || typeof r === 'string') return m;
    const w = Number.isFinite(r.weight) ? r.weight : DEFAULT_WEIGHT;
    return w > m ? w : m;
  }, 0);
}

module.exports = {
  DEFAULT_WEIGHT,
  effectiveWeight,
  canOverwrite,
  maxWeight
};
