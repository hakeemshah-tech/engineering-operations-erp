import { Modal } from '../../design-system/Modal'

export default function EditAfterSubmitModal({ isOpen, onCancel, onConfirm, employeeName }) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Edit submitted attendance?" size="small">
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
            {employeeName ? `${employeeName}'s attendance is already submitted.` : 'This row is already submitted.'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Your change will overwrite the saved entry the next time you click Submit. The previous values are kept in the edit history.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="hr-btn hr-btn-secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="hr-btn hr-btn-primary" type="button" onClick={onConfirm}>Yes, edit it</button>
        </div>
      </div>
    </Modal>
  )
}
