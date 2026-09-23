import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const SUMMARY_URL = '/api/accounts/masters/chart-of-accounts-summary'
const XML_URL = '/api/accounts/masters/chart-of-accounts-xml'
const ACK_URL = '/api/accounts/masters/chart-of-accounts-renames-ack'

/** One control-total stat card. */
function StatCard({ label, value, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 110, background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px'
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || 'var(--text)', fontFamily: 'monospace' }}>{value ?? 0}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
    </div>
  )
}

/** Grey pulsing skeleton block. */
function Skeleton({ h = 16, w = '100%', style }) {
  return <div style={{ height: h, width: w, borderRadius: 6, background: 'var(--border)', opacity: 0.5, animation: 'pulse 1.2s ease-in-out infinite', ...style }} />
}

/**
 * Pre-export summary modal for the Chart of Accounts → Tally masters export.
 * Fetches a dry-run summary, shows control totals + validation, and guards the
 * download: the "Download XML" button stays disabled while any critical warning
 * exists. onClose(refresh?) - pass true to signal the parent to reload.
 */
export default function TallyExportSummaryModal({ open, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [mode, setMode] = useState('create') // 'create' | 'alter'
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [acking, setAcking] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    setSummary(null); setError(''); setDownloaded(false); setMode('create')
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await api.get(SUMMARY_URL)
        if (!cancelled) setSummary(res.data?.data || null)
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load export summary.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  if (!open) return null

  const warnings = summary?.validation?.warnings || []
  const criticals = warnings.filter(w => w.type === 'critical')
  const notices = warnings.filter(w => w.type === 'notice')
  const isReady = !!summary?.validation?.isReady && criticals.length === 0
  const ms = summary?.mastersSummary || {}
  const scope = summary?.scope || {}

  async function downloadXml() {
    setDownloading(true)
    setError('')
    try {
      const res = await api.get(`${XML_URL}?alter=${mode === 'alter'}`, { responseType: 'blob' })
      const disposition = res.headers?.['content-disposition'] || ''
      const m = disposition.match(/filename="?([^"]+)"?/i)
      const fileName = m ? m[1] : 'Tally-CoA-Masters.xml'
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url; a.download = fileName
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setDownloaded(true)
    } catch (err) {
      let msg = 'Download failed. Please try again.'
      if (err.response?.data instanceof Blob) {
        try { msg = JSON.parse(await err.response.data.text()).message || msg } catch { /* keep default */ }
      }
      setError(msg)
    } finally {
      setDownloading(false)
    }
  }

  async function markSynced() {
    setAcking(true)
    try {
      await api.post(ACK_URL)
      onClose?.(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark as synced.')
    } finally {
      setAcking(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !downloading && !acking && onClose?.()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>Export to Tally — Pre-flight Summary</h2>
          <button onClick={() => onClose?.()} className="close-btn">×</button>
        </div>

        <div className="lead-form" style={{ padding: 20 }}>
          {/* ---- Loading skeleton ---- */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skeleton h={14} w="60%" />
              <div style={{ display: 'flex', gap: 10 }}>
                <Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} />
              </div>
              <Skeleton h={52} />
              <Skeleton h={38} w="40%" style={{ alignSelf: 'flex-end' }} />
            </div>
          )}

          {!loading && error && !summary && (
            <div style={alertStyle('#ef4444')}>{error}</div>
          )}

          {!loading && summary && (
            <>
              {/* ---- Scope ---- */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{scope.exportType}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {scope.totalRecords} record{scope.totalRecords === 1 ? '' : 's'} about to be exported
                  {' '}({scope.totalGroups} group{scope.totalGroups === 1 ? '' : 's'} + {scope.totalLedgers} ledger{scope.totalLedgers === 1 ? '' : 's'}).
                </div>
              </div>

              {/* ---- Control totals ---- */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <StatCard label="New Groups" value={ms.newGroups} accent="#10b981" />
                <StatCard label="Updated Groups" value={ms.updatedGroups} accent="#3b82f6" />
                <StatCard label="New Ledgers" value={ms.newLedgers} accent="#10b981" />
                <StatCard label="Updated Ledgers" value={ms.updatedLedgers} accent="#3b82f6" />
              </div>

              {/* ---- Validation ---- */}
              {criticals.length > 0 ? (
                <div style={alertStyle('#ef4444')}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>⛔ {criticals.length} critical issue{criticals.length === 1 ? '' : 's'} — fix before exporting</div>
                  <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
                    {criticals.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w.message}</li>)}
                  </ul>
                </div>
              ) : notices.length > 0 ? (
                <div style={alertStyle('#f59e0b')}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠ {notices.length} notice{notices.length === 1 ? '' : 's'}</div>
                  <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
                    {notices.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w.message}</li>)}
                  </ul>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>These won't block the export, but review them if unexpected.</div>
                </div>
              ) : (
                <div style={{ ...alertStyle('#10b981'), fontWeight: 700 }}>🟢 Status: Ready for Export</div>
              )}

              {error && summary && (
                <div style={{ ...alertStyle('#ef4444'), marginTop: 12 }}>{error}</div>
              )}

              {/* ---- Action area ---- */}
              {!downloaded ? (
                <>
                  <div style={{ marginTop: 16, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Import mode</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { key: 'create', label: 'Create (first import)' },
                        { key: 'alter', label: 'Alter (update existing)' }
                      ].map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setMode(opt.key)}
                          style={{
                            padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                            border: `1px solid ${mode === opt.key ? 'var(--primary)' : 'var(--border)'}`,
                            background: mode === opt.key ? 'rgba(99,102,241,0.10)' : 'var(--card)',
                            color: mode === opt.key ? 'var(--primary)' : 'var(--text)',
                            fontWeight: mode === opt.key ? 600 : 400
                          }}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="button" className="cancel-btn" onClick={() => onClose?.()} disabled={downloading}>Cancel</button>
                    <button
                      type="button"
                      className="save-btn"
                      onClick={downloadXml}
                      disabled={!isReady || downloading}
                      title={!isReady ? 'Resolve the critical issues to enable download' : 'Download the Tally masters XML'}
                      style={!isReady ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                    >
                      {downloading ? 'Generating…' : '⬇ Download XML'}
                    </button>
                  </div>
                  {!isReady && (
                    <p style={{ margin: '8px 0 0', color: '#ef4444', fontSize: 12, textAlign: 'right' }}>
                      Fix the critical issues in the Chart of Accounts to unlock the download.
                    </p>
                  )}
                </>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <div style={{ ...alertStyle('#3b82f6'), marginBottom: 12 }}>
                    ✅ File downloaded. Import it into Tally via <strong>Gateway → Import Data → Masters</strong>.
                    Once the import succeeds, mark it synced so these records count as “updated” next time.
                  </div>
                  <div className="form-actions">
                    <button type="button" className="cancel-btn" onClick={() => onClose?.()} disabled={acking}>Close</button>
                    <button type="button" className="save-btn" onClick={markSynced} disabled={acking}>
                      {acking ? 'Marking…' : '✓ Mark as synced in Tally'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function alertStyle(color) {
  return {
    background: `${color}14`,
    border: `1px solid ${color}`,
    color: 'var(--text)',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    lineHeight: 1.5
  }
}
