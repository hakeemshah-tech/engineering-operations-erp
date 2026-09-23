import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'
import AccountHeadSelect from './AccountHeadSelect'
import TallyExportSummaryModal from './TallyExportSummaryModal'

const GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity', 'Uncategorized']

// PO types the Account Manager can map to a default expense ledger. Keys must
// match the PurchaseOrder.poType enum exactly.
const PO_TYPE_OPTIONS = [
  { key: 'material', label: 'Material / Product' },
  { key: 'manpower', label: 'Manpower Hiring' },
  { key: 'subcontracting', label: 'Subcontracting' },
  { key: 'machine_rental', label: 'Machine Rental' },
  { key: 'other', label: 'Other Services / Products' }
]
const emptyPoMap = { material: '', manpower: '', subcontracting: '', machine_rental: '', other: '' }

const emptyForm = {
  code: '',
  name: '',
  group: 'Expenses',
  subGroup: '',
  vatApplicable: false,
  vatRate: '0',
  currency: 'AED',
  description: '',
  isActive: true,
  tags: []
}

// Lightweight chip-style multi-value input for ERP-only ledger tags. Type and
// press Enter or comma to add; click × (or Backspace on an empty box) to remove.
function TagsInput({ value = [], onChange }) {
  const [text, setText] = useState('')
  const tags = Array.isArray(value) ? value : []
  const add = (raw) => {
    const t = String(raw || '').trim()
    if (t && !tags.some(x => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t])
    setText('')
  }
  const removeAt = (i) => onChange(tags.filter((_, idx) => idx !== i))
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', background: 'var(--card)' }}>
      {tags.map((t, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}>
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => removeAt(i)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text) }
          else if (e.key === 'Backspace' && !text && tags.length) removeAt(tags.length - 1)
        }}
        onBlur={() => add(text)}
        placeholder={tags.length ? 'Add tag…' : 'e.g. Steel, Plumbing'}
        style={{ flex: 1, minWidth: 110, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13 }}
      />
    </div>
  )
}

export default function ChartOfAccountsManagement() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  // Minimal display: hide deactivated (non-operational) accounts by default.
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  // When editing a GUID-mapped (reconciled) ledger, its Tally ledger name is
  // locked to that pre-existing Tally ledger. We keep the mapped name to render a
  // read-only field; the ERP code/name stay fully editable in every state.
  const [editSync, setEditSync] = useState({ guidMapped: false, tallyName: '' })
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // PO type → expense ledger mapping
  const [showMapModal, setShowMapModal] = useState(false)
  const [poMap, setPoMap] = useState({ ...emptyPoMap })
  const [mapSaving, setMapSaving] = useState(false)

  // Sub-Groups (Tally-owned) - power the cascading dropdown. Ingested via XML sync.
  const [accountGroups, setAccountGroups] = useState([])

  // Pre-export summary modal
  const [showExportModal, setShowExportModal] = useState(false)
  // Top-level bird's-eye counts
  const [stats, setStats] = useState(null)

  const fetchSeq = useRef(0)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  // Debounced fetch on search / filter change. Keeps the search input mounted
  // (the full-page spinner only shows on the very first load) so it never loses
  // focus while typing.
  useEffect(() => {
    const t = setTimeout(() => { fetchAccounts() }, 300)
    return () => clearTimeout(t)
  }, [search, groupFilter, showInactive])

  async function fetchAccounts() {
    const seq = ++fetchSeq.current
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search.trim()) params.append('search', search.trim())
      if (groupFilter !== 'all') params.append('group', groupFilter)
      // Default view = operational only. Deactivated (pure-accounting) rows are
      // hidden unless the user opts to see them.
      if (!showInactive) params.append('isActive', 'true')
      const res = await api.get(`/api/accounts/chart-of-accounts?${params}`)
      if (seq !== fetchSeq.current) return // a newer request superseded this one
      setAccounts(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      if (seq === fetchSeq.current) setNotify({ open: true, title: 'Error', message: 'Failed to load accounts.' })
    } finally {
      if (seq === fetchSeq.current) { setLoading(false); setInitialLoad(false) }
    }
  }

  useEffect(() => { fetchAccountGroups(); fetchStats() }, [])

  async function fetchStats() {
    try {
      const res = await api.get('/api/accounts/chart-of-accounts/stats')
      setStats(res.data)
    } catch { /* stats are best-effort */ }
  }

  async function fetchAccountGroups() {
    try {
      const res = await api.get('/api/accounts/account-groups')
      setAccountGroups(Array.isArray(res.data) ? res.data : [])
    } catch { /* dropdown will just be empty until retry */ }
  }

  async function openMapModal() {
    try {
      const res = await api.get('/api/system-settings')
      const map = res.data?.accounts?.poTypeAccountMap || {}
      setPoMap({ ...emptyPoMap, ...map })
      setShowMapModal(true)
    } catch {
      // Don't open with a blank form on a load failure - saving it would wipe
      // any existing (but unseen) mapping with empty values.
      setNotify({ open: true, title: 'Error', message: 'Could not load the existing mapping. Please try again.' })
    }
  }

  async function handleSaveMap() {
    try {
      setMapSaving(true)
      await api.put('/api/system-settings', { accounts: { poTypeAccountMap: poMap } })
      setShowMapModal(false)
      setNotify({ open: true, title: 'Success', message: 'PO type → account mapping saved.' })
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to save mapping.' })
    } finally {
      setMapSaving(false)
    }
  }

  function openCreate() {
    setEditingId(null)
    setEditSync({ guidMapped: false, tallyName: '' })
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  function openEdit(a) {
    setEditingId(a._id)
    // State B (Synced) when a GUID is present - the Tally ledger name is locked to
    // a reconciled Tally ledger. State A otherwise - the Tally name is generated
    // from code + name. The ERP code/name remain editable in both states.
    setEditSync({ guidMapped: !!a.tallyGuid, tallyName: a.tallyLedgerName || '' })
    setForm({
      code: a.code || '',
      name: a.name || '',
      group: a.group || 'Expenses',
      subGroup: a.subGroup || '',
      vatApplicable: !!a.vatApplicable,
      vatRate: a.vatRate?.$numberDecimal || a.vatRate || '0',
      currency: a.currency || 'AED',
      description: a.description || '',
      isActive: a.isActive !== false,
      tags: Array.isArray(a.tags) ? a.tags : []
    })
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!form.code.trim()) return setNotify({ open: true, title: 'Error', message: 'Code is required' })
    if (!form.name.trim()) return setNotify({ open: true, title: 'Error', message: 'Name is required' })
    if (!form.subGroup.trim()) return setNotify({ open: true, title: 'Error', message: 'Sub-group is required' })

    try {
      setSaving(true)
      if (editingId) {
        await api.put(`/api/accounts/chart-of-accounts/${editingId}`, form)
        setNotify({ open: true, title: 'Success', message: 'Account updated' })
      } else {
        await api.post('/api/accounts/chart-of-accounts', form)
        setNotify({ open: true, title: 'Success', message: 'Account created' })
      }
      setShowModal(false)
      setForm({ ...emptyForm })
      setEditingId(null)
      fetchAccounts(); fetchStats()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/accounts/chart-of-accounts/${id}`)
      setNotify({ open: true, title: 'Success', message: 'Account deleted' })
      setDeleteConfirm(null)
      fetchAccounts(); fetchStats()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to delete' })
      setDeleteConfirm(null)
    }
  }

  function getGroupBadge(group) {
    const palette = {
      Assets: ['rgba(16,185,129,0.1)', '#10b981'],
      Liabilities: ['rgba(239,68,68,0.1)', '#ef4444'],
      Income: ['rgba(59,130,246,0.1)', '#3b82f6'],
      Expenses: ['rgba(245,158,11,0.1)', '#f59e0b'],
      Equity: ['rgba(168,85,247,0.1)', '#a855f7'],
      Uncategorized: ['rgba(107,114,128,0.1)', '#6b7280']
    }
    const [bg, color] = palette[group] || palette.Uncategorized
    return (
      <span style={{
        padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
        background: bg, color, textTransform: 'uppercase'
      }}>{group}</span>
    )
  }

  // Tally sync state for a ledger:
  //   Synced - captured Tally's GUID and/or acknowledged an export
  //   Pending - synced before, but renamed/re-classified since → needs re-export
  //   Not Synced - never exported to or reconciled with Tally
  function getSyncBadge(a) {
    const synced = !!(a.lastSyncedToTally || a.tallyGuid)
    let label, bg, color, title
    if (!synced) {
      label = 'Not Synced'; bg = 'rgba(107,114,128,0.12)'; color = '#9ca3af'
      title = 'Never exported to or reconciled with Tally'
    } else if (a.previousTallyLedgerName || a.previousSubGroup) {
      label = 'Pending'; bg = 'rgba(245,158,11,0.12)'; color = '#f59e0b'
      title = 'Synced, but renamed / re-classified since — re-export to update Tally'
    } else {
      label = 'Synced'; bg = 'rgba(16,185,129,0.12)'; color = '#10b981'
      title = a.lastSyncedToTally ? `Last synced ${new Date(a.lastSyncedToTally).toLocaleDateString()}` : 'Reconciled with Tally (GUID captured)'
    }
    return (
      <span title={title} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
        borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap'
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {label}
      </span>
    )
  }

  if (initialLoad) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading chart of accounts...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Chart of Accounts</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Ledger master. Tally ledger name must match your Tally company exactly for XML import.
          </p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="cancel-btn" onClick={openMapModal} title="Map each PO type to a default expense ledger">
              ⚙️ PO Type Mapping
            </button>
            <button className="save-btn" style={{ background: '#1F4788' }} onClick={() => setShowExportModal(true)} title="Review the summary, then export the Chart of Accounts to Tally">
              📤 Export to Tally
            </button>
            <button className="save-btn" onClick={openCreate}>+ New Account</button>
          </div>
        )}
      </div>

      {/* Bird's-eye stat cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Total Ledgers', value: stats?.totalLedgers, color: 'var(--primary)' },
          { label: 'Total Groups', value: stats?.totalGroups, color: '#10b981' },
          { label: 'Total Sub-Groups', value: stats?.totalSubGroups, color: '#3b82f6' }
        ].map(c => (
          <div key={c.label} style={{ flex: 1, minWidth: 150, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: c.color, fontFamily: 'monospace' }}>
              {c.value === undefined || c.value === null ? '—' : c.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by code, name, or Tally ledger..."
          style={{
            flex: 1, minWidth: 220, padding: '10px 14px',
            borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--card)', color: 'var(--text)', fontSize: 13
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', ...GROUPS].map(g => (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: groupFilter === g ? 'var(--primary)' : 'var(--card)',
                color: groupFilter === g ? 'white' : 'var(--text)',
                cursor: 'pointer', fontWeight: 500, fontSize: 13
              }}
            >{g}</button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }} title="Show deactivated / non-operational (pure-accounting) ledgers too">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {loading && (
        <p style={{ margin: '-8px 0 12px', color: 'var(--text-muted)', fontSize: 12 }}>Searching…</p>
      )}

      {accounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--card)', borderRadius: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📒</div>
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No Accounts</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {search ? 'No accounts match your search.' : 'Run `npm run seed:coa` to populate the default chart.'}
          </p>
        </div>
      ) : (
        <div className="table" style={{ background: 'var(--card)', borderRadius: 12, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Group</th>
                <th>Sub-Group</th>
                <th>Tally Ledger</th>
                <th>Tally Sync</th>
                <th>VAT</th>
                <th>Active</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a._id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{a.code}</td>
                  <td style={{ color: 'var(--text)' }}>
                    {a.name}
                    {Array.isArray(a.tags) && a.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {a.tags.map((t, i) => (
                          <span key={i} style={{ fontSize: 10, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderRadius: 4, padding: '1px 6px' }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{getGroupBadge(a.group)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{a.subGroup}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{a.tallyLedgerName}</td>
                  <td>{getSyncBadge(a)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {a.vatApplicable ? `${a.vatRate?.$numberDecimal || a.vatRate || 0}%` : '-'}
                  </td>
                  <td>
                    <span style={{
                      padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: a.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                      color: a.isActive ? '#10b981' : '#6b7280'
                    }}>{a.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                  </td>
                  {canManage && (
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => openEdit(a)}>Edit</button>
                        <button className="link-btn" style={{ color: '#ef4444' }} onClick={() => setDeleteConfirm(a._id)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Account' : 'New Account'}</h2>
              <button onClick={() => setShowModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Code *</label>
                  <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. 5100-MATERIALS" />
                </div>
                <div className="form-group">
                  <label>Group * <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(from sub-group)</span></label>
                  <select value={form.group} disabled title="Determined automatically by the selected sub-group's primary group">
                    {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Display name" />
              </div>
              <div className="form-group">
                <label>Sub-Group *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(() => {
                    // List ALL sub-groups (grouped by primary). The sub-group is the
                    // source of truth - picking one sets and locks the Group above.
                    const byPrimary = {}
                    for (const g of accountGroups) { (byPrimary[g.group] = byPrimary[g.group] || []).push(g) }
                    const known = accountGroups.some(o => o.name === form.subGroup)
                    const currentMissing = form.subGroup && !known
                    return (
                      <select
                        style={{ flex: 1 }}
                        value={form.subGroup}
                        onChange={e => {
                          const name = e.target.value
                          const ag = accountGroups.find(g => g.name === name)
                          // Derive + lock the primary Group from the chosen sub-group.
                          setForm(f => ({ ...f, subGroup: name, group: ag?.group || f.group }))
                        }}
                      >
                        <option value="">— Select sub-group —</option>
                        {currentMissing && <option value={form.subGroup}>{form.subGroup} (current)</option>}
                        {GROUPS.filter(p => (byPrimary[p] || []).length).map(p => (
                          <optgroup key={p} label={p}>
                            {byPrimary[p].slice().sort((a, b) => a.name.localeCompare(b.name)).map(o => (
                              <option key={o._id} value={o.name}>{o.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    )
                  })()}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Selecting a sub-group sets its primary Group automatically. Sub-groups are owned by Tally and synced in automatically.
                </span>
              </div>

              {/* Tally mapping. State B (GUID-mapped): show the reconciled Tally name
                  read-only. State A (no GUID): keep the auto-generation helper. The
                  ERP code/name above stay editable in both states. */}
              {editSync.guidMapped ? (
                <div className="form-group">
                  <label>Mapped Tally Ledger</label>
                  <input
                    type="text"
                    value={editSync.tallyName}
                    readOnly
                    disabled
                    title="Locked to a reconciled Tally ledger (matched by GUID)"
                    style={{ background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                  />
                  <span style={{ fontSize: 11, color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    🔒 Locked to a reconciled Tally ledger (GUID). Editing the ERP code / name won't change this mapping.
                  </span>
                </div>
              ) : (
                <div className="form-group" style={{ marginTop: -4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    The Tally ledger name is generated from the code and name.
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={form.vatApplicable} onChange={e => setForm({ ...form, vatApplicable: e.target.checked })} />
                    {' '}VAT Applicable
                  </label>
                </div>
                <div className="form-group">
                  <label>VAT Rate (%)</label>
                  <input type="number" min="0" step="0.01" value={form.vatRate} onChange={e => setForm({ ...form, vatRate: e.target.value })} disabled={!form.vatApplicable} />
                </div>
                <div className="form-group">
                  <label>Currency</label>
                  <input type="text" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tags <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(internal filtering only — never sent to Tally)</span></label>
                <TagsInput value={form.tags} onChange={tags => setForm({ ...form, tags })} />
              </div>
              {editingId && (
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                    {' '}Active
                  </label>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Account</h2>
              <button onClick={() => setDeleteConfirm(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Delete this account? Accounts referenced by journal entries cannot be deleted — deactivate them instead.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button type="button" className="reject-btn" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMapModal && (
        <div className="modal-overlay" onClick={() => setShowMapModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>PO Type → Account Mapping</h2>
              <button onClick={() => setShowMapModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: 20 }}>
              <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                Choose the default expense ledger for each Purchase Order type. During PO creation the matching
                account is auto-selected for every type except <strong>Other</strong>, where it is chosen per item.
                The Account Manager can still override the account head when approving a PO.
              </p>
              {PO_TYPE_OPTIONS.map(opt => (
                <div className="form-group" key={opt.key} style={{ marginBottom: 14 }}>
                  <label>{opt.label}</label>
                  <AccountHeadSelect
                    value={poMap[opt.key] || ''}
                    onChange={(code) => setPoMap(prev => ({ ...prev, [opt.key]: code }))}
                    placeholder="Use built-in default"
                  />
                </div>
              ))}
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowMapModal(false)} disabled={mapSaving}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleSaveMap} disabled={mapSaving}>
                  {mapSaving ? 'Saving...' : 'Save Mapping'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TallyExportSummaryModal
        open={showExportModal}
        onClose={(refresh) => {
          setShowExportModal(false)
          if (refresh) { fetchAccounts(); fetchAccountGroups() }
        }}
      />

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
