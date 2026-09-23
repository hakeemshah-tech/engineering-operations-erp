import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import './hr.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

function relativeTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return d.toLocaleDateString()
}

function viaLabel(via) {
  if (via === 'email') return 'Email'
  if (via === 'employee_id') return 'Employee ID'
  if (via === 'phone') return 'Phone'
  return '—'
}

export default function PasswordResetQueue() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [rowError, setRowError] = useState({ id: null, message: '' })
  const [busyId, setBusyId] = useState(null)
  const [reveal, setReveal] = useState(null) // { user, tempPassword }
  const [copied, setCopied] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const res = await api.get('/api/users/pending-password-resets')
      setQueue(Array.isArray(res.data) ? res.data : [])
      setRowError({ id: null, message: '' })
    } catch (err) {
      setRowError({ id: null, message: err.response?.data?.message || 'Failed to load queue' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const approve = async (userId) => {
    setBusyId(userId)
    setRowError({ id: null, message: '' })
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/api/users/${userId}/generate-temp-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError({ id: userId, message: data.message || `Failed (${res.status})` })
        setBusyId(null)
        return
      }
      setReveal({ user: data.user, tempPassword: data.tempPassword })
      setBusyId(null)
    } catch (err) {
      setRowError({ id: userId, message: err.message || 'Network error' })
      setBusyId(null)
    }
  }

  const copyPassword = async () => {
    if (!reveal?.tempPassword) return
    try {
      await navigator.clipboard.writeText(reveal.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const closeReveal = () => {
    setReveal(null)
    setCopied(false)
    load()
  }

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>Pending Password Resets</h2>
          <p>
            Users who clicked "Forgot password?" appear here. Approve &amp; Generate creates
            a one-time temporary password — share it securely with the user. They will be
            forced to set a new password on their next login.
          </p>
        </div>
        <button className="hr-btn hr-btn-secondary" onClick={() => navigate('/hr')}>Back</button>
      </div>

      {loading ? (
        <div className="hr-empty">Loading…</div>
      ) : queue.length === 0 ? (
        <div className="hr-empty">No pending password reset requests.</div>
      ) : (
        <table className="hr-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Requested</th>
              <th>Via</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {queue.map(row => (
              <Fragment key={row._id}>
                <tr>
                  <td>{row.employee?.employeeId || '—'}</td>
                  <td>
                    {row.employee?.fullName || row.name}
                    {row.employee?.department && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {row.employee.department}
                      </div>
                    )}
                  </td>
                  <td>{row.email}</td>
                  <td>
                    {(row.roles || []).map(r => (
                      <span
                        key={r.key}
                        className="hr-badge hr-badge-info"
                        style={{ marginRight: 4 }}
                      >
                        {r.name || r.key}
                      </span>
                    ))}
                  </td>
                  <td>{relativeTime(row.requestedAt)}</td>
                  <td>{viaLabel(row.requestedVia)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="hr-btn hr-btn-primary"
                      onClick={() => approve(row._id)}
                      disabled={busyId === row._id}
                    >
                      {busyId === row._id ? 'Generating…' : 'Approve & Generate'}
                    </button>
                  </td>
                </tr>
                {rowError.id === row._id && rowError.message && (
                  <tr>
                    <td colSpan={7}>
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#b91c1c',
                        fontSize: '0.88rem'
                      }}>{rowError.message}</div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {rowError.id === null && rowError.message && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.12)',
          color: '#b91c1c',
          fontSize: '0.9rem'
        }}>{rowError.message}</div>
      )}

      {reveal && (
        <div
          onClick={closeReveal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(520px, 94vw)',
              padding: '26px 28px 22px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.18)',
              backdropFilter: 'blur(22px) saturate(160%)',
              WebkitBackdropFilter: 'blur(22px) saturate(160%)',
              border: '1px solid rgba(255, 255, 255, 0.32)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              color: 'var(--text-primary, #0f172a)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                Temporary password generated
              </h2>
              <button
                type="button"
                onClick={closeReveal}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.6rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: 'inherit',
                  opacity: 0.7
                }}
              >×</button>
            </div>

            <p style={{ margin: '0 0 14px', opacity: 0.88, fontSize: '0.95rem', lineHeight: 1.55 }}>
              A temporary password was generated for <strong>{reveal.user?.email}</strong>.
              They will be prompted to change it on their next login.
            </p>

            <div style={{ marginBottom: 6, fontSize: '0.82rem', opacity: 0.7 }}>Temporary password</div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#e2e8f0',
              fontFamily: 'monospace',
              fontSize: '1rem',
              marginBottom: 14
            }}>
              <code style={{ color: '#fde68a' }}>{reveal.tempPassword}</code>
              <button
                type="button"
                onClick={copyPassword}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: copied ? '#10b981' : 'rgba(255, 255, 255, 0.15)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 500
                }}
              >{copied ? 'Copied' : 'Copy'}</button>
            </div>

            <div style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#92400e',
              fontSize: '0.85rem',
              marginBottom: 18,
              lineHeight: 1.45
            }}>
              <strong>This password is shown only once.</strong> Copy it now and share it
              with the user through a secure channel.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeReveal}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
