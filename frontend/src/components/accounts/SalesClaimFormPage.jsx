import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'object' && v.$numberDecimal !== undefined) return parseFloat(v.$numberDecimal)
  return parseFloat(v) || 0
}
function amount(v) { return toNum(v).toFixed(2) }

export default function SalesClaimFormPage() {
  const navigate = useNavigate()
  const { claimId } = useParams()
  const isView = !!claimId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [claim, setClaim] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [form, setForm] = useState({
    projectId: '',
    claimPeriod: {
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10)
    },
    claimDate: new Date().toISOString().slice(0, 10),
    percentComplete: '',
    vatRate: 5,
    retentionEnabled: false,
    retentionRate: 10,
    customerTRN: '',
    notes: '',
    lines: [{ description: '', milestoneRef: '', amount: '' }]
  })

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canApprove = ['admin', 'manager'].some(r => roles.includes(r))
  const canManage = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => {
    (async () => {
      try {
        if (isView) {
          const res = await api.get(`/api/accounts/sales-claims/${claimId}`)
          setClaim(res.data)
        } else {
          const res = await api.get('/api/accounts/sales-claims/eligible-projects')
          setProjects(res.data || [])
        }
      } catch (err) {
        setNotify({ open: true, title: 'Error', message: 'Failed to load data.' })
      } finally {
        setLoading(false)
      }
    })()
  }, [claimId])

  function selectProject(id) {
    const p = projects.find(x => x._id === id)
    setSelectedProject(p || null)
    setForm(f => ({ ...f, projectId: id }))
  }

  const totals = useMemo(() => {
    const gross = (form.lines || []).reduce((s, l) => s + toNum(l.amount), 0)
    const vat = gross * (toNum(form.vatRate) / 100)
    const total = gross + vat
    const retention = form.retentionEnabled ? gross * (toNum(form.retentionRate) / 100) : 0
    const net = total - retention
    return { gross, vat, total, retention, net }
  }, [form.lines, form.vatRate, form.retentionEnabled, form.retentionRate])

  function updateLine(i, field, value) {
    setForm(f => {
      const lines = [...f.lines]
      lines[i] = { ...lines[i], [field]: value }
      return { ...f, lines }
    })
  }
  function addLine() { setForm(f => ({ ...f, lines: [...f.lines, { description: '', milestoneRef: '', amount: '' }] })) }
  function removeLine(i) { setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) })) }

  async function handleSubmit() {
    if (!form.projectId) return setNotify({ open: true, title: 'Error', message: 'Project is required' })
    if (!form.lines || form.lines.length === 0) return setNotify({ open: true, title: 'Error', message: 'At least one line is required' })
    for (const l of form.lines) {
      if (!l.description?.trim()) return setNotify({ open: true, title: 'Error', message: 'Each line needs a description' })
      if (toNum(l.amount) <= 0) return setNotify({ open: true, title: 'Error', message: 'Each line needs a positive amount' })
    }

    try {
      setSaving(true)
      const payload = {
        projectId: form.projectId,
        claimPeriod: form.claimPeriod,
        claimDate: form.claimDate,
        percentComplete: toNum(form.percentComplete),
        vatRate: toNum(form.vatRate),
        retentionRate: form.retentionEnabled ? toNum(form.retentionRate) : 0,
        customerTRN: form.customerTRN,
        notes: form.notes,
        lines: form.lines.map(l => ({
          description: l.description,
          milestoneRef: l.milestoneRef,
          amount: toNum(l.amount)
        }))
      }
      const res = await api.post('/api/accounts/sales-claims', payload)
      setNotify({ open: true, title: 'Created', message: `Draft ${res.data.claimNumber} created.` })
      setTimeout(() => navigate(`/accounts/claims/${res.data._id}`), 500)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  async function approve() {
    try {
      setSaving(true)
      await api.post(`/api/accounts/sales-claims/${claimId}/approve`)
      const res = await api.get(`/api/accounts/sales-claims/${claimId}`)
      setClaim(res.data)
      setNotify({ open: true, title: 'Approved', message: 'Claim approved. Ready to invoice.' })
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  async function invoiceAndDownload() {
    try {
      setSaving(true)
      const res = await api.post(`/api/accounts/sales-claims/${claimId}/invoice-and-generate-xml`, {}, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `SV-${claim.claimNumber}.xml`
      a.click()
      URL.revokeObjectURL(url)
      setNotify({ open: true, title: 'Posted', message: 'Sales voucher XML saved. Journal posted.' })
      setTimeout(() => navigate('/accounts/claims'), 800)
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
      await api.post(`/api/accounts/sales-claims/${claimId}/cancel`)
      setNotify({ open: true, title: 'Cancelled', message: 'Claim cancelled.' })
      setTimeout(() => navigate('/accounts/claims'), 500)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /><p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading...</p></div>
  }

  // VIEW MODE
  if (isView && claim) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
          <button className="cancel-btn" onClick={() => navigate('/accounts/claims')}>← Back</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: 'var(--text)' }}>{claim.claimNumber}</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Status: <strong>{claim.status}</strong>
              {claim.journalEntry && ' · JE: ' + claim.journalEntry.entryNumber}
              {claim.journalEntry?.tallySyncStatus && ' · Sync: ' + claim.journalEntry.tallySyncStatus}
            </p>
          </div>
          {canApprove && claim.status === 'draft' && (
            <button className="save-btn" onClick={approve} disabled={saving}>Approve</button>
          )}
          {canManage && claim.status === 'approved' && (
            <button className="save-btn" style={{ background: '#10b981' }} onClick={invoiceAndDownload} disabled={saving}>
              {saving ? 'Posting...' : 'Invoice & Download XML'}
            </button>
          )}
          {canManage && (claim.status === 'draft' || claim.status === 'approved') && (
            <button className="cancel-btn" onClick={cancel} disabled={saving}>Cancel</button>
          )}
        </div>

        <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div><strong>Project:</strong><br />{claim.projectId?.name || '-'}</div>
            <div><strong>Customer:</strong><br />{claim.customerName || '-'}<br /><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>TRN: {claim.customerTRN || '-'}</span></div>
            <div><strong>Period:</strong><br />{new Date(claim.claimPeriod.from).toLocaleDateString()} – {new Date(claim.claimPeriod.to).toLocaleDateString()}<br /><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>% complete: {amount(claim.percentComplete)}%</span></div>
          </div>

          <h3 style={{ margin: '24px 0 12px', color: 'var(--text)' }}>Lines</h3>
          <table style={{ width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ padding: 8 }}>Description</th>
                <th style={{ padding: 8 }}>Milestone</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(claim.lines || []).map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: 8 }}>{l.description}</td>
                  <td style={{ padding: 8, color: 'var(--text-muted)' }}>{l.milestoneRef || '-'}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(l.amount)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                <td colSpan={2} style={{ padding: 8 }}>Gross</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(claim.grossAmount)}</td>
              </tr>
              <tr>
                <td colSpan={2} style={{ padding: 8 }}>VAT</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(claim.vatAmount)}</td>
              </tr>
              {toNum(claim.retention) > 0 && (
                <tr>
                  <td colSpan={2} style={{ padding: 8 }}>Retention ({amount(claim.retentionRate)}%)</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: '#ef4444' }}>-{amount(claim.retention)}</td>
                </tr>
              )}
              <tr style={{ fontWeight: 700, fontSize: 16 }}>
                <td colSpan={2} style={{ padding: 8, color: 'var(--text)' }}>Net Invoice (Customer owes now)</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: 'var(--text)' }}>AED {amount(claim.netInvoiceAmount)}</td>
              </tr>
            </tbody>
          </table>

          {claim.notes && <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: 13 }}><strong>Notes:</strong> {claim.notes}</p>}
        </div>

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

  // CREATE MODE
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <button className="cancel-btn" onClick={() => navigate('/accounts/claims')}>← Back</button>
        <h2 style={{ margin: 0, color: 'var(--text)', flex: 1 }}>New Sales Claim</h2>
      </div>

      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
        <div className="form-group">
          <label>Project *</label>
          <select value={form.projectId} onChange={e => selectProject(e.target.value)}>
            <option value="">Select a project...</option>
            {projects.map(p => (
              <option key={p._id} value={p._id}>
                {p.name} — {p.customerName || 'Unknown customer'}{p.priorClaimCount > 0 ? ` (${p.priorClaimCount} prior claim${p.priorClaimCount > 1 ? 's' : ''})` : ''}
              </option>
            ))}
          </select>
          {selectedProject && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 0' }}>
              Customer: <strong>{selectedProject.customerName || '-'}</strong>
              {selectedProject.budget && ` · Budget: AED ${Number(selectedProject.budget).toLocaleString()}`}
              {selectedProject.priorClaimed > 0 && ` · Previously claimed: AED ${Number(selectedProject.priorClaimed).toLocaleString()}`}
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label>Period Start *</label>
            <input type="date" value={form.claimPeriod.from} onChange={e => setForm({ ...form, claimPeriod: { ...form.claimPeriod, from: e.target.value } })} />
          </div>
          <div className="form-group">
            <label>Period End *</label>
            <input type="date" value={form.claimPeriod.to} onChange={e => setForm({ ...form, claimPeriod: { ...form.claimPeriod, to: e.target.value } })} />
          </div>
          <div className="form-group">
            <label>Claim Date</label>
            <input type="date" value={form.claimDate} onChange={e => setForm({ ...form, claimDate: e.target.value })} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label>% Complete</label>
            <input type="number" min="0" max="100" step="0.01" value={form.percentComplete} onChange={e => setForm({ ...form, percentComplete: e.target.value })} placeholder="25" />
          </div>
          <div className="form-group">
            <label>VAT Rate (%)</label>
            <input type="number" min="0" max="100" step="0.01" value={form.vatRate} onChange={e => setForm({ ...form, vatRate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Customer TRN</label>
            <input type="text" value={form.customerTRN} onChange={e => setForm({ ...form, customerTRN: e.target.value })} placeholder="15-digit TRN" />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'rgba(59,130,246,0.06)', borderRadius: 8, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 500 }}>
            <input type="checkbox" checked={form.retentionEnabled} onChange={e => setForm({ ...form, retentionEnabled: e.target.checked })} />
            Apply retention (split debtors → Retention Receivable)
          </label>
          {form.retentionEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label>Rate (%):</label>
              <input type="number" min="0" max="100" step="0.01" value={form.retentionRate} onChange={e => setForm({ ...form, retentionRate: e.target.value })} style={{ width: 80 }} />
            </div>
          )}
        </div>

        <h3 style={{ margin: '24px 0 12px', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Line Items
          <button type="button" className="cancel-btn" onClick={addLine}>+ Add Line</button>
        </h3>

        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
              <th style={{ padding: 8, minWidth: 240 }}>Description *</th>
              <th style={{ padding: 8, width: 160 }}>Milestone</th>
              <th style={{ padding: 8, width: 160, textAlign: 'right' }}>Amount *</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {form.lines.map((l, i) => (
              <tr key={i}>
                <td style={{ padding: 4 }}>
                  <input type="text" value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} style={{ width: '100%' }} placeholder="e.g. Milestone 1 — Site mobilisation" />
                </td>
                <td style={{ padding: 4 }}>
                  <input type="text" value={l.milestoneRef} onChange={e => updateLine(i, 'milestoneRef', e.target.value)} style={{ width: '100%' }} placeholder="Optional" />
                </td>
                <td style={{ padding: 4 }}>
                  <input type="number" min="0" step="0.01" value={l.amount} onChange={e => updateLine(i, 'amount', e.target.value)} style={{ width: '100%', textAlign: 'right', fontFamily: 'monospace' }} placeholder="0.00" />
                </td>
                <td style={{ padding: 4, textAlign: 'center' }}>
                  <button type="button" className="link-btn" style={{ color: '#ef4444' }} onClick={() => removeLine(i)} disabled={form.lines.length <= 1}>×</button>
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
              <td colSpan={2} style={{ padding: 8 }}>Gross</td>
              <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(totals.gross)}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={2} style={{ padding: 8 }}>VAT ({form.vatRate}%)</td>
              <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(totals.vat)}</td>
              <td></td>
            </tr>
            {form.retentionEnabled && (
              <tr>
                <td colSpan={2} style={{ padding: 8 }}>Retention ({form.retentionRate}% held back)</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: '#ef4444' }}>-{amount(totals.retention)}</td>
                <td></td>
              </tr>
            )}
            <tr style={{ fontWeight: 700, fontSize: 16 }}>
              <td colSpan={2} style={{ padding: 8, color: 'var(--text)' }}>Net Invoice (customer owes now)</td>
              <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: 'var(--text)' }}>AED {amount(totals.net)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label>Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="form-actions" style={{ marginTop: 24 }}>
          <button type="button" className="cancel-btn" onClick={() => navigate('/accounts/claims')} disabled={saving}>Cancel</button>
          <button type="button" className="save-btn" onClick={handleSubmit} disabled={saving || !form.projectId}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>

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
