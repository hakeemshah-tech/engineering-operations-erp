import { Modal } from '../../design-system/Modal'

/**
 * Glassmorphism warning shown BEFORE a higher-ranked user overrides an attendance
 * row that was marked by a lower-ranked user (and is therefore not server-locked
 * against them). The server allows the save; this modal makes sure the human
 * stops to confirm.
 *
 * Props:
 *   isOpen, onClose, onConfirm
 *   entries: array of { employeeName, date, markedByName, markedByRoleLabel }
 *     - at least one is required. If multiple, all are listed.
 */
export default function OverrideWarningModal({
  isOpen,
  onClose,
  onConfirm,
  entries = []
}) {
  const count = entries.length
  const isMulti = count > 1

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isMulti ? `Override ${count} entries marked by others?` : 'Override another user\'s entry?'}
      size="small"
    >
      <div style={{
        padding: '8px 4px 4px',
        lineHeight: 1.55,
        position: 'relative'
      }}>
        <div style={{
          padding: '16px 18px',
          borderRadius: 14,
          marginBottom: 16,
          background: 'rgba(99, 102, 241, 0.08)',
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          color: 'var(--text)'
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              fontSize: 22,
              flexShrink: 0,
              lineHeight: 1
            }}>⚠️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {isMulti
                  ? `${count} ${count === 1 ? 'entry was' : 'entries were'} marked by lower-ranked users.`
                  : 'This entry was marked by another user.'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                As a higher-ranked role you can override {isMulti ? 'them' : 'it'}, but the original {isMulti ? 'entries are' : 'entry is'} preserved in the audit log.
              </div>
            </div>
          </div>
        </div>

        {count > 0 && (
          <div style={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--input)',
            marginBottom: 16
          }}>
            {entries.slice(0, 8).map((e, idx) => (
              <div key={idx} style={{
                padding: '10px 14px',
                borderBottom: idx < Math.min(entries.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 13
              }}>
                <div style={{ fontWeight: 600 }}>{e.employeeName || 'Unknown employee'}</div>
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                  {e.date ? `${e.date} — ` : ''}
                  marked by <strong>{e.markedByName || 'Unknown'}</strong>
                  {e.markedByRoleLabel ? ` (${e.markedByRoleLabel})` : ''}
                </div>
              </div>
            ))}
            {entries.length > 8 && (
              <div style={{
                padding: '8px 14px',
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center'
              }}>
                + {entries.length - 8} more…
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="hr-btn hr-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="hr-btn hr-btn-primary" onClick={onConfirm}>
            Override
          </button>
        </div>
      </div>
    </Modal>
  )
}
