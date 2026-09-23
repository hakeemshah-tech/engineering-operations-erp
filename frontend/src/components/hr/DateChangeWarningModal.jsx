import { Modal } from '../../design-system/Modal'

function fmt(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString() } catch { return d }
}

export default function DateChangeWarningModal({
  isOpen, onCancel, onDiscardAndSwitch, currentDate, pendingDate, modifiedCount
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Unsaved attendance edits" size="small">
      <div style={{ padding: '4px 4px 8px', lineHeight: 1.55 }}>
        <div style={{
          padding: '14px 16px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 10,
          marginBottom: 14,
          color: 'var(--text)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            You have {modifiedCount} unsaved {modifiedCount === 1 ? 'edit' : 'edits'} for {fmt(currentDate)}.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Switching to {fmt(pendingDate)} will discard those edits. Submit them first if you want to keep them.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="hr-btn hr-btn-secondary" type="button" onClick={onCancel}>
            Stay on {fmt(currentDate)}
          </button>
          <button className="hr-btn hr-btn-danger" type="button" onClick={onDiscardAndSwitch}>
            Discard and switch
          </button>
        </div>
      </div>
    </Modal>
  )
}
