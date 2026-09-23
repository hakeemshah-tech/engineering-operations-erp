import { Navigate } from 'react-router-dom'
import { getUser, isAccountsOnlyUser, hasAnyRole } from '../lib/roles'

// Route guard. The role helpers it uses are in ../lib/roles so this module
// exports a component and nothing else - a mixed-export module disables
// React Fast Refresh for every file that imports it.
function RoleGate({ children, allow, denyAccountsOnly = false, redirectTo = '/accounts' }) {
  const user = getUser()

  if (denyAccountsOnly && isAccountsOnlyUser(user)) {
    return <Navigate to={redirectTo} replace />
  }

  if (Array.isArray(allow) && allow.length > 0) {
    if (!hasAnyRole(user, allow)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return children
}

export default RoleGate
