import { useEffect, useState, useMemo } from 'react'
import { api } from '../../lib/api'
import './hr.css'

const STATUS_BADGE = {
  pending: 'hr-badge-warning',
  approved: 'hr-badge-success',
  rejected: 'hr-badge-danger',
  cancelled: 'hr-badge-neutral'
}

const HR_LIKE_ROLES = ['hr', 'manager', 'admin']

const ROLE_LABEL = {
  hr: 'HR',
  manager: 'Manager',
  admin: 'Admin'
}

const STEP_BADGE_STYLE = {
  approved: { bg: 'rgba(34,197,94,.12)', fg: '#15803d', label: 'Approved' },
  rejected: { bg: 'rgba(239,68,68,.12)', fg: '#b91c1c', label: 'Rejected' },
  pending:  { bg: 'rgba(245,158,11,.15)', fg: '#b45309', label: 'Pending' }
}

// Map the current user's roles onto the role keys the approval chain uses.
// A "manager" or "admin" role both satisfy the manager step.
function chainRoleForUser(roles) {
  if (!Array.isArray(roles)) return null
  if (roles.includes('manager') || roles.includes('admin')) return 'manager'
  if (roles.includes('hr')) return 'hr'
  return null
}

// The single step from a chain that belongs to the current user. Null when
// the user's role is not represented in this chain.
function myStep(chain, roles) {
  if (!Array.isArray(chain)) return null
  const myRole = chainRoleForUser(roles)
  if (!myRole) return null
  return chain.find(s => s.role === myRole) || null
}

export default function LeaveManagement() {
  const [requests, setRequests] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    employee: '',
    leaveType: 'annual',
    startDate: '',
    endDate: '',
    halfDay: false,
    halfDayPeriod: 'first',
    reason: ''
  })
  const [empSearch, setEmpSearch] = useState('')
  const [empPage, setEmpPage] = useState(1)
  const EMP_PAGE_SIZE = 10
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  const load = async () => {
    try {
      setLoading(true)
      const params = {}
      if (statusFilter !== 'all') params.status = statusFilter
      const res = await api.get('/api/leave-requests', { params })
      setRequests(res.data || [])
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  const loadEmployees = async () => {
    // /eligible-employees scopes by role: HR sees everyone, PE/SS/Sup see
    // their project workers + themselves, anyone else sees just themselves.
    const res = await api.get('/api/leave-requests/eligible-employees').catch(() => ({ data: [] }))
    const list = res.data || []
    setEmployees(list)
    // Plain self-service: when there's exactly one eligible employee (the
    // current user), pre-select it so the form is one-step shorter.
    if (list.length === 1) {
      setForm(prev => prev.employee ? prev : { ...prev, employee: list[0]._id })
    }
  }

  useEffect(() => { loadEmployees() }, [])
  useEffect(() => { load() }, [statusFilter])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.employee || !form.startDate || !form.endDate) {
      setNotify({ open: true, title: 'Validation', message: 'Employee and dates are required.' })
      return
    }
    try {
      const payload = {
        ...form,
        halfDay: form.halfDay === true,
        halfDayPeriod: form.halfDay ? form.halfDayPeriod : undefined
      }
      await api.post('/api/leave-requests', payload)
      setShowForm(false)
      setForm({ employee: '', leaveType: 'annual', startDate: '', endDate: '', halfDay: false, halfDayPeriod: 'first', reason: '' })
      setEmpSearch('')
      setEmpPage(1)
      load()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Submit failed' })
    }
  }

  // Pre-action confirmation. Holds the row + action ('approve' | 'reject' |
   // 'cancel' | 'reverse') plus an optional comments field. The same modal
   // drives every "are you sure" prompt so the UX is consistent.
   const [confirmState, setConfirmState] = useState({ open: false, action: null, request: null, comments: '', loading: false })

   const openConfirm = (action, request) => setConfirmState({ open: true, action, request, comments: '', loading: false })
   const closeConfirm = () => setConfirmState(s => s.loading ? s : { open: false, action: null, request: null, comments: '', loading: false })

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} }
  }, [])
  const myRoles = useMemo(() => {
    const fromRoot = Array.isArray(me?.roles) ? me.roles.map(r => (typeof r === 'string' ? r : r?.key)).filter(Boolean) : []
    return fromRoot
  }, [me])
  const myUserId = String(me?._id || me?.id || me?.userId || '')
  const isHrLike = myRoles.some(k => HR_LIKE_ROLES.includes(k))

  // Per-row action availability. The UI hides anything that isn't true here,
  // and the server still enforces the same rules - this is the visibility
  // layer that makes the table feel clean, not the actual authorisation.
  const availableActions = (r) => {
    if (!r) return {}
    const ownerUserId = String(r.employee?.userId || '')
    const isOwner = ownerUserId && ownerUserId === myUserId
    const submitterId = String(r.appliedBy?._id || r.createdBy?._id || '')
    const isSubmitter = submitterId && submitterId === myUserId
    const myMainStep = myStep(r.approvalChain, myRoles)
    const myReversalStep = myStep(r.reversal?.approvalChain, myRoles)
    const reversalPending = r.reversal && r.reversal.status === 'pending'

    return {
      // Original approve/reject - only if the user has a step that's still pending.
      approve: r.status === 'pending' && isHrLike && myMainStep && myMainStep.status === 'pending',
      reject:  r.status === 'pending' && isHrLike && myMainStep && myMainStep.status === 'pending',
      // Pending cancellations - owner / submitter / HR-like.
      cancel:  r.status === 'pending' && (isOwner || isSubmitter || isHrLike),
      // Reversal-initiation - only on approved leaves, HR-like, no reversal in flight.
      reverseRequest: r.status === 'approved' && isHrLike && !reversalPending,
      // Reversal sign-off - user's reversal step is pending.
      reverseApprove: reversalPending && myReversalStep && myReversalStep.status === 'pending',
      reverseReject:  reversalPending && myReversalStep && myReversalStep.status === 'pending'
    }
  }

  // Maps a confirm-modal action to a server endpoint suffix. Reversal flow:
  //   reverse-request  →  POST /reverse-request   (initiate + auto-sign your step)
  //   reverse-approve  →  POST /reverse-approve   (sign the other step)
  //   reverse-reject   →  POST /reverse-reject    (kill the reversal, leave stays approved)
  const ACTION_ENDPOINT = {
    approve: 'approve',
    reject: 'reject',
    cancel: 'cancel',
    'reverse-request': 'reverse-request',
    'reverse-approve': 'reverse-approve',
    'reverse-reject': 'reverse-reject'
  }

  // Friendly success messages - reads the response payload to tell the user
  // precisely what changed: who's still pending in the chain, whether the
  // request flipped to a final state, etc.
  function successFor(action, updated) {
    const pendingMain = (updated.approvalChain || [])
      .filter(s => s.status === 'pending').map(s => ROLE_LABEL[s.role] || s.role).join(', ')
    const pendingRev = (updated.reversal?.approvalChain || [])
      .filter(s => s.status === 'pending').map(s => ROLE_LABEL[s.role] || s.role).join(', ')

    if (action === 'approve') {
      return updated.status === 'approved'
        ? { title: 'Leave fully approved', message: 'All approval steps are complete. Attendance has been synced for the leave dates.' }
        : { title: 'Your approval recorded', message: pendingMain ? `Your step was approved. Still waiting on: ${pendingMain}.` : 'Your step was approved.' }
    }
    if (action === 'reject') {
      return { title: 'Leave rejected', message: 'The request is now in the Rejected state.' }
    }
    if (action === 'cancel') {
      return { title: 'Leave cancelled', message: 'The pending request has been cancelled.' }
    }
    if (action === 'reverse-request') {
      return pendingRev
        ? { title: 'Reversal requested', message: `Your step on the reversal chain is auto-signed. Still waiting on: ${pendingRev}. The leave stays approved until every step signs off.` }
        : { title: 'Reversal complete', message: 'The reversal was approved end-to-end and the leave is now cancelled. Attendance has been reverted.' }
    }
    if (action === 'reverse-approve') {
      return updated.status === 'cancelled'
        ? { title: 'Reversal complete', message: 'All reversal steps approved. The leave is now cancelled and attendance has been reverted.' }
        : { title: 'Your reversal approval recorded', message: pendingRev ? `Your step was approved. Still waiting on: ${pendingRev}.` : 'Your step was approved.' }
    }
    if (action === 'reverse-reject') {
      return { title: 'Reversal rejected', message: 'The reversal was declined. The leave stays in the Approved state.' }
    }
    return { title: 'Done', message: 'Action completed.' }
  }

  const performAction = async () => {
    const { action, request, comments } = confirmState
    if (!action || !request) return
    const endpoint = ACTION_ENDPOINT[action] || action
    setConfirmState(s => ({ ...s, loading: true }))
    try {
      const payload = comments?.trim()
        ? (action === 'reverse-request' ? { reason: comments.trim() } : { comments: comments.trim() })
        : undefined
      const res = await api.post(`/api/leave-requests/${request._id}/${endpoint}`, payload)
      const updated = res?.data || {}
      const { title, message } = successFor(action, updated)
      setConfirmState({ open: false, action: null, request: null, comments: '', loading: false })
      setNotify({ open: true, title, message })
      load()
    } catch (err) {
      setConfirmState(s => ({ ...s, loading: false }))
      setNotify({
        open: true,
        title: 'Action failed',
        message: err.response?.data?.message || err.message || 'The action could not be completed. Please try again.'
      })
    }
  }

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>Leave Requests</h2>
          <p>Review and approve employee leave requests.</p>
        </div>
        <button className="hr-btn hr-btn-primary" onClick={() => setShowForm(true)}>+ New Request</button>
      </div>

      <div className="hr-filters">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="hr-btn hr-btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="hr-empty">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="hr-empty">No leave requests.</div>
      ) : (
        <table className="hr-table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Employee</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Submitted by</th>
              <th>Approval chain</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(r => {
              const submitter = r.appliedBy || r.createdBy
              const submittedSelf = submitter && r.employee?.userId
                && String(submitter._id) === String(r.employee.userId)
              const actions = availableActions(r)
              return (
              <tr key={r._id}>
                <td>{r.requestNumber}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.employee?.fullName || '—'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {r.employee?.employeeId || '—'}
                  </div>
                  {(r.employee?.email || r.employee?.phone) && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                      {r.employee?.email && <span title="Email">✉ {r.employee.email}</span>}
                      {r.employee?.email && r.employee?.phone && <span> · </span>}
                      {r.employee?.phone && <span title="Phone">☎ {r.employee.phone}</span>}
                    </div>
                  )}
                </td>
                <td style={{ textTransform: 'capitalize' }}>{r.leaveType}</td>
                <td>
                  {new Date(r.startDate).toLocaleDateString()} — {new Date(r.endDate).toLocaleDateString()}
                </td>
                <td>
                  {r.totalDays}
                  {r.halfDay && (
                    <span
                      title={`Half-day · ${r.halfDayPeriod === 'second' ? 'second half (afternoon)' : 'first half (morning)'}`}
                      style={{
                        marginLeft: 6,
                        padding: '1px 6px',
                        borderRadius: 999,
                        background: 'rgba(245,158,11,.15)',
                        border: '1px solid rgba(245,158,11,.40)',
                        color: '#b45309',
                        fontSize: 10,
                        fontWeight: 600
                      }}
                    >½ day</span>
                  )}
                </td>
                <td>
                  {submitter ? (
                    <>
                      <div style={{ fontSize: 13 }}>
                        {submitter.name || '—'}
                        {submittedSelf && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>(self)</span>
                        )}
                      </div>
                      {submitter.email && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{submitter.email}</div>
                      )}
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 1 }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                    </>
                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ minWidth: 220 }}>
                  <ChainView chain={r.approvalChain || []} />
                  {r.reversal && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>
                        Reversal · {r.reversal.status}
                      </div>
                      {r.reversal.requestedBy && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Initiated by <strong>{r.reversal.requestedBy.name}</strong>
                          {r.reversal.requestedAt && <> · {new Date(r.reversal.requestedAt).toLocaleDateString()}</>}
                        </div>
                      )}
                      {r.reversal.reason && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 4 }}>
                          “{r.reversal.reason}”
                        </div>
                      )}
                      <ChainView chain={r.reversal.approvalChain || []} compact />
                    </div>
                  )}
                </td>
                <td>
                  <span className={`hr-badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  {r.reversal?.status === 'pending' && (
                    <div style={{ marginTop: 4 }}>
                      <span className="hr-badge hr-badge-warning" style={{ fontSize: 10 }}>Reversal pending</span>
                    </div>
                  )}
                </td>
                <td>
                  <div className="hr-table-actions">
                    {actions.approve && (
                      <button className="hr-btn hr-btn-success" onClick={() => openConfirm('approve', r)}>Approve</button>
                    )}
                    {actions.reject && (
                      <button className="hr-btn hr-btn-danger" onClick={() => openConfirm('reject', r)}>Reject</button>
                    )}
                    {actions.cancel && (
                      <button
                        className="hr-btn hr-btn-secondary"
                        onClick={() => openConfirm('cancel', r)}
                        title="Cancel this pending request"
                      >Cancel</button>
                    )}
                    {actions.reverseRequest && (
                      <button
                        className="hr-btn hr-btn-secondary"
                        onClick={() => openConfirm('reverse-request', r)}
                        title="Request reversal — same approvers must sign off"
                      >Request Reversal</button>
                    )}
                    {actions.reverseApprove && (
                      <button
                        className="hr-btn hr-btn-success"
                        onClick={() => openConfirm('reverse-approve', r)}
                        title="Approve the pending reversal"
                      >Approve Reversal</button>
                    )}
                    {actions.reverseReject && (
                      <button
                        className="hr-btn hr-btn-danger"
                        onClick={() => openConfirm('reverse-reject', r)}
                        title="Decline the reversal — leave stays approved"
                      >Reject Reversal</button>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="hr-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3>New Leave Request</h3>
            <form onSubmit={submit}>
              <div className="hr-form-field" style={{ width: '100%' }}>
                <label>Employee *</label>
                {(() => {
                  // Filter + paginate employee list client-side. Eligible
                  // list is already RBAC-scoped server-side.
                  const term = empSearch.trim().toLowerCase()
                  const filtered = term
                    ? employees.filter(e =>
                        (e.fullName || '').toLowerCase().includes(term) ||
                        (e.employeeId || '').toLowerCase().includes(term))
                    : employees
                  const totalPages = Math.max(1, Math.ceil(filtered.length / EMP_PAGE_SIZE))
                  const safePage = Math.min(empPage, totalPages)
                  const pageItems = filtered.slice((safePage - 1) * EMP_PAGE_SIZE, safePage * EMP_PAGE_SIZE)
                  const selectedDoc = employees.find(e => String(e._id) === String(form.employee))
                  return (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', overflow: 'hidden' }}>
                      <div style={{ padding: '8px 10px', background: 'var(--input)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Search by name or employee ID…"
                          value={empSearch}
                          onChange={e => { setEmpSearch(e.target.value); setEmpPage(1) }}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length} match</span>
                      </div>
                      {selectedDoc && (
                        <div style={{ padding: '6px 10px', background: 'rgba(99,102,241,.06)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)' }}>
                          ✓ <strong>{selectedDoc.fullName}</strong>
                          {selectedDoc.employeeId && <> · {selectedDoc.employeeId}</>}
                          {selectedDoc.category && <> · {selectedDoc.category.replace(/_/g, ' ')}</>}
                        </div>
                      )}
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {pageItems.length === 0
                          ? <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>No employees match.</div>
                          : pageItems.map(e => {
                            const on = String(form.employee) === String(e._id)
                            return (
                              <label
                                key={e._id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '7px 10px',
                                  borderBottom: '1px solid var(--border)',
                                  cursor: 'pointer',
                                  background: on ? 'rgba(99,102,241,.08)' : 'transparent'
                                }}
                              >
                                <input
                                  type="radio"
                                  checked={on}
                                  onChange={() => setForm({ ...form, employee: e._id })}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500 }}>{e.fullName || '—'}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {e.employeeId || '—'}
                                    {e.category && <> · {e.category.replace(/_/g, ' ')}</>}
                                    {e.status && <> · {e.status}</>}
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                      </div>
                      {totalPages > 1 && (
                        <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', background: 'var(--input)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                          <span>Page {safePage} of {totalPages}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={() => setEmpPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: safePage <= 1 ? 'transparent' : 'var(--card)', color: 'var(--text)', fontSize: 11, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}>‹ Prev</button>
                            <button type="button" onClick={() => setEmpPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: safePage >= totalPages ? 'transparent' : 'var(--card)', color: 'var(--text)', fontSize: 11, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}>Next ›</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div className="hr-form-row">
                <div className="hr-form-field">
                  <label>Type</label>
                  <select value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })}>
                    <option value="annual">Annual</option>
                    <option value="sick">Sick</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="emergency">Emergency</option>
                    <option value="maternity">Maternity</option>
                    <option value="paternity">Paternity</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="hr-form-field">
                  <label>Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required />
                </div>
                <div className="hr-form-field">
                  <label>End Date *</label>
                  <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required />
                </div>
              </div>
              {/* Half-day toggle - only meaningful when the start and end
                  dates are the same. Server also enforces this rule. */}
              {form.startDate && form.endDate && form.startDate === form.endDate && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.25)', marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.halfDay}
                      onChange={e => setForm({ ...form, halfDay: e.target.checked })}
                    />
                    <span>Half-day leave (counted as 0.5 day)</span>
                  </label>
                  {form.halfDay && (
                    <div style={{ marginTop: 6, marginLeft: 24, display: 'flex', gap: 12, fontSize: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" checked={form.halfDayPeriod === 'first'} onChange={() => setForm({ ...form, halfDayPeriod: 'first' })} />
                        First half (morning)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" checked={form.halfDayPeriod === 'second'} onChange={() => setForm({ ...form, halfDayPeriod: 'second' })} />
                        Second half (afternoon)
                      </label>
                    </div>
                  )}
                </div>
              )}
              <div className="hr-form-field">
                <label>Reason</label>
                <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="hr-form-actions">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="hr-btn hr-btn-primary">Submit</button>
              </div>
            </form>
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

      {confirmState.open && (() => {
        const { action, request, comments, loading } = confirmState
        const r = request || {}
        const empName = r.employee?.fullName || r.employee?.employeeId || '—'
        const dateRange = r.startDate && r.endDate
          ? `${new Date(r.startDate).toLocaleDateString()} → ${new Date(r.endDate).toLocaleDateString()}`
          : ''
        const cfg = {
          approve: {
            title: 'Approve leave request?',
            description: `You are about to approve the leave request for ${empName} (${r.leaveType || 'leave'}) covering ${dateRange}. If the approval chain has multiple steps, the request will only become fully approved once every step is approved.`,
            primary: 'Approve',
            primaryClass: 'hr-btn-success',
            showComments: true
          },
          reject: {
            title: 'Reject leave request?',
            description: `You are about to reject the leave request for ${empName} (${r.leaveType || 'leave'}) covering ${dateRange}. Once rejected the request cannot be reopened — the employee would have to submit a new one.`,
            primary: 'Reject',
            primaryClass: 'hr-btn-danger',
            showComments: true
          },
          cancel: {
            title: 'Cancel pending request?',
            description: `Cancel the pending leave request for ${empName} covering ${dateRange}?`,
            primary: 'Yes, cancel',
            primaryClass: 'hr-btn-danger',
            showComments: false
          },
          'reverse-request': {
            title: 'Request reversal of an approved leave?',
            description: `This will start a reversal request for ${empName} (${r.leaveType || 'leave'}) covering ${dateRange}. The same approvers (HR + Manager) must sign off on the reversal before the leave is cancelled and attendance is reverted. Your own step is auto-signed when you submit this request. The leave stays Approved until every reversal step signs off.`,
            primary: 'Request reversal',
            primaryClass: 'hr-btn-danger',
            showComments: true,
            commentsLabel: 'Reason for reversal (visible to other approvers)'
          },
          'reverse-approve': {
            title: 'Approve the pending reversal?',
            description: `You are approving the reversal of ${empName}'s leave covering ${dateRange}. Once every step in the reversal chain is approved the leave moves to Cancelled and attendance for those dates is reverted.`,
            primary: 'Approve reversal',
            primaryClass: 'hr-btn-success',
            showComments: true
          },
          'reverse-reject': {
            title: 'Reject the pending reversal?',
            description: `This will decline the reversal request for ${empName}. The leave stays in the Approved state and attendance for those dates is unchanged.`,
            primary: 'Reject reversal',
            primaryClass: 'hr-btn-danger',
            showComments: true
          }
        }[action] || {}
        return (
          <div className="hr-modal-overlay" onClick={closeConfirm}>
            <div className="hr-modal" onClick={e => e.stopPropagation()}>
              <h3>{cfg.title}</h3>
              <p style={{ lineHeight: 1.5 }}>{cfg.description}</p>
              {cfg.showComments && (
                <div className="hr-form-field" style={{ marginTop: 8 }}>
                  <label>{cfg.commentsLabel || 'Comments (optional)'}</label>
                  <textarea
                    value={comments}
                    onChange={e => setConfirmState(s => ({ ...s, comments: e.target.value }))}
                    placeholder="Short note recorded against this step…"
                    rows={3}
                  />
                </div>
              )}
              <div className="hr-form-actions">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={closeConfirm} disabled={loading}>Cancel</button>
                <button type="button" className={`hr-btn ${cfg.primaryClass}`} onClick={performAction} disabled={loading}>
                  {loading ? 'Working…' : cfg.primary}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/**
 * Visual display of an approval chain. Each step is one line: role + actor +
 * status pill + timestamp + optional comment. Used for both the main
 * approval chain and the reversal chain.
 */
function ChainView({ chain, compact = false }) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      {chain.map((step, idx) => {
        const badge = STEP_BADGE_STYLE[step.status] || STEP_BADGE_STYLE.pending
        const roleLabel = ROLE_LABEL[step.role] || step.role
        return (
          <div key={idx} style={{ fontSize: compact ? 11 : 12, lineHeight: 1.4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--text)' }}>{roleLabel}</strong>
              <span style={{
                padding: '1px 6px',
                borderRadius: 4,
                background: badge.bg,
                color: badge.fg,
                fontSize: 10,
                fontWeight: 600
              }}>{badge.label}</span>
              {step.approver?.name && (
                <span style={{ color: 'var(--text-muted)' }}>
                  · {step.approver.name}
                </span>
              )}
              {step.actedAt && (
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                  · {new Date(step.actedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {!compact && step.approver?.email && (
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{step.approver.email}</div>
            )}
            {step.comments && (
              <div style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>
                “{step.comments}”
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
