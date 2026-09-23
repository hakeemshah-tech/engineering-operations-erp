import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'
import DownloadToTallyButton from './components/DownloadToTallyButton'

const VOUCHER_TYPES = ['all', 'PURCHASE', 'SALES', 'PAYMENT', 'RECEIPT', 'JOURNAL', 'CONTRA']

function SyncBadge({ status }) {
  const palette = {
    PENDING: ['rgba(245,158,11,0.1)', '#f59e0b'],
    DOWNLOADED: ['rgba(59,130,246,0.1)', '#3b82f6'],
    SYNCED: ['rgba(16,185,129,0.1)', '#10b981'],
    FAILED: ['rgba(239,68,68,0.1)', '#ef4444']
  }
  const [bg, color] = palette[status] || palette.PENDING
  return <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color }}>{status}</span>
}

function KpiTile({ label, value, color }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

function lineTotal(lines = []) {
  return lines.reduce((s, l) => {
    const d = typeof l.debit === 'object' && l.debit?.$numberDecimal !== undefined ? parseFloat(l.debit.$numberDecimal) : parseFloat(l.debit || 0)
    return s + d
  }, 0)
}

export default function TallySyncQueue() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ PENDING: 0, DOWNLOADED: 0, SYNCED: 0, FAILED: 0 })
  const [loading, setLoading] = useState(true)
  const [syncFilter, setSyncFilter] = useState('both')
  const [typeFilter, setTypeFilter] = useState('all')
  const [bundling, setBundling] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  useEffect(() => { fetch() }, [syncFilter, typeFilter])

  async function fetch() {
    try {
      setLoading(true)
      const p = new URLSearchParams()
      if (syncFilter !== 'both') p.append('syncStatus', syncFilter)
      if (typeFilter !== 'all') p.append('voucherType', typeFilter)
      const res = await api.get(`/api/accounts/tally/pending?${p}`)
      setItems(res.data.items || [])
      setSummary(res.data.summary || { PENDING: 0, DOWNLOADED: 0, SYNCED: 0, FAILED: 0 })
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load sync queue.' })
    } finally {
      setLoading(false)
    }
  }

  async function downloadBundle() {
    try {
      setBundling(true)
      const res = await api.get(`/api/accounts/tally/bundle?syncStatus=${syncFilter}`, { responseType: 'blob' })
      const disposition = res.headers?.['content-disposition'] || ''
      const m = disposition.match(/filename="?([^"]+)"?/i)
      const fileName = m ? m[1] : `Tally-Bundle-${Date.now()}.xml`
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      const count = res.headers?.['x-bundle-count'] || '?'
      setNotify({ open: true, title: 'Bundle downloaded', message: `${count} voucher(s) bundled into a single Tally import file.` })
      fetch()
    } catch (err) {
      let msg = 'Failed'
      if (err.response?.data instanceof Blob) {
        const t = await err.response.data.text()
        try { msg = JSON.parse(t).message || msg } catch { msg = t.slice(0, 200) }
      } else {
        msg = err.response?.data?.message || msg
      }
      setNotify({ open: true, title: 'Bundle failed', message: msg })
    } finally {
      setBundling(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /><p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading Tally sync queue...</p></div>
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Tally Sync Queue</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Posted journals pending or downloaded for Tally import. Bundle into one file for a single import operation.
          </p>
        </div>
        <button
          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#1F4788', color: 'white', fontWeight: 600, fontSize: 14, cursor: bundling ? 'not-allowed' : 'pointer', opacity: bundling ? 0.6 : 1 }}
          onClick={downloadBundle}
          disabled={bundling || summary.PENDING + (syncFilter === 'both' ? summary.DOWNLOADED : 0) === 0}
        >
          {bundling ? 'Bundling...' : '⬇ Download Bundle'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <KpiTile label="Pending" value={summary.PENDING} color="#f59e0b" />
        <KpiTile label="Downloaded (awaiting sync)" value={summary.DOWNLOADED} color="#3b82f6" />
        <KpiTile label="Synced" value={summary.SYNCED} color="#10b981" />
        <KpiTile label="Failed" value={summary.FAILED} color="#ef4444" />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['both', 'PENDING', 'DOWNLOADED'].map(s => (
            <button key={s} onClick={() => setSyncFilter(s)}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none',
                background: syncFilter === s ? 'var(--primary)' : 'var(--card)',
                color: syncFilter === s ? 'white' : 'var(--text)',
                cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
              {s === 'both' ? 'Pending + Downloaded' : s}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          {VOUCHER_TYPES.map(t => <option key={t} value={t}>{t === 'all' ? 'All voucher types' : t}</option>)}
        </select>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--card)', borderRadius: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>Queue Clear</h3>
          <p style={{ color: 'var(--text-muted)' }}>Nothing matches your filter. All caught up.</p>
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
                <th>Source</th>
                <th>Sync</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(j => (
                <tr key={j._id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{j.entryNumber}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(j.entryDate).toLocaleDateString()}</td>
                  <td style={{ color: 'var(--text)' }}>{j.voucherType}</td>
                  <td style={{ color: 'var(--text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {j.narration || '-'}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{lineTotal(j.lines).toFixed(2)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{j.source?.kind || 'MANUAL'}</td>
                  <td><SyncBadge status={j.tallySyncStatus} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => navigate(`/accounts/journals/${j._id}`)}>View</button>
                      <DownloadToTallyButton
                        journalEntryId={j._id}
                        label={j.tallySyncStatus === 'DOWNLOADED' ? 'Re-download' : 'Download'}
                        variant="ghost"
                        onDownloaded={fetch}
                        onError={m => setNotify({ open: true, title: 'Download failed', message: m })}
                      />
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
            <div className="modal-header"><h2>{notify.title}</h2><button onClick={() => setNotify({ ...notify, open: false })} className="close-btn">×</button></div>
            <div className="lead-form"><p>{notify.message}</p><div className="form-actions"><button type="button" className="save-btn" onClick={() => setNotify({ ...notify, open: false })}>OK</button></div></div>
          </div>
        </div>
      )}
    </div>
  )
}
