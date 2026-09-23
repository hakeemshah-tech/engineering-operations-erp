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

export default function SupplierBillFormPage() {
  const navigate = useNavigate()
  const { billId } = useParams()
  const isView = !!billId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [bill, setBill] = useState(null)
  const [pendingPOs, setPendingPOs] = useState([])
  const [selectedPoId, setSelectedPoId] = useState('')
  const [prefillContext, setPrefillContext] = useState(null)
  const [form, setForm] = useState({
    billNumber: '',
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    supplierId: '',
    supplierTRN: '',
    purchaseOrderId: '',
    grnNumber: '',
    projectId: '',
    vatPercentage: 5,
    lines: [],
    notes: ''
  })

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => {
    (async () => {
      try {
        if (isView) {
          const res = await api.get(`/api/accounts/supplier-bills/${billId}`)
          setBill(res.data)
        } else {
          const res = await api.get('/api/accounts/supplier-bills/pending-match')
          setPendingPOs(res.data || [])
        }
      } catch (err) {
        setNotify({ open: true, title: 'Error', message: 'Failed to load data.' })
      } finally {
        setLoading(false)
      }
    })()
  }, [billId])

  async function selectPO(poId) {
    setSelectedPoId(poId)
    if (!poId) {
      setPrefillContext(null)
      setForm(f => ({ ...f, purchaseOrderId: '', grnNumber: '', projectId: '', supplierId: '', lines: [] }))
      return
    }
    try {
      const res = await api.get(`/api/accounts/supplier-bills/prefill/${poId}`)
      const { po, prefilled } = res.data
      setPrefillContext(res.data)
      setForm(f => ({
        ...f,
        purchaseOrderId: prefilled.purchaseOrderId,
        supplierId: prefilled.supplierId || '',
        supplierTRN: prefilled.supplierTRN || '',
        grnNumber: prefilled.grnNumber || '',
        projectId: prefilled.projectId || '',
        vatPercentage: po.vatPercentage || 5,
        lines: (prefilled.lines || []).map(l => ({
          description: l.description,
          materialId: l.materialId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal
        }))
      }))
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'Failed to pre-fill from PO.' })
    }
  }

  const totals = useMemo(() => {
    const subtotal = (form.lines || []).reduce((s, l) => s + toNum(l.lineTotal || (toNum(l.quantity) * toNum(l.unitPrice))), 0)
    const vat = subtotal * (toNum(form.vatPercentage) / 100)
    return { subtotal, vat, total: subtotal + vat }
  }, [form.lines, form.vatPercentage])

  function updateLine(i, field, value) {
    setForm(f => {
      const lines = [...f.lines]
      const l = { ...lines[i], [field]: value }
      if (field === 'quantity' || field === 'unitPrice') {
        l.lineTotal = toNum(l.quantity) * toNum(l.unitPrice)
      }
      lines[i] = l
      return { ...f, lines }
    })
  }

  async function handleSubmit() {
    if (!form.billNumber.trim()) return setNotify({ open: true, title: 'Error', message: 'Bill number is required' })
    if (!form.supplierId) return setNotify({ open: true, title: 'Error', message: 'Supplier is required' })
    if (!form.lines || form.lines.length === 0) return setNotify({ open: true, title: 'Error', message: 'At least one line is required' })

    try {
      setSaving(true)
      const res = await api.post('/api/accounts/supplier-bills', form)
      const { matched, exceptions = [] } = res.data
      if (!matched && exceptions.length > 0) {
        const msg = 'Bill created as draft with ' + exceptions.length + ' variance(s):\n' + exceptions.map(e => '• ' + (e.message || e.kind)).join('\n')
        setNotify({ open: true, title: 'Variances detected', message: msg })
      } else {
        setNotify({ open: true, title: 'Matched', message: 'Bill created and 3-way matched. Ready to post.' })
      }
      setTimeout(() => navigate(`/accounts/bills/${res.data.bill._id}`), 800)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    if (!bill) return
    try {
      setSaving(true)
      await api.post(`/api/accounts/supplier-bills/${bill._id}/cancel`)
      setNotify({ open: true, title: 'Cancelled', message: 'Bill cancelled.' })
      setTimeout(() => navigate('/accounts/bills'), 500)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to cancel' })
    } finally {
      setSaving(false)
    }
  }

  async function downloadAndPost() {
    if (!bill) return
    try {
      setSaving(true)
      const res = await api.post(`/api/accounts/supplier-bills/${bill._id}/post-and-generate-xml`, {}, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `PV-${bill.billNumber}.xml`
      a.click()
      URL.revokeObjectURL(url)
      setNotify({ open: true, title: 'Downloaded', message: 'XML generated and journal posted.' })
      setTimeout(() => navigate('/accounts/bills'), 800)
    } catch (err) {
      let msg = 'Failed to post'
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text()
        try { msg = JSON.parse(text).message || msg } catch { msg = text.slice(0, 200) }
      } else {
        msg = err.response?.data?.message || msg
      }
      setNotify({ open: true, title: 'Error', message: msg })
    } finally {
      setSaving(false)
    }
  }

  async function resolveException(excId) {
    try {
      await api.post(`/api/accounts/supplier-bills/${bill._id}/exceptions/${excId}/resolve`, { note: 'Acknowledged' })
      const res = await api.get(`/api/accounts/supplier-bills/${bill._id}`)
      setBill(res.data)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to resolve' })
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    )
  }

  // View mode
  if (isView && bill) {
    const unresolved = (bill.matchExceptions || []).filter(e => !e.resolved)
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
          <button className="cancel-btn" onClick={() => navigate('/accounts/bills')}>← Back</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: 'var(--text)' }}>Bill {bill.billNumber}</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Status: <strong>{bill.status}</strong>
              {bill.journalEntry && ' · JE: ' + bill.journalEntry.entryNumber}
              {bill.journalEntry?.tallySyncStatus && ' · Sync: ' + bill.journalEntry.tallySyncStatus}
            </p>
          </div>
          {canManage && bill.status === 'matched' && (
            <button className="save-btn" onClick={downloadAndPost} disabled={saving}>
              {saving ? 'Posting...' : 'Post & Download XML'}
            </button>
          )}
          {canManage && (bill.status === 'draft' || bill.status === 'matched') && (
            <button className="cancel-btn" onClick={handleCancel} disabled={saving}>Cancel Bill</button>
          )}
        </div>

        {unresolved.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid #ef4444', borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 8px', color: '#ef4444' }}>⚠ {unresolved.length} match exception(s) blocking post</h3>
            {unresolved.map(e => (
              <div key={e._id} style={{ padding: '8px 0', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{e.kind}</strong>: expected {JSON.stringify(e.expected)}, got {JSON.stringify(e.actual)}
                  {e.variancePct !== undefined && ` (${amount(e.variancePct)}% off)`}
                </div>
                {canManage && (
                  <button className="link-btn" style={{ color: '#3b82f6', marginTop: 4 }} onClick={() => resolveException(e._id)}>Acknowledge & resolve</button>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div><strong>Supplier:</strong><br />{bill.supplierId?.name || '-'}<br /><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>TRN: {bill.supplierId?.trn || bill.supplierTRN || '-'}</span></div>
            <div><strong>PO:</strong><br />{bill.purchaseOrderId?.poNumber || '-'}<br /><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>GRN: {bill.grnNumber || '-'}</span></div>
            <div><strong>Bill Date:</strong><br />{new Date(bill.billDate).toLocaleDateString()}</div>
          </div>

          <h3 style={{ margin: '24px 0 12px', color: 'var(--text)' }}>Lines</h3>
          <table style={{ width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ padding: 8 }}>Description</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Qty</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Unit Price</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(bill.lines || []).map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: 8 }}>{l.description}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(l.quantity)}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(l.unitPrice)}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(l.lineTotal)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                <td style={{ padding: 8 }} colSpan={3}>Subtotal</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(bill.subtotal)}</td>
              </tr>
              <tr>
                <td style={{ padding: 8 }} colSpan={3}>VAT</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(bill.vatAmount)}</td>
              </tr>
              <tr style={{ fontWeight: 700, fontSize: 16 }}>
                <td style={{ padding: 8, color: 'var(--text)' }} colSpan={3}>Total</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: 'var(--text)' }}>AED {amount(bill.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {notify.open && (
          <div className="modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{notify.title}</h2>
                <button onClick={() => setNotify({ ...notify, open: false })} className="close-btn">×</button>
              </div>
              <div className="lead-form">
                <p style={{ whiteSpace: 'pre-line' }}>{notify.message}</p>
                <div className="form-actions">
                  <button type="button" className="save-btn" onClick={() => setNotify({ ...notify, open: false })}>OK</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Create mode
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <button className="cancel-btn" onClick={() => navigate('/accounts/bills')}>← Back</button>
        <h2 style={{ margin: 0, color: 'var(--text)', flex: 1 }}>Enter Supplier Bill</h2>
      </div>

      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
        <div className="form-group">
          <label>Purchase Order (with GRN) *</label>
          <select value={selectedPoId} onChange={e => selectPO(e.target.value)}>
            <option value="">Select an approved PO...</option>
            {pendingPOs.filter(p => !p.alreadyBilled).map(p => (
              <option key={p._id} value={p._id}>
                {p.poNumber} — {p.supplierId?.name || p.supplierSnapshot?.name || 'Supplier'} — GRN {p.grnNumber}
              </option>
            ))}
          </select>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 0' }}>
            {pendingPOs.length} POs with GRN available; {pendingPOs.filter(p => p.alreadyBilled).length} already billed.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label>Supplier's Bill Number *</label>
            <input type="text" value={form.billNumber} onChange={e => setForm({ ...form, billNumber: e.target.value })} placeholder="As printed on supplier's invoice" />
          </div>
          <div className="form-group">
            <label>Bill Date *</label>
            <input type="date" value={form.billDate} onChange={e => setForm({ ...form, billDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Due Date</label>
            <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>

        {prefillContext && (
          <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: 8, padding: 12, margin: '12px 0', fontSize: 13 }}>
            <strong>Pre-filled from PO {prefillContext.po.poNumber}:</strong>{' '}
            Supplier TRN {form.supplierTRN || '-'} · GRN {form.grnNumber || '-'} · VAT {form.vatPercentage}%
          </div>
        )}

        {form.lines.length > 0 && (
          <>
            <h3 style={{ margin: '24px 0 12px', color: 'var(--text)' }}>Lines (edit if supplier billed differently)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                    <th style={{ padding: 8 }}>Description</th>
                    <th style={{ padding: 8, textAlign: 'right', width: 120 }}>Qty</th>
                    <th style={{ padding: 8, textAlign: 'right', width: 140 }}>Unit Price</th>
                    <th style={{ padding: 8, textAlign: 'right', width: 140 }}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i}>
                      <td style={{ padding: 4 }}>
                        <input type="text" value={l.description || ''} onChange={e => updateLine(i, 'description', e.target.value)} style={{ width: '100%' }} />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input type="number" min="0" step="0.01" value={l.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} style={{ width: '100%', textAlign: 'right', fontFamily: 'monospace' }} />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input type="number" min="0" step="0.01" value={l.unitPrice} onChange={e => updateLine(i, 'unitPrice', e.target.value)} style={{ width: '100%', textAlign: 'right', fontFamily: 'monospace' }} />
                      </td>
                      <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>
                        {amount(l.lineTotal || (toNum(l.quantity) * toNum(l.unitPrice)))}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 600 }}>
                    <td style={{ padding: 8 }} colSpan={3}>Subtotal</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(totals.subtotal)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: 8 }} colSpan={3}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        VAT %:
                        <input type="number" min="0" max="100" step="0.01" value={form.vatPercentage} onChange={e => setForm({ ...form, vatPercentage: e.target.value })} style={{ width: 80 }} />
                      </label>
                    </td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{amount(totals.vat)}</td>
                  </tr>
                  <tr style={{ fontWeight: 700, fontSize: 16 }}>
                    <td style={{ padding: 8, color: 'var(--text)' }} colSpan={3}>Total Amount</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: 'var(--text)' }}>AED {amount(totals.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="form-group" style={{ marginTop: 16 }}>
          <label>Notes</label>
          <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="form-actions" style={{ marginTop: 24 }}>
          <button type="button" className="cancel-btn" onClick={() => navigate('/accounts/bills')} disabled={saving}>Cancel</button>
          <button type="button" className="save-btn" onClick={handleSubmit} disabled={saving || form.lines.length === 0}>
            {saving ? 'Saving...' : 'Save & Run 3-Way Match'}
          </button>
        </div>
      </div>

      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{notify.title}</h2>
              <button onClick={() => setNotify({ ...notify, open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ whiteSpace: 'pre-line' }}>{notify.message}</p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setNotify({ ...notify, open: false })}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
