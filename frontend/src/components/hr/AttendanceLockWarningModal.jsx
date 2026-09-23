import { Modal } from '../../design-system/Modal'

export default function AttendanceLockWarningModal({
  isOpen,
  onClose,
  employeeName,
  lockedByRoleWeight,
  userRoleWeight,
  roles = [],
  reason
}) {
  const higherRoles = (roles || [])
    .filter(r => Number.isFinite(r.weight) && r.weight >= lockedByRoleWeight)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(r => r.name)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Entry is locked" size="small">
      <div style={{ padding: '8px 4px 4px', lineHeight: 1.55 }}>
        <div style={{
          padding: '14px 16px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 10,
          marginBottom: 14,
          color: 'var(--text)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {employeeName ? `${employeeName}'s attendance is locked.` : 'This entry is locked.'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {reason || 'A higher-ranked reviewer saved this row. Only someone at the same or higher weight can overwrite it.'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={{
            padding: 12, borderRadius: 8, background: 'var(--input)', border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Locked at weight
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{lockedByRoleWeight ?? '—'}</div>
          </div>
          <div style={{
            padding: 12, borderRadius: 8, background: 'var(--input)', border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Your role weight
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{userRoleWeight ?? 0}</div>
          </div>
        </div>

        {higherRoles.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Roles that can edit: {higherRoles.join(', ')}.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="hr-btn hr-btn-primary" onClick={onClose} type="button">
            Got it
          </button>
        </div>
      </div>
    </Modal>
  )
}
