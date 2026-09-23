const PurchaseRequest = require('../../models/PurchaseRequest');

/**
 * Resolve the Project (cost center) for a PurchaseOrder.
 * Preference order:
 *   1. po.projectId (direct link, set by PE on creation)
 *   2. po.sourceRequests[0].requestId -> PurchaseRequest.projectId (for PR-originated POs)
 *
 * Returns a Project ObjectId or null if none can be resolved.
 */
async function resolveProjectForPO(po) {
  if (!po) return null;
  if (po.projectId) return po.projectId;

  const firstSource = Array.isArray(po.sourceRequests) ? po.sourceRequests[0] : null;
  if (!firstSource || !firstSource.requestId) return null;

  const pr = await PurchaseRequest.findById(firstSource.requestId)
    .select('projectId')
    .lean();
  return pr?.projectId || null;
}

module.exports = { resolveProjectForPO };
