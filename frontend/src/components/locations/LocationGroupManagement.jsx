import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '../../lib/api'
import { getUser, hasAnyRole } from '../../lib/roles'
import { userRoleWeight } from '../../lib/roleWeights'
import LocationGroupForm from './LocationGroupForm'
import './locations.css'

const WRITE_ROLES  = ['admin', 'manager', 'hr', 'project_engineer']
const DELETE_ROLES = ['admin', 'manager']

const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'office', label: 'Office' },
  { value: 'site', label: 'Site' },
  { value: 'remote', label: 'Remote' },
  { value: 'mixed', label: 'Mixed' }
]

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
]

function formatDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleString() } catch { return String(d) }
}

export default function LocationGroupManagement() {
  const currentUser = useMemo(() => getUser(), [])
  const myWeight = useMemo(() => userRoleWeight(currentUser), [currentUser])
  const canWrite  = hasAnyRole(currentUser, WRITE_ROLES)
  const canDelete = hasAnyRole(currentUser, DELETE_ROLES)

  const [groups, setGroups] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ type: '', status: '', q: '' })

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('create')
  const [editing, setEditing] = useState(null)

  const [notice, setNotice] = useState(null)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filters.type)   params.type   = filters.type
      if (filters.status) params.status = filters.status
      if (filters.q)      params.q      = filters.q
      const res = await api.get('/api/location-groups', { params })
      setGroups(res.data || [])
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load location groups.')
    } finally {
      setLoading(false)
    }
  }, [filters.type, filters.status, filters.q])

  useEffect(() => { loadGroups() }, [loadGroups])

  // Load all locations once for the multi-select picker in the form
  useEffect(() => {
    api.get('/api/locations', { params: { status: 'active' } })
      .then(res => setLocations(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLocations([]))
  }, [])

  const openCreate = () => { setEditing(null); setFormMode('create'); setFormOpen(true) }
  const openEdit   = (g) => { setEditing(g);  setFormMode('edit');   setFormOpen(true) }

  const handleSubmit = async (payload) => {
    if (formMode === 'edit' && editing) {
      const res = await api.put(`/api/location-groups/${editing._id}`, payload)
      setGroups(prev => prev.map(g => g._id === editing._id ? res.data : g))
      setNotice({ type: 'success', message: `Updated "${res.data.name}".` })
    } else {
      const res = await api.post('/api/location-groups', payload)
      setGroups(prev => [res.data, ...prev])
      setNotice({ type: 'success', message: `Created "${res.data.name}".` })
    }
  }

  const handleDelete = async (g) => {
    if (!canDelete) return
    if (g.lockedByRoleWeight > myWeight) {
      setNotice({ type: 'error', message: `🔒 "${g.name}" is locked by a higher-ranked role.` })
      return
    }
    if (!window.confirm(`Deactivate "${g.name}"? Employees assigned to this group will continue to use their last-known members, but no new members will be inherited.`)) return
    try {
      const res = await api.delete(`/api/location-groups/${g._id}`)
      const updated = res.data?.group
      if (updated) setGroups(prev => prev.map(x => x._id === g._id ? updated : x))
      else loadGroups()
      setNotice({ type: 'success', message: `Deactivated "${g.name}".` })
    } catch (err) {
      const data = err?.response?.data || {}
      if (data.code === 'GROUP_IN_USE') {
        setNotice({ type: 'error', message: `${g.name} is still assigned to ${data.employeeCount} employee${data.employeeCount === 1 ? '' : 's'}. Reassign them first.` })
      } else {
        setNotice({ type: 'error', message: data.message || 'Delete failed.' })
      }
    }
  }

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  return (
    <div className="loc-page">
      <div className="loc-page-header">
        <div>
          <h1 className="loc-page-title">Location Groups</h1>
          <p className="loc-page-subtitle">
            Bundles of Locations you can assign to many employees in one go. Edit a group once and every member-employee inherits the change — the lever for WFH and multi-office setups.
          </p>
        </div>
        {canWrite && (
          <button className="loc-btn loc-btn-primary" onClick={openCreate}>
            + New group
          </button>
        )}
      </div>

      {notice && (
        <div className={`loc-banner loc-banner-${notice.type}`}>{notice.message}</div>
      )}

      <div className="loc-filter-bar">
        <input
          type="text"
          className="loc-filter-input"
          placeholder="Search by name..."
          value={filters.q}
          onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
        />
        <select
          className="loc-filter-input"
          value={filters.type}
          onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
        >
          {TYPE_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          className="loc-filter-input"
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          {STATUS_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {error && <div className="loc-banner loc-banner-error">{error}</div>}

      <div className="loc-table-wrap">
        <table className="loc-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Members</th>
              <th>Description</th>
              <th>Status</th>
              <th>Lock</th>
              <th>Updated</th>
              <th style={{ width: 180 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="8" className="loc-table-empty">Loading...</td></tr>
            )}
            {!loading && groups.length === 0 && (
              <tr><td colSpan="8" className="loc-table-empty">No location groups yet.</td></tr>
            )}
            {!loading && groups.map(g => {
              const lockedAgainstMe = g.lockedByRoleWeight > myWeight
              return (
                <tr key={g._id} className={g.status === 'inactive' ? 'loc-row-inactive' : ''}>
                  <td><strong>{g.name}</strong></td>
                  <td>
                    <span className={`loc-type-badge loc-type-${g.type}`}>{g.type}</span>
                  </td>
                  <td>
                    <span className="loc-pill">{(g.locationIds || []).length} location{(g.locationIds || []).length === 1 ? '' : 's'}</span>
                  </td>
                  <td className="loc-cell-truncate" title={g.description || ''}>{g.description || '—'}</td>
                  <td>
                    <span className={`loc-status-badge loc-status-${g.status}`}>{g.status}</span>
                  </td>
                  <td title={`Locked by role weight ${g.lockedByRoleWeight}`}>
                    {lockedAgainstMe
                      ? <span className="loc-lock-icon" aria-label="Locked by higher role">🔒</span>
                      : <span className="loc-lock-weight">w{g.lockedByRoleWeight ?? 0}</span>}
                  </td>
                  <td className="loc-cell-muted">{formatDate(g.updatedAt)}</td>
                  <td>
                    <div className="loc-row-actions">
                      <button
                        type="button"
                        className="loc-btn loc-btn-ghost loc-btn-sm"
                        onClick={() => openEdit(g)}
                      >
                        {canWrite && !lockedAgainstMe ? 'Edit' : 'View'}
                      </button>
                      {canDelete && g.status === 'active' && (
                        <button
                          type="button"
                          className="loc-btn loc-btn-danger loc-btn-sm"
                          onClick={() => handleDelete(g)}
                          disabled={lockedAgainstMe}
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <LocationGroupForm
        isOpen={formOpen}
        mode={formMode}
        initial={editing}
        locations={locations}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
