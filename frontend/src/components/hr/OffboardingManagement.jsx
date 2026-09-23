import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import './hr.css'

const STATUS_COLUMNS = [
  {
    key: 'initiated',
    label: 'Initiated',
    hint: 'Notice running. Open a case here, then start clearance.'
  },
  {
    key: 'in_clearance',
    label: 'In Clearance',
    hint: 'Returning assets, calculating gratuity. Finalize once everything is done.'
  },
  {
    key: 'completed',
    label: 'Completed',
    hint: 'Exit processed. Employee account is deactivated.'
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    hint: 'Case closed before completion.'
  }
]

export default function OffboardingManagement() {
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    employee: '',
    exitType: 'resignation',
    noticePeriodDays: 30,
    noticeStartDate: new Date().toISOString().slice(0, 10),
    lastWorkingDate: '',
    reason: ''
  })
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  const load = async () => {
    try {
      setLoading(true)
      const res = await api.get('/api/offboarding')
      setCases(res.data || [])
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  const loadEmployees = async () => {
    const res = await api.get('/api/employees?status=active').catch(() => ({ data: [] }))
    setEmployees(res.data || [])
  }

  useEffect(() => { load(); loadEmployees() }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.employee) {
      setNotify({ open: true, title: 'Validation', message: 'Employee is required.' })
      return
    }
    try {
      await api.post('/api/offboarding', form)
      setShowForm(false)
      setForm({
        employee: '',
        exitType: 'resignation',
        noticePeriodDays: 30,
        noticeStartDate: new Date().toISOString().slice(0, 10),
        lastWorkingDate: '',
        reason: ''
      })
      load()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    }
  }

  const groupedCases = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.key] = cases.filter(c => c.status === col.key)
    return acc
  }, {})

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>Offboarding</h2>
          <p>Track resignations, terminations, clearances, and final settlements.</p>
        </div>
        <button className="hr-btn hr-btn-primary" onClick={() => setShowForm(true)}>+ Initiate Offboarding</button>
      </div>

      <div className="hr-card" style={{ background: 'var(--input)' }}>
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
          <strong>How the stages flow:</strong> Initiated → In Clearance → Completed.
          Open a case from <em>+ Initiate Offboarding</em>; press <em>Start Clearance</em> on the case detail once the employee begins handovers; calculate gratuity and tick every clearance item; then <em>Finalize</em> to close out. Finalising deactivates the user account and revokes any open session.
        </div>
      </div>

      {loading ? (
        <div className="hr-empty">Loading…</div>
      ) : (
        <div className="hr-pipeline">
          {STATUS_COLUMNS.map(col => (
            <div key={col.key} className="hr-pipeline-column">
              <h4 title={col.hint}>{col.label} ({groupedCases[col.key]?.length || 0})</h4>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{col.hint}</div>
              {(groupedCases[col.key] || []).length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>Empty</div>
              ) : (
                groupedCases[col.key].map(k => (
                  <div
                    key={k._id}
                    className="hr-pipeline-card"
                    onClick={() => navigate('/hr/offboarding-detail', { state: { offboardingId: k._id } })}
                  >
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>{k.employee?.fullName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {k.caseNumber} · {k.exitType.replace('_', ' ')}
                    </div>
                    {k.lastWorkingDate && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        LWD: {new Date(k.lastWorkingDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="hr-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3>Initiate Offboarding</h3>
            <form onSubmit={submit}>
              <div className="hr-form-row">
                <div className="hr-form-field" style={{ gridColumn: 'span 2' }}>
                  <label>Employee *</label>
                  <SearchableEmployeePicker
                    employees={employees}
                    value={form.employee}
                    onChange={(id) => setForm({ ...form, employee: id })}
                  />
                </div>
                <div className="hr-form-field">
                  <label>Exit Type</label>
                  <select value={form.exitType} onChange={e => setForm({ ...form, exitType: e.target.value })}>
                    <option value="resignation">Resignation</option>
                    <option value="termination">Termination</option>
                    <option value="end_of_contract">End of Contract</option>
                    <option value="retirement">Retirement</option>
                  </select>
                </div>
                <div className="hr-form-field">
                  <label>Notice Period (days)</label>
                  <input type="number" min="0" value={form.noticePeriodDays} onChange={e => setForm({ ...form, noticePeriodDays: e.target.value })} />
                </div>
                <div className="hr-form-field">
                  <label>Notice Start</label>
                  <input type="date" value={form.noticeStartDate} onChange={e => setForm({ ...form, noticeStartDate: e.target.value })} />
                </div>
                <div className="hr-form-field">
                  <label>Last Working Date</label>
                  <input type="date" value={form.lastWorkingDate} onChange={e => setForm({ ...form, lastWorkingDate: e.target.value })} />
                </div>
              </div>
              <div className="hr-form-field">
                <label>Reason</label>
                <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="hr-form-actions">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="hr-btn hr-btn-primary">Initiate</button>
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
    </div>
  )
}

/**
 * Inline searchable employee picker (single-select). Client-side filter
 * + pagination - fine for typical org sizes; the dropdown becomes
 * unusable around 30+ entries which is exactly when this picker helps.
 */
function SearchableEmployeePicker({ employees, value, onChange }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10
  const term = search.trim().toLowerCase()
  const filtered = term
    ? employees.filter(e =>
        (e.fullName || '').toLowerCase().includes(term) ||
        (e.employeeId || '').toLowerCase().includes(term))
    : employees
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const selectedDoc = employees.find(e => String(e._id) === String(value))
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', background: 'var(--input)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name or employee ID…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length} match</span>
      </div>
      {selectedDoc && (
        <div style={{ padding: '6px 10px', background: 'rgba(99,102,241,.06)', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          ✓ <strong>{selectedDoc.fullName}</strong>
          {selectedDoc.employeeId && <> · {selectedDoc.employeeId}</>}
          {selectedDoc.category && <> · {selectedDoc.category.replace(/_/g, ' ')}</>}
        </div>
      )}
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {pageItems.length === 0
          ? <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>No employees match.</div>
          : pageItems.map(e => {
            const on = String(value) === String(e._id)
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
                <input type="radio" checked={on} onChange={() => onChange(e._id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{e.fullName || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {e.employeeId || '—'}
                    {e.position && <> · {e.position}</>}
                    {e.department && <> · {e.department}</>}
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
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: safePage <= 1 ? 'transparent' : 'var(--card)', color: 'var(--text)', fontSize: 11, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}>‹ Prev</button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: safePage >= totalPages ? 'transparent' : 'var(--card)', color: 'var(--text)', fontSize: 11, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  )
}
