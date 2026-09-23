import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'object' && v.$numberDecimal !== undefined) return parseFloat(v.$numberDecimal)
  return parseFloat(v) || 0
}
function amount(v) { return toNum(v).toFixed(2) }

export default function SalaryRunDetail() {
  const navigate = useNavigate()
  const { runId } = useParams()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [ackModal, setAckModal] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canApprove = ['admin', 'manager'].some(r => roles.includes(r))
  const canManage = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => { load() }, [runId])

  async function load() {
    try {
      setLoading(true)
      const res = await api.get(`/api/accounts/salary-runs/${runId}`)
      setRun(res.data)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load run.' })
    } finally {
      setLoading(false)
    }
  }

  async function recompute() {
    try {
      setSaving(true)
      await api.post(`/api/accounts/salary-runs/${runId}/recompute`)
      await load()
      setNotify({ open: true, title: 'Recomputed', message: 'Fresh attendance and budget numbers loaded.' })
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  async function approve(acknowledge = false) {
    try {
      setSaving(true)
      const payload = acknowledge ? { acknowledgeCriticalAlerts: true } : {}
      await api.post(`/api/accounts/salary-runs/${runId}/approve`, payload)
      await load()
      setAckModal(false)
      setNotify({ open: true, title: 'Approved', message: 'Run approved. Ready to post & generate Tally XML.' })
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed'
      if (msg.includes('critical') && !acknowledge) {
        setAckModal(true)
      } else {
        setNotify({ open: true, title: 'Error', message: msg })
      }
    } finally {
      setSaving(false)
    }
  }

  async function postAndDownload() {
    try {
      setSaving(true)
      const res = await api.post(`/api/accounts/salary-runs/${runId}/post-and-generate-xml`, {}, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `JV-${run.runNumber}.xml`
      a.click()
      URL.revokeObjectURL(url)
      setNotify({ open: true, title: 'Posted', message: 'Journal voucher XML saved. Journal posted.' })
      setTimeout(() => navigate('/accounts/salary-preparation'), 800)
    } catch (err) {
      let msg = 'Failed'
      if (err.response?.data instanceof Blob) {
        const t = await err.response.data.text()
        try { msg = JSON.parse(t).message || msg } catch { msg = t.slice(0, 200) }
      } else {
        msg = err.response?.data?.message || msg
      }
      setNotify({ open: true, title: 'Error', message: msg })
    } finally {
      setSaving(false)
    }
  }

  async function cancel() {
    try {
      setSaving(true)
      await api.post(`/api/accounts/salary-runs/${runId}/cancel`)
      setNotify({ open: true, title: 'Cancelled', message: 'Run cancelled.' })
      setTimeout(() => navigate('/accounts/salary-preparation'), 500)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /><p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading...</p></div>
  }
  if (!run) return null

  const alerts = run.budgetVarianceAlerts || []
  const critical = alerts.filter(a => a.severity === 'critical')
  const warning = alerts.filter(a => a.severity === 'warning')
  const hasCriticalBlocking = critical.length > 0 && run.status === 'computed'

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <button className="cancel-btn" onClick={() => navigate('/accounts/salary-preparation')}>← Back</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>{run.runNumber}</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            {MONTHS[run.period.month - 1]} {run.period.year} · Status: <strong>{run.status}</strong>
            {run.journalEntry && ' · JE: ' + run.journalEntry.entryNumber}
            {run.journalEntry?.tallySyncStatus && ' · Sync: ' + run.journalEntry.tallySyncStatus}
          </p>
        </div>
        {canManage && run.status === 'computed' && (
          <button className="cancel-btn" onClick={recompute} disabled={saving}>Recompute</button>
        )}
        {canApprove && run.status === 'computed' && (
          <button className="save-btn" onClick={() => approve(false)} disabled={saving || hasCriticalBlocking}
            title={hasCriticalBlocking ? 'Acknowledge critical alerts first' : ''}>
            {saving ? '...' : 'Approve'}
          </button>
        )}
        {canManage && run.status === 'approved' && (
          <button className="save-btn" style={{ background: '#10b981' }} onClick={postAndDownload} disabled={saving}>
            {saving ? 'Posting...' : 'Post & Download XML'}
          </button>
        )}
        {canManage && ['computed', 'draft'].includes(run.status) && (
          <button className="cancel-btn" style={{ color: '#ef4444' }} onClick={cancel} disabled={saving}>Cancel</button>
        )}
      </div>

      {/* Blocking banner for critical alerts */}
      {hasCriticalBlocking && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '2px solid #ef4444', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 8px', color: '#ef4444' }}>⛔ Post blocked — {critical.length} critical variance alert(s)</h3>
          {critical.map((a, i) => (
            <div key={i} style={{ padding: '6px 0', fontSize: 13 }}>
              <strong>{a.kind}:</strong> {a.message}
            </div>
          ))}
          {canApprove && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              An Admin / Manager may approve anyway by acknowledging each alert. The alerts remain on record.
            </p>
          )}
        </div>
      )}

      {warning.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b', borderRadius: 8, padding: 12, marginBottom: 20 }}>
          <strong style={{ color: '#f59e0b' }}>⚠ {warning.length} warning(s)</strong>
          {warning.map((a, i) => (
            <div key={i} style={{ padding: '4px 0', fontSize: 13 }}>{a.message}</div>
          ))}
        </div>
      )}

      {/* Summary (what goes to Tally) */}
      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)' }}>Summary Journal Preview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <Stat label="Employees" value={run.totals?.employeeCount || 0} />
          <Stat label="Gross Pay (AED)" value={amount(run.totals?.grossPay)} emphasis />
          <Stat label="OT Amount" value={amount(run.totals?.otAmount)} />
          <Stat label="Deductions" value={amount(run.totals?.totalDeductions)} />
          <Stat label="Net Pay" value={amount(run.totals?.netPay)} emphasis />
        </div>
      </div>

      {/* Per-employee breakdown - collapsible */}
      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: 'var(--text)' }}>Per-Employee Breakdown ({run.lines?.length || 0})</h3>
          <button className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => setShowBreakdown(s => !s)}>
            {showBreakdown ? 'Hide' : 'Show'}
          </button>
        </div>
        {showBreakdown && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                  <th style={{ padding: 6 }}>Code</th>
                  <th style={{ padding: 6 }}>Name</th>
                  <th style={{ padding: 6 }}>Cat</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Days (P/A/L)</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Basic</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Allowances</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>OT</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Gross</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Net</th>
                  <th style={{ padding: 6 }}>Projects</th>
                </tr>
              </thead>
              <tbody>
                {(run.lines || []).map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 12 }}>{l.employeeCode}</td>
                    <td style={{ padding: 6, color: 'var(--text)' }}>{l.employeeName}</td>
                    <td style={{ padding: 6, color: 'var(--text-muted)', fontSize: 12 }}>{l.category}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{l.presentDays}/{l.absentDays}/{l.leaveDays}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontFamily: 'monospace' }}>{amount(l.basic)}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontFamily: 'monospace' }}>{amount(toNum(l.housing) + toNum(l.transport) + toNum(l.otherAllowances))}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontFamily: 'monospace' }}>{amount(l.otAmount)}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{amount(l.grossPay)}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{amount(l.netPay)}</td>
                    <td style={{ padding: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      {(l.projectAllocations || []).map(a => a.projectId?.name || 'Unassigned').join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Acknowledge-critical modal */}
      {ackModal && (
        <div className="modal-overlay" onClick={() => setAckModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2>Acknowledge Critical Alerts</h2>
              <button onClick={() => setAckModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ color: '#ef4444' }}><strong>{critical.length} project(s) exceeding labour budget:</strong></p>
              <ul style={{ fontSize: 13 }}>
                {critical.map((a, i) => <li key={i}>{a.message}</li>)}
              </ul>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Proceed with approval anyway? The alerts remain on record for audit.
              </p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setAckModal(false)} disabled={saving}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#ef4444' }} onClick={() => approve(true)} disabled={saving}>
                  {saving ? '...' : 'Acknowledge & Approve'}
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

function Stat({ label, value, emphasis }) {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: emphasis ? 22 : 18, fontWeight: emphasis ? 700 : 500, fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}
