// Mirror of server/backfillRoleWeights.js - keep in sync if weights ever change.
// Used client-side to compute the current user's effective weight for hierarchy
// lock UI (showing 🔒 when their weight is below a locked record). The backend
// is the authoritative gate; this is for UX only.
export const ROLE_WEIGHTS = {
  admin: 100,
  manager: 80,
  hr: 70,
  account_manager: 60,
  project_engineer: 50,
  site_engineer: 40,
  sales_engineer: 40,
  estimation_engineer: 40,
  supervisor: 30,
  site_supervisor: 30,
  inventory_manager: 30,
  procurement_engineer: 30,
  store_keeper: 20,
  tally_agent: 20,
  employee: 10,
  site_worker: 10,
  vendor: 5
};

export function userRoleWeight(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  let max = 0;
  for (const r of roles) {
    const w = ROLE_WEIGHTS[r];
    if (typeof w === 'number' && w > max) max = w;
  }
  return max;
}
