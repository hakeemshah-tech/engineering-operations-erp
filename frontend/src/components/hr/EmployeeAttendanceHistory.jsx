import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '../../lib/api'

const STATUS_COLORS = {
  present: { bg: 'rgba(16, 185, 129, 0.15)', fg: '#047857', border: 'rgba(16, 185, 129, 0.4)' },
  late: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#b45309', border: 'rgba(245, 158, 11, 0.4)' },
  absent: { bg: 'rgba(239, 68, 68, 0.15)', fg: '#b91c1c', border: 'rgba(239, 68, 68, 0.4)' },
  leave: { bg: 'rgba(245, 158, 11, 0.12)', fg: '#92400e', border: 'rgba(245, 158, 11, 0.35)' },
  holiday: { bg: 'rgba(59, 130, 246, 0.15)', fg: '#1d4ed8', border: 'rgba(59, 130, 246, 0.4)' },
  not_marked: { bg: 'rgba(100, 116, 139, 0.15)', fg: '#475569', border: 'rgba(100, 116, 139, 0.35)' }
}

const ENTRY_METHOD_LABEL = {
  GPS_PUNCH: { icon: '📍', label: 'GPS punch' },
  MANUAL_ENTRY: { icon: '✋', label: 'Manual entry' },
  manual: { icon: '✋', label: 'Manual' },
  biometric: { icon: '👆', label: 'Biometric' },
  mobile_app: { icon: '📱', label: 'Mobile app' },
  web: { icon: '💻', label: 'Web' }
}

function toIsoDate(d) {
  return new Date(d).toISOString().slice(0, 10)
}

function formatDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(d) }
}

function formatTime(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }
  catch { return String(d) }
}

/**
 * Attendance History tab for the Employee Detail page.
 * HR users (gated by the parent route) can pick a date range and view all
 * attendance entries for the selected employee. Read-only - editing happens
 * in the Attendance grid under HR Management.
 */
export default function EmployeeAttendanceHistory({ employeeId, employeeName }) {
  const today = useMemo(() => new Date(), [])
  const defaultStart = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 29) // last 30 days
    return toIsoDate(d)
  }, [today])
  const defaultEnd = useMemo(() => toIsoDate(today), [today])

  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!employeeId) return
    if (!startDate || !endDate) return
    if (startDate > endDate) {
      setError('Start date must be on or before end date.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/attendance', {
        params: { employee: employeeId, startDate, endDate }
      })
      const rows = Array.isArray(res.data) ? res.data : []
      // Server returns records for this employee already; sort newest first.
      rows.sort((a, b) => new Date(b.date) - new Date(a.date))
      setRecords(rows)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load attendance records.')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [employeeId, startDate, endDate])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const totals = {
      count: records.length,
      regularHours: 0,
      otHours: 0,
      present: 0,
      late: 0,
      absent: 0,
      leave: 0,
      holiday: 0
    }
    for (const r of records) {
      totals.regularHours += Number(r.regularHours) || 0
      totals.otHours += Number(r.otHours) || 0
      if (totals[r.status] !== undefined) totals[r.status] += 1
    }
    return totals
  }, [records])

  return (
    <div className="hr-card">
      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Start date
          </label>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={e => setStartDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            End date
          </label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={e => setEndDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button
          type="button"
          className="hr-btn hr-btn-secondary"
          onClick={() => {
            setStartDate(defaultStart)
            setEndDate(defaultEnd)
          }}
        >
          Last 30 days
        </button>
        <button
          type="button"
          className="hr-btn hr-btn-secondary"
          onClick={() => {
            const d = new Date(today)
            d.setDate(d.getDate() - 6)
            setStartDate(toIsoDate(d))
            setEndDate(defaultEnd)
          }}
        >
          Last 7 days
        </button>
        <button
          type="button"
          className="hr-btn hr-btn-secondary"
          onClick={() => {
            const d = new Date(today)
            d.setMonth(d.getMonth() - 3)
            setStartDate(toIsoDate(d))
            setEndDate(defaultEnd)
          }}
        >
          Last 90 days
        </button>
        <button
          type="button"
          className="hr-btn hr-btn-primary"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
        marginBottom: 16
      }}>
        <SummaryTile label="Records" value={summary.count} />
        <SummaryTile label="Regular hrs" value={summary.regularHours.toFixed(1)} />
        <SummaryTile label="OT hrs" value={summary.otHours.toFixed(1)} />
        <SummaryTile label="Present" value={summary.present} tint="#047857" />
        <SummaryTile label="Late" value={summary.late} tint="#b45309" />
        <SummaryTile label="Absent" value={summary.absent} tint="#b91c1c" />
        <SummaryTile label="Leave" value={summary.leave} tint="#92400e" />
        <SummaryTile label="Holiday" value={summary.holiday} tint="#1d4ed8" />
      </div>

      {error && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.12)',
          color: '#b91c1c',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          fontSize: '0.88rem',
          marginBottom: 14
        }}>{error}</div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="hr-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Source</th>
              <th>In</th>
              <th>Out</th>
              <th style={{ textAlign: 'right' }}>Regular</th>
              <th style={{ textAlign: 'right' }}>OT</th>
              <th style={{ textAlign: 'right' }}>Break</th>
              <th>Entry</th>
              <th>Marked by</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="11" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Loading…</td></tr>
            )}
            {!loading && records.length === 0 && (
              <tr><td colSpan="11" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                No attendance records in this range for {employeeName || 'this employee'}.
              </td></tr>
            )}
            {!loading && records.map(r => {
              const statusKey = r.status || 'not_marked'
              const statusColor = STATUS_COLORS[statusKey] || STATUS_COLORS.not_marked
              const entry = ENTRY_METHOD_LABEL[r.entryMethod]
              const markedBy = r.markedBy?.name || r.createdBy?.name || '—'
              return (
                <tr key={r._id}>
                  <td>{formatDate(r.date)}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: statusColor.bg,
                      color: statusColor.fg,
                      border: `1px solid ${statusColor.border}`,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'capitalize'
                    }}>{statusKey.replace('_', ' ')}</span>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{r.source || '—'}</td>
                  <td>{formatTime(r.timeIn)}</td>
                  <td>{formatTime(r.timeOut)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {(Number(r.regularHours) || 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {(Number(r.otHours) || 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(r.breakMinutes) || 0}m
                  </td>
                  <td title={entry?.label || r.entryMethod || ''}>
                    {entry ? `${entry.icon} ${entry.label}` : (r.entryMethod || '—')}
                  </td>
                  <td title={r.markedBy?.email || ''}>{markedBy}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={r.notes || ''}>
                    {r.notes || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--input)',
  color: 'var(--text)',
  fontSize: '0.9rem',
  minWidth: 160
}

function SummaryTile({ label, value, tint }) {
  return (
    <div style={{
      background: 'var(--input)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 12px'
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tint || 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}
