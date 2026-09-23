export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function currentRoleWeight() {
  const payload = decodeJwtPayload(localStorage.getItem('token'))
  const w = payload?.roleWeight
  return Number.isFinite(w) ? w : 0
}
