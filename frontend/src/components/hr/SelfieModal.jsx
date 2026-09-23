import { useEffect, useState } from 'react'
import { Modal } from '../../design-system/Modal'
import { apiFetch } from '../../lib/api'

/**
 * Viewer for a single punch-in or punch-out selfie. The image bytes are
 * fetched via apiFetch (which carries the JWT) and shown as a blob URL -
 * the gated GET /api/attendance/selfie/:attendanceId/:logId/:which
 * endpoint requires auth, so a plain <img src> would fail without a token.
 *
 * Props:
 *   isOpen, onClose
 *   attendanceId, logId, which  ('in' | 'out')
 *   meta: optional context object - { employeeName, date, locationName,
 *         distanceMeters, gps:{lat,lng,accuracyMeters}, ip, capturedAt,
 *         markedByName, entryMethod }
 */
export default function SelfieModal({
  isOpen,
  onClose,
  attendanceId,
  logId,
  which = 'in',
  meta = {}
}) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen || !attendanceId || !logId) {
      setBlobUrl(null)
      setError(null)
      return
    }
    let cancelled = false
    let createdUrl = null

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await apiFetch(`/api/attendance/selfie/${attendanceId}/${logId}/${which}`)
        const blob = await res.blob()
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setBlobUrl(createdUrl)
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Could not load selfie.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [isOpen, attendanceId, logId, which])

  const fmtDate = (d) => {
    if (!d) return null
    try {
      return new Date(d).toLocaleString()
    } catch {
      return String(d)
    }
  }

  const whichLabel = which === 'in' ? 'Punch In' : 'Punch Out'
  const capturedAt = meta?.capturedAt
  const gps = meta?.gps || {}

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${whichLabel} selfie${meta?.employeeName ? ` — ${meta.employeeName}` : ''}`}
      size="medium"
    >
      <div style={{ padding: '4px 4px' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.04)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 14,
          border: '1px solid var(--border)'
        }}>
          {loading && (
            <div style={{ padding: 60, color: 'var(--text-muted)', fontSize: 14 }}>
              Loading selfie…
            </div>
          )}
          {error && !loading && (
            <div style={{
              padding: 18,
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.10)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: 'var(--text)',
              fontSize: 13,
              textAlign: 'center',
              maxWidth: 360
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Could not load selfie</div>
              <div style={{ color: 'var(--text-muted)' }}>{error}</div>
            </div>
          )}
          {blobUrl && !loading && (
            <img
              src={blobUrl}
              alt={`${whichLabel} selfie`}
              style={{
                maxWidth: '100%',
                maxHeight: 480,
                borderRadius: 10,
                boxShadow: '0 6px 24px rgba(0,0,0,0.25)'
              }}
            />
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '8px 14px',
          fontSize: 13,
          color: 'var(--text)'
        }}>
          {meta?.date && (
            <>
              <div style={{ color: 'var(--text-muted)' }}>Date</div>
              <div>{meta.date}</div>
            </>
          )}
          {capturedAt && (
            <>
              <div style={{ color: 'var(--text-muted)' }}>Captured</div>
              <div>{fmtDate(capturedAt)}</div>
            </>
          )}
          {meta?.locationName && (
            <>
              <div style={{ color: 'var(--text-muted)' }}>Location</div>
              <div>{meta.locationName}</div>
            </>
          )}
          {Number.isFinite(meta?.distanceMeters) && (
            <>
              <div style={{ color: 'var(--text-muted)' }}>Distance</div>
              <div>{Math.round(meta.distanceMeters)} m from geofence center</div>
            </>
          )}
          {(gps.lat != null && gps.lng != null) && (
            <>
              <div style={{ color: 'var(--text-muted)' }}>GPS</div>
              <div>
                {Number(gps.lat).toFixed(6)}, {Number(gps.lng).toFixed(6)}
                {Number.isFinite(gps.accuracyMeters) && ` · ±${Math.round(gps.accuracyMeters)}m`}
              </div>
            </>
          )}
          {meta?.ip && (
            <>
              <div style={{ color: 'var(--text-muted)' }}>Network IP</div>
              <div style={{ fontFamily: 'monospace' }}>{meta.ip}</div>
            </>
          )}
          {meta?.markedByName && (
            <>
              <div style={{ color: 'var(--text-muted)' }}>Marked by</div>
              <div>{meta.markedByName}{meta.entryMethod ? ` (${meta.entryMethod})` : ''}</div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" className="hr-btn hr-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
