// Role helpers shared across the UI.
//
// These live outside RoleGate.jsx on purpose: a module that exports both a
// component and plain functions breaks React Fast Refresh, so the component
// stays in RoleGate.jsx and every non-component export lives here.

// Treat `supervisor` and `site_supervisor` as the same role everywhere in the UI.
// If stored user still has just one key (e.g. stale localStorage from a session
// issued before the server-side alias fix), normalize on read so every downstream
// check matches regardless of which canonical key the user was originally given.
export const SUPERVISOR_ALIASES = ['supervisor', 'site_supervisor']

export function aliasRoles(roles = []) {
  if (!Array.isArray(roles)) return []
  const hasAny = roles.some(r => SUPERVISOR_ALIASES.includes(r))
  if (!hasAny) return roles
  const set = new Set(roles)
  for (const a of SUPERVISOR_ALIASES) set.add(a)
  return Array.from(set)
}

export function getUser() {
  try {
    const raw = JSON.parse(localStorage.getItem('user') || 'null')
    if (!raw) return null
    if (Array.isArray(raw.roles) && raw.roles.some(r => SUPERVISOR_ALIASES.includes(r))) {
      return { ...raw, roles: aliasRoles(raw.roles) }
    }
    return raw
  } catch {
    return null
  }
}

export function isAccountsOnlyUser(user) {
  const roles = aliasRoles(user?.roles)
  return roles.length === 1 && roles[0] === 'account_manager'
}

export function hasAnyRole(user, allowed = []) {
  const roles = aliasRoles(user?.roles)
  return roles.some(r => allowed.includes(r))
}
