import { useCallback, useEffect, useMemo, useReducer, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FixedSizeList } from 'react-window'
import { api } from '../../lib/api'
import { currentRoleWeight } from '../../lib/jwt'
import { hasAnyRole } from '../../lib/roles'
import AttendanceLockWarningModal from './AttendanceLockWarningModal'
import AttendanceHistoryModal from './AttendanceHistoryModal'
import EditAfterSubmitModal from './EditAfterSubmitModal'
import DateChangeWarningModal from './DateChangeWarningModal'
import OverrideWarningModal from './OverrideWarningModal'
import SelfieModal from './SelfieModal'
import './AttendanceGrid.css'

const ENTRY_METHOD_BADGES = {
  GPS_PUNCH: { icon: '📍', label: 'GPS punch' },
  MANUAL_ENTRY: { icon: '✋', label: 'Manual entry' }
}

const ROW_HEIGHT = 56
const LIST_HEIGHT = 640
const LIST_WIDTH = 1340

const STATUS_OPTIONS = ['not_marked', 'present', 'late', 'absent', 'leave', 'half_day', 'holiday', 'weekend']
const STATUS_LABEL = {
  not_marked: 'Not Marked',
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  leave: 'Leave',
  half_day: 'Half Day',
  holiday: 'Holiday',
  weekend: 'Weekend'
}

/**
 * Build a human-readable hover tooltip for the status cell.
 * Uses fields surfaced by Attendance v3: lateMinutes, leaveRequestId,
 * entryMethod=AUTO_SWEEP (set by the nightly status cron), and the
 * existing 'edits[]' audit trail.
 */
function buildStatusReason(rec) {
  if (!rec) return ''
  const status = rec.status || 'not_marked'
  const parts = []
  if (status === 'late' && Number.isFinite(rec.lateMinutes)) {
    parts.push(`Late by ${rec.lateMinutes} min`)
  } else if (status === 'leave' && rec.leaveRequestId) {
    parts.push('Approved leave')
  } else if (status === 'half_day' && rec.leaveRequestId) {
    parts.push('Approved half-day leave')
  } else if (status === 'holiday') {
    parts.push('Holiday')
  } else if (status === 'weekend') {
    parts.push('Non-working day per schedule')
  } else if (status === 'absent' && rec.entryMethod === 'AUTO_SWEEP') {
    parts.push('Auto-marked absent at end of day')
  } else if (status === 'present') {
    parts.push(rec.entryMethod === 'GPS_PUNCH' ? 'GPS punch' : 'Manual entry')
  }
  if (rec.entryMethod === 'MANUAL_ENTRY' && status !== 'present') {
    parts.push('Manually set by HR')
  }
  if (rec.breakSkipped) {
    parts.push('Break skipped — long session with no punch-out gap')
  }
  if (rec.approximate) {
    parts.push('Approximate GPS — worker punched with low-confidence location')
  }
  return parts.join(' · ')
}
const DEFAULT_STATUS = 'not_marked'

const makeDefaultDraft = (date) => ({
  date,
  source: 'site',
  status: DEFAULT_STATUS,
  regularHours: 8,
  otHours: 0,
  breakMinutes: 60,
  notes: '',
  projectAllocations: [],
  timeLogs: []
})

function existingToDraft(a, date) {
  return {
    date,
    source: a.source || 'site',
    status: a.status || DEFAULT_STATUS,
    regularHours: a.regularHours ?? 0,
    otHours: a.otHours ?? 0,
    breakMinutes: a.breakMinutes ?? 0,
    notes: a.notes || '',
    projectAllocations: (a.projectAllocations || []).map(p => ({
      projectId: p.projectId?._id || p.projectId,
      projectName: p.projectId?.name || p.projectName || '',
      hours: p.hours,
      notes: p.notes || ''
    })),
    // Map server timeLogs → editor shape. References may already be populated
    // documents (post-populate) or raw ObjectIds, so normalize to string IDs.
    // We also preserve a display label from the populated doc so the modal
    // can show the correct option even when the referenced Project/Location
    // is missing from the modal's regular dropdown list (deactivated,
    // outside PE's project scope, etc.) - without it, <select value="X">
    // with no matching <option> would render blank.
    timeLogs: (a.timeLogs || []).map(l => {
      const refObj = (l.referenceId && typeof l.referenceId === 'object') ? l.referenceId : null
      return {
        _id: l._id,
        type: l.type || 'Project',
        referenceModel: l.referenceModel || 'Project',
        referenceId: refObj ? String(refObj._id || '') : String(l.referenceId || ''),
        _refLabel: refObj ? (refObj.name || '') : '',
        timeIn: l.timeIn || null,
        timeOut: l.timeOut || null,
        notes: l.notes || '',
        // Carry forward the audit fields untouched so they survive round-trip
        inCoordinates: l.inCoordinates,
        outCoordinates: l.outCoordinates,
        inSelfieUrl: l.inSelfieUrl,
        outSelfieUrl: l.outSelfieUrl,
        inIpAddress: l.inIpAddress,
        outIpAddress: l.outIpAddress,
        inDistanceMeters: l.inDistanceMeters,
        outDistanceMeters: l.outDistanceMeters
      }
    })
  }
}

function editsReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD': {
      const next = new Map(state)
      const current = next.get(action.empId) || action.seed
      next.set(action.empId, { ...current, [action.field]: action.value })
      return next
    }
    case 'SET_ALLOCATIONS': {
      const next = new Map(state)
      const current = next.get(action.empId) || action.seed
      next.set(action.empId, { ...current, projectAllocations: action.allocations })
      return next
    }
    case 'SET_TIMELOGS': {
      const next = new Map(state)
      const current = next.get(action.empId) || action.seed
      next.set(action.empId, {
        ...current,
        timeLogs: action.timeLogs,
        ...(action.editReason ? { editReason: action.editReason } : {})
      })
      return next
    }
    case 'DISCARD_ROW': {
      if (!state.has(action.empId)) return state
      const next = new Map(state)
      next.delete(action.empId)
      return next
    }
    case 'DISCARD_ROWS': {
      if (!action.empIds?.length) return state
      const next = new Map(state)
      for (const id of action.empIds) next.delete(id)
      return next.size === state.size ? state : next
    }
    case 'DISCARD_ALL':
      return state.size === 0 ? state : new Map()
    default:
      return state
  }
}

function empUserIdStr(emp) {
  if (!emp?.userId) return null
  if (typeof emp.userId === 'string') return emp.userId
  return String(emp.userId._id || emp.userId)
}

function empRoleKeys(emp) {
  const rs = emp?.userId?.roles
  if (!Array.isArray(rs)) return []
  return rs.map(r => r.key).filter(Boolean)
}

const AttendanceRow = memo(function AttendanceRow({ index, style, data }) {
  const {
    employees, edits, existingByEmp, date,
    userRoleWeight, currentUserId, rowErrors, canOpenEmployee,
    onField, onOpenTimeLogs, onLockClick, onOpenHistory, onOpenEmployee
  } = data
  const emp = employees[index]
  const empId = emp._id

  const existing = existingByEmp.get(empId)
  const draft = edits.get(empId)
  const seed = draft
    || (existing ? existingToDraft(existing, date) : makeDefaultDraft(date))

  const isModified = !!draft
  const locked = existing && (existing.lockedByRoleWeight || 0) > userRoleWeight
  const errorInfo = rowErrors.get(empId)
  const lockedByError = errorInfo?.status === 'locked'
  const rowIsLocked = locked || lockedByError

  const handleRowClick = rowIsLocked
    ? () => onLockClick({
        employeeName: emp.fullName,
        lockedByRoleWeight: lockedByError
          ? errorInfo.lockedByRoleWeight
          : (existing?.lockedByRoleWeight || 0),
        reason: errorInfo?.reason
      })
    : undefined

  const projectName = emp.assignedProjects?.[0]?.name || ''
  const roleDisplay = emp.position || (emp.userId?.roles?.[0]?.name) || emp.department || ''

  const change = (field) => (e) => onField(empId, field, e.target.value, seed)

  // Time-logs summary for the row chip - counts and total CLOSED hours.
  // An "open" log (timeIn set, timeOut null) shows the red ⚠ marker.
  const timeLogs = seed.timeLogs || []
  const closedLogs = timeLogs.filter(l => l.timeIn && l.timeOut)
  const totalLoggedHours = closedLogs.reduce((s, l) => {
    const ms = new Date(l.timeOut) - new Date(l.timeIn)
    return s + (Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0)
  }, 0)
  const hasOpenLog = timeLogs.some(l => l.timeIn && !l.timeOut)

  const rowClass = [
    'ag-row',
    `ag-status-${seed.status || DEFAULT_STATUS}`,
    isModified && 'ag-row-modified',
    locked && 'ag-row-locked',
    errorInfo && `ag-row-${errorInfo.status === 'locked' ? 'locked' : 'error'}`,
    rowIsLocked && 'ag-row-clickable'
  ].filter(Boolean).join(' ')

  const flag = errorInfo?.status === 'locked' ? '🔒'
    : errorInfo?.status === 'error' ? '!'
    : locked ? '🔒'
    : isModified ? '●'
    : ''

  const flagTitle = errorInfo?.reason
    || (locked ? 'Locked by higher-ranked reviewer' : isModified ? 'Modified' : '')

  return (
    <div style={style} className={rowClass} onClick={handleRowClick}>
      <div className="ag-cell ag-cell-flag" title={flagTitle}>{flag}</div>
      <div className="ag-cell ag-cell-emp">
        {canOpenEmployee ? (
          <button type="button" className="ag-emp-link"
            onClick={(e) => { e.stopPropagation(); onOpenEmployee(empId) }}
            title="Open employee detail">
            {emp.fullName}
          </button>
        ) : (
          <div className="ag-emp-name">{emp.fullName}</div>
        )}
        <div className="ag-emp-id-row">
          <span className="ag-emp-id">{emp.employeeId}</span>
          {existing && ENTRY_METHOD_BADGES[existing.entryMethod] && (() => {
            const badge = ENTRY_METHOD_BADGES[existing.entryMethod]
            const markedByName = existing.markedBy?.name || existing.createdBy?.name || 'Unknown'
            const markedById = existing.markedBy?._id || existing.markedBy
            const byMe = markedById && currentUserId && String(markedById) === String(currentUserId)
            const tooltip = byMe
              ? `${badge.label} — marked by you`
              : `${badge.label} — marked by ${markedByName}`
            return (
              <span
                className="ag-entry-badge"
                title={tooltip}
                aria-label={tooltip}
                onClick={e => e.stopPropagation()}
              >{badge.icon}</span>
            )
          })()}
          {/* Approximate-GPS chip - set when the worker used the low-
              accuracy escape hatch. Small amber "~" next to the entry
              badge so HR can spot which rows have weaker location proof. */}
          {existing?.approximate && (
            <span
              className="ag-entry-badge"
              style={{
                background: 'rgba(245,158,11,.18)',
                color: '#b45309',
                border: '1px solid rgba(245,158,11,.50)'
              }}
              title="Approximate GPS — worker punched with low-confidence location"
              aria-label="Approximate GPS punch"
              onClick={e => e.stopPropagation()}
            >~GPS</span>
          )}
        </div>
      </div>
      <div className="ag-cell ag-cell-meta" title={projectName}>{projectName}</div>
      <div className="ag-cell ag-cell-meta" title={roleDisplay}>{roleDisplay}</div>
      <div className="ag-cell">
        <select disabled={locked} value={seed.source} onChange={change('source')}>
          <option value="site">Site</option>
          <option value="office">Office</option>
        </select>
      </div>
      <div className="ag-cell" title={buildStatusReason(existing) || STATUS_LABEL[seed.status] || ''}>
        <select className={`ag-status-select-${seed.status || DEFAULT_STATUS}`}
          disabled={locked} value={seed.status} onChange={change('status')}>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <div className="ag-cell">
        <input type="number" min="0" step="0.5" disabled={locked}
          value={seed.regularHours} onChange={change('regularHours')} />
      </div>
      <div className="ag-cell">
        <input type="number" min="0" step="0.5" disabled={locked}
          value={seed.otHours} onChange={change('otHours')} />
      </div>
      <div className="ag-cell" style={{ position: 'relative' }}>
        <input type="number" min="0" disabled={locked}
          value={seed.breakMinutes} onChange={change('breakMinutes')} />
        {/* breakSkipped is set server-side by the math when the longest
            session exceeded the threshold AND no real break gap existed.
            Surface as a small amber chip so HR can spot the pattern at a
            glance - full reason is in the row status tooltip too. */}
        {existing?.breakSkipped && (
          <span
            title="No punch-out gap detected during a long session — worker likely worked through lunch without punching out."
            style={{
              position: 'absolute',
              top: -4,
              right: -2,
              padding: '0 5px',
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 700,
              background: 'rgba(245,158,11,.18)',
              color: '#b45309',
              border: '1px solid rgba(245,158,11,.50)',
              pointerEvents: 'auto'
            }}
          >⚠ no break</span>
        )}
      </div>
      <div className="ag-cell">
        <button
          type="button"
          className={`ag-alloc-btn ${hasOpenLog ? 'ag-alloc-btn-warn' : ''}`}
          disabled={locked}
          onClick={() => onOpenTimeLogs(empId, seed, emp)}
          title={hasOpenLog ? 'One or more logs are missing Time Out' : `${closedLogs.length} time log${closedLogs.length === 1 ? '' : 's'}`}
        >
          {closedLogs.length} log{closedLogs.length === 1 ? '' : 's'} / {totalLoggedHours.toFixed(1)}h{hasOpenLog ? ' ⚠' : ''}
        </button>
      </div>
      <div className="ag-cell">
        <input type="text" disabled={locked} value={seed.notes}
          onChange={change('notes')} placeholder="Notes" />
      </div>
      <div className="ag-cell" onClick={e => e.stopPropagation()}>
        <button type="button" className="ag-history-btn"
          disabled={!existing}
          title={existing ? 'View edit history' : 'No submitted record yet'}
          onClick={() => existing && onOpenHistory(existing, emp.fullName)}>
          📜
        </button>
      </div>
    </div>
  )
})

/* ----------- Time-Logs Modal helpers ----------- */

// Convert a Date / ISO string into the value expected by <input type="time"> (HH:MM)
function toTimeInputValue(dt) {
  if (!dt) return ''
  const d = dt instanceof Date ? dt : new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// Combine the row's date (YYYY-MM-DD) with the time input (HH:MM) into an ISO string
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const d = new Date(`${dateStr}T${timeStr}:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Friendly duration label for the auto-calculated value
function formatDuration(timeIn, timeOut) {
  if (!timeIn || !timeOut) return '—'
  const ms = new Date(timeOut) - new Date(timeIn)
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * TimeLogsModal - supervisor manual edit of the multi-log timeline for one
 * employee on one date. Replaces the old AllocationsModal (which was a single
 * Hours number per project). Rows are validated, the duration is auto-derived,
 * and any row missing Time Out gets the red-glow treatment.
 *
 * For office employees, new rows default to type='Office' with the employee's
 * baseLocationId pre-selected.
 */
function TimeLogsModal({ open, onClose, onSave, initial, date, projects, officeLocations, employee, attendanceId, onViewSelfie }) {
  const [rows, setRows] = useState([])
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const isOfficeEmployee = employee?.category === 'office'
  const defaultBaseLocationId = employee?.baseLocationId
    ? (typeof employee.baseLocationId === 'object' ? String(employee.baseLocationId._id || '') : String(employee.baseLocationId))
    : ''

  useEffect(() => {
    if (!open) return
    setReason('')
    setReasonError('')
    setSaving(false)
    setSaveError('')
    setRows((initial || []).map(l => ({
      type: l.type || (isOfficeEmployee ? 'Office' : 'Project'),
      referenceModel: l.referenceModel || (isOfficeEmployee ? 'Location' : 'Project'),
      referenceId: l.referenceId || '',
      // Display label from the populated server doc - used by the dropdown
      // when the referenced Project/Location is not in the modal's regular
      // option list (deactivated, out of the viewer's scope).
      _refLabel: l._refLabel || '',
      timeIn:  l.timeIn  ? toTimeInputValue(l.timeIn)  : '',
      timeOut: l.timeOut ? toTimeInputValue(l.timeOut) : '',
      notes: l.notes || '',
      // Preserve the original ISO/Date and any audit fields so they round-trip
      _origTimeIn:  l.timeIn  || null,
      _origTimeOut: l.timeOut || null,
      _audit: {
        _id: l._id,
        inCoordinates: l.inCoordinates,
        outCoordinates: l.outCoordinates,
        inSelfieUrl: l.inSelfieUrl,
        outSelfieUrl: l.outSelfieUrl,
        inIpAddress: l.inIpAddress,
        outIpAddress: l.outIpAddress,
        inDistanceMeters: l.inDistanceMeters,
        outDistanceMeters: l.outDistanceMeters
      }
    })))
  }, [open, initial, isOfficeEmployee])

  if (!open) return null

  const add = () => {
    const defaults = isOfficeEmployee
      ? { type: 'Office', referenceModel: 'Location', referenceId: defaultBaseLocationId }
      : { type: 'Project', referenceModel: 'Project', referenceId: '' }
    setRows(r => [...r, {
      ...defaults,
      timeIn: '',
      timeOut: '',
      notes: '',
      _origTimeIn: null, _origTimeOut: null, _audit: {}
    }])
  }

  const update = (i, field, value) => setRows(r => {
    const next = [...r]
    next[i] = { ...next[i], [field]: value }
    // Type change → reset reference accordingly
    if (field === 'type') {
      if (value === 'Office') {
        next[i].referenceModel = 'Location'
        next[i].referenceId = defaultBaseLocationId
      } else {
        // Project + Travel both reference a Project
        next[i].referenceModel = 'Project'
        next[i].referenceId = ''
      }
    }
    return next
  })

  const remove = (i) => setRows(r => r.filter((_, idx) => idx !== i))

  const save = async () => {
    if (saving) return
    // Reason is required - manual edits to timeLogs must have justification.
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('Please describe why you are editing these time logs.')
      return
    }
    if (trimmed.length < 4) {
      setReasonError('Reason is too short.')
      return
    }
    setReasonError('')
    setSaveError('')

    // Per-row validation BEFORE serialising. Both fields are required by the
    // Attendance schema (timeLogSchema.referenceId/timeIn) and a missing
    // referenceId would either crash on save or, worse, get silently dropped
    // and leave the parent attendance row "saved" with no logs visible.
    const problems = []
    rows.forEach((r, idx) => {
      if (!r.timeIn) {
        problems.push(`Row ${idx + 1}: Time In is required.`)
      }
      if (!r.referenceId) {
        const label = r.type === 'Office' ? 'Location' : 'Project'
        problems.push(`Row ${idx + 1}: ${label} must be selected.`)
      }
    })
    if (problems.length > 0) {
      setSaveError(problems.join(' '))
      return
    }

    // Serialize rows back to the timeLogs[] payload shape the server expects.
    const cleaned = rows.map(r => ({
      type: r.type,
      referenceModel: r.referenceModel,
      referenceId: r.referenceId,
      timeIn:  combineDateTime(date, r.timeIn),
      timeOut: r.timeOut ? combineDateTime(date, r.timeOut) : null,
      notes: r.notes || '',
      // Preserve audit fields so a supervisor edit doesn't wipe the selfies
      ...(r._audit?._id ? { _id: r._audit._id } : {}),
      inCoordinates: r._audit?.inCoordinates,
      outCoordinates: r._audit?.outCoordinates,
      inSelfieUrl: r._audit?.inSelfieUrl,
      outSelfieUrl: r._audit?.outSelfieUrl,
      inIpAddress: r._audit?.inIpAddress,
      outIpAddress: r._audit?.outIpAddress,
      inDistanceMeters: r._audit?.inDistanceMeters,
      outDistanceMeters: r._audit?.outDistanceMeters
    }))
    setSaving(true)
    try {
      const result = await onSave(cleaned, trimmed)
      // onSave resolves to { ok, error? } - the parent persists immediately
      // and signals failure so the modal stays open with the user's input.
      if (result && result.ok === false) {
        setSaveError(result.error || 'Could not save time logs.')
        return
      }
      // Successful save closes the modal in the parent.
    } catch (err) {
      setSaveError(err?.response?.data?.message || err?.message || 'Could not save time logs.')
    } finally {
      setSaving(false)
    }
  }

  // Build the reference dropdown options based on the row's type. When the
  // row already has a referenceId that's NOT in the main option list (the
  // referenced Project/Location was deactivated, is out of the viewer's
  // project scope, or simply isn't in the type-filtered set), inject a
  // synthetic option so the select renders with the right value selected
  // instead of falling back to the blank placeholder.
  const refOptionsFor = (row) => {
    const base = row.type === 'Office'
      ? officeLocations.map(l => ({ value: String(l._id), label: l.name }))
      : projects.map(p => ({ value: String(p._id), label: p.name }))
    if (row.referenceId && !base.some(o => o.value === String(row.referenceId))) {
      base.unshift({
        value: String(row.referenceId),
        label: row._refLabel || '(current selection)'
      })
    }
    return base
  }

  const openLogCount = rows.filter(r => r.timeIn && !r.timeOut).length

  return (
    <div className="hr-modal-overlay" onClick={onClose}>
      <div className="hr-modal" style={{ maxWidth: 920 }} onClick={e => e.stopPropagation()}>
        <h3>Time Logs · {employee?.fullName || 'Employee'} · {date}</h3>

        {isOfficeEmployee && (
          <div style={{
            margin: '6px 0 14px',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            color: 'var(--text)',
            fontSize: '0.85rem'
          }}>
            🏢 Office employee — new logs default to their base office location.
          </div>
        )}
        {openLogCount > 0 && (
          <div style={{
            margin: '6px 0 14px',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#b91c1c',
            fontSize: '0.85rem'
          }}>
            ⚠ {openLogCount} log{openLogCount === 1 ? '' : 's'} missing Time Out — please complete or remove.
          </div>
        )}

        {rows.length === 0 && (
          <div className="hr-empty" style={{ margin: '12px 0' }}>No time logs yet.</div>
        )}

        {rows.map((row, i) => {
          const missingOut = !!(row.timeIn && !row.timeOut)
          const refOptions = refOptionsFor(row)
          return (
            <div key={i} className="hr-form-row" style={{ alignItems: 'end', gap: 10 }}>
              <div className="hr-form-field" style={{ flex: '0 0 110px' }}>
                <label>Type</label>
                <select value={row.type} onChange={e => update(i, 'type', e.target.value)}>
                  <option value="Project">Project</option>
                  <option value="Office">Office</option>
                  <option value="Travel">Travel</option>
                </select>
              </div>
              <div className="hr-form-field" style={{ flex: '1 1 160px' }}>
                <label>
                  {row.type === 'Office' ? 'Location' : 'Project'} <span style={{ color: '#b91c1c' }}>*</span>
                </label>
                <select
                  value={row.referenceId}
                  onChange={e => update(i, 'referenceId', e.target.value)}
                  style={{
                    borderColor: !row.referenceId ? 'rgba(239,68,68,0.55)' : undefined
                  }}
                >
                  <option value="">— select —</option>
                  {refOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="hr-form-field" style={{ flex: '0 0 110px' }}>
                <label>Time In <span style={{ color: '#b91c1c' }}>*</span></label>
                <input
                  type="time"
                  value={row.timeIn}
                  onChange={e => update(i, 'timeIn', e.target.value)}
                  className={missingOut ? 'ag-time-warn' : ''}
                />
              </div>
              <div className="hr-form-field" style={{ flex: '0 0 110px' }}>
                <label>Time Out</label>
                <input
                  type="time"
                  value={row.timeOut}
                  onChange={e => update(i, 'timeOut', e.target.value)}
                  className={missingOut ? 'ag-time-warn' : ''}
                />
              </div>
              <div className="hr-form-field" style={{ flex: '0 0 90px' }}>
                <label>Duration</label>
                <div style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'var(--input, #f8fafc)',
                  border: '1px solid var(--border)',
                  color: missingOut ? '#b91c1c' : 'var(--text)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500
                }}>{formatDuration(row._origTimeIn || combineDateTime(date, row.timeIn), row._origTimeOut || combineDateTime(date, row.timeOut))}</div>
              </div>
              <div className="hr-form-field" style={{ flex: '1 1 140px' }}>
                <label>Notes</label>
                <input value={row.notes || ''} onChange={e => update(i, 'notes', e.target.value)} />
              </div>
              {attendanceId && row._audit?._id && (row._audit?.inSelfieUrl || row._audit?.outSelfieUrl) && (
                <div className="hr-form-field" style={{ flex: '0 0 78px' }}>
                  <label>Selfies</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {row._audit.inSelfieUrl && (
                      <button
                        type="button"
                        title="View Punch-In selfie"
                        onClick={() => onViewSelfie && onViewSelfie({
                          attendanceId,
                          logId: String(row._audit._id),
                          which: 'in',
                          meta: {
                            employeeName: employee?.fullName,
                            date,
                            capturedAt: row._audit.inCoordinates?.capturedAt || row._origTimeIn,
                            distanceMeters: row._audit.inDistanceMeters,
                            gps: row._audit.inCoordinates,
                            ip: row._audit.inIpAddress
                          }
                        })}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: 'rgba(34,197,94,0.10)',
                          border: '1px solid rgba(34,197,94,0.40)',
                          cursor: 'pointer',
                          fontSize: 14
                        }}
                      >📷</button>
                    )}
                    {row._audit.outSelfieUrl && (
                      <button
                        type="button"
                        title="View Punch-Out selfie"
                        onClick={() => onViewSelfie && onViewSelfie({
                          attendanceId,
                          logId: String(row._audit._id),
                          which: 'out',
                          meta: {
                            employeeName: employee?.fullName,
                            date,
                            capturedAt: row._audit.outCoordinates?.capturedAt || row._origTimeOut,
                            distanceMeters: row._audit.outDistanceMeters,
                            gps: row._audit.outCoordinates,
                            ip: row._audit.outIpAddress
                          }
                        })}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: 'rgba(99,102,241,0.10)',
                          border: '1px solid rgba(99,102,241,0.40)',
                          cursor: 'pointer',
                          fontSize: 14
                        }}
                      >📷</button>
                    )}
                  </div>
                </div>
              )}
              <button type="button" className="hr-btn hr-btn-danger" onClick={() => remove(i)}>×</button>
            </div>
          )
        })}

        <button type="button" className="hr-btn hr-btn-secondary" onClick={add} style={{ marginTop: 8 }}>
          + Add Time Log
        </button>

        <div className="hr-form-row" style={{ marginTop: 14 }}>
          <div className="hr-form-field" style={{ flex: 1 }}>
            <label>
              Reason for manual edit <span style={{ color: '#b91c1c' }}>*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError('') }}
              placeholder="e.g. Worker forgot to punch out — verified arrival/departure via supervisor logbook."
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '8px 10px',
                borderRadius: 6,
                border: `1px solid ${reasonError ? '#dc2626' : 'var(--border)'}`,
                background: 'var(--input, #f8fafc)',
                color: 'var(--text)',
                fontSize: '0.875rem',
                fontFamily: 'inherit'
              }}
            />
            {reasonError && (
              <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: 4 }}>{reasonError}</div>
            )}
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>
              Required. Captured in the audit log so future reviewers know why this row was changed.
            </div>
          </div>
        </div>

        {saveError && (
          <div style={{
            margin: '10px 0',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.10)',
            border: '1px solid rgba(239, 68, 68, 0.40)',
            color: 'var(--text)',
            fontSize: 13
          }}>{saveError}</div>
        )}

        <div className="hr-form-actions">
          <button type="button" className="hr-btn hr-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="hr-btn hr-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AttendanceGrid() {
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, [])
  const hasFullHR = hasAnyRole(currentUser, ['hr', 'manager', 'admin'])
  const isProjectScoped = !hasFullHR && hasAnyRole(currentUser, ['project_engineer', 'site_supervisor', 'supervisor'])
  const userRoleWeight = useMemo(() => currentRoleWeight(), [])
  const currentUserId = currentUser?.id || currentUser?._id || null

  const [filters, setFilters] = useState({
    date: new Date().toISOString().slice(0, 10),
    search: '',
    projectId: '',
    roleKey: '',
    status: ''
  })
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [employees, setEmployees] = useState([])
  const [existing, setExisting] = useState([])
  const [projects, setProjects] = useState([])
  const [officeLocations, setOfficeLocations] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [edits, dispatch] = useReducer(editsReducer, new Map())
  const [rowErrors, setRowErrors] = useState(new Map())
  const [timeLogsModal, setTimeLogsModal] = useState({ open: false, empId: null, initial: [], seed: null, employee: null, attendanceId: null })
  const [selfieModal, setSelfieModal] = useState({ open: false, attendanceId: null, logId: null, which: 'in', meta: {} })
  const [lockModal, setLockModal] = useState({ open: false, employeeName: '', lockedByRoleWeight: 0, reason: '' })
  const [historyModal, setHistoryModal] = useState({ open: false, record: null, employeeName: '' })
  const [editWarn, setEditWarn] = useState({ open: false, employeeName: '', pendingAction: null })
  const [dateWarn, setDateWarn] = useState({ open: false, pendingDate: '' })
  const [overrideWarn, setOverrideWarn] = useState({ open: false, entries: [] })
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [filters.search])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [empRes, projRes, roleRes, locRes] = await Promise.all([
          api.get('/api/attendance/grid-employees').catch(() => ({ data: [] })),
          api.get(isProjectScoped ? '/api/projects?mine=true' : '/api/projects').catch(() => ({ data: [] })),
          api.get('/api/roles').catch(() => ({ data: [] })),
          // Office Locations feed the TimeLogsModal "Office" type dropdown.
          // We deliberately load ALL active Locations (not just type='office')
          // because GPS punches can resolve to *any* Location - a site worker
          // falling back to their base location, an employee picking from a
          // LocationGroup, etc. Filtering by type='office' here was hiding
          // those rows and leaving the dropdown blank when HR opened Time Logs
          // for the row, breaking the auto-select after punch-in.
          api.get('/api/locations', { params: { status: 'active' } }).catch(() => ({ data: [] }))
        ])
        if (cancelled) return
        setEmployees(empRes.data || [])
        setProjects(projRes.data || [])
        setRoles(Array.isArray(roleRes.data) ? roleRes.data : [])
        setOfficeLocations(Array.isArray(locRes.data) ? locRes.data : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isProjectScoped])

  const reloadExisting = useCallback(async () => {
    if (isProjectScoped && !filters.projectId) {
      setExisting([])
      return
    }
    try {
      const params = { startDate: filters.date, endDate: filters.date }
      const res = await api.get('/api/attendance', { params })
      setExisting(res.data || [])
    } catch {
      setExisting([])
    }
  }, [filters.date, filters.projectId, isProjectScoped])

  useEffect(() => { reloadExisting() }, [reloadExisting])

  const existingByEmp = useMemo(() => {
    const m = new Map()
    for (const rec of existing) {
      const empId = rec.employee?._id || rec.employee
      if (empId) m.set(String(empId), rec)
    }
    return m
  }, [existing])

  const filteredEmployees = useMemo(() => {
    let list = employees

    const cutoff = new Date(filters.date)
    cutoff.setHours(23, 59, 59, 999)
    list = list.filter(e => {
      if (!e.joiningDate) return true
      return new Date(e.joiningDate).getTime() <= cutoff.getTime()
    })

    if (filters.projectId) {
      const proj = projects.find(p => p._id === filters.projectId)
      if (proj) {
        // Site team membership for the project = workers ∪ supervisors. The
        // earlier version only looked at proj.workers, which made site
        // supervisors / supervisors invisible whenever a PE narrowed the
        // grid to a specific project. Fall back to assignedProjects so
        // employees whose User isn't on the project but whose Employee
        // profile is still appear.
        const teamUserIds = new Set([
          ...((proj.workers || []).map(w => typeof w === 'string' ? w : String(w._id || w))),
          ...((proj.supervisors || []).map(s => typeof s === 'string' ? s : String(s._id || s)))
        ])
        list = list.filter(e => {
          const uid = empUserIdStr(e)
          if (uid && teamUserIds.has(uid)) return true
          const assigned = (e.assignedProjects || []).map(p => typeof p === 'string' ? p : String(p._id || p))
          return assigned.includes(filters.projectId)
        })
      } else {
        list = []
      }
    }

    if (filters.roleKey) {
      list = list.filter(e => empRoleKeys(e).includes(filters.roleKey))
    }

    if (debouncedSearch) {
      list = list.filter(e => {
        const name = (e.fullName || '').toLowerCase()
        const id = (e.employeeId || '').toLowerCase()
        return name.includes(debouncedSearch) || id.includes(debouncedSearch)
      })
    }

    if (filters.status) {
      list = list.filter(e => {
        const rec = existingByEmp.get(e._id)
        return rec?.status === filters.status
      })
    }

    return list
  }, [employees, projects, filters.date, filters.projectId, filters.roleKey, filters.status, debouncedSearch, existingByEmp])

  const safeDispatch = useCallback((action, empId) => {
    if (existingByEmp.has(empId) && !edits.has(empId)) {
      const emp = employees.find(e => e._id === empId)
      setEditWarn({
        open: true,
        employeeName: emp?.fullName || '',
        pendingAction: action
      })
      return
    }
    dispatch(action)
  }, [edits, existingByEmp, employees])

  const confirmEditAfterSubmit = useCallback(() => {
    if (editWarn.pendingAction) dispatch(editWarn.pendingAction)
    setEditWarn({ open: false, employeeName: '', pendingAction: null })
  }, [editWarn])

  const cancelEditAfterSubmit = useCallback(() => {
    setEditWarn({ open: false, employeeName: '', pendingAction: null })
  }, [])

  const onField = useCallback((empId, field, value, seed) => {
    safeDispatch({ type: 'SET_FIELD', empId, field, value, seed }, empId)
    setRowErrors(prev => {
      if (!prev.has(empId)) return prev
      const next = new Map(prev)
      next.delete(empId)
      return next
    })
  }, [safeDispatch])

  const onOpenTimeLogs = useCallback((empId, seed, emp) => {
    const existing = existingByEmp.get(empId)
    setTimeLogsModal({
      open: true,
      empId,
      initial: seed.timeLogs || [],
      seed,
      employee: emp || null,
      attendanceId: existing?._id || null
    })
  }, [existingByEmp])

  const closeTimeLogs = useCallback(() => {
    setTimeLogsModal({ open: false, empId: null, initial: [], seed: null, employee: null, attendanceId: null })
  }, [])

  const openSelfie = useCallback((args) => {
    setSelfieModal({ open: true, ...args })
  }, [])

  const closeSelfie = useCallback(() => {
    setSelfieModal({ open: false, attendanceId: null, logId: null, which: 'in', meta: {} })
  }, [])

  // Persist time-log edits IMMEDIATELY to the server instead of staging them
  // in the per-row draft and waiting for the bulk "Submit". This matches user
  // expectation: clicking Save in the TimeLogsModal should save the time
  // logs right now, not defer them to a later submit. Other row fields
  // (status, hours, notes) still stage via the bulk reducer.
  //
  // Returns { ok, error? } so the modal can stay open on failure with the
  // user's input intact.
  const saveTimeLogs = useCallback(async (timeLogs, editReason) => {
    const { empId, employee, attendanceId, seed } = timeLogsModal
    try {
      if (attendanceId) {
        const res = await api.put(`/api/attendance/${attendanceId}`, {
          timeLogs,
          editReason
        })
        const updated = res.data
        // Splice the updated doc back into the existing list so the row
        // refreshes without a full reload.
        setExisting(prev => prev.map(e => String(e._id) === String(updated._id) ? updated : e))
      } else {
        // No row yet for (employee, date) - upsert via bulk-manual with one entry.
        const fallbackSource = employee?.category === 'office' ? 'office' : 'site'
        const entry = {
          employee: empId,
          date: filters.date,
          source: seed?.source || fallbackSource,
          status: seed?.status || 'present',
          regularHours: Number(seed?.regularHours) || 0,
          otHours: Number(seed?.otHours) || 0,
          breakMinutes: Number(seed?.breakMinutes) || 0,
          notes: seed?.notes || '',
          timeLogs,
          editReason
        }
        const res = await api.post('/api/attendance/bulk-manual', { entries: [entry] })
        const result = (res.data?.results || [])[0]
        if (result && result.status === 'locked') {
          return { ok: false, error: result.reason || 'This row is locked by a higher-ranked reviewer.' }
        }
        if (result && result.status === 'error') {
          return { ok: false, error: result.error || 'Could not save time logs.' }
        }
        await reloadExisting()
      }
      // Drop any stale draft for this row - server is now the source of truth.
      dispatch({ type: 'DISCARD_ROW', empId })
      closeTimeLogs()
      return { ok: true }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Could not save time logs.'
      return { ok: false, error: msg }
    }
  }, [timeLogsModal, filters.date, reloadExisting, closeTimeLogs])

  const onLockClick = useCallback((info) => {
    setLockModal({ open: true, ...info })
  }, [])

  const closeLockModal = useCallback(() => {
    setLockModal(m => ({ ...m, open: false }))
  }, [])

  const onOpenHistory = useCallback((record, employeeName) => {
    setHistoryModal({ open: true, record, employeeName })
  }, [])

  const closeHistory = useCallback(() => {
    setHistoryModal({ open: false, record: null, employeeName: '' })
  }, [])

  const onOpenEmployee = useCallback((empId) => {
    navigate('/hr/employee-detail', { state: { employeeId: empId } })
  }, [navigate])

  const requestDateChange = useCallback((nextDate) => {
    if (nextDate === filters.date) return
    if (edits.size > 0) {
      setDateWarn({ open: true, pendingDate: nextDate })
      return
    }
    setFilters(f => ({ ...f, date: nextDate }))
  }, [edits.size, filters.date])

  const cancelDateChange = useCallback(() => {
    setDateWarn({ open: false, pendingDate: '' })
  }, [])

  const confirmDateChange = useCallback(() => {
    const nextDate = dateWarn.pendingDate
    dispatch({ type: 'DISCARD_ALL' })
    setRowErrors(new Map())
    setFilters(f => ({ ...f, date: nextDate }))
    setDateWarn({ open: false, pendingDate: '' })
  }, [dateWarn.pendingDate])

  const buildEntries = useCallback(() => {
    const out = []
    for (const [empId, draft] of edits) {
      const entry = {
        employee: empId,
        date: draft.date,
        source: draft.source,
        status: draft.status,
        regularHours: Number(draft.regularHours) || 0,
        otHours: Number(draft.otHours) || 0,
        breakMinutes: Number(draft.breakMinutes) || 0,
        notes: draft.notes || '',
        projectAllocations: (draft.projectAllocations || [])
          .filter(a => a.projectId && Number(a.hours) > 0)
          .map(a => ({ projectId: a.projectId, hours: Number(a.hours), notes: a.notes || '' }))
      }
      // NOTE: timeLogs are no longer sent in the bulk-manual payload. They
      // are persisted directly from TimeLogsModal via PUT/:id (or a single
      // bulk-manual entry when no row exists yet). Sending stale draft
      // timeLogs here would re-trigger the server's "reason required" guard
      // even for status/notes-only changes.
      out.push(entry)
    }
    return out
  }, [edits])

  const doSubmit = useCallback(async () => {
    const entries = buildEntries()
    if (entries.length === 0) return
    setSubmitting(true)
    try {
      const res = await api.post('/api/attendance/bulk-manual', { entries })
      const results = res.data?.results || []

      const successIds = []
      const errors = new Map()
      let saved = 0, locked = 0, errored = 0
      for (const r of results) {
        if (r.status === 'created' || r.status === 'updated') {
          successIds.push(String(r.employee))
          saved++
        } else if (r.status === 'locked') {
          errors.set(String(r.employee), r)
          locked++
        } else {
          errors.set(String(r.employee), r)
          errored++
        }
      }

      if (successIds.length) dispatch({ type: 'DISCARD_ROWS', empIds: successIds })
      setRowErrors(errors)
      await reloadExisting()

      const parts = []
      if (saved) parts.push(`${saved} saved`)
      if (locked) parts.push(`${locked} locked`)
      if (errored) parts.push(`${errored} error${errored === 1 ? '' : 's'}`)
      setNotify({
        open: true,
        title: errored || locked ? 'Submit complete (with issues)' : 'Submit complete',
        message: parts.join(', ') || 'No rows processed.'
      })
    } catch (err) {
      setNotify({
        open: true,
        title: 'Submit failed',
        message: err.response?.data?.message || 'Server error — please retry.'
      })
    } finally {
      setSubmitting(false)
    }
  }, [buildEntries, reloadExisting])

  // Detect rows the current user would override (i.e. row was marked by a
  // lower-ranked user that is not themselves). The server allows the save;
  // this gate forces a human confirmation first.
  const findOverrideTargets = useCallback(() => {
    const targets = []
    for (const empId of edits.keys()) {
      const existing = existingByEmp.get(String(empId))
      if (!existing) continue
      const lockWeight = existing.lockedByRoleWeight || 0
      if (lockWeight >= userRoleWeight) continue // server will block; AttendanceLockWarningModal covers this
      const markedById = existing.markedBy?._id || existing.markedBy
      if (!markedById || (currentUserId && String(markedById) === String(currentUserId))) continue
      const emp = employees.find(e => String(e._id) === String(empId))
      targets.push({
        employeeName: emp?.fullName || existing.employee?.fullName || 'Unknown',
        date: filters.date,
        markedByName: existing.markedBy?.name || existing.createdBy?.name || 'Unknown',
        markedByRoleLabel: `weight ${lockWeight}`
      })
    }
    return targets
  }, [edits, existingByEmp, userRoleWeight, currentUserId, employees, filters.date])

  const handleSubmit = useCallback(() => {
    const targets = findOverrideTargets()
    if (targets.length > 0) {
      setOverrideWarn({ open: true, entries: targets })
      return
    }
    doSubmit()
  }, [findOverrideTargets, doSubmit])

  const confirmOverride = useCallback(() => {
    setOverrideWarn({ open: false, entries: [] })
    doSubmit()
  }, [doSubmit])

  const cancelOverride = useCallback(() => {
    setOverrideWarn({ open: false, entries: [] })
  }, [])

  const itemData = useMemo(() => ({
    employees: filteredEmployees,
    edits,
    existingByEmp,
    rowErrors,
    date: filters.date,
    userRoleWeight,
    currentUserId,
    canOpenEmployee: hasFullHR,
    onField,
    onOpenTimeLogs,
    onLockClick,
    onOpenHistory,
    onOpenEmployee
  }), [filteredEmployees, edits, existingByEmp, rowErrors, filters.date, userRoleWeight, currentUserId, hasFullHR, onField, onOpenTimeLogs, onLockClick, onOpenHistory, onOpenEmployee])

  const scopedNeedsProject = isProjectScoped && !filters.projectId

  return (
    <div className="ag-container">
      <div className="ag-toolbar">
        <div className="ag-toolbar-left">
          <label className="ag-toolbar-label">Date</label>
          <input type="date" value={filters.date}
            onChange={e => requestDateChange(e.target.value)} />
          <input type="text" placeholder="Search name or ID…" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            style={{ minWidth: 200 }} />
          <select value={filters.projectId}
            onChange={e => setFilters(f => ({ ...f, projectId: e.target.value }))}>
            <option value="">{isProjectScoped ? 'Select project…' : 'All projects'}</option>
            {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <select value={filters.roleKey}
            onChange={e => setFilters(f => ({ ...f, roleKey: e.target.value }))}>
            <option value="">All roles</option>
            {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
          <select value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">Any saved status</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="ag-toolbar-right">
          <span className="ag-count-badge">{edits.size} modified</span>
          <button className="hr-btn hr-btn-secondary" disabled={edits.size === 0 || submitting}
            onClick={() => { dispatch({ type: 'DISCARD_ALL' }); setRowErrors(new Map()) }}>
            Discard all
          </button>
          <button className="hr-btn hr-btn-primary" disabled={edits.size === 0 || submitting}
            onClick={handleSubmit}>
            {submitting ? 'Submitting…' : `Submit ${edits.size || ''}`.trim()}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="hr-empty">Loading employees…</div>
      ) : scopedNeedsProject ? (
        <div className="hr-empty">Select one of your projects to see workers.</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="hr-empty">No employees match the current filters.</div>
      ) : (
        <div className="ag-scroll-outer">
          <div className="ag-table" style={{ width: LIST_WIDTH }}>
            <div className="ag-row ag-header">
              <div className="ag-cell ag-cell-flag">⚑</div>
              <div className="ag-cell">Employee</div>
              <div className="ag-cell">Project</div>
              <div className="ag-cell">Role</div>
              <div className="ag-cell">Source</div>
              <div className="ag-cell">Status</div>
              <div className="ag-cell">Reg Hrs</div>
              <div className="ag-cell">OT Hrs</div>
              <div className="ag-cell">Break (min)</div>
              <div className="ag-cell">Allocations</div>
              <div className="ag-cell">Notes</div>
              <div className="ag-cell">History</div>
            </div>
            <FixedSizeList
              height={Math.min(LIST_HEIGHT, Math.max(ROW_HEIGHT * 4, filteredEmployees.length * ROW_HEIGHT))}
              width={LIST_WIDTH}
              itemCount={filteredEmployees.length}
              itemSize={ROW_HEIGHT}
              overscanCount={8}
              itemData={itemData}
            >
              {AttendanceRow}
            </FixedSizeList>
          </div>
        </div>
      )}

      <TimeLogsModal
        open={timeLogsModal.open}
        initial={timeLogsModal.initial}
        date={filters.date}
        projects={projects}
        officeLocations={officeLocations}
        employee={timeLogsModal.employee}
        attendanceId={timeLogsModal.attendanceId}
        onViewSelfie={openSelfie}
        onSave={saveTimeLogs}
        onClose={closeTimeLogs}
      />

      <SelfieModal
        isOpen={selfieModal.open}
        attendanceId={selfieModal.attendanceId}
        logId={selfieModal.logId}
        which={selfieModal.which}
        meta={selfieModal.meta}
        onClose={closeSelfie}
      />

      <AttendanceLockWarningModal
        isOpen={lockModal.open}
        onClose={closeLockModal}
        employeeName={lockModal.employeeName}
        lockedByRoleWeight={lockModal.lockedByRoleWeight}
        userRoleWeight={userRoleWeight}
        roles={roles}
        reason={lockModal.reason}
      />

      <AttendanceHistoryModal
        isOpen={historyModal.open}
        onClose={closeHistory}
        record={historyModal.record}
        employeeName={historyModal.employeeName}
      />

      <EditAfterSubmitModal
        isOpen={editWarn.open}
        onCancel={cancelEditAfterSubmit}
        onConfirm={confirmEditAfterSubmit}
        employeeName={editWarn.employeeName}
      />

      <DateChangeWarningModal
        isOpen={dateWarn.open}
        currentDate={filters.date}
        pendingDate={dateWarn.pendingDate}
        modifiedCount={edits.size}
        onCancel={cancelDateChange}
        onDiscardAndSwitch={confirmDateChange}
      />

      <OverrideWarningModal
        isOpen={overrideWarn.open}
        entries={overrideWarn.entries}
        onClose={cancelOverride}
        onConfirm={confirmOverride}
      />

      {notify.open && (
        <div className="hr-modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3>{notify.title}</h3>
            <p>{notify.message}</p>
            <div className="hr-form-actions">
              <button className="hr-btn hr-btn-primary"
                onClick={() => setNotify({ ...notify, open: false })}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
