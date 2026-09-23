import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const PRIMARY_GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity']
const URL = '/api/accounts/account-groups'

/**
 * Manage the Chart-of-Accounts sub-groups: add, rename, re-classify (move to a
 * different primary group) and deactivate. Rename is tracked server-side via
 * previousName, so the next Tally export emits an ACTION="Alter" with the same
 * GUID - Tally renames the group in place instead of duplicating it.
 *
 * onClose(changed?) - pass true so the parent reloads its sub-group list.
 */
export default function SubGroupManagerModal({ open, onClose }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [changed, setChanged] = useState(false)

  const [addName, setAddName] = useState('')
  const [addGroup, setAddGroup] = useState('Expenses')
  const [adding, setAdding] = useState(false)

  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editGroup, setEditGroup] = useState('Expenses')
  const [rowBusy, setRowBusy] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    if (!open) return undefined
    setError(''); setChanged(false); setEditId(null); setAddName(''); setAddGroup('Expenses'); setDeleteConfirm(null)
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await api.get(`${URL}?includeInactive=true`)
        if (!cancelled) setGroups(Array.isArray(res.data) ? res.data : [])
      } catch {
        if (!cancelled) setError('Failed to load sub-groups.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  if (!open) return null

  async function refresh() {
    try {
      const res = await api.get(`${URL}?includeInactive=true`)
      setGroups(Array.isArray(res.data) ? res.data : [])
    } catch { /* keep current */ }
  }

  async function addSubGroup() {
    const name = addName.trim()
    if (!name) return
    setAdding(true); setError('')
    try {
      await api.post(URL, { name, group: addGroup })
      setAddName('')
      setChanged(true)
      await refresh()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add sub-group.')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(g) {
    setEditId(g._id); setEditName(g.name); setEditGroup(g.group); setError('')
  }

  async function saveEdit(g) {
    const name = editName.trim()
    if (!name) return
    setRowBusy(g._id); setError('')
    try {
      await api.put(`${URL}/${g._id}`, { name, group: editGroup })
      setEditId(null)
      setChanged(true)
      await refresh()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save changes.')
    } finally {
      setRowBusy(null)
    }
  }

  async function toggleActive(g) {
    setRowBusy(g._id); setError('')
    try {
      await api.put(`${URL}/${g._id}`, { isActive: !g.isActive })
      setChanged(true)
      await refresh()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status.')
    } finally {
      setRowBusy(null)
    }
  }

  async function doDelete(g) {
    setRowBusy(g._id); setError('')
    try {
      await api.delete(`${URL}/${g._id}`)
      setDeleteConfirm(null)
      setChanged(true)
      await refresh()
    } catch (err) {
      setDeleteConfirm(null)
      setError(err.response?.data?.message || 'Failed to delete sub-group.')
    } finally {
      setRowBusy(null)
    }
  }

  const badge = (text, color) => (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${color}1a`, color, textTransform: 'uppercase' }}>{text}</span>
  )

  return (
    <div className="modal-overlay" onClick={() => onClose?.(changed)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>Manage Sub-Groups</h2>
          <button onClick={() => onClose?.(changed)} className="close-btn">×</button>
        </div>

        <div className="lead-form" style={{ padding: 20 }}>
          <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: 13 }}>
            Rename, re-classify or deactivate sub-groups. Renaming is synced to Tally in place (via the group's GUID),
            so it updates rather than duplicating. Deactivated sub-groups are excluded from the export.
          </p>

          {/* Add row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 2, minWidth: 180, margin: 0 }}>
              <label>New Sub-Group</label>
              <input
                type="text" value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && addName.trim()) addSubGroup() }}
                placeholder="e.g. Project WIP"
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 130, margin: 0 }}>
              <label>Under</label>
              <select value={addGroup} onChange={e => setAddGroup(e.target.value)}>
                {PRIMARY_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <button type="button" className="save-btn" onClick={addSubGroup} disabled={adding || !addName.trim()}>
              {adding ? 'Adding…' : '+ Add'}
            </button>
          </div>

          {error && (
            <div style={{ background: '#ef444414', border: '1px solid #ef4444', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
          ) : groups.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sub-groups yet.</p>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {groups.map((g, idx) => {
                const editing = editId === g._id
                const busy = rowBusy === g._id
                return (
                  <div
                    key={g._id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                      background: g.isActive ? 'transparent' : 'rgba(107,114,128,0.06)',
                      opacity: busy ? 0.6 : 1, flexWrap: 'wrap'
                    }}
                  >
                    {editing ? (
                      <>
                        <input
                          type="text" value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && editName.trim()) saveEdit(g) }}
                          style={{ flex: 2, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', fontSize: 13 }}
                          autoFocus
                        />
                        <select
                          value={editGroup}
                          onChange={e => setEditGroup(e.target.value)}
                          style={{ minWidth: 130, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', fontSize: 13 }}
                        >
                          {PRIMARY_GROUPS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                          <button type="button" className="save-btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => saveEdit(g)} disabled={busy || !editName.trim()}>Save</button>
                          <button type="button" className="cancel-btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setEditId(null)} disabled={busy}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 2, minWidth: 160, color: 'var(--text)', fontWeight: 500 }}>
                          {g.name}
                          {g.previousName ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> (was “{g.previousName}”)</span> : null}
                        </span>
                        <span style={{ minWidth: 90 }}>{badge(g.group, '#6366f1')}</span>
                        <span style={{ minWidth: 78 }}>{g.isActive ? badge('Active', '#10b981') : badge('Inactive', '#6b7280')}</span>
                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                          <button type="button" className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => startEdit(g)} disabled={busy}>Edit</button>
                          <button type="button" className="link-btn" style={{ color: g.isActive ? '#f59e0b' : '#10b981' }} onClick={() => toggleActive(g)} disabled={busy}>
                            {g.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" className="link-btn" style={{ color: '#ef4444' }} onClick={() => setDeleteConfirm(g)} disabled={busy}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="save-btn" onClick={() => onClose?.(changed)}>Done</button>
          </div>
        </div>
      </div>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Delete Sub-Group</h2>
              <button onClick={() => setDeleteConfirm(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: 20 }}>
              <p style={{ color: 'var(--text)' }}>
                Delete “{deleteConfirm.name}”? Sub-groups still used by a ledger can't be deleted — deactivate them instead.
              </p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button type="button" className="reject-btn" onClick={() => doDelete(deleteConfirm)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
