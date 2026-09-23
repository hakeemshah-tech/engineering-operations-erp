import React from 'react'
import './ExpiryBadge.css'

export default function ExpiryBadge({ expiryDate, reminderDaysBefore = 30, noExpiry = false }) {
  if (noExpiry) {
    return (
      <span className="expiry-badge" style={{ backgroundColor: 'rgba(107, 114, 128, 0.1)', color: '#6b7280' }}>
        No Expiry
      </span>
    )
  }

  if (!expiryDate) {
    return (
      <span className="expiry-badge" style={{ backgroundColor: 'rgba(107, 114, 128, 0.1)', color: '#6b7280' }}>
        N/A
      </span>
    )
  }

  const expiryTime = new Date(expiryDate).getTime()
  const now = Date.now()
  const daysRemaining = Math.ceil((expiryTime - now) / 86400000)
  const windowMs = (reminderDaysBefore || 30) * 24 * 60 * 60 * 1000

  if (expiryTime < now) {
    return (
      <span className="expiry-badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
        Expired {Math.abs(daysRemaining)} days ago
      </span>
    )
  }

  if (expiryTime - now <= windowMs) {
    return (
      <span className="expiry-badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
        Expires in {daysRemaining} days
      </span>
    )
  }

  return (
    <span className="expiry-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
      Valid
    </span>
  )
}
