import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

/**
 * Project-scoped landing view for Site Supervisor / Supervisor /
 * Site Worker / Project Engineer.
 *
 * Tabular layout (the user explicitly asked for table rows over cards
 * - tables scan and filter better at scale). Pagination is client-side
 * because the server already self-scopes via `?mine=true`.
 */

const STATUS_TONE = {
  active:    { bg: 'rgba(34,197,94,.12)',   br: 'rgba(34,197,94,.40)',   fg: '#16a34a', label: 'Active' },
  on_hold:   { bg: 'rgba(245,158,11,.12)',  br: 'rgba(245,158,11,.40)',  fg: '#b45309', label: 'On Hold' },
  completed: { bg: 'rgba(99,102,241,.12)',  br: 'rgba(99,102,241,.40)',  fg: '#4f46e5', label: 'Completed' },
  cancelled: { bg: 'rgba(148,163,184,.12)', br: 'rgba(148,163,184,.40)', fg: '#475569', label: 'Cancelled' },
  default:   { bg: 'rgba(148,163,184,.12)', br: 'rgba(148,163,184,.40)', fg: '#475569', label: '—' }
}

function idOf(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return String(v._id || v.id || '')
}

export default function MyProjects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [roleFilter, setRoleFilter]       = useState('all')
  const [page, setPage]                   = useState(1)
  const PAGE_SIZE = 12

  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, [])
  const myId = String(currentUser?.id || currentUser?._id || '')
  const myRoles = currentUser?.roles || []

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get('/api/projects', { params: { mine: 'true' } })
      .then(res => {
        if (!alive) return
        setProjects(Array.isArray(res.data) ? res.data : [])
      })
      .catch(err => {
        if (!alive) return
        setError(err?.response?.data?.message || 'Could not load your projects.')
        setProjects([])
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, statusFilter, roleFilter])

  const myRolesOnProject = (project) => {
    const roles = []
    if ((project.assignedProjectEngineer || []).some(e => idOf(e) === myId)) roles.push('Project Engineer')
    if (idOf(project.assignedSiteEngineer) === myId)                          roles.push('Site Engineer')
    if ((project.supervisors || []).some(e => idOf(e) === myId))              roles.push('Supervisor')
    if ((project.workers     || []).some(e => idOf(e) === myId))              roles.push('Site Worker')
    return roles
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return projects.filter(p => {
      if (statusFilter !== 'all' && (p.status || 'active') !== statusFilter) return false
      if (roleFilter !== 'all') {
        const roles = myRolesOnProject(p)
        if (!roles.includes(roleFilter)) return false
      }
      if (!term) return true
      return (p.name || '').toLowerCase().includes(term)
          || (p.locationDetails || '').toLowerCase().includes(term)
          || (typeof p.siteLocationId === 'object' && (p.siteLocationId?.name || '').toLowerCase().includes(term))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, statusFilter, roleFilter, myId])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // ProjectDetail is keyed by localStorage('projectId') + a static
   // `/project-detail` route (legacy contract from ProjectManagement). Match
   // that pattern instead of inventing a /projects/:id route that doesn't
   // exist in App.jsx.
   const openProject = (id) => {
     try {
       localStorage.setItem('projectId', String(id))
       localStorage.setItem('projectsFocusId', String(id))
     } catch {}
     navigate('/project-detail')
   }

  const ROLE_OPTIONS = [
    { v: 'all', l: 'All my roles' },
    { v: 'Project Engineer', l: 'Project Engineer' },
    { v: 'Site Engineer',    l: 'Site Engineer' },
    { v: 'Supervisor',       l: 'Supervisor' },
    { v: 'Site Worker',      l: 'Site Worker' }
  ]
  const STATUS_OPTIONS = [
    { v: 'all',       l: 'All statuses' },
    { v: 'active',    l: 'Active' },
    { v: 'on_hold',   l: 'On Hold' },
    { v: 'completed', l: 'Completed' },
    { v: 'cancelled', l: 'Cancelled' }
  ]

  return (
    <div style={{ padding: '24px 32px', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>My Projects</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
          {currentUser?.name || 'You'} · {myRoles.map(r => r.replace(/_/g, ' ')).join(', ') || 'no roles'} · only projects you are assigned to are visible
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 14,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="Search by project name, location, or site…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1 1 280px',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--input, #f8fafc)',
            color: 'var(--text)',
            fontSize: 14
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: 13
          }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: 13
          }}
        >
          {ROLE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} project{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading && <div style={{ padding: 30, color: 'var(--text-muted)' }}>Loading…</div>}
      {error && !loading && (
        <div style={{
          padding: 14,
          borderRadius: 10,
          background: 'rgba(239,68,68,.10)',
          border: '1px solid rgba(239,68,68,.40)',
          color: 'var(--text)',
          fontSize: 13
        }}>{error}</div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{
          padding: 40,
          borderRadius: 12,
          border: '1px dashed var(--border)',
          color: 'var(--text-muted)',
          textAlign: 'center',
          fontSize: 14
        }}>
          You are not currently assigned to any projects matching the filters. Ask the Project Engineer or HR to assign you.
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--card)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{
                background: 'var(--input, #f8fafc)',
                borderBottom: '2px solid var(--border)'
              }}>
                <tr>
                  <th style={th}>Project</th>
                  <th style={th}>Status</th>
                  <th style={th}>Your role(s)</th>
                  <th style={th}>Site location</th>
                  <th style={th}>Project Engineer</th>
                  <th style={th}>Team</th>
                  <th style={th}>Assigned by</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(p => {
                  const tone  = STATUS_TONE[p.status] || STATUS_TONE.default
                  const myRolesHere = myRolesOnProject(p)
                  const pe = (p.assignedProjectEngineer || []).map(e => e?.name).filter(Boolean).join(', ')
                  const supsCount = (p.supervisors || []).length
                  const wrkCount  = (p.workers     || []).length
                  const siteLoc = typeof p.siteLocationId === 'object' ? p.siteLocationId : null
                  return (
                    <tr
                      key={p._id}
                      onClick={() => openProject(p._id)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.1s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99,102,241,.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{p.name || '—'}</div>
                        {p.locationDetails && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            📍 {p.locationDetails}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <span style={{
                          padding: '2px 9px',
                          borderRadius: 999,
                          background: tone.bg,
                          border: `1px solid ${tone.br}`,
                          color: tone.fg,
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}>{tone.label}</span>
                      </td>
                      <td style={td}>
                        {myRolesHere.length === 0
                          ? <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                          : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {myRolesHere.map(r => (
                                <span
                                  key={r}
                                  style={{
                                    padding: '1px 7px',
                                    borderRadius: 999,
                                    background: 'rgba(99,102,241,.12)',
                                    border: '1px solid rgba(99,102,241,.30)',
                                    fontSize: 10,
                                    fontWeight: 600
                                  }}
                                >{r}</span>
                              ))}
                            </div>
                          )
                        }
                      </td>
                      <td style={td}>
                        {siteLoc
                          ? (
                            <div>
                              <div>{siteLoc.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                {siteLoc.type}{siteLoc.geofenceRadiusMeters ? ` · ${siteLoc.geofenceRadiusMeters}m` : ''}
                              </div>
                            </div>
                          )
                          : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>None</span>}
                      </td>
                      <td style={td}>{pe || <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Sups: <strong style={{ color: 'var(--text)' }}>{supsCount}</strong>
                          {' · '}
                          Wrk: <strong style={{ color: 'var(--text)' }}>{wrkCount}</strong>
                        </span>
                      </td>
                      <td style={td}>
                        {p.createdBy?.name || <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openProject(p._id) }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text)',
                            fontSize: 11,
                            cursor: 'pointer'
                          }}
                        >Open →</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border)',
              background: 'var(--input, #f8fafc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              fontSize: 12,
              color: 'var(--text-muted)'
            }}>
              <span>Page {safePage} of {totalPages} · {filtered.length} project{filtered.length === 1 ? '' : 's'}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} style={pageBtn(safePage <= 1)}>‹ Prev</button>
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={pageBtn(safePage >= totalPages)}>Next ›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const th = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--text)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '.04em'
}
const td = {
  padding: '10px 12px',
  verticalAlign: 'top',
  color: 'var(--text)'
}
function pageBtn(disabled) {
  return {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: disabled ? 'transparent' : 'var(--card)',
    color: disabled ? 'var(--text-muted)' : 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12
  }
}
