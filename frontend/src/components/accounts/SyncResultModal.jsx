/**
 * Result modal for the reconciliation Sync / Bulk-Import actions.
 * result = { success, title?, summary?: { totalProcessed, distribution, skipped?, errors? }, error?, mismatches? }
 */
export default function SyncResultModal({ open, onClose, result }) {
  if (!open || !result) return null
  const { success, title, summary, error, mismatches } = result
  const dist = (summary && summary.distribution) || {}
  const groups = Object.keys(dist).filter(g => dist[g])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2>{success ? 'Sync Complete' : 'Action Failed'}</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="lead-form" style={{ padding: 20 }}>
          {success ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 44, lineHeight: 1 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981', marginTop: 6 }}>
                  {title || `${summary?.totalProcessed ?? 0} ledger(s) processed`}
                </div>
              </div>
              {groups.length > 0 ? (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '6px 12px', background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)' }}>
                    Breakdown by primary group
                  </div>
                  {groups.map((g, i) => (
                    <div key={g} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 13, color: 'var(--text)' }}>
                      <span>{g}</span>
                      <strong style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{dist[g]}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No new records were changed.</p>
              )}
              {summary?.skipped > 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                  {summary.skipped} skipped (already existed).
                </p>
              )}
            </>
          ) : (
            <div style={{ background: '#ef444414', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 14px', color: 'var(--text)', fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>⚠️ {error || 'Something went wrong.'}</div>
              {Array.isArray(mismatches) && mismatches.length > 0 && (
                <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                  {mismatches.map((mm, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>
                      {mm.code || mm.tallyName}: ERP <strong>{mm.erpGroup}</strong> ≠ Tally <strong>{mm.tallyGroup}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="save-btn" onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
    </div>
  )
}
