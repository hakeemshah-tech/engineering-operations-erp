import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '../../lib/api'
import { getUser, hasAnyRole } from '../../lib/roles'
import { userRoleWeight } from '../../lib/roleWeights'
import LocationForm from './LocationForm'
import './locations.css'

const WRITE_ROLES = ['admin', 'manager', 'hr', 'project_engineer']
const DELETE_ROLES = ['admin', 'manager']

const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'site', label: 'Site' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' }
]

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
]

function formatDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return String(d)
  }
}

export default function LocationManagement() {
  const currentUser = useMemo(() => getUser(), [])
  const myWeight = useMemo(() => userRoleWeight(currentUser), [currentUser])
  const canWrite = hasAnyRole(currentUser, WRITE_ROLES)
  const canDelete = hasAnyRole(currentUser, DELETE_ROLES)

  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ type: '', status: '', q: '' })

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('create')
  const [editing, setEditing] = useState(null)

  const [notice, setNotice] = useState(null) // { type: 'success'|'error', message }

  const loadLocations = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filters.type) params.type = filters.type
      if (filters.status) params.status = filters.status
      if (filters.q) params.q = filters.q
      const res = await api.get('/api/locations', { params })
      setLocations(res.data || [])
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load locations.')
    } finally {
      setLoading(false)
    }
  }, [filters.type, filters.status, filters.q])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  const openCreate = () => {
    setEditing(null)
    setFormMode('create')
    setFormOpen(true)
  }

  const openEdit = (loc) => {
    setEditing(loc)
    setFormMode('edit')
    setFormOpen(true)
  }

  const handleSubmit = async (payload) => {
    if (formMode === 'edit' && editing) {
      const res = await api.put(`/api/locations/${editing._id}`, payload)
      setLocations(prev => prev.map(l => l._id === editing._id ? res.data : l))
      setNotice({ type: 'success', message: `Updated "${res.data.name}".` })
    } else {
      const res = await api.post('/api/locations', payload)
      setLocations(prev => [res.data, ...prev])
      setNotice({ type: 'success', message: `Created "${res.data.name}".` })
    }
  }

  const handleDelete = async (loc) => {
    if (!canDelete) return
    if (loc.lockedByRoleWeight > myWeight) {
      setNotice({ type: 'error', message: `🔒 "${loc.name}" is locked by a higher-ranked role.` })
      return
    }
    if (!window.confirm(`Deactivate "${loc.name}"? It will no longer be selectable, but historical references remain intact.`)) {
      return
    }
    try {
      const res = await api.delete(`/api/locations/${loc._id}`)
      const updated = res.data?.location
      if (updated) {
        setLocations(prev => prev.map(l => l._id === loc._id ? updated : l))
      } else {
        loadLocations()
      }
      setNotice({ type: 'success', message: `Deactivated "${loc.name}".` })
    } catch (err) {
      const msg = err?.response?.data?.message || 'Delete failed.'
      setNotice({ type: 'error', message: msg })
    }
  }

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  return (
    <div className="loc-page">
      <div className="loc-page-header">
        <div>
          <h1 className="loc-page-title">Locations</h1>
          <p className="loc-page-subtitle">
            Geofenced sites and offices used for attendance validation. Higher-ranked roles can lock locations against edits by lower-ranked roles.
          </p>
        </div>
        {canWrite && (
          <button className="loc-btn loc-btn-primary" onClick={openCreate}>
            + New location
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
          onChange={(e) => setFilters(f => ({ ...f, q: e.target.value }))}
        />
        <select
          className="loc-filter-input"
          value={filters.type}
          onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
        >
          {TYPE_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          className="loc-filter-input"
          value={filters.status}
          onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
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
              <th>Address</th>
              <th>Coords</th>
              <th>Radius</th>
              <th>Status</th>
              <th>Lock</th>
              <th>Updated</th>
              <th style={{ width: 180 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="9" className="loc-table-empty">Loading...</td></tr>
            )}
            {!loading && locations.length === 0 && (
              <tr><td colSpan="9" className="loc-table-empty">No locations yet.</td></tr>
            )}
            {!loading && locations.map(loc => {
              const lockedAgainstMe = loc.lockedByRoleWeight > myWeight
              return (
                <tr key={loc._id} className={loc.status === 'inactive' ? 'loc-row-inactive' : ''}>
                  <td><strong>{loc.name}</strong></td>
                  <td>
                    <span className={`loc-type-badge loc-type-${loc.type}`}>{loc.type}</span>
                  </td>
                  <td className="loc-cell-truncate" title={loc.address || ''}>{loc.address || '—'}</td>
                  <td className="loc-cell-mono">
                    {Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}
                  </td>
                  <td>{loc.geofenceRadiusMeters} m</td>
                  <td>
                    <span className={`loc-status-badge loc-status-${loc.status}`}>{loc.status}</span>
                  </td>
                  <td title={`Locked by role weight ${loc.lockedByRoleWeight}`}>
                    {lockedAgainstMe
                      ? <span className="loc-lock-icon" aria-label="Locked by higher role">🔒</span>
                      : <span className="loc-lock-weight">w{loc.lockedByRoleWeight ?? 0}</span>}
                  </td>
                  <td className="loc-cell-muted">{formatDate(loc.updatedAt)}</td>
                  <td>
                    <div className="loc-row-actions">
                      <button
                        type="button"
                        className="loc-btn loc-btn-ghost loc-btn-sm"
                        onClick={() => openEdit(loc)}
                      >
                        {canWrite && !lockedAgainstMe ? 'Edit' : 'View'}
                      </button>
                      {canDelete && loc.status === 'active' && (
                        <button
                          type="button"
                          className="loc-btn loc-btn-danger loc-btn-sm"
                          onClick={() => handleDelete(loc)}
                          disabled={lockedAgainstMe}
                          title={lockedAgainstMe ? 'Locked by higher role' : ''}
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

      <LocationForm
        isOpen={formOpen}
        mode={formMode}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
