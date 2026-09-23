import './hr.css'

export default function ExpiryBadge({ date, label = 'Expires' }) {
  if (!date) return <span className="hr-badge hr-badge-neutral">No date</span>

  const now = new Date()
  const expiry = new Date(date)
  const days = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  const dateStr = expiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  if (days < 0) {
    return <span className="hr-badge hr-badge-danger">Expired {dateStr}</span>
  }
  if (days <= 7) {
    return <span className="hr-badge hr-badge-danger">{label} in {days}d ({dateStr})</span>
  }
  if (days <= 30) {
    return <span className="hr-badge hr-badge-warning">{label} in {days}d ({dateStr})</span>
  }
  if (days <= 90) {
    return <span className="hr-badge hr-badge-info">{label} {dateStr}</span>
  }
  return <span className="hr-badge hr-badge-success">{label} {dateStr}</span>
}
