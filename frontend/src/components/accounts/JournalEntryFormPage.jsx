import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

const VOUCHER_TYPES = ['PURCHASE', 'SALES', 'PAYMENT', 'RECEIPT', 'JOURNAL', 'CONTRA']

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'object' && v.$numberDecimal !== undefined) return parseFloat(v.$numberDecimal)
  return parseFloat(v) || 0
}

function newLine() {
  return { account: '', debit: '', credit: '', description: '' }
}

export default function JournalEntryFormPage() {
  const navigate = useNavigate()
  const { entryId } = useParams()
  const isViewMode = !!entryId

  const [entry, setEntry] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [form, setForm] = useState({
    voucherType: 'JOURNAL',
    entryDate: new Date().toISOString().slice(0, 10),
    narration: '',
    lines: [newLine(), newLine()]
  })

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canPost = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => {
    (async () => {
      try {
        const coaRes = await api.get('/api/accounts/chart-of-accounts?isActive=true')
        setAccounts(coaRes.data || [])
        if (isViewMode) {
          const entryRes = await api.get(`/api/accounts/journal-entries/${entryId}`)
          setEntry(entryRes.data)
          setForm({
            voucherType: entryRes.data.voucherType,
            entryDate: entryRes.data.entryDate?.slice(0, 10) || '',
            narration: entryRes.data.narration || '',
            lines: (entryRes.data.lines || []).map(l => ({
              _id: l._id,
              account: l.account?._id || l.account,
              debit: toNumber(l.debit) ? String(toNumber(l.debit)) : '',
              credit: toNumber(l.credit) ? String(toNumber(l.credit)) : '',
              description: l.description || ''
            }))
          })
        }
      } catch (err) {
        setNotify({ open: true, title: 'Error', message: 'Failed to load data.' })
      } finally {
        setLoading(false)
      }
    })()
  }, [entryId])

  const totals = useMemo(() => {
    const d = form.lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const c = form.lines.reduce((s, l) => s + toNumber(l.credit), 0)
    return { debit: d, credit: c, balanced: Math.round(d * 10000) === Math.round(c * 10000) }
  }, [form.lines])

  function updateLine(i, field, value) {
    setForm(f => {
      const lines = [...f.lines]
      lines[i] = { ...lines[i], [field]: value }
      // Prevent both debit and credit on the same line
      if (field === 'debit' && value) lines[i].credit = ''
      if (field === 'credit' && value) lines[i].debit = ''
      return { ...f, lines }
    })
  }

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, newLine()] }))
  }

  function removeLine(i) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  }

  async function handleSave(andPost = false) {
    if (form.lines.length < 2) {
      return setNotify({ open: true, title: 'Error', message: 'At least two lines are required.' })
    }
    for (const l of form.lines) {
      if (!l.account) return setNotify({ open: true, title: 'Error', message: 'Every line must select an account.' })
      const d = toNumber(l.debit), c = toNumber(l.credit)
      if (d === 0 && c === 0) return setNotify({ open: true, title: 'Error', message: 'Every line must have a debit or a credit.' })
      if (d > 0 && c > 0) return setNotify({ open: true, title: 'Error', message: 'A line cannot have both debit and credit.' })
    }
    if (!totals.balanced) {
      return setNotify({
        open: true, title: 'Unbalanced',
        message: `Debits (${totals.debit.toFixed(2)}) must equal credits (${totals.credit.toFixed(2)}).`
      })
    }

    try {
      setSaving(true)
      const payload = {
        voucherType: form.voucherType,
        entryDate: form.entryDate,
        narration: form.narration,
        lines: form.lines.map(l => ({
          account: l.account,
          debit: l.debit || '0',
          credit: l.credit || '0',
          description: l.description
        }))
      }
      const res = await api.post('/api/accounts/journal-entries', payload)
      if (andPost) {
        await api.post(`/api/accounts/journal-entries/${res.data._id}/post`)
      }
      setNotify({ open: true, title: 'Success', message: andPost ? 'Journal created and posted.' : 'Draft journal created.' })
      setTimeout(() => navigate('/accounts/journals'), 500)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function handlePostExisting() {
    try {
      setSaving(true)
      await api.post(`/api/accounts/journal-entries/${entryId}/post`)
      setNotify({ open: true, title: 'Success', message: 'Journal entry posted.' })
      const fresh = await api.get(`/api/accounts/journal-entries/${entryId}`)
      setEntry(fresh.data)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to post' })
    } finally {
      setSaving(false)
    }
  }

  async function handleReverseExisting() {
    try {
      setSaving(true)
      await api.post(`/api/accounts/journal-entries/${entryId}/reverse`)
      setNotify({ open: true, title: 'Success', message: 'Reversal entry created.' })
      setTimeout(() => navigate('/accounts/journals'), 500)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to reverse' })
    } finally {
      setSaving(false)
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

  const readOnly = isViewMode && entry && entry.status !== 'DRAFT'

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <button className="cancel-btn" onClick={() => navigate('/accounts/journals')}>← Back</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>
            {isViewMode ? `Journal ${entry?.entryNumber}` : 'New Manual Journal Entry'}
          </h2>
          {isViewMode && (
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Status: <strong>{entry?.status}</strong> · Tally Sync: <strong>{entry?.tallySyncStatus}</strong>
              {entry?.reversalOf && ' · This is a reversal entry'}
            </p>
          )}
        </div>
        {isViewMode && canPost && entry?.status === 'DRAFT' && (
          <button className="save-btn" onClick={handlePostExisting} disabled={saving}>Post Entry</button>
        )}
        {isViewMode && canPost && entry?.status === 'POSTED' && (
          <button className="save-btn" style={{ background: '#f59e0b' }} onClick={handleReverseExisting} disabled={saving}>Reverse</button>
        )}
      </div>

      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="form-group">
            <label>Voucher Type *</label>
            <select disabled={readOnly} value={form.voucherType} onChange={e => setForm({ ...form, voucherType: e.target.value })}>
              {VOUCHER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Entry Date *</label>
            <input disabled={readOnly} type="date" value={form.entryDate} onChange={e => setForm({ ...form, entryDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Entry Number</label>
            <input disabled value={entry?.entryNumber || 'Auto-generated on save'} />
          </div>
        </div>
        <div className="form-group">
          <label>Narration</label>
          <input disabled={readOnly} type="text" value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} placeholder="Describe the business reason for this entry" />
        </div>

        <div style={{ marginTop: 24, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, color: 'var(--text)' }}>Lines</h3>
          {!readOnly && (
            <button type="button" className="cancel-btn" onClick={addLine}>+ Add Line</button>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', background: 'var(--card)', borderRadius: 8 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ padding: 8, minWidth: 260 }}>Account</th>
                <th style={{ padding: 8, minWidth: 120 }}>Debit (AED)</th>
                <th style={{ padding: 8, minWidth: 120 }}>Credit (AED)</th>
                <th style={{ padding: 8 }}>Description</th>
                {!readOnly && <th style={{ padding: 8, width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: 4 }}>
                    <select disabled={readOnly} value={l.account} onChange={e => updateLine(i, 'account', e.target.value)} style={{ width: '100%' }}>
                      <option value="">Select account...</option>
                      {accounts.map(a => (
                        <option key={a._id} value={a._id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: 4 }}>
                    <input disabled={readOnly} type="number" min="0" step="0.01" value={l.debit} onChange={e => updateLine(i, 'debit', e.target.value)} placeholder="0.00" style={{ width: '100%', fontFamily: 'monospace', textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: 4 }}>
                    <input disabled={readOnly} type="number" min="0" step="0.01" value={l.credit} onChange={e => updateLine(i, 'credit', e.target.value)} placeholder="0.00" style={{ width: '100%', fontFamily: 'monospace', textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: 4 }}>
                    <input disabled={readOnly} type="text" value={l.description || ''} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Optional note" style={{ width: '100%' }} />
                  </td>
                  {!readOnly && (
                    <td style={{ padding: 4, textAlign: 'center' }}>
                      <button type="button" className="link-btn" style={{ color: '#ef4444' }} onClick={() => removeLine(i)} disabled={form.lines.length <= 2}>×</button>
                    </td>
                  )}
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                <td style={{ padding: 8, color: 'var(--text)' }}>Totals</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: 'var(--text)' }}>{totals.debit.toFixed(2)}</td>
                <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: 'var(--text)' }}>{totals.credit.toFixed(2)}</td>
                <td style={{ padding: 8 }}>
                  {totals.balanced ? (
                    <span style={{ color: '#10b981', fontSize: 12 }}>✓ Balanced</span>
                  ) : (
                    <span style={{ color: '#ef4444', fontSize: 12 }}>
                      Out of balance by {Math.abs(totals.debit - totals.credit).toFixed(2)}
                    </span>
                  )}
                </td>
                {!readOnly && <td></td>}
              </tr>
            </tbody>
          </table>
        </div>

        {!isViewMode && (
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="cancel-btn" onClick={() => navigate('/accounts/journals')} disabled={saving}>Cancel</button>
            <button type="button" className="save-btn" onClick={() => handleSave(false)} disabled={saving || !totals.balanced}>
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button type="button" className="save-btn" style={{ background: '#10b981' }} onClick={() => handleSave(true)} disabled={saving || !totals.balanced}>
              Save &amp; Post
            </button>
          </div>
        )}
      </div>

      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{notify.title}</h2>
              <button onClick={() => setNotify({ ...notify, open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>{notify.message}</p>
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
