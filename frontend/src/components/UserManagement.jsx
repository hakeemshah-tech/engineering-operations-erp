import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import './UserManagement.css'

const PAGE_SIZE = 15

// Will be fetched from server
const STATIC_FALLBACK_ROLES = [
  { key: 'admin', name: 'Admin' },
  { key: 'manager', name: 'Manager' },
  { key: 'account_manager', name: 'Account Manager' },
  { key: 'hr', name: 'HR' },
  { key: 'inventory_manager', name: 'Inventory Manager' },
  { key: 'procurement_engineer', name: 'Procurement Engineer' },
  { key: 'store_keeper', name: 'Store Keeper' },
  { key: 'supervisor', name: 'Supervisor' },
  { key: 'site_supervisor', name: 'Site Supervisor' },
  { key: 'site_worker', name: 'Site Worker' },
  { key: 'site_engineer', name: 'Site Engineer' },
  { key: 'vendor', name: 'Vendor' },
  { key: 'employee', name: 'Employee' }
]

const ROLE_PERMISSIONS = {
  admin: ['admin', 'manager', 'account_manager', 'hr', 'inventory_manager', 'procurement_engineer', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'sales_engineer', 'project_engineer', 'estimation_engineer', 'vendor', 'employee'],
  manager: ['account_manager', 'hr', 'inventory_manager', 'procurement_engineer', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'sales_engineer', 'project_engineer', 'estimation_engineer', 'vendor', 'employee'],
  hr: ['account_manager', 'inventory_manager', 'store_keeper', 'supervisor', 'site_supervisor', 'site_worker', 'site_engineer', 'employee'],
  supervisor: ['vendor'],
  site_engineer: ['vendor'],
  inventory_manager: ['store_keeper']
}

function UserManagement() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [showBypassWarning, setShowBypassWarning] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [formData, setFormData] = useState({ name: '', email: '', roles: [], roleIds: [] })
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [allRoles, setAllRoles] = useState(STATIC_FALLBACK_ROLES)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  // Table state - search, role + status filters, paging.
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'))
    setCurrentUser(userData)
    fetchUsers()
    fetchRoles()
  }, [])
  const fetchRoles = async () => {
    try {
      const response = await api.get('/api/roles')
      setAllRoles(response.data)
    } catch (error) {
      // keep fallback
    }
  }


  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users')
      setUsers(response.data)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const token = localStorage.getItem('token')
      
      const payload = {
        name: formData.name,
        email: formData.email,
        // Prefer roleIds; server can also accept roles keys
        roleIds: formData.roleIds,
        roles: formData.roles
      }
      if (editingUser) {
        await api.put(`/api/users/${editingUser._id}`, payload)
      } else {
        await api.post('/api/users', payload)
      }
      
      fetchUsers()
      setShowModal(false)
      setEditingUser(null)
      setFormData({ name: '', email: '', roles: [], roleIds: [] })
    } catch (error) {
      setNotify({ open: true, title: 'Save Failed', message: error.response?.data?.message || 'We could not save the user. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (user) => {
    setEditingUser(user)
    setEditingUser(user)
    setFormData({ name: user.name, email: user.email, roles: user.roles || [], roleIds: user.roleIds || [] })
    setShowModal(true)
  }

  // Delete flow:
  //   1. Optimistic DELETE - server returns 409 USER_LINKED_TO_EMPLOYEE if
  //      the user is bridged to an Employee.
  //   2. On 409 we surface a confirmation modal listing the linked employee
  //      and offering "Unlink and Delete" which re-issues the request with
  //      ?force=true. The employee record stays intact; HR can re-link via
  //      Activate & Assign Role later.
  const [confirmLinkedDelete, setConfirmLinkedDelete] = useState(null)

  const handleDelete = async (userId, { force = false } = {}) => {
    if (!force && !confirm('Are you sure you want to delete this user?')) return
    try {
      const url = `/api/users/${userId}${force ? '?force=true' : ''}`
      const res = await api.delete(url)
      setConfirmLinkedDelete(null)
      const unlinked = res?.data?.unlinkedEmployee
      if (unlinked) {
        setNotify({
          open: true,
          title: 'User deleted',
          message: `User removed. The link to employee ${unlinked.fullName} was cleared — HR can reassign a new login from Employee Management.`
        })
      }
      fetchUsers()
    } catch (error) {
      if (error?.response?.status === 409 && error.response.data?.code === 'USER_LINKED_TO_EMPLOYEE') {
        setConfirmLinkedDelete({
          userId,
          employee: error.response.data.employee
        })
        return
      }
      setNotify({ open: true, title: 'Delete Failed', message: error?.response?.data?.message || 'We could not delete the user. Please try again.' })
    }
  }

  const getRoleLabel = (roleKey) => {
    return allRoles.find(r => r.key === roleKey)?.name || roleKey
  }

  const getAvailableRoles = () => {
    if (!currentUser?.roles) return []
    
    let allowedRoles = []
    
    for (const role of currentUser.roles) {
      if (ROLE_PERMISSIONS[role]) {
        allowedRoles = [...allowedRoles, ...ROLE_PERMISSIONS[role]]
      }
    }
    
    // Remove duplicates and return role objects
    const uniqueRoles = [...new Set(allowedRoles)]
    return allRoles
      .filter(role => uniqueRoles.includes(role.key))
      .map(r => ({ value: r.key, label: r.name, _id: r._id }))
  }

  const handleRoleChange = (roleValue, roleId) => {
    const hasRole = formData.roles.includes(roleValue)
    const newRoles = hasRole
      ? formData.roles.filter(r => r !== roleValue)
      : [...formData.roles, roleValue]
    const newRoleIds = hasRole
      ? formData.roleIds.filter(id => id !== roleId)
      : [...formData.roleIds, roleId]
    setFormData({ ...formData, roles: newRoles, roleIds: newRoleIds })
  }

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter(u => {
      if (statusFilter === 'active' && !u.isActive) return false
      if (statusFilter === 'inactive' && u.isActive) return false
      if (roleFilter !== 'all') {
        const roles = u.roles || []
        if (!roles.includes(roleFilter)) return false
      }
      if (term) {
        const hay = [u.name, u.email].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [users, search, roleFilter, statusFilter])

  useEffect(() => { setPage(1) }, [search, roleFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const visibleRoleOptions = useMemo(() => {
    const used = new Set()
    users.forEach(u => (u.roles || []).forEach(r => used.add(r)))
    return allRoles.filter(r => used.has(r.key))
  }, [allRoles, users])

  return (
    <div className="user-management">
      <div className="header">
        <h1>User Management</h1>
        <button className="add-btn" onClick={() => setShowBypassWarning(true)}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
          Add User
        </button>
      </div>

      <div className="users-toolbar">
        <input
          type="text"
          className="users-search"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="users-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All roles</option>
          {visibleRoleOptions.map(r => (
            <option key={r.key} value={r.key}>{r.name}</option>
          ))}
        </select>
        <select
          className="users-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="users-toolbar-summary">
          {filteredUsers.length} of {users.length} users
        </div>
      </div>

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th style={{ width: 56 }} />
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="users-empty">
                  No users match the current filters.
                </td>
              </tr>
            ) : pageRows.map(user => (
              <tr key={user._id}>
                <td>
                  <div className="users-row-avatar">
                    {(user.name || '?').charAt(0).toUpperCase()}
                  </div>
                </td>
                <td className="users-row-name">{user.name}</td>
                <td className="users-row-email">{user.email}</td>
                <td>
                  <div className="roles-container">
                    {(user.roles || []).map(role => (
                      <span key={role} className={`role-badge ${role}`}>
                        {getRoleLabel(role)}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={`status ${user.isActive ? 'active' : 'inactive'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="user-actions users-row-actions">
                    <button onClick={() => handleEdit(user)} className="edit-btn" title="Edit user">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(user._id)} className="delete-btn" title="Delete user">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="users-pagination">
          <button
            className="users-page-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >‹ Prev</button>
          <span className="users-page-indicator">
            Page {safePage} of {totalPages}
          </span>
          <button
            className="users-page-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >Next ›</button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setShowModal(false)} className="close-btn">×</button>
            </div>
            
            <form onSubmit={handleSubmit} className="user-form">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Roles (Select multiple)</label>
                <div className="roles-grid">
                  {getAvailableRoles().map(role => (
                    <label key={role.value} className="role-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.roles.includes(role.value)}
                        onChange={() => handleRoleChange(role.value, role._id)}
                      />
                      <span className="checkmark"></span>
                      {role.label}
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)} className="cancel-btn">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="save-btn">
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ open: false, title: '', message: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{notify.title || 'Notice'}</h2>
              <button onClick={() => setNotify({ open: false, title: '', message: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>{notify.message}</p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setNotify({ open: false, title: '', message: '' })}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmLinkedDelete && (
        <div className="modal-overlay" onClick={() => setConfirmLinkedDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>This user is linked to an employee</h2>
              <button onClick={() => setConfirmLinkedDelete(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ lineHeight: 1.55 }}>
                This account is currently linked to employee{' '}
                <strong>{confirmLinkedDelete.employee?.fullName || confirmLinkedDelete.employee?.employeeId}</strong>
                {confirmLinkedDelete.employee?.employeeId && (
                  <> (<code>{confirmLinkedDelete.employee.employeeId}</code>)</>
                )}. Deleting the user will clear the link — the employee record stays intact and HR can attach a new login later from Employee Management using <em>Activate &amp; Assign Role</em>.
              </p>
              <div className="form-actions" style={{ gap: 10 }}>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setConfirmLinkedDelete(null)}
                >Cancel</button>
                <button
                  type="button"
                  className="save-btn"
                  style={{ background: '#dc2626' }}
                  onClick={() => handleDelete(confirmLinkedDelete.userId, { force: true })}
                >Unlink and delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showBypassWarning && (
        <div
          onClick={() => setShowBypassWarning(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            animation: 'fadeIn 180ms ease-out'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(520px, 92vw)',
              padding: '28px 28px 22px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.18)',
              backdropFilter: 'blur(22px) saturate(160%)',
              WebkitBackdropFilter: 'blur(22px) saturate(160%)',
              border: '1px solid rgba(255, 255, 255, 0.32)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              color: 'var(--text-primary, #0f172a)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div
                aria-hidden="true"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '22px',
                  fontWeight: '700',
                  boxShadow: '0 8px 20px rgba(239, 68, 68, 0.35)'
                }}
              >
                !
              </div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                Use the HR flow for employees
              </h2>
            </div>
            <p style={{ margin: '0 0 20px', lineHeight: 1.55, fontSize: '0.95rem', opacity: 0.85 }}>
              Employee logins should be provisioned through <strong>HR → Employees → Activate &amp; Assign Role</strong>.
              That flow links the user account to the employee record and cascades access when the employee is
              terminated.
              <br /><br />
              Direct user creation is intended for <em>external or system accounts only</em>. Continue only if that
              applies here.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowBypassWarning(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  background: 'rgba(255, 255, 255, 0.55)',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowBypassWarning(false); navigate('/hr/employees') }}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600,
                  boxShadow: '0 8px 20px rgba(99, 102, 241, 0.35)'
                }}
              >
                Go to HR
              </button>
              <button
                type="button"
                onClick={() => { setShowBypassWarning(false); setShowModal(true) }}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  background: 'transparent',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement