import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

const STATUSES = ['all', 'draft', 'approved', 'journalized', 'collected', 'cancelled']

function Badge({ status }) {
  const palette = {
    draft: ['rgba(245,158,11,0.1)', '#f59e0b'],
    approved: ['rgba(59,130,246,0.1)', '#3b82f6'],
    journalized: ['rgba(16,185,129,0.1)', '#10b981'],
    collected: ['rgba(168,85,247,0.1)', '#a855f7'],
    cancelled: ['rgba(107,114,128,0.1)', '#6b7280']
  }
  const [bg, color] = palette[status] || palette.draft
  return <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color, textTransform: 'uppercase' }}>{status}</span>
}

function amount(v) {
  if (!v) return '0.00'
  if (typeof v === 'object' && v.$numberDecimal !== undefined) return parseFloat(v.$numberDecimal).toFixed(2)
  return parseFloat(v).toFixed(2)
}

export default function SalesClaimManagement() {
  const navigate = useNavigate()
  const [claims, setClaims] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [working, setWorking] = useState(null)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canApprove = ['admin', 'manager'].some(r => roles.includes(r))
  const canManage = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => { fetch() }, [statusFilter, search])

  async function fetch() {
    try {
      setLoading(true)
      const p = new URLSearchParams()
      if (statusFilter !== 'all') p.append('status', statusFilter)
      if (search.trim()) p.append('search', search.trim())
      const res = await api.get(`/api/accounts/sales-claims?${p}`)
      setClaims(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load sales claims.' })
    } finally {
      setLoading(false)
    }
  }

  async function approve(id) {
    try {
      setWorking(id)
      await api.post(`/api/accounts/sales-claims/${id}/approve`)
      setNotify({ open: true, title: 'Approved', message: 'Claim approved.' })
      fetch()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setWorking(null)
    }
  }

  async function invoiceAndDownload(id, claimNumber) {
    try {
      setWorking(id)
      const res = await api.post(`/api/accounts/sales-claims/${id}/invoice-and-generate-xml`, {}, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `SV-${claimNumber}.xml`
      a.click()
      URL.revokeObjectURL(url)
      setNotify({ open: true, title: 'Downloaded', message: 'Sales voucher XML saved. Journal posted.' })
      fetch()
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
      setWorking(null)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /><p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading sales claims...</p></div>
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Sales Claims</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {total} {total === 1 ? 'claim' : 'claims'} · Progress claims per project; approved claims generate Sales Voucher XML.
          </p>
        </div>
        {canManage && (
          <button className="save-btn" onClick={() => navigate('/accounts/claims/create')}>+ New Claim</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by claim number..."
          style={{ flex: 1, minWidth: 220, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none',
                background: statusFilter === s ? 'var(--primary)' : 'var(--card)',
                color: statusFilter === s ? 'white' : 'var(--text)',
                cursor: 'pointer', fontWeight: 500, fontSize: 13, textTransform: 'capitalize' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {claims.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--card)', borderRadius: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No Sales Claims</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {statusFilter !== 'all' || search ? 'No claims match your filter.' : 'Create a progress claim against a project to begin AR.'}
          </p>
        </div>
      ) : (
        <div className="table" style={{ background: 'var(--card)', borderRadius: 12, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Claim #</th>
                <th>Project</th>
                <th>Period</th>
                <th>%</th>
                <th>Gross</th>
                <th>VAT</th>
                <th>Retention</th>
                <th>Net Invoice</th>
                <th>Status</th>
                <th>Journal</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c._id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{c.claimNumber}</td>
                  <td style={{ color: 'var(--text)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.projectId?.name || '-'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {c.claimPeriod?.from && new Date(c.claimPeriod.from).toLocaleDateString()} — {c.claimPeriod?.to && new Date(c.claimPeriod.to).toLocaleDateString()}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{amount(c.percentComplete)}%</td>
                  <td style={{ fontFamily: 'monospace' }}>{amount(c.grossAmount)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{amount(c.vatAmount)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{amount(c.retention)}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>{amount(c.netInvoiceAmount)}</td>
                  <td><Badge status={c.status} /></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                    {c.journalEntry ? c.journalEntry.entryNumber : '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => navigate(`/accounts/claims/${c._id}`)}>View</button>
                      {canApprove && c.status === 'draft' && (
                        <button className="link-btn" style={{ color: '#3b82f6' }} onClick={() => approve(c._id)} disabled={working === c._id}>
                          {working === c._id ? '...' : 'Approve'}
                        </button>
                      )}
                      {canManage && c.status === 'approved' && (
                        <button className="link-btn" style={{ color: '#10b981' }} onClick={() => invoiceAndDownload(c._id, c.claimNumber)} disabled={working === c._id}>
                          {working === c._id ? 'Posting...' : 'Invoice & Download XML'}
                        </button>
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
