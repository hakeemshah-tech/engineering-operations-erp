import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import './Profile.css'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const photoSrc = (url) => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString() } catch { return '—' }
}

function fmtDateTime(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
    })
  } catch { return '—' }
}

function Row({ label, children }) {
  return (
    <div className="profile-row">
      <div className="profile-row-label">{label}</div>
      <div className="profile-row-value">{children}</div>
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await api.get('/api/auth/me')
        if (!cancelled) setData(res.data)
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="profile-page"><div className="profile-empty">Loading profile…</div></div>
  }
  if (error) {
    return <div className="profile-page"><div className="profile-empty profile-error">{error}</div></div>
  }

  const { user, employee } = data || {}
  const initials = (user?.name || user?.email || '?').charAt(0).toUpperCase()
  const roleNames = (user?.roles || []).map(r => r.name).filter(Boolean)
  const assignedProjects = (employee?.assignedProjects || []).map(p => p.name).filter(Boolean)

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div
          className="profile-avatar"
          style={employee?.photoUrl ? { background: 'transparent', overflow: 'hidden', padding: 0 } : undefined}
        >
          {employee?.photoUrl ? (
            <img
              src={photoSrc(employee.photoUrl)}
              alt={user?.name || 'Profile photo'}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            initials
          )}
        </div>
        <div className="profile-header-text">
          <h1>{user?.name || '—'}</h1>
          <div className="profile-subtitle">{user?.email}</div>
          <div className="profile-roles">
            {roleNames.length > 0
              ? roleNames.map((r, i) => <span key={i} className="profile-chip">{r}</span>)
              : <span className="profile-chip profile-chip-muted">No roles assigned</span>
            }
          </div>
        </div>
        <div className="profile-header-actions">
          <button className="profile-btn profile-btn-primary" onClick={() => navigate('/change-password')}>
            Change password
          </button>
          <button className="profile-btn profile-btn-secondary" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>

      <section className="profile-card">
        <h2>Account</h2>
        <Row label="Full name">{user?.name || '—'}</Row>
        <Row label="Email">{user?.email || '—'}</Row>
        <Row label="Roles">
          {roleNames.length > 0 ? roleNames.join(', ') : '—'}
        </Row>
        <Row label="Status">
          <span className={`profile-badge ${user?.isActive ? 'profile-badge-success' : 'profile-badge-danger'}`}>
            {user?.isActive ? 'Active' : 'Disabled'}
          </span>
        </Row>
        <Row label="Password last changed">{fmtDateTime(user?.passwordChangedAt)}</Row>
        <Row label="Account created">{fmtDateTime(user?.createdAt)}</Row>
      </section>

      {employee && (
        <section className="profile-card">
          <h2>Employment</h2>
          <Row label="Employee ID">{employee.employeeId || '—'}</Row>
          <Row label="Name on record">{employee.fullName || '—'}</Row>
          <Row label="Position">{employee.position || '—'}</Row>
          <Row label="Department">{employee.department || '—'}</Row>
          <Row label="Category">{employee.category || '—'}</Row>
          <Row label="Employment status">{employee.status || '—'}</Row>
          <Row label="Joining date">{fmtDate(employee.joiningDate)}</Row>
          {employee.probationEndDate && (
            <Row label="Probation ends">{fmtDate(employee.probationEndDate)}</Row>
          )}
          <Row label="Phone">{employee.phone || '—'}</Row>
          <Row label="Contact email">{employee.email || '—'}</Row>
          <Row label="Reports to">
            {employee.reportingTo?.name || '—'}
          </Row>
          <Row label="Assigned projects">
            {assignedProjects.length > 0
              ? assignedProjects.join(', ')
              : '—'}
          </Row>
        </section>
      )}

      <section className="profile-card">
        <h2>Security</h2>
        <p className="profile-help">
          You can change your password at any time. You'll need to enter your current password and choose a new one of at least 10 characters.
        </p>
        <div>
          <button className="profile-btn profile-btn-primary" onClick={() => navigate('/change-password')}>
            Change password
          </button>
        </div>
      </section>

      <div className="profile-note">
        This page is read-only. To update any of the details above, contact HR.
      </div>
    </div>
  )
}
