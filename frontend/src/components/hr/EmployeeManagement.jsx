import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import './hr.css'

const CATEGORY_LABELS = {
  site_company_visa: 'Site — Company Visa',
  site_mission_visa: 'Site — Mission Visa',
  office: 'Office'
}

const STATUS_BADGE = {
  onboarding: 'hr-badge-info',
  active: 'hr-badge-success',
  on_leave: 'hr-badge-warning',
  offboarding: 'hr-badge-warning',
  terminated: 'hr-badge-danger',
  resigned: 'hr-badge-neutral'
}

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const photoSrc = (url) => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

export default function EmployeeManagement() {
  const navigate = useNavigate()
  const [employees, setEmployees] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [workflowType, setWorkflowType] = useState('all')
  const [role, setRole] = useState('all')
  const [location, setLocation] = useState('all')
  const [locationGroup, setLocationGroup] = useState('all')
  const [locationOptions, setLocationOptions] = useState([])
  const [locationGroupOptions, setLocationGroupOptions] = useState([])
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkResult, setBulkResult] = useState(null)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const params = {}
      if (search) params.search = search
      if (status !== 'all') params.status = status
      if (category !== 'all') params.category = category
      if (workflowType !== 'all') params.workflowType = workflowType
      if (role !== 'all') params.role = role
      if (location !== 'all') params.location = location
      if (locationGroup !== 'all') params.locationGroup = locationGroup
      const res = await api.get('/api/employees', { params })
      setEmployees(res.data || [])
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to load employees' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [status, category, workflowType, role, location, locationGroup])

  useEffect(() => {
    api.get('/api/roles')
      .then(res => setRoles(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRoles([]))
    // Location + group dropdowns - fetched once. For very large catalogs
    // we'd switch to an async picker, but the filter dropdowns work fine
    // up to a few hundred entries.
    api.get('/api/locations', { params: { status: 'active' } })
      .then(res => setLocationOptions(Array.isArray(res.data) ? res.data : (res.data?.items || [])))
      .catch(() => setLocationOptions([]))
    api.get('/api/location-groups', { params: { status: 'active' } })
      .then(res => setLocationGroupOptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLocationGroupOptions([]))
  }, [])

  const openDetail = (id) => navigate('/hr/employee-detail', { state: { employeeId: id } })

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>Employees</h2>
          <p>Manage employee records, onboarding, and documents.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="hr-btn hr-btn-secondary" onClick={() => { setBulkOpen(true); setBulkResult(null) }}>
            ⬆ Bulk assign locations
          </button>
          <button className="hr-btn hr-btn-primary" onClick={() => navigate('/hr/employees/create')}>
            + New Employee
          </button>
        </div>
      </div>

      <div className="hr-filters">
        <input
          type="text"
          placeholder="Search by name, ID, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="onboarding">Onboarding</option>
          <option value="active">Active</option>
          <option value="on_leave">On Leave</option>
          <option value="offboarding">Offboarding</option>
          <option value="terminated">Terminated</option>
          <option value="resigned">Resigned</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          <option value="site_company_visa">Site — Company Visa</option>
          <option value="site_mission_visa">Site — Mission Visa</option>
          <option value="office">Office</option>
        </select>
        <select value={workflowType} onChange={(e) => setWorkflowType(e.target.value)}>
          <option value="all">All workflows</option>
          <option value="overseas">Overseas</option>
          <option value="uae_transfer">UAE Transfer</option>
          <option value="emirati">Emirati</option>
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="all">All roles</option>
          {roles.map(r => (
            <option key={r.key} value={r.key}>{r.name || r.key}</option>
          ))}
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)} title="Match employees with this location set as Base, Additional, or via their Location Group">
          <option value="all">All locations</option>
          {locationOptions.map(loc => (
            <option key={loc._id} value={loc._id}>
              📍 {loc.name}{loc.type ? ` (${loc.type})` : ''}
            </option>
          ))}
        </select>
        <select value={locationGroup} onChange={(e) => setLocationGroup(e.target.value)}>
          <option value="all">All location groups</option>
          {locationGroupOptions.map(g => (
            <option key={g._id} value={g._id}>
              👥 {g.name}
            </option>
          ))}
        </select>
        <button className="hr-btn hr-btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="hr-empty">Loading…</div>
      ) : employees.length === 0 ? (
        <div className="hr-empty">No employees match your filters.</div>
      ) : (
        <table className="hr-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Roles</th>
              <th>Workflow</th>
              <th>Stage</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(e => {
              const empRoles = Array.isArray(e.userId?.roles) ? e.userId.roles : []
              // "Has a usable login" = linked User exists AND it has at least
              // one role. The Name + Roles cells get a flag for HR triage.
              const needsLogin = !e.userId || empRoles.length === 0
              return (
                <tr key={e._id} style={needsLogin ? { background: 'rgba(245,158,11,0.04)' } : undefined}>
                  <td>{e.employeeId}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--input, #f1f5f9)',
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
                        flexShrink: 0,
                        position: 'relative'
                      }}>
                        {e.photoUrl ? (
                          <img src={photoSrc(e.photoUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          (e.fullName || '?').trim().charAt(0).toUpperCase()
                        )}
                        {needsLogin && (
                          <span
                            title="No active login linked to this employee"
                            style={{
                              position: 'absolute',
                              bottom: -2, right: -2,
                              width: 12, height: 12,
                              borderRadius: '50%',
                              background: '#f59e0b',
                              border: '2px solid var(--card, #fff)'
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{e.fullName}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.email || e.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td>{CATEGORY_LABELS[e.category] || e.category}</td>
                  <td>
                    {needsLogin ? (
                      <span
                        title="Open the employee detail page to assign a login & role"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(245,158,11,.12)',
                          color: '#b45309',
                          border: '1px solid rgba(245,158,11,.35)'
                        }}
                      >
                        ⚠ No login {e.userId ? '(no roles)' : ''}
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {empRoles.map(r => (
                          <span
                            key={r._id || r.key}
                            className="hr-badge hr-badge-info"
                            style={{ fontSize: 11 }}
                          >
                            {r.name || r.key}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{e.workflow?.type?.replace('_', ' ')}</td>
                  <td style={{ textTransform: 'capitalize' }}>{e.workflow?.currentStage?.replace(/_/g, ' ')}</td>
                  <td>
                    <span className={`hr-badge ${STATUS_BADGE[e.status] || 'hr-badge-neutral'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td>
                    <div className="hr-table-actions">
                      <button className="hr-btn hr-btn-secondary" onClick={() => openDetail(e._id)}>View</button>
                      <button className="hr-btn hr-btn-secondary" onClick={() => navigate(`/hr/employees/edit/${e._id}`)}>Edit</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {bulkOpen && (
        <div className="hr-modal-overlay" onClick={() => setBulkOpen(false)}>
          <div className="hr-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <h3>Bulk assign location / group</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Paste rows in CSV format. Names are matched against existing Locations and Location Groups (case-insensitive, exact match). Each employee row updates only the fields you supply — leave a column blank to keep the current value.
            </p>
            <div style={{
              padding: '10px 12px',
              background: 'var(--input)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              marginBottom: 12,
              fontSize: '0.82rem',
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--text-muted)'
            }}>
              <strong style={{ color: 'var(--text)' }}>Format:</strong> employeeId,baseLocationName,locationGroupName<br />
              EMP-00001,HQ Office,<br />
              EMP-00002,,All UAE Offices<br />
              EMP-00003,Branch B,Remote — UAE
            </div>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={'EMP-00001,HQ Office,\nEMP-00002,,All UAE Offices'}
              rows={8}
              style={{
                width: '100%',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.85rem',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--input)',
                color: 'var(--text)'
              }}
            />

            {bulkResult && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span className="hr-badge hr-badge-success">✓ {bulkResult.updated} updated</span>
                  <span className="hr-badge hr-badge-neutral">{bulkResult.skipped} skipped</span>
                  {bulkResult.errored > 0 && <span className="hr-badge hr-badge-danger">✗ {bulkResult.errored} errored</span>}
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table className="hr-table" style={{ margin: 0 }}>
                    <thead>
                      <tr><th>Employee</th><th>Status</th><th>Detail</th></tr>
                    </thead>
                    <tbody>
                      {(bulkResult.results || []).map((r, i) => (
                        <tr key={i}>
                          <td>{r.employeeId}{r.name ? ` · ${r.name}` : ''}</td>
                          <td>
                            <span className={`hr-badge ${
                              r.status === 'updated' ? 'hr-badge-success'
                              : r.status === 'skipped' ? 'hr-badge-neutral'
                              : 'hr-badge-danger'
                            }`}>{r.status}</span>
                          </td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {r.status === 'updated' ? `Updated: ${(r.changes || []).join(', ')}` : (r.reason || '')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="hr-form-actions" style={{ marginTop: 14 }}>
              <button className="hr-btn hr-btn-secondary" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>Close</button>
              <button
                className="hr-btn hr-btn-primary"
                disabled={bulkSubmitting || !bulkText.trim()}
                onClick={async () => {
                  setBulkSubmitting(true)
                  setBulkResult(null)
                  try {
                    // Parse CSV: lines → { employeeId, baseLocationName, locationGroupName }
                    const rows = bulkText.split(/\r?\n/)
                      .map(l => l.trim())
                      .filter(l => l && !l.startsWith('#') && !l.toLowerCase().startsWith('employeeid'))
                      .map(line => {
                        const parts = line.split(',').map(p => p.trim())
                        return {
                          employeeId: parts[0] || '',
                          baseLocationName: parts[1] || '',
                          locationGroupName: parts[2] || ''
                        }
                      })
                    if (rows.length === 0) {
                      setNotify({ open: true, title: 'Nothing to do', message: 'Paste at least one CSV row.' })
                    } else {
                      const res = await api.post('/api/employees/bulk-assign-location', { rows })
                      setBulkResult(res.data)
                      load()  // refresh the employee list to reflect changes
                    }
                  } catch (err) {
                    setNotify({ open: true, title: 'Error', message: err?.response?.data?.message || 'Bulk assignment failed.' })
                  } finally {
                    setBulkSubmitting(false)
                  }
                }}
              >
                {bulkSubmitting ? 'Processing…' : 'Process rows'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notify.open && (
        <div className="hr-modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3>{notify.title}</h3>
            <p>{notify.message}</p>
            <div className="hr-form-actions">
              <button className="hr-btn hr-btn-primary" onClick={() => setNotify({ ...notify, open: false })}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
