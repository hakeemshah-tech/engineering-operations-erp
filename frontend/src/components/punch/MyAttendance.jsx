import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import { api } from '../../lib/api'
import SelfieModal from '../hr/SelfieModal'
import '../hr/hr.css'

/**
 * Employee self-service attendance view.
 *
 * Read-only. Renders the caller's own rows from GET /api/attendance/mine
 * with a period selector, status filter, summary stats, and per-row
 * expand to show time logs + selfies.
 */

const STATUS_LABEL = {
  not_marked: 'Not marked',
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  leave: 'Leave',
  holiday: 'Holiday',
  weekend: 'Weekend'
}

const STATUS_TONE = {
  present:    { bg: 'rgba(34,197,94,.12)',  br: 'rgba(34,197,94,.40)',  fg: '#16a34a', icon: '✓' },
  late:       { bg: 'rgba(245,158,11,.12)', br: 'rgba(245,158,11,.40)', fg: '#b45309', icon: '⚠' },
  absent:     { bg: 'rgba(239,68,68,.12)',  br: 'rgba(239,68,68,.40)',  fg: '#b91c1c', icon: '✗' },
  leave:      { bg: 'rgba(168,85,247,.12)', br: 'rgba(168,85,247,.40)', fg: '#7e22ce', icon: '🌴' },
  holiday:    { bg: 'rgba(56,189,248,.12)', br: 'rgba(56,189,248,.40)', fg: '#0284c7', icon: '🎉' },
  weekend:    { bg: 'rgba(148,163,184,.12)', br: 'rgba(148,163,184,.40)', fg: '#475569', icon: '🛌' },
  not_marked: { bg: 'rgba(148,163,184,.08)', br: 'rgba(148,163,184,.30)', fg: '#64748b', icon: '·' }
}

const PERIOD_OPTIONS = [
  { key: 'this_month',  label: 'This month' },
  { key: 'last_month',  label: 'Last month' },
  { key: 'last_30',     label: 'Last 30 days' },
  { key: 'last_90',     label: 'Last 90 days' },
  { key: 'custom',      label: 'Custom range' }
]

function startOfMonth(d)  { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x }
function endOfMonth(d)    { const x = new Date(d); x.setMonth(x.getMonth() + 1, 0); x.setHours(23,59,59,999); return x }
function shiftDays(d, n)  { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function isoDay(d)        { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}` }

function periodRange(key) {
  const now = new Date()
  switch (key) {
    case 'this_month': return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'last_month': {
      const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return { start: startOfMonth(ref), end: endOfMonth(ref) }
    }
    case 'last_30':    return { start: shiftDays(now, -30), end: now }
    case 'last_90':    return { start: shiftDays(now, -90), end: now }
    default:           return { start: shiftDays(now, -30), end: now }
  }
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '—' }
}
function fmtHM(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}
function fmtDuration(a, b) {
  if (!a || !b) return '—'
  const ms = new Date(b) - new Date(a)
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const min = Math.round(ms / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function MyAttendance() {
  const [period, setPeriod] = useState('this_month')
  const [customStart, setCustomStart] = useState(isoDay(shiftDays(new Date(), -30)))
  const [customEnd, setCustomEnd]   = useState(isoDay(new Date()))
  const [statusFilter, setStatusFilter] = useState('all')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ employee: null, rows: [] })
  const [expandedId, setExpandedId] = useState(null)
  const [selfieView, setSelfieView] = useState({ open: false, attendanceId: null, logId: null, which: 'in', meta: {} })

  // Resolve current range from period + custom.
  const range = useMemo(() => {
    if (period === 'custom') {
      const s = new Date(customStart); s.setHours(0,0,0,0)
      const e = new Date(customEnd);   e.setHours(23,59,59,999)
      return { start: s, end: e }
    }
    return periodRange(period)
  }, [period, customStart, customEnd])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {
        startDate: isoDay(range.start),
        endDate:   isoDay(range.end)
      }
      if (statusFilter !== 'all') params.status = statusFilter
      const res = await api.get('/api/attendance/mine', { params })
      setData({
        employee: res.data?.employee || null,
        rows: Array.isArray(res.data?.rows) ? res.data.rows : [],
        notLinked: !!res.data?.notLinked
      })
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load attendance.')
      setData({ employee: null, rows: [] })
    } finally {
      setLoading(false)
    }
  }, [range, statusFilter])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const out = { total: 0, present: 0, late: 0, absent: 0, leave: 0, holiday: 0, weekend: 0, totalHours: 0, otHours: 0 }
    for (const r of data.rows) {
      out.total += 1
      if (r.status && out[r.status] !== undefined) out[r.status] += 1
      out.totalHours += Number(r.regularHours) || 0
      out.otHours    += Number(r.otHours)      || 0
    }
    return out
  }, [data.rows])

  const openSelfie = (row, log, which) => {
    if (!log._id) return
    const ref = log.referenceId && typeof log.referenceId === 'object'
      ? (log.referenceId.name || log.type)
      : log.type
    setSelfieView({
      open: true,
      attendanceId: String(row._id),
      logId: String(log._id),
      which,
      meta: {
        date: fmtDate(row.date),
        capturedAt: which === 'in' ? (log.inCoordinates?.capturedAt || log.timeIn) : (log.outCoordinates?.capturedAt || log.timeOut),
        distanceMeters: which === 'in' ? log.inDistanceMeters : log.outDistanceMeters,
        gps: which === 'in' ? log.inCoordinates : log.outCoordinates,
        ip: which === 'in' ? log.inIpAddress : log.outIpAddress,
        locationName: ref
      }
    })
  }

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>My Attendance</h2>
          <p>
            {data.employee
              ? <>{data.employee.fullName} · <strong>{data.employee.employeeId}</strong></>
              : 'Your attendance history'}
          </p>
        </div>
      </div>

      {/* ===== Filters ===== */}
      <div className="hr-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div style={{ flex: '0 0 200px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Period</div>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)' }}
          >
            {PERIOD_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div style={{ flex: '0 0 170px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>From</div>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ flex: '0 0 170px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>To</div>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)' }}
              />
            </div>
          </>
        )}
        <div style={{ flex: '1 1 280px', minWidth: 240 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['all', ...Object.keys(STATUS_LABEL)].map(s => {
              const on = statusFilter === s
              const tone = s === 'all' ? null : STATUS_TONE[s]
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    padding: '6px 11px',
                    borderRadius: 999,
                    border: `1px solid ${on ? (tone?.br || 'rgba(99,102,241,.55)') : 'var(--border)'}`,
                    background: on ? (tone?.bg || 'rgba(99,102,241,.15)') : 'transparent',
                    color: on ? (tone?.fg || 'var(--text)') : 'var(--text-muted)',
                    fontSize: 12,
                    fontWeight: on ? 600 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {s === 'all' ? 'All' : STATUS_LABEL[s]}
                </button>
              )
            })}
          </div>
        </div>
        <button
          type="button"
          className="hr-btn hr-btn-secondary"
          onClick={load}
          disabled={loading}
          style={{ marginLeft: 'auto' }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* ===== Summary ===== */}
      {!data.notLinked && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
          <StatCard label="Days in period" value={summary.total} tone={STATUS_TONE.not_marked} />
          <StatCard label="Present" value={summary.present} tone={STATUS_TONE.present} />
          <StatCard label="Late" value={summary.late} tone={STATUS_TONE.late} />
          <StatCard label="Absent" value={summary.absent} tone={STATUS_TONE.absent} />
          <StatCard label="Leave" value={summary.leave} tone={STATUS_TONE.leave} />
          <StatCard label="Holiday" value={summary.holiday} tone={STATUS_TONE.holiday} />
          <StatCard label="Weekend" value={summary.weekend} tone={STATUS_TONE.weekend} />
          <StatCard label="Total hours" value={summary.totalHours.toFixed(1)} tone={STATUS_TONE.present} />
          <StatCard label="OT hours" value={summary.otHours.toFixed(1)} tone={STATUS_TONE.late} />
        </div>
      )}

      {/* ===== Error / loading / empty ===== */}
      {error && (
        <div className="hr-card" style={{ borderColor: 'rgba(239,68,68,.40)', color: 'var(--text)' }}>{error}</div>
      )}
      {!loading && !error && data.notLinked && (
        <div className="hr-card" style={{ borderColor: 'rgba(245,158,11,.40)', color: 'var(--text)' }}>
          Your account isn’t linked to an employee profile yet, so there are no attendance records to show.
          If you should be tracking attendance, ask HR to link your user to an employee.
        </div>
      )}
      {loading && !error && (
        <div className="hr-empty">Loading…</div>
      )}
      {!loading && !error && !data.notLinked && data.rows.length === 0 && (
        <div className="hr-empty">No attendance for this period.</div>
      )}

      {/* ===== Table ===== */}
      {!loading && !error && data.rows.length > 0 && (
        <div className="hr-card" style={{ padding: 0 }}>
          <table className="hr-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 200 }}>Date</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 95 }}>Time In</th>
                <th style={{ width: 95 }}>Time Out</th>
                <th style={{ width: 75 }}>Reg</th>
                <th style={{ width: 75 }}>OT</th>
                <th style={{ width: 95 }}>Late (m)</th>
                <th>Notes</th>
                <th style={{ width: 80 }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => {
                const tone = STATUS_TONE[r.status] || STATUS_TONE.not_marked
                const isOpen = expandedId === String(r._id)
                const logs = Array.isArray(r.timeLogs) ? r.timeLogs : []
                return (
                  <Fragment key={r._id}>
                    <tr
                      style={{ cursor: logs.length > 0 ? 'pointer' : 'default' }}
                      onClick={() => logs.length > 0 && setExpandedId(isOpen ? null : String(r._id))}
                    >
                      <td>{fmtDate(r.date)}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 9px',
                          borderRadius: 999,
                          background: tone.bg,
                          border: `1px solid ${tone.br}`,
                          color: tone.fg,
                          fontSize: 11,
                          fontWeight: 600
                        }}>
                          {tone.icon} {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td>{fmtHM(r.timeIn)}</td>
                      <td>{fmtHM(r.timeOut)}</td>
                      <td>{(Number(r.regularHours) || 0).toFixed(1)}</td>
                      <td>{(Number(r.otHours) || 0).toFixed(1)}</td>
                      <td>{Number.isFinite(r.lateMinutes) ? r.lateMinutes : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {r.notes || (r.leaveRequestId ? `Approved ${r.leaveRequestId.type || ''} leave` : '')}
                      </td>
                      <td>
                        {logs.length > 0 && (
                          <button
                            type="button"
                            className="hr-btn hr-btn-secondary"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isOpen ? null : String(r._id)) }}
                          >
                            {isOpen ? 'Hide' : `View · ${logs.length}`}
                          </button>
                        )}
                      </td>
                    </tr>

                    {isOpen && logs.length > 0 && (
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--input, #f8fafc)', padding: '12px 18px' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                            Time logs ({logs.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {logs.map((log, i) => {
                              const ref = log.referenceId && typeof log.referenceId === 'object'
                                ? (log.referenceId.name || log.type)
                                : log.type
                              const isOpenLog = log.timeIn && !log.timeOut
                              return (
                                <div
                                  key={log._id || i}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '24px 1fr auto auto auto auto',
                                    gap: 10,
                                    alignItems: 'center',
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    background: 'var(--card)',
                                    border: '1px solid var(--border)',
                                    fontSize: 13
                                  }}
                                >
                                  <span>{log.type === 'Office' ? '🏢' : log.type === 'Travel' ? '🚗' : '📍'}</span>
                                  <span style={{ fontWeight: 500 }}>{ref}</span>
                                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                                    {fmtHM(log.timeIn)} → {log.timeOut ? fmtHM(log.timeOut) : '…open'}
                                  </span>
                                  <span style={{
                                    fontSize: 12,
                                    color: isOpenLog ? '#b45309' : 'var(--text-muted)',
                                    fontWeight: isOpenLog ? 600 : 500
                                  }}>
                                    {isOpenLog ? '⚠ still open' : fmtDuration(log.timeIn, log.timeOut)}
                                  </span>
                                  <span style={{ display: 'flex', gap: 4 }}>
                                    {log.inSelfieUrl && (
                                      <button
                                        type="button"
                                        title="View Punch In selfie"
                                        onClick={() => openSelfie(r, log, 'in')}
                                        style={{ padding: '4px 7px', borderRadius: 6, background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.40)', cursor: 'pointer', fontSize: 12 }}
                                      >📷</button>
                                    )}
                                    {log.outSelfieUrl && (
                                      <button
                                        type="button"
                                        title="View Punch Out selfie"
                                        onClick={() => openSelfie(r, log, 'out')}
                                        style={{ padding: '4px 7px', borderRadius: 6, background: 'rgba(99,102,241,.10)', border: '1px solid rgba(99,102,241,.40)', cursor: 'pointer', fontSize: 12 }}
                                      >📷</button>
                                    )}
                                  </span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {Number.isFinite(log.inDistanceMeters) ? `±${log.inDistanceMeters}m` : ''}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <SelfieModal
        isOpen={selfieView.open}
        attendanceId={selfieView.attendanceId}
        logId={selfieView.logId}
        which={selfieView.which}
        meta={selfieView.meta}
        onClose={() => setSelfieView({ open: false, attendanceId: null, logId: null, which: 'in', meta: {} })}
      />
    </div>
  )
}

function StatCard({ label, value, tone }) {
  return (
    <div style={{
      flex: '1 1 110px',
      minWidth: 110,
      padding: '12px 14px',
      borderRadius: 10,
      background: tone?.bg || 'var(--card)',
      border: `1px solid ${tone?.br || 'var(--border)'}`,
      color: 'var(--text)'
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone?.fg || 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}
