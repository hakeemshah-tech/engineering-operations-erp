import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const TABS = [
  { key: 'create', label: 'Create new login' },
  { key: 'link',   label: 'Link existing user' }
]

export default function ActivateUserModal({ employee, onClose, onActivated }) {
  const [tab, setTab] = useState('create')
  const [roles, setRoles] = useState([])
  const [selectedKeys, setSelectedKeys] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  // Existing-user picker state
  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [userLoading, setUserLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')

  useEffect(() => {
    let alive = true
    api.get('/api/roles').then(res => {
      if (!alive) return
      setRoles((res.data || []).filter(r => r.key !== 'admin'))
    }).catch(() => {
      if (alive) setError('Could not load roles')
    })
    return () => { alive = false }
  }, [])

  // Load unlinked users when the Link tab is opened or the search changes.
  // Debounced to avoid hammering the API on every keystroke.
  useEffect(() => {
    if (tab !== 'link') return
    let alive = true
    setUserLoading(true)
    const t = setTimeout(() => {
      api.get('/api/users/unlinked', { params: { q: userSearch, limit: 20 } })
        .then(res => { if (alive) setUsers(res.data || []) })
        .catch(() => { if (alive) setUsers([]) })
        .finally(() => { if (alive) setUserLoading(false) })
    }, 200)
    return () => { alive = false; clearTimeout(t) }
  }, [tab, userSearch])

  const toggleKey = (key) => {
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (selectedKeys.length === 0) {
      setError('Select at least one role')
      return
    }
    if (tab === 'link' && !selectedUserId) {
      setError('Select an existing user to link')
      return
    }
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const body = { roleKeys: selectedKeys }
      if (tab === 'link') body.existingUserId = selectedUserId
      const res = await fetch(`${API_BASE}/api/employees/${employee._id}/activate-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || `Failed (${res.status})`)
        setLoading(false)
        return
      }
      setResult(data)
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Network error')
      setLoading(false)
    }
  }

  const copyPassword = async () => {
    if (!result?.tempPassword) return
    try {
      await navigator.clipboard.writeText(result.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const handleClose = () => {
    if (result && onActivated) onActivated()
    onClose()
  }

  const isLinkMode = tab === 'link'
  const linkedMode = result?.mode === 'linked'

  return (
    <div
      onClick={handleClose}
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
          width: 'min(620px, 94vw)',
          maxHeight: '88vh',
          overflow: 'auto',
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
            {result ? (linkedMode ? 'User linked' : 'Account provisioned') : 'Activate & Assign Role'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.6rem',
              lineHeight: 1,
              cursor: 'pointer',
              color: 'inherit',
              opacity: 0.7
            }}
            aria-label="Close"
          >×</button>
        </div>

        {!result && (
          <>
            <p style={{ margin: '0 0 14px', opacity: 0.85, fontSize: '0.92rem', lineHeight: 1.5 }}>
              Provisioning a login for <strong>{employee.fullName}</strong> ({employee.email}).
              Admin role is not available here — use User Management for admin grants.
            </p>

            {/* Tabs - Create vs Link */}
            <div style={{
              display: 'flex',
              gap: 4,
              padding: 4,
              borderRadius: 10,
              background: 'rgba(15,23,42,.05)',
              marginBottom: 14
            }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTab(t.key); setError(''); setSelectedUserId('') }}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: tab === t.key ? '#fff' : 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontWeight: tab === t.key ? 600 : 500,
                    fontSize: '0.88rem'
                  }}
                >{t.label}</button>
              ))}
            </div>

            {error && (
              <div style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#b91c1c',
                marginBottom: 12,
                fontSize: '0.9rem'
              }}>{error}</div>
            )}

            <form onSubmit={submit}>
              {/* Existing-user picker (link mode only) */}
              {isLinkMode && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 6, fontSize: '0.85rem', fontWeight: 500, opacity: 0.75 }}>
                    Pick an existing user (not currently linked to any employee)
                  </div>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.12)',
                      background: 'rgba(255,255,255,0.6)',
                      fontSize: '0.9rem',
                      marginBottom: 6
                    }}
                  />
                  <div style={{
                    maxHeight: 180,
                    overflow: 'auto',
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: 'rgba(255,255,255,0.35)'
                  }}>
                    {userLoading && <div style={{ padding: 12, fontSize: 13, opacity: 0.6 }}>Loading…</div>}
                    {!userLoading && users.length === 0 && (
                      <div style={{ padding: 12, fontSize: 13, opacity: 0.6 }}>
                        No unlinked users match. Create a new login instead, or visit User Management.
                      </div>
                    )}
                    {users.map(u => {
                      const on = String(selectedUserId) === String(u._id)
                      const roleLabels = (u.roles || []).map(r => r.name || r.key).join(', ')
                      return (
                        <label
                          key={u._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 12px',
                            borderBottom: '1px solid rgba(0,0,0,0.05)',
                            cursor: 'pointer',
                            background: on ? 'rgba(99,102,241,.10)' : 'transparent'
                          }}
                        >
                          <input
                            type="radio"
                            name="existingUser"
                            checked={on}
                            onChange={() => setSelectedUserId(u._id)}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                            <div style={{ fontSize: 11, opacity: 0.7 }}>
                              {u.email}{roleLabels ? ` · ${roleLabels}` : ''}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6, lineHeight: 1.5 }}>
                    Linking will add the selected roles below to the user (keeping any roles they already have) and connect them to this employee. They keep their current password.
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 8, fontSize: '0.85rem', fontWeight: 500, opacity: 0.75 }}>
                {isLinkMode ? 'Roles to ensure are granted (existing roles are preserved)' : 'Select one or more roles'}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 8,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.35)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                marginBottom: 18,
                maxHeight: 220,
                overflow: 'auto'
              }}>
                {roles.length === 0 && <div style={{ opacity: 0.6 }}>Loading roles…</div>}
                {roles.map(r => (
                  <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.92rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(r.key)}
                      onChange={() => toggleKey(r.key)}
                    />
                    <span>{r.name || r.key}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: '1px solid rgba(0, 0, 0, 0.12)',
                    background: 'rgba(255, 255, 255, 0.55)',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >Cancel</button>
                <button
                  type="submit"
                  disabled={loading || selectedKeys.length === 0 || (isLinkMode && !selectedUserId)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white',
                    cursor: loading ? 'default' : 'pointer',
                    fontWeight: 600,
                    boxShadow: '0 8px 20px rgba(99, 102, 241, 0.35)',
                    opacity: (loading || selectedKeys.length === 0 || (isLinkMode && !selectedUserId)) ? 0.65 : 1
                  }}
                >{loading ? (isLinkMode ? 'Linking…' : 'Activating…') : (isLinkMode ? 'Link user' : 'Activate')}</button>
              </div>
            </form>
          </>
        )}

        {result && linkedMode && (
          <>
            <p style={{ margin: '0 0 14px', opacity: 0.88, fontSize: '0.95rem', lineHeight: 1.55 }}>
              <strong>{result.user?.email}</strong> is now linked to <strong>{employee.fullName}</strong>. They keep their current password and any roles they already had — the new roles you selected have been added.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleClose}
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
          </>
        )}

        {result && !linkedMode && (
          <>
            <p style={{ margin: '0 0 14px', opacity: 0.88, fontSize: '0.95rem', lineHeight: 1.55 }}>
              A user account was created for <strong>{result.user?.email}</strong>. They will be prompted
              to change this temporary password on first login.
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
              <code style={{ color: '#fde68a' }}>{result.tempPassword}</code>
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
              <strong>This password is shown only once.</strong> Copy it now and share it with the
              employee through a secure channel.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleClose}
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
          </>
        )}
      </div>
    </div>
  )
}
