import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

const STATUSES = ['all', 'draft', 'matched', 'journalized', 'paid', 'cancelled']

function StatusBadge({ status }) {
  const palette = {
    draft: ['rgba(245,158,11,0.1)', '#f59e0b'],
    matched: ['rgba(59,130,246,0.1)', '#3b82f6'],
    journalized: ['rgba(16,185,129,0.1)', '#10b981'],
    paid: ['rgba(168,85,247,0.1)', '#a855f7'],
    cancelled: ['rgba(107,114,128,0.1)', '#6b7280']
  }
  const [bg, color] = palette[status] || palette.draft
  return (
    <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color, textTransform: 'uppercase' }}>
      {status}
    </span>
  )
}

function amount(v) {
  if (!v) return '0.00'
  if (typeof v === 'object' && v.$numberDecimal !== undefined) return parseFloat(v.$numberDecimal).toFixed(2)
  return parseFloat(v).toFixed(2)
}

export default function SupplierBillManagement() {
  const navigate = useNavigate()
  const [bills, setBills] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [downloading, setDownloading] = useState(null)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => { fetchBills() }, [statusFilter, search])

  async function fetchBills() {
    try {
      setLoading(true)
      const p = new URLSearchParams()
      if (statusFilter !== 'all') p.append('status', statusFilter)
      if (search.trim()) p.append('search', search.trim())
      const res = await api.get(`/api/accounts/supplier-bills?${p}`)
      setBills(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load supplier bills.' })
    } finally {
      setLoading(false)
    }
  }

  async function downloadXml(id, billNumber) {
    try {
      setDownloading(id)
      const res = await api.post(`/api/accounts/supplier-bills/${id}/post-and-generate-xml`, {}, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PV-${billNumber}.xml`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setNotify({ open: true, title: 'Downloaded', message: 'Tally XML saved. Journal posted.' })
      fetchBills()
    } catch (err) {
      let msg = 'Failed to generate XML'
      try {
        // Blob error responses require manual parsing
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text()
          try { msg = JSON.parse(text).message || msg } catch { msg = text.slice(0, 200) }
        } else {
          msg = err.response?.data?.message || msg
        }
      } catch {}
      setNotify({ open: true, title: 'Error', message: msg })
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading supplier bills...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Supplier Bills</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {total} {total === 1 ? 'bill' : 'bills'} · 3-way matched bills produce a Purchase Voucher XML for Tally.
          </p>
        </div>
        {canManage && (
          <button className="save-btn" onClick={() => navigate('/accounts/bills/create')}>+ Enter Supplier Bill</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by bill number..."
          style={{ flex: 1, minWidth: 220, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: statusFilter === s ? 'var(--primary)' : 'var(--card)',
                color: statusFilter === s ? 'white' : 'var(--text)',
                cursor: 'pointer', fontWeight: 500, fontSize: 13, textTransform: 'capitalize'
              }}
            >{s}</button>
          ))}
        </div>
      </div>

      {bills.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--card)', borderRadius: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧾</div>
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No Supplier Bills</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {statusFilter !== 'all' || search ? 'No bills match your filter.' : 'Enter your first supplier bill from an approved PO with a GRN.'}
          </p>
        </div>
      ) : (
        <div className="table" style={{ background: 'var(--card)', borderRadius: 12, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Supplier</th>
                <th>PO</th>
                <th>GRN</th>
                <th>Bill Date</th>
                <th>Subtotal</th>
                <th>VAT</th>
                <th>Total</th>
                <th>Status</th>
                <th>Journal</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b._id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{b.billNumber}</td>
                  <td style={{ color: 'var(--text)' }}>{b.supplierId?.name || '-'}</td>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{b.purchaseOrderId?.poNumber || '-'}</td>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{b.grnNumber || '-'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(b.billDate).toLocaleDateString()}</td>
                  <td style={{ fontFamily: 'monospace' }}>{amount(b.subtotal)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{amount(b.vatAmount)}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>{amount(b.totalAmount)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                    {b.journalEntry ? b.journalEntry.entryNumber : '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => navigate(`/accounts/bills/${b._id}`)}>View</button>
                      {canManage && b.status === 'matched' && (
                        <button className="link-btn" style={{ color: '#10b981' }} onClick={() => downloadXml(b._id, b.billNumber)} disabled={downloading === b._id}>
                          {downloading === b._id ? 'Posting...' : 'Post & Download XML'}
                        </button>
                      )}
                      {canManage && b.status === 'journalized' && (
                        <span style={{ fontSize: 12, color: '#10b981' }}>XML generated</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
