import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function Badge({ status }) {
  const palette = {
    draft: ['rgba(107,114,128,0.1)', '#6b7280'],
    computed: ['rgba(245,158,11,0.1)', '#f59e0b'],
    approved: ['rgba(59,130,246,0.1)', '#3b82f6'],
    journalized: ['rgba(16,185,129,0.1)', '#10b981'],
    paid: ['rgba(168,85,247,0.1)', '#a855f7'],
    cancelled: ['rgba(156,163,175,0.1)', '#6b7280']
  }
  const [bg, color] = palette[status] || palette.draft
  return <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color, textTransform: 'uppercase' }}>{status}</span>
}

function amount(v) {
  if (!v) return '0.00'
  if (typeof v === 'object' && v.$numberDecimal !== undefined) return parseFloat(v.$numberDecimal).toFixed(2)
  return parseFloat(v).toFixed(2)
}

function alertSummary(alerts = []) {
  const counts = { critical: 0, warning: 0, info: 0 }
  alerts.forEach(a => counts[a.severity] !== undefined && counts[a.severity]++)
  if (counts.critical > 0) return { text: `${counts.critical} critical`, color: '#ef4444' }
  if (counts.warning > 0) return { text: `${counts.warning} warning`, color: '#f59e0b' }
  if (counts.info > 0) return { text: `${counts.info} info`, color: '#3b82f6' }
  return null
}

export default function SalaryPreparationManagement() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())
  const [showCompute, setShowCompute] = useState(false)
  const [computeYear, setComputeYear] = useState(new Date().getFullYear())
  const [computeMonth, setComputeMonth] = useState(new Date().getMonth() + 1)
  const [computing, setComputing] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => { fetch() }, [yearFilter])

  async function fetch() {
    try {
      setLoading(true)
      const res = await api.get(`/api/accounts/salary-runs?year=${yearFilter}`)
      setRuns(res.data.items || [])
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load salary runs.' })
    } finally {
      setLoading(false)
    }
  }

  async function compute() {
    try {
      setComputing(true)
      const res = await api.post('/api/accounts/salary-runs', { year: parseInt(computeYear, 10), month: parseInt(computeMonth, 10) })
      setNotify({ open: true, title: 'Computed', message: `${res.data.run.runNumber} computed. ${res.data.alertSummary.critical} critical, ${res.data.alertSummary.warning} warning alert(s).` })
      setShowCompute(false)
      setYearFilter(parseInt(computeYear, 10))
      setTimeout(() => navigate(`/accounts/salary-preparation/${res.data.run._id}`), 500)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Compute failed' })
    } finally {
      setComputing(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /><p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading salary runs...</p></div>
  }

  const years = []
  for (let y = new Date().getFullYear() + 1; y >= 2020; y--) years.push(y)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Salary Preparation</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Monthly cycle. Computed from Employee master + Attendance, checked against project labour budgets.
          </p>
        </div>
        {canManage && (
          <button className="save-btn" onClick={() => setShowCompute(true)}>+ Compute Monthly Run</button>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ color: 'var(--text-muted)', marginRight: 8 }}>Year:</label>
        <select value={yearFilter} onChange={e => setYearFilter(parseInt(e.target.value, 10))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {runs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--card)', borderRadius: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No Salary Runs for {yearFilter}</h3>
          <p style={{ color: 'var(--text-muted)' }}>Compute a monthly run to begin.</p>
        </div>
      ) : (
        <div className="table" style={{ background: 'var(--card)', borderRadius: 12, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Run #</th>
                <th>Period</th>
                <th>Employees</th>
                <th>Gross Pay</th>
                <th>OT</th>
                <th>Net Pay</th>
                <th>Alerts</th>
                <th>Status</th>
                <th>Journal</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => {
                const sum = alertSummary(r.budgetVarianceAlerts)
                return (
                  <tr key={r._id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{r.runNumber}</td>
                    <td>{MONTHS[r.period.month - 1]} {r.period.year}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.totals?.employeeCount || 0}</td>
                    <td style={{ fontFamily: 'monospace' }}>{amount(r.totals?.grossPay)}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{amount(r.totals?.otAmount)}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>{amount(r.totals?.netPay)}</td>
                    <td>{sum && <span style={{ color: sum.color, fontSize: 12, fontWeight: 600 }}>⚠ {sum.text}</span>}</td>
                    <td><Badge status={r.status} /></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.journalEntry ? r.journalEntry.entryNumber : '-'}
                    </td>
                    <td>
                      <button className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => navigate(`/accounts/salary-preparation/${r._id}`)}>Open</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCompute && (
        <div className="modal-overlay" onClick={() => setShowCompute(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>Compute Salary Run</h2>
              <button onClick={() => setShowCompute(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: 20 }}>
              <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                Pulls employees (status active/on-leave) and their attendance for the selected month.
                Re-running an existing non-approved run refreshes the numbers.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Month</label>
                  <select value={computeMonth} onChange={e => setComputeMonth(e.target.value)}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Year</label>
                  <select value={computeYear} onChange={e => setComputeYear(e.target.value)}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowCompute(false)} disabled={computing}>Cancel</button>
                <button type="button" className="save-btn" onClick={compute} disabled={computing}>
                  {computing ? 'Computing...' : 'Compute'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2>{notify.title}</h2><button onClick={() => setNotify({ ...notify, open: false })} className="close-btn">×</button></div>
            <div className="lead-form"><p>{notify.message}</p><div className="form-actions"><button type="button" className="save-btn" onClick={() => setNotify({ ...notify, open: false })}>OK</button></div></div>
          </div>
        </div>
      )}
    </div>
  )
}
