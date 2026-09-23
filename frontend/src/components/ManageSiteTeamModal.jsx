import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { hasAnyRole } from '../lib/roles'
import { Modal } from '../design-system/Modal'

function idOf(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return String(v._id || v.id || '')
}

/**
 * Modal-wrapped editor for project team assignment. Opened from the
 * "Manage Site Team" button on the Project Detail page. The read-only
 * display lives in SiteTeamView.jsx.
 *
 * Authorization mirrors the previous in-place editor: Admin/Manager can edit
 * both groups; assigned Project Engineers can edit both; assigned (or
 * optimistically any) Supervisors can edit workers only. The backend is the
 * authoritative gate.
 */
export default function ManageSiteTeamModal({ isOpen, project, onClose, onUpdated }) {
  const [supervisorOptions, setSupervisorOptions] = useState([])
  const [workerOptions, setWorkerOptions] = useState([])
  const [selectedSupervisors, setSelectedSupervisors] = useState([])
  const [selectedWorkers, setSelectedWorkers] = useState([])
  const [initialSupervisors, setInitialSupervisors] = useState([])
  const [initialWorkers, setInitialWorkers] = useState([])
  const [supSearch, setSupSearch] = useState('')
  const [wrkSearch, setWrkSearch] = useState('')
  // Pagination + filter - added so the panels stay usable when a
  // company grows past a few dozen workers. Both lists slice on the
  // client (the role endpoints return everyone), so pagination is
  // purely a render-window optimisation.
  const [supPage, setSupPage] = useState(1)
  const [wrkPage, setWrkPage] = useState(1)
  const PAGE_SIZE = 15
  // 'all' shows site_supervisor + supervisor; the role chips filter
  // down. Worker panel has no role filter - there's only one role.
  const [supRoleFilter, setSupRoleFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, [])

  const { canEditSupervisors, canEditWorkers, roleBanner } = useMemo(() => {
    if (!project) return { canEditSupervisors: false, canEditWorkers: false, roleBanner: '' }
    const myId = String(currentUser?.id || currentUser?._id || '')
    if (hasAnyRole(currentUser, ['admin', 'manager'])) {
      return { canEditSupervisors: true, canEditWorkers: true, roleBanner: '' }
    }
    const peAssigned = (project.assignedProjectEngineer || []).some(e => idOf(e) === myId)
    if (hasAnyRole(currentUser, ['project_engineer']) && peAssigned) {
      return { canEditSupervisors: true, canEditWorkers: true, roleBanner: '' }
    }
    if (hasAnyRole(currentUser, ['site_supervisor', 'supervisor'])) {
      const supAssigned = (project.supervisors || []).some(e => idOf(e) === myId)
      return {
        canEditSupervisors: false,
        canEditWorkers: true,
        roleBanner: supAssigned
          ? 'As a supervisor on this project, you can add or remove site workers.'
          : 'Supervisors can manage workers only on projects they are assigned to. If you are assigned here, changes will save; otherwise the server will reject the update.'
      }
    }
    return {
      canEditSupervisors: false,
      canEditWorkers: false,
      roleBanner: 'Editing is restricted to Admins, Managers, assigned Project Engineers, and assigned Supervisors (workers only).'
    }
  }, [project, currentUser])

  const anyEdit = canEditSupervisors || canEditWorkers

  useEffect(() => {
    if (!isOpen || !project) return
    let alive = true
    const load = async () => {
      try {
        setLoading(true)
        const [siteSupRes, supRes, wrkRes] = await Promise.all([
          api.get('/api/users/by-role/site_supervisor').catch(() => ({ data: [] })),
          api.get('/api/users/by-role/supervisor').catch(() => ({ data: [] })),
          api.get('/api/users/by-role/site_worker').catch(() => ({ data: [] }))
        ])
        if (!alive) return
        // Tag each user with the role that brought them in. Used by the
        // role chips on the supervisor panel so the user can filter by
        // 'site_supervisor' vs 'supervisor' (the two get merged for
        // selection but admins still want to know the breakdown).
        const taggedSiteSup = (siteSupRes.data || []).map(u => ({ ...u, _role: 'site_supervisor' }))
        const taggedSup     = (supRes.data     || []).map(u => ({ ...u, _role: 'supervisor' }))
        const mergedSups = Array.from(
          new Map([...taggedSiteSup, ...taggedSup].map(u => [String(u._id), u])).values()
        )
        setSupervisorOptions(mergedSups)
        setWorkerOptions(wrkRes.data || [])
        const curSup = (project.supervisors || []).map(idOf).filter(Boolean)
        const curWrk = (project.workers || []).map(idOf).filter(Boolean)
        setSelectedSupervisors(curSup)
        setSelectedWorkers(curWrk)
        setInitialSupervisors(curSup)
        setInitialWorkers(curWrk)
        setError('')
        setSuccess('')
      } catch (err) {
        if (!alive) return
        setError(err.response?.data?.message || 'Failed to load team options')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [isOpen, project])

  const toggle = (list, setter, id, allowed) => {
    if (!allowed) return
    setSuccess('')
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const dirty = useMemo(() => {
    const a = [...selectedSupervisors].sort().join(',')
    const b = [...initialSupervisors].sort().join(',')
    const c = [...selectedWorkers].sort().join(',')
    const d = [...initialWorkers].sort().join(',')
    return a !== b || c !== d
  }, [selectedSupervisors, selectedWorkers, initialSupervisors, initialWorkers])

  const save = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      await api.patch(`/api/projects/${project._id}/allocate-team`, {
        supervisorIds: selectedSupervisors,
        workerIds: selectedWorkers
      })
      setInitialSupervisors(selectedSupervisors)
      setInitialWorkers(selectedWorkers)
      setSuccess('Team updated')
      // Auto-close after the parent has refreshed. onUpdated triggers the
      // parent re-fetch; the timeout lets the success message flash so the
      // user sees confirmation before the modal goes away.
      if (onUpdated) onUpdated()
      setTimeout(() => {
        if (typeof onClose === 'function') onClose()
      }, 750)
      return
    } catch (err) {
      const status = err.response?.status
      const serverMsg = err.response?.data?.message
      if (status === 403 && hasAnyRole(currentUser, ['site_supervisor', 'supervisor'])) {
        setError(
          serverMsg ||
          'You are not listed as a supervisor on this project. Ask an Admin, Manager, or the assigned Project Engineer to add you first.'
        )
      } else {
        setError(serverMsg || 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setSelectedSupervisors(initialSupervisors)
    setSelectedWorkers(initialWorkers)
    setError('')
    setSuccess('')
  }

  const filterOptions = (list, q, roleFilter = 'all') => {
    let out = list
    if (roleFilter && roleFilter !== 'all') {
      out = out.filter(u => u._role === roleFilter)
    }
    if (q) {
      const needle = q.toLowerCase()
      out = out.filter(u =>
        (u.name || '').toLowerCase().includes(needle) ||
        (u.email || '').toLowerCase().includes(needle)
      )
    }
    return out
  }

  // Reset to page 1 when the filter/search inputs change. Without these
  // the user can be on "page 4" of an empty result set after typing.
  useEffect(() => { setSupPage(1) }, [supSearch, supRoleFilter])
  useEffect(() => { setWrkPage(1) }, [wrkSearch])

  const listBox = (opts, selectedIds, setter, search, setSearch, emptyLabel, editable, accentColor, opts2 = {}) => {
    const { page = 1, setPage, roleFilter, setRoleFilter, roleChips } = opts2
    const filtered = filterOptions(opts, search, roleFilter)
    const total = filtered.length
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const safePage = Math.min(page, pages)
    const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    return (
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--card)',
        overflow: 'hidden'
      }}>
        {/* Role filter chips - only rendered for the supervisor panel */}
        {roleChips && (
          <div style={{
            display: 'flex',
            gap: 4,
            padding: '8px 10px',
            background: 'var(--input)',
            borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap'
          }}>
            {roleChips.map(c => {
              const on = roleFilter === c.value
              return (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setRoleFilter && setRoleFilter(c.value)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: `1px solid ${on ? accentColor : 'var(--border)'}`,
                    background: on ? `${accentColor}22` : 'transparent',
                    color: on ? 'var(--text)' : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: on ? 600 : 500,
                    cursor: 'pointer'
                  }}
                >{c.label}</button>
              )
            })}
          </div>
        )}
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            background: 'var(--input)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            outline: 'none'
          }}
        />
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          {visible.length === 0 && (
            <div style={{
              padding: '16px 12px',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              textAlign: 'center'
            }}>
              {emptyLabel}
            </div>
          )}
          {visible.map(u => {
            const checked = selectedIds.includes(u._id)
            return (
              <label
                key={u._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  cursor: editable ? 'pointer' : 'default',
                  background: checked ? (accentColor + '22') : 'transparent',
                  borderLeft: checked ? `3px solid ${accentColor}` : '3px solid transparent',
                  transition: 'background 120ms ease, border-left-color 120ms ease',
                  color: 'var(--text)'
                }}
                onMouseEnter={(e) => {
                  if (editable && !checked) e.currentTarget.style.background = 'var(--input)'
                }}
                onMouseLeave={(e) => {
                  if (!checked) e.currentTarget.style.background = 'transparent'
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!editable}
                  onChange={() => toggle(selectedIds, setter, u._id, editable)}
                  style={{ accentColor, cursor: editable ? 'pointer' : 'not-allowed' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</span>
                </div>
              </label>
            )
          })}
        </div>
        {/* Pagination footer - only renders when there's more than one page */}
        {pages > 1 && (
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--border)',
            background: 'var(--input)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: 12,
            color: 'var(--text-muted)'
          }}>
            <span>Page {safePage} of {pages} · {total} match{total === 1 ? '' : 'es'}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setPage && setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={pageBtnStyle(safePage <= 1)}
              >‹ Prev</button>
              <button
                type="button"
                onClick={() => setPage && setPage(p => Math.min(pages, p + 1))}
                disabled={safePage >= pages}
                style={pageBtnStyle(safePage >= pages)}
              >Next ›</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function pageBtnStyle(isDisabled) {
    return {
      padding: '3px 10px',
      borderRadius: 6,
      border: '1px solid var(--border)',
      background: isDisabled ? 'transparent' : 'var(--card)',
      color: isDisabled ? 'var(--text-muted)' : 'var(--text)',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      fontSize: 11
    }
  }

  const panelLabelStyle = {
    fontSize: '0.92rem',
    fontWeight: 700,
    marginBottom: 10,
    color: 'var(--text)',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  }
  const badgeStyle = (bg) => ({
    background: bg,
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 600
  })
  const lockedPillStyle = {
    marginLeft: 'auto',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    background: 'var(--input)',
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border)'
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Site Team"
      size="large"
    >
      {loading ? (
        <div style={{ padding: '32px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Loading team options…
        </div>
      ) : (
        <div style={{ padding: '4px 4px 0' }}>
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Assign supervisors and workers to <strong style={{ color: 'var(--text)' }}>{project?.name}</strong>. Workers assigned here become visible in project-scoped attendance.
          </p>

          {roleBanner && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'var(--primary-light)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: 'var(--text)',
              fontSize: '0.88rem',
              lineHeight: 1.5,
              marginBottom: 14
            }}>
              {roleBanner}
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16
          }}>
            <div>
              <div style={panelLabelStyle}>
                <span>Supervisors</span>
                <span style={badgeStyle('#6366f1')}>{selectedSupervisors.length}</span>
                {!canEditSupervisors && <span style={lockedPillStyle}>Read-only</span>}
              </div>
              {listBox(
                supervisorOptions,
                selectedSupervisors,
                setSelectedSupervisors,
                supSearch,
                setSupSearch,
                'No matching supervisors',
                canEditSupervisors,
                '#6366f1',
                {
                  page: supPage,
                  setPage: setSupPage,
                  roleFilter: supRoleFilter,
                  setRoleFilter: setSupRoleFilter,
                  roleChips: [
                    { value: 'all',             label: 'All' },
                    { value: 'site_supervisor', label: 'Site Supervisor' },
                    { value: 'supervisor',      label: 'Supervisor' }
                  ]
                }
              )}
            </div>
            <div>
              <div style={panelLabelStyle}>
                <span>Workers</span>
                <span style={badgeStyle('#10b981')}>{selectedWorkers.length}</span>
                {!canEditWorkers && <span style={lockedPillStyle}>Read-only</span>}
              </div>
              {listBox(
                workerOptions,
                selectedWorkers,
                setSelectedWorkers,
                wrkSearch,
                setWrkSearch,
                'No matching workers',
                canEditWorkers,
                '#10b981',
                {
                  page: wrkPage,
                  setPage: setWrkPage
                }
              )}
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#b91c1c',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              fontSize: '0.9rem',
              fontWeight: 500
            }}>{error}</div>
          )}
          {success && (
            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#047857',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              fontSize: '0.9rem',
              fontWeight: 500
            }}>{success}</div>
          )}

          <div style={{
            display: 'flex',
            gap: 10,
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid var(--border)',
            justifyContent: 'flex-end',
            alignItems: 'center'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--input)',
                color: 'var(--text)',
                cursor: saving ? 'default' : 'pointer',
                fontWeight: 500
              }}
            >Close</button>
            {anyEdit && (
              <>
                <button
                  type="button"
                  onClick={reset}
                  disabled={!dirty || saving}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--text-muted)',
                    cursor: (!dirty || saving) ? 'default' : 'pointer',
                    fontWeight: 500,
                    opacity: (!dirty || saving) ? 0.5 : 1
                  }}
                >Reset</button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || saving}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: (!dirty || saving) ? 'rgba(99, 102, 241, 0.55)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white',
                    cursor: (!dirty || saving) ? 'default' : 'pointer',
                    fontWeight: 600,
                    boxShadow: (!dirty || saving) ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.3)'
                  }}
                >{saving ? 'Saving…' : 'Save Team'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
