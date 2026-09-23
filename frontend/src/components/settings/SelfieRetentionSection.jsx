import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '../../lib/api'
import { Modal } from '../../design-system/Modal'

/**
 * Settings → Attendance → Selfie Storage & Retention.
 *
 * Punch selfies are PII (face + GPS coordinates) so storing them forever is a
 * compliance liability. This panel lets the admin:
 *  - see current storage usage by month,
 *  - configure a retention policy (auto-delete > N days),
 *  - turn the nightly sweep on/off,
 *  - kick off the sweep on-demand.
 *
 * Note: only the image bytes are deleted. The Attendance row + timeLog
 * metadata (distance, IP, marked-by, audit edits[]) stays intact.
 */
function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export default function SelfieRetentionSection({ settings, onSaved }) {
  const att = useMemo(() => settings?.attendance || {}, [settings])
  const [retentionDays, setRetentionDays] = useState(att.selfieRetentionDays ?? 365)
  const [autoEnabled, setAutoEnabled] = useState(att.selfieAutoCleanupEnabled === true)
  const [stats, setStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [statsError, setStatsError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, force: false })

  useEffect(() => {
    setRetentionDays(att.selfieRetentionDays ?? 365)
    setAutoEnabled(att.selfieAutoCleanupEnabled === true)
  }, [att.selfieRetentionDays, att.selfieAutoCleanupEnabled])

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    setStatsError('')
    try {
      const res = await api.get('/api/system-settings/attendance/selfie-stats')
      setStats(res.data)
    } catch (err) {
      setStatsError(err?.response?.data?.message || 'Could not load storage stats.')
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const savePolicy = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const days = Number(retentionDays)
      if (!Number.isFinite(days) || days < 7 || days > 3650) {
        setMsg({ type: 'error', text: 'Retention must be between 7 and 3650 days.' })
        return
      }
      const res = await api.put('/api/system-settings', {
        attendance: {
          selfieRetentionDays: days,
          selfieAutoCleanupEnabled: autoEnabled
        }
      })
      onSaved && onSaved(res.data)
      setMsg({ type: 'success', text: 'Retention policy saved.' })
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Save failed.' })
    } finally {
      setBusy(false)
    }
  }

  const askCleanup = (force) => setConfirm({ open: true, force })
  const cancelCleanup = () => setConfirm({ open: false, force: false })

  const runCleanupNow = async () => {
    const force = confirm.force
    setConfirm({ open: false, force: false })
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.post('/api/system-settings/attendance/selfie-cleanup', { force })
      const r = res.data
      if (r.skipped) {
        setMsg({ type: 'info', text: 'Auto-cleanup is disabled. Use "Force run" to override.' })
      } else {
        setMsg({
          type: 'success',
          text: `Sweep complete · scanned ${r.scanned} rows · cleared ${r.cleared} URLs · deleted ${r.filesDeleted} files.`
        })
        await loadStats()
      }
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Sweep failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      marginTop: 24,
      padding: 18,
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--card, transparent)'
    }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: '0 0 6px', color: 'var(--text)', fontSize: 16 }}>
          Storage &amp; retention
        </h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          Punch selfies sit in <code>server/uploads/attendance/&lt;YYYY-MM&gt;/</code>.
          Only the image bytes are deleted by the sweep — the attendance row,
          timestamps, GPS, distance, and audit trail stay intact.
        </p>
      </div>

      {/* Current usage */}
      <div style={{
        marginBottom: 18,
        padding: 14,
        borderRadius: 8,
        background: 'rgba(99, 102, 241, 0.06)',
        border: '1px solid rgba(99, 102, 241, 0.25)'
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
          Current usage
        </div>
        {loadingStats && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}
        {statsError && <div style={{ color: '#dc2626', fontSize: 13 }}>{statsError}</div>}
        {stats && !loadingStats && (
          <>
            <div style={{ display: 'flex', gap: 24, marginBottom: 10, fontSize: 14 }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Files: </span>
                <strong>{stats.totalFiles.toLocaleString()}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Total size: </span>
                <strong>{formatBytes(stats.totalBytes)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Folders: </span>
                <strong>{stats.folders.length}</strong>
              </div>
            </div>
            {stats.folders.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                  Breakdown by month
                </summary>
                <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Folder</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px' }}>Files</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px' }}>Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.folders.map(f => (
                        <tr key={f.name}>
                          <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{f.name}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{f.fileCount.toLocaleString()}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{formatBytes(f.bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            <button
              type="button"
              onClick={loadStats}
              disabled={loadingStats}
              style={{
                marginTop: 8,
                padding: '4px 10px',
                fontSize: 12,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >Refresh</button>
          </>
        )}
      </div>

      {/* Policy */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '12px 14px',
        alignItems: 'center',
        marginBottom: 14
      }}>
        <label style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>
          Auto-cleanup
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--text)' }}>
          <input
            type="checkbox"
            checked={autoEnabled}
            onChange={e => setAutoEnabled(e.target.checked)}
          />
          Run the retention sweep every night at 02:30
        </label>

        <label style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>
          Retention window
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="number"
            min={7}
            max={3650}
            value={retentionDays}
            onChange={e => setRetentionDays(e.target.value)}
            style={{
              width: 100,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--input, #f8fafc)',
              color: 'var(--text)'
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            days · selfies older than this are deleted (min 7, max 3650 ≈ 10 yrs)
          </span>
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 12,
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
          background:
            msg.type === 'success' ? 'rgba(34, 197, 94, 0.10)' :
            msg.type === 'error'   ? 'rgba(239, 68, 68, 0.10)' :
                                     'rgba(99, 102, 241, 0.10)',
          border:
            msg.type === 'success' ? '1px solid rgba(34, 197, 94, 0.40)' :
            msg.type === 'error'   ? '1px solid rgba(239, 68, 68, 0.40)' :
                                     '1px solid rgba(99, 102, 241, 0.40)',
          color: 'var(--text)'
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={savePolicy}
          disabled={busy}
        >
          {busy ? 'Working…' : 'Save retention policy'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => askCleanup(false)}
          disabled={busy || !autoEnabled}
          title={!autoEnabled ? 'Enable auto-cleanup or use Force run' : 'Run sweep now'}
        >
          Run sweep now
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => askCleanup(true)}
          disabled={busy}
          style={{ color: '#b45309' }}
          title="Run the sweep even if auto-cleanup is disabled"
        >
          Force run (one-off)
        </button>
      </div>

      <Modal
        isOpen={confirm.open}
        onClose={cancelCleanup}
        title={confirm.force ? 'Force-run cleanup sweep?' : 'Run cleanup sweep now?'}
        size="small"
      >
        <div style={{ padding: '8px 4px 4px', lineHeight: 1.55 }}>
          <div style={{
            padding: '14px 16px',
            borderRadius: 12,
            marginBottom: 16,
            background: confirm.force ? 'rgba(245, 158, 11, 0.10)' : 'rgba(99, 102, 241, 0.08)',
            border: confirm.force ? '1px solid rgba(245, 158, 11, 0.40)' : '1px solid rgba(99, 102, 241, 0.30)',
            color: 'var(--text)',
            fontSize: 13
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>
                {confirm.force ? '⚠️' : 'ℹ️'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {confirm.force
                    ? 'This will run the sweep even though auto-cleanup is disabled.'
                    : 'The sweep will respect your auto-cleanup setting.'}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  Selfies older than <strong>{retentionDays} days</strong> will be deleted
                  from disk. The Attendance row, timestamps, GPS, distance, IP, and audit
                  trail will stay intact — only the image bytes are removed.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={cancelCleanup}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={runCleanupNow}
              style={confirm.force ? { background: '#b45309', borderColor: '#b45309' } : undefined}
            >
              {confirm.force ? 'Force run' : 'Run sweep'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
