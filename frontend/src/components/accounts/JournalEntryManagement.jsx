import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

const STATUSES = ['all', 'DRAFT', 'POSTED', 'REVERSED']
const VOUCHER_TYPES = ['all', 'PURCHASE', 'SALES', 'PAYMENT', 'RECEIPT', 'JOURNAL', 'CONTRA']

function StatusBadge({ status }) {
  const palette = {
    DRAFT: ['rgba(245,158,11,0.1)', '#f59e0b'],
    POSTED: ['rgba(16,185,129,0.1)', '#10b981'],
    REVERSED: ['rgba(107,114,128,0.1)', '#6b7280']
  }
  const [bg, color] = palette[status] || palette.DRAFT
  return (
    <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color }}>
      {status}
    </span>
  )
}

function SyncBadge({ status }) {
  const palette = {
    PENDING: ['rgba(245,158,11,0.1)', '#f59e0b'],
    DOWNLOADED: ['rgba(59,130,246,0.1)', '#3b82f6'],
    SYNCED: ['rgba(16,185,129,0.1)', '#10b981'],
    FAILED: ['rgba(239,68,68,0.1)', '#ef4444']
  }
  const [bg, color] = palette[status] || palette.PENDING
  return (
    <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: bg, color }}>
      {status}
    </span>
  )
}

function amount(lines) {
  const total = (lines || []).reduce((s, l) => {
    const d = parseFloat(l.debit?.$numberDecimal || l.debit || 0)
    return s + d
  }, 0)
  return total.toFixed(2)
}

export default function JournalEntryManagement() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(params.get('status') || 'all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [syncFilter, setSyncFilter] = useState(params.get('tallySyncStatus') || 'all')
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [actionConfirm, setActionConfirm] = useState(null)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canPost = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => { fetchEntries() }, [search, statusFilter, typeFilter, syncFilter])

  async function fetchEntries() {
    try {
      setLoading(true)
      const p = new URLSearchParams()
      if (search.trim()) p.append('search', search.trim())
      if (statusFilter !== 'all') p.append('status', statusFilter)
      if (typeFilter !== 'all') p.append('voucherType', typeFilter)
      if (syncFilter !== 'all') p.append('tallySyncStatus', syncFilter)
      const res = await api.get(`/api/accounts/journal-entries?${p}`)
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load journal entries.' })
    } finally {
      setLoading(false)
    }
  }

  async function doPost(id) {
    try {
      await api.post(`/api/accounts/journal-entries/${id}/post`)
      setNotify({ open: true, title: 'Success', message: 'Journal entry posted.' })
      fetchEntries()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to post' })
    } finally {
      setActionConfirm(null)
    }
  }

  async function doReverse(id) {
    try {
      await api.post(`/api/accounts/journal-entries/${id}/reverse`)
      setNotify({ open: true, title: 'Success', message: 'Reversal entry created and posted.' })
      fetchEntries()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to reverse' })
    } finally {
      setActionConfirm(null)
    }
  }

  async function doDelete(id) {
    try {
      await api.delete(`/api/accounts/journal-entries/${id}`)
      setNotify({ open: true, title: 'Success', message: 'Draft deleted.' })
      fetchEntries()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to delete' })
    } finally {
      setActionConfirm(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading journal entries...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Journal Entries</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {total} {total === 1 ? 'entry' : 'entries'} · Posted entries flow to Tally XML export.
          </p>
        </div>
        {canPost && (
          <button className="save-btn" onClick={() => navigate('/accounts/journals/create')}>
            + New Manual Journal
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by entry number or narration..."
          style={{ flex: 1, minWidth: 220, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          {STATUSES.map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          {VOUCHER_TYPES.map(t => <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>)}
        </select>
        <select value={syncFilter} onChange={e => setSyncFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          <option value="all">All sync states</option>
          <option value="PENDING">Pending</option>
          <option value="DOWNLOADED">Downloaded</option>
          <option value="SYNCED">Synced</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--card)', borderRadius: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No Journal Entries</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {search || statusFilter !== 'all' ? 'No entries match your filter.' : 'Create your first manual journal to begin.'}
          </p>
        </div>
      ) : (
        <div className="table" style={{ background: 'var(--card)', borderRadius: 12, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Entry #</th>
                <th>Date</th>
                <th>Type</th>
                <th>Narration</th>
                <th>Amount (AED)</th>
                <th>Status</th>
                <th>Tally Sync</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(je => (
                <tr key={je._id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{je.entryNumber}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(je.entryDate).toLocaleDateString()}</td>
                  <td style={{ color: 'var(--text)' }}>{je.voucherType}</td>
                  <td style={{ color: 'var(--text-muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {je.narration || '-'}
                  </td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text)', fontWeight: 600 }}>{amount(je.lines)}</td>
                  <td><StatusBadge status={je.status} /></td>
                  <td><SyncBadge status={je.tallySyncStatus} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => navigate(`/accounts/journals/${je._id}`)}>View</button>
                      {canPost && je.status === 'DRAFT' && (
                        <>
                          <button className="link-btn" style={{ color: '#10b981' }} onClick={() => setActionConfirm({ kind: 'post', id: je._id, number: je.entryNumber })}>Post</button>
                          <button className="link-btn" style={{ color: '#ef4444' }} onClick={() => setActionConfirm({ kind: 'delete', id: je._id, number: je.entryNumber })}>Delete</button>
                        </>
                      )}
                      {canPost && je.status === 'POSTED' && (
                        <button className="link-btn" style={{ color: '#f59e0b' }} onClick={() => setActionConfirm({ kind: 'reverse', id: je._id, number: je.entryNumber })}>Reverse</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {actionConfirm && (
        <div className="modal-overlay" onClick={() => setActionConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {actionConfirm.kind === 'post' && 'Post Journal Entry'}
                {actionConfirm.kind === 'reverse' && 'Reverse Journal Entry'}
                {actionConfirm.kind === 'delete' && 'Delete Draft'}
              </h2>
              <button onClick={() => setActionConfirm(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>
                {actionConfirm.kind === 'post' && `Post ${actionConfirm.number}? Once posted, the entry is locked and ready for Tally XML export.`}
                {actionConfirm.kind === 'reverse' && `Reverse ${actionConfirm.number}? A new posted reversal entry will be created.`}
                {actionConfirm.kind === 'delete' && `Delete draft ${actionConfirm.number}?`}
              </p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setActionConfirm(null)}>Cancel</button>
                <button type="button" className="save-btn" onClick={() => {
                  if (actionConfirm.kind === 'post') doPost(actionConfirm.id)
                  if (actionConfirm.kind === 'reverse') doReverse(actionConfirm.id)
                  if (actionConfirm.kind === 'delete') doDelete(actionConfirm.id)
                }}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
