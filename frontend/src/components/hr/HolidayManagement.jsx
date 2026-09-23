import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '../../lib/api'
import { Modal } from '../../design-system/Modal'
import './hr.css'

const SCOPE_LABEL = { all: 'Everyone', office: 'Office only', site: 'Site only' }
const SCOPE_COLOR = {
  all:    { bg: 'rgba(99,102,241,.10)',  br: 'rgba(99,102,241,.40)' },
  office: { bg: 'rgba(56,189,248,.10)',  br: 'rgba(56,189,248,.40)' },
  site:   { bg: 'rgba(34,197,94,.10)',   br: 'rgba(34,197,94,.40)' }
}

function formatDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function toDateInput(v) {
  if (!v) return ''
  try {
    const d = new Date(v)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  } catch { return '' }
}

export default function HolidayManagement() {
  const [holidays, setHolidays] = useState([])
  const [presets, setPresets] = useState([])
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importKey, setImportKey] = useState('')
  const [importOverwrite, setImportOverwrite] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/holidays', { params: { year } })
      setHolidays(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load holidays.')
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    api.get('/api/holidays/presets').then(res => {
      setPresets(Array.isArray(res.data) ? res.data : [])
    }).catch(() => setPresets([]))
  }, [])

  const grouped = useMemo(() => {
    const byMonth = new Map()
    for (const h of holidays) {
      const d = new Date(h.date)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
      if (!byMonth.has(key)) byMonth.set(key, { label, items: [] })
      byMonth.get(key).items.push(h)
    }
    return Array.from(byMonth.values())
  }, [holidays])

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (h) => { setEditing(h); setFormOpen(true) }
  const closeForm = () => { setFormOpen(false); setEditing(null) }

  const onSaved = async () => {
    closeForm()
    await reload()
  }

  const askDelete = (h) => setConfirmDelete(h)
  const cancelDelete = () => setConfirmDelete(null)
  const doDelete = async () => {
    if (!confirmDelete) return
    try {
      await api.delete(`/api/holidays/${confirmDelete._id}`)
      setConfirmDelete(null)
      await reload()
    } catch (err) {
      setConfirmDelete(null)
      setNotify({ open: true, title: 'Delete failed', message: err?.response?.data?.message || 'Could not delete.' })
    }
  }

  const runImport = async () => {
    if (!importKey) return
    setImportBusy(true)
    setImportResult(null)
    try {
      const res = await api.post('/api/holidays/import-preset', { key: importKey, overwriteExisting: importOverwrite })
      setImportResult(res.data)
      await reload()
    } catch (err) {
      setImportResult({ error: err?.response?.data?.message || 'Import failed.' })
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>Holidays</h2>
          <p>Mark public, office, or site-only holidays. The auto-status engine treats marked dates as paid days off (when enabled in Settings) and blocks GPS punch on those dates.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)'
            }}
          >
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="hr-btn hr-btn-secondary" onClick={() => setImportOpen(true)}>
            ⬆ Import yearly preset
          </button>
          <button className="hr-btn hr-btn-primary" onClick={openCreate}>
            + Add holiday
          </button>
        </div>
      </div>

      {error && (
        <div className="hr-card" style={{ borderColor: 'rgba(239,68,68,.40)', color: 'var(--text)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="hr-empty">Loading…</div>
      ) : holidays.length === 0 ? (
        <div className="hr-empty">
          No holidays for {year} yet. Use <strong>+ Add holiday</strong> for one-off entries or
          <strong> Import yearly preset</strong> to load a year of national holidays in one click.
        </div>
      ) : (
        grouped.map(g => (
          <div className="hr-card" key={g.label} style={{ marginBottom: 14 }}>
            <div className="hr-section-header">{g.label}</div>
            <table className="hr-table">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Date</th>
                  <th>Name</th>
                  <th style={{ width: 130 }}>Scope</th>
                  <th style={{ width: 100 }}>Paid</th>
                  <th style={{ width: 110 }}>Recurring</th>
                  <th style={{ width: 120 }}>Source</th>
                  <th style={{ width: 130 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map(h => {
                  const sc = SCOPE_COLOR[h.scope] || SCOPE_COLOR.all
                  return (
                    <tr key={h._id}>
                      <td>{formatDate(h.date)}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{h.name}</div>
                        {h.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.notes}</div>}
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: sc.bg,
                          border: `1px solid ${sc.br}`,
                          fontSize: 11,
                          fontWeight: 600
                        }}>{SCOPE_LABEL[h.scope] || h.scope}</span>
                      </td>
                      <td>{h.paid ? '✓' : '—'}</td>
                      <td>{h.recurringYearly ? '🔁 Yearly' : '—'}</td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {h.source === 'preset' ? `Preset · ${h.presetKey || ''}` : 'Manual'}
                        </span>
                      </td>
                      <td>
                        <div className="hr-table-actions">
                          <button className="hr-btn hr-btn-secondary" onClick={() => openEdit(h)}>Edit</button>
                          <button className="hr-btn hr-btn-danger" onClick={() => askDelete(h)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))
      )}

      <HolidayFormModal
        isOpen={formOpen}
        initial={editing}
        onClose={closeForm}
        onSaved={onSaved}
        onError={(msg) => setNotify({ open: true, title: 'Save failed', message: msg })}
      />

      <Modal
        isOpen={importOpen}
        onClose={() => { setImportOpen(false); setImportResult(null); setImportKey('') }}
        title="Import yearly holiday preset"
        size="small"
      >
        <div style={{ padding: '4px 4px' }}>
          {presets.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No presets available. Add JSON files to <code>server/data/holidayPresets/</code>.
            </div>
          ) : (
            <>
              <div className="hr-form-row">
                <div className="hr-form-field" style={{ flex: 1 }}>
                  <label>Preset</label>
                  <select value={importKey} onChange={e => setImportKey(e.target.value)}>
                    <option value="">— Select —</option>
                    {presets.map(p => (
                      <option key={p.key} value={p.key}>{p.label} ({p.count} entries)</option>
                    ))}
                  </select>
                </div>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={importOverwrite}
                  onChange={e => setImportOverwrite(e.target.checked)}
                />
                Overwrite existing entries with matching date + name + scope
              </label>
              {importResult && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: importResult.error ? 'rgba(239,68,68,.10)' : 'rgba(34,197,94,.10)',
                  border: `1px solid ${importResult.error ? 'rgba(239,68,68,.40)' : 'rgba(34,197,94,.40)'}`,
                  color: 'var(--text)',
                  fontSize: 13,
                  marginBottom: 12
                }}>
                  {importResult.error
                    ? importResult.error
                    : `Imported · created ${importResult.created} · updated ${importResult.updated} · skipped ${importResult.skipped}`}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  className="hr-btn hr-btn-secondary"
                  onClick={() => { setImportOpen(false); setImportResult(null); setImportKey('') }}
                  disabled={importBusy}
                >Close</button>
                <button
                  className="hr-btn hr-btn-primary"
                  onClick={runImport}
                  disabled={importBusy || !importKey}
                >
                  {importBusy ? 'Importing…' : 'Import'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!confirmDelete}
        onClose={cancelDelete}
        title="Delete holiday?"
        size="small"
      >
        <div style={{ padding: '8px 4px' }}>
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            Delete <strong>{confirmDelete?.name}</strong> on {formatDate(confirmDelete?.date)}?
            Attendance rows already marked as 'holiday' for past dates are NOT reverted automatically.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="hr-btn hr-btn-secondary" onClick={cancelDelete}>Cancel</button>
            <button className="hr-btn hr-btn-danger" onClick={doDelete}>Delete</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={notify.open}
        onClose={() => setNotify({ open: false, title: '', message: '' })}
        title={notify.title}
        size="small"
      >
        <div style={{ padding: '8px 4px' }}>
          <p style={{ fontSize: 14 }}>{notify.message}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="hr-btn hr-btn-primary" onClick={() => setNotify({ open: false, title: '', message: '' })}>OK</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function HolidayFormModal({ isOpen, initial, onClose, onSaved, onError }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [scope, setScope] = useState('all')
  const [recurringYearly, setRecurring] = useState(false)
  const [paid, setPaid] = useState(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setSaving(false); setErr('')
    if (initial) {
      setName(initial.name || '')
      setDate(toDateInput(initial.date))
      setScope(initial.scope || 'all')
      setRecurring(!!initial.recurringYearly)
      setPaid(initial.paid !== false)
      setNotes(initial.notes || '')
    } else {
      setName(''); setDate(''); setScope('all')
      setRecurring(false); setPaid(true); setNotes('')
    }
  }, [isOpen, initial])

  const submit = async () => {
    if (!name.trim()) { setErr('Name is required.'); return }
    if (!date)        { setErr('Date is required.'); return }
    setSaving(true); setErr('')
    try {
      const payload = { name: name.trim(), date, scope, recurringYearly, paid, notes: notes.trim() || undefined }
      if (initial?._id) {
        await api.put(`/api/holidays/${initial._id}`, payload)
      } else {
        await api.post('/api/holidays', payload)
      }
      onSaved && onSaved()
    } catch (e) {
      const msg = e?.response?.data?.message || 'Save failed.'
      setErr(msg)
      onError && onError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial ? 'Edit holiday' : 'Add holiday'} size="small">
      <div style={{ padding: '4px 4px' }}>
        <div className="hr-form-row">
          <div className="hr-form-field" style={{ flex: 1 }}>
            <label>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. UAE National Day" />
          </div>
        </div>
        <div className="hr-form-row">
          <div className="hr-form-field" style={{ flex: 1 }}>
            <label>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="hr-form-field" style={{ flex: 1 }}>
            <label>Applies to</label>
            <select value={scope} onChange={e => setScope(e.target.value)}>
              <option value="all">Everyone</option>
              <option value="office">Office employees only</option>
              <option value="site">Site workers only</option>
            </select>
          </div>
        </div>
        <div className="hr-form-row">
          <div className="hr-form-field" style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={recurringYearly} onChange={e => setRecurring(e.target.checked)} />
              Repeats every year on this date
            </label>
          </div>
          <div className="hr-form-field" style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />
              Paid
            </label>
          </div>
        </div>
        <div className="hr-form-row">
          <div className="hr-form-field" style={{ flex: 1 }}>
            <label>Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder='e.g. "Subject to moon sighting"' />
          </div>
        </div>
        {err && (
          <div style={{
            margin: '8px 0',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(239,68,68,.10)',
            border: '1px solid rgba(239,68,68,.40)',
            color: 'var(--text)',
            fontSize: 13
          }}>{err}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <button className="hr-btn hr-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="hr-btn hr-btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
