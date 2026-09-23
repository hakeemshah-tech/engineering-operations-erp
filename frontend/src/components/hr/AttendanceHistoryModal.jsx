import { Modal } from '../../design-system/Modal'

const FIELD_LABELS = {
  status: 'Status',
  source: 'Source',
  timeIn: 'Time In',
  timeOut: 'Time Out',
  breakMinutes: 'Break (min)',
  regularHours: 'Regular Hours',
  otHours: 'OT Hours',
  notes: 'Notes',
  projectAllocations: 'Project Allocations'
}

function fmtDateTime(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return String(d)
  }
}

function fmtValue(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) {
    if (v.length === 0) return 'none'
    if (v[0]?.projectId !== undefined || v[0]?.hours !== undefined) {
      return v.map(a => {
        const pid = a?.projectId?.name || a?.projectName || a?.projectId || '?'
        return `${pid}: ${a?.hours ?? 0}h`
      }).join(', ')
    }
    return JSON.stringify(v)
  }
  if (typeof v === 'object') {
    if (v instanceof Date) return fmtDateTime(v)
    return JSON.stringify(v)
  }
  return String(v)
}

export default function AttendanceHistoryModal({ isOpen, onClose, record, employeeName }) {
  if (!isOpen || !record) {
    return <Modal isOpen={false} onClose={onClose} title="" />
  }

  const edits = Array.isArray(record.edits) ? [...record.edits].reverse() : []
  const dateLabel = record.date ? new Date(record.date).toLocaleDateString() : '—'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit history — ${dateLabel}`} size="large">
      <div style={{ padding: '4px 4px 8px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16
        }}>
          <Stat label="Employee" value={employeeName || '—'} />
          <Stat label="Date" value={dateLabel} />
          <Stat label="Source" value={record.source || '—'} />
          <Stat label="Status" value={record.status || '—'} />
        </div>

        <div style={{
          padding: 12, borderRadius: 8, background: 'var(--input)', border: '1px solid var(--border)',
          marginBottom: 16
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Originally submitted
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontWeight: 500 }}>{record.createdBy?.name || record.createdBy?.email || '—'}</span>
            <span style={{ color: 'var(--text-muted)' }}>{fmtDateTime(record.createdAt)}</span>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
          {edits.length === 0 ? 'No edits since submission.' : `${edits.length} edit${edits.length === 1 ? '' : 's'}`}
        </div>

        {edits.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
            {edits.map((e, i) => (
              <div key={i} style={{
                border: '1px solid var(--border)',
                borderRadius: 8, padding: 12, background: 'var(--card)'
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  gap: 8, marginBottom: 8, flexWrap: 'wrap'
                }}>
                  <span style={{ fontWeight: 600 }}>
                    {e.editedBy?.name || e.editedBy?.email || 'Unknown user'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {fmtDateTime(e.editedAt)}
                  </span>
                </div>
                {Array.isArray(e.changes) && e.changes.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {e.changes.map((c, ci) => (
                      <div key={ci} style={{ fontSize: 13, lineHeight: 1.5 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{FIELD_LABELS[c.field] || c.field}:</span>{' '}
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{fmtValue(c.from)}</span>
                        <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                        <span style={{ fontWeight: 500 }}>{fmtValue(c.to)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No field changes recorded.</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="hr-btn hr-btn-primary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, background: 'var(--input)', border: '1px solid var(--border)'
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}
