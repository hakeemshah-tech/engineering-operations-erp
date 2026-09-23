import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import SelfieModal from '../hr/SelfieModal'
import './PunchPage.css'

/* ============= Formatting helpers ============= */
function formatDate(d) {
  try { return new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return String(d) }
}
function formatTime(d) {
  try { return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return String(d) }
}
function formatHM(d) {
  try { return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }
  catch { return String(d) }
}
function formatDuration(start, end) {
  if (!start || !end) return '—'
  const ms = new Date(end) - new Date(start)
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const total = Math.round(ms / 60000)
  const h = Math.floor(total / 60), m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
function formatDistance(m) {
  if (!Number.isFinite(m)) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(2)} km`
}

/* ============= Haversine for client-side live distance ============= */
function haversineMeters(a, b) {
  if (!a || !b) return Infinity
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

/* ============= Selfie compressor ============= */
function compressSelfie(canvas, targetBytes) {
  let q = 0.72
  let url = canvas.toDataURL('image/jpeg', q)
  const approxBytes = (s) => Math.ceil((s.length - s.indexOf(',') - 1) * 0.75)
  for (let i = 0; i < 5; i++) {
    if (approxBytes(url) <= targetBytes) return url
    q -= 0.12
    if (q < 0.28) break
    url = canvas.toDataURL('image/jpeg', q)
  }
  return url
}

/* ============= Server-error mapper ============= */
const ERROR_MAP = {
  LOW_ACCURACY:           { title: 'GPS not precise enough', t: d => `GPS accuracy is ±${d?.accuracyMeters || '?'}m (max ${d?.maxAcceptableMeters || 2000}m). Move to an open area and wait a few seconds for the signal to refine.` },
  OPEN_LOG_EXISTS:        { title: 'Already punched in', t: d => `You have an open log since ${d?.openLog?.timeIn ? formatHM(d.openLog.timeIn) : 'earlier today'}. Punch OUT first.` },
  NO_OPEN_LOG:            { title: 'Nothing to punch out', t: () => 'You haven\'t punched in yet today.' },
  OUT_OF_GEOFENCE:        { title: 'Outside the geofence', t: d => `You're ${d?.distanceMeters}m from ${d?.locationName} (allowed ${d?.allowedRadiusMeters}m). Move closer or contact your supervisor.` },
  NO_MATCHING_GEOFENCE:   { title: 'No site in range', t: d => d?.closest ? `Closest: ${d.closest.locationName} at ${d.closest.distanceMeters}m (radius ${d.closest.allowedRadiusMeters}m).` : 'You are not inside any assigned project geofence.' },
  NO_ACTIVE_SITE:         { title: 'No site configured', t: () => 'You have no active project with a configured site location, and no base location set. Ask HR or your Project Engineer.' },
  IP_NOT_WHITELISTED:     { title: 'Network not allowed', t: d => `This network (${d?.ip || 'unknown'}) is not on the office allowlist. Connect to office Wi-Fi or ask HR.` },
  IP_LOCK_MISCONFIGURED:  { title: 'IP Lock misconfigured', t: () => 'Admin enabled IP Lock without adding any allowed networks. Ask an admin to fix the Settings page.' },
  NO_BASE_LOCATION:       { title: 'No base location', t: () => 'No location is configured for you. Ask HR.' },
  BASE_LOCATION_INACTIVE: { title: 'Base location inactive', t: () => 'Your base location has been deactivated.' },
  PROJECT_NOT_ASSIGNED:   { title: 'Not assigned', t: () => 'You are no longer assigned to that project. Refresh the page.' },
  PROJECT_NOT_FOUND:      { title: 'Project removed', t: () => 'The selected project no longer exists. Refresh the page.' },
  PROJECT_INACTIVE:       { title: 'Project inactive', t: () => 'That project or its site location is not active anymore.' },
  TRAVEL_NOT_SELF_SERVICE:{ title: 'Not allowed', t: () => 'Travel logs are added by your supervisor.' },
  NO_EMPLOYEE_PROFILE:    { title: 'No employee profile', t: () => 'No employee profile is linked to your user. Ask HR.' },
  EMPLOYEE_INACTIVE:      { title: 'Employee inactive', t: () => 'Your employee status isn\'t active.' },
  locked:                 { title: 'Entry locked', t: () => 'Today\'s entry was overridden by a higher-ranked reviewer.' },
  SELFIE_MISSING:         { title: 'Selfie required', t: () => 'A selfie is required for every punch. Allow camera access.' },
  SELFIE_TOO_LARGE:       { title: 'Selfie too large', t: () => 'Selfie exceeded the size limit. Retake.' },
  SELFIE_UNSUPPORTED_TYPE:{ title: 'Unsupported photo', t: () => 'Selfie type isn\'t accepted.' },
  SELFIE_INVALID:         { title: 'Selfie unreadable', t: () => 'Couldn\'t decode the photo. Retake.' },
  SELFIE_WRITE_FAILED:    { title: 'Storage error', t: () => 'Couldn\'t save selfie on the server. Try again.' }
}
function mapError(err) {
  const data = err?.response?.data || {}
  const code = data.code
  if (code && ERROR_MAP[code]) return { type: 'error', title: ERROR_MAP[code].title, message: ERROR_MAP[code].t(data) }
  return { type: 'error', title: 'Punch failed', message: data.message || 'Network error — try again.' }
}

const GEO_ERROR_MESSAGES = {
  1: 'Location permission denied. Allow location access in your browser settings, then reload.',
  2: 'Position unavailable. Move to an area with a clearer view of the sky.',
  3: 'Timed out acquiring position. Check your GPS / location services.'
}

/* ----- Manual GPS acquire (Attendance v3) -----
 * Replaces the old `watchPosition` stream. The flicker bugs that were
 * disabling the button after "in range" was shown were caused by every
 * new fix overwriting the previous one - a worse fix would arrive 1–2
 * seconds after a good one and undo every UI assertion that depended on
 * it. The fix is architectural: stop subscribing to a stream and use
 * one-shot `getCurrentPosition` calls driven by explicit user action.
 *
 * The single acceptable-accuracy threshold is admin-configurable as
 * `maxPunchAccuracyMeters` in Settings → Attendance. We read it from
 * the /shift-status policy block; fall back to 1000 m if missing.
 *
 * PREWARM_MAX_AGE_MS lets us reuse a recent fix from another tab/site
 * - almost-instant on mobile devices that have used GPS in the last 5
 * minutes. No effect on cold devices.
 */
const DEFAULT_MAX_PUNCH_ACCURACY_M = 1000
const PREWARM_MAX_AGE_MS            = 5 * 60 * 1000     // accept cached fix up to 5 min old
const ACQUIRE_TIMEOUT_MS            = 12000             // GPS chip warmup window
const PREWARM_TIMEOUT_MS            = 3000              // pre-warm gives up fast if cache is cold

/* ============= Component ============= */

export default function PunchPage() {
  const navigate = useNavigate()
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, [])

  /* ----- Core state ----- */
  const [now, setNow] = useState(new Date())
  // GPS lifecycle (manual acquire, no auto-watch):
  //   'idle' - page just loaded, no GPS attempt yet
  //   'acquiring' - getCurrentPosition is running
  //   'ready' - got a fix with accuracy ≤ maxPunchAccuracyMeters
  //   'low_accuracy' - got a fix but accuracy worse than max
  //   'error' - permission denied, timeout, etc.
  const [gpsState, setGpsState] = useState('idle')
  const [coords, setCoords] = useState(null)            // { lat, lng, accuracy, capturedAt }
  const [geoError, setGeoError] = useState('')
  // True when the worker explicitly opts to send a low-accuracy punch.
  // Sticky - clears on a fresh acquire.
  const [useApproximate, setUseApproximate] = useState(false)
  const [todayRecord, setTodayRecord] = useState(null)
  const [loadingRecord, setLoadingRecord] = useState(true)

  const [punchCtx, setPunchCtx] = useState(null)        // employee + candidates + policy
  const [loadingCtx, setLoadingCtx] = useState(true)
  const [ctxError, setCtxError] = useState('')

  const [selectedKey, setSelectedKey] = useState(null) // user's explicit pick when 2+ in range
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  /* Camera + selfie state */
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraStatus, setCameraStatus] = useState('idle')
  const [cameraError, setCameraError] = useState('')
  const [selfieDataUrl, setSelfieDataUrl] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  /* View previously-captured selfie (audit / "I want to see my photo") */
  const [selfieView, setSelfieView] = useState({ open: false, attendanceId: null, logId: null, which: 'in', meta: {} })
  const closeSelfieView = useCallback(() => {
    setSelfieView({ open: false, attendanceId: null, logId: null, which: 'in', meta: {} })
  }, [])

  /* ----- Live clock ----- */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  /* ----- Manual GPS acquire -----
   * Pre-warm on mount: if the browser has any recent fix in cache
   * (from this tab or another), we get it back almost instantly.
   * Otherwise the call returns POSITION_UNAVAILABLE and the user
   * sees the "Get my location" button.
   *
   * acquireLocation() runs the real GPS call when the user taps. */

  // We need the configured maxAccuracy to decide ready vs low_accuracy,
  // but settings load asynchronously. The function takes a current max
  // arg so it can be re-classified later when settings arrive.
  const classifyFix = useCallback((pos, max) => {
    const accuracy = pos.coords.accuracy
    if (!Number.isFinite(accuracy)) return 'low_accuracy'
    return accuracy <= max ? 'ready' : 'low_accuracy'
  }, [])

  const acquireLocation = useCallback((opts = {}) => {
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not supported in this browser.')
      setGpsState('error')
      return
    }
    setGeoError('')
    setUseApproximate(false)
    setGpsState('acquiring')
    const max = opts.maxAccuracy ?? DEFAULT_MAX_PUNCH_ACCURACY_M
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: Date.now()
        }
        setCoords(next)
        setGpsState(classifyFix(pos, max))
      },
      (err) => {
        setGeoError(GEO_ERROR_MESSAGES[err.code] || err.message || 'Unable to acquire position.')
        setGpsState('error')
      },
      { enableHighAccuracy: true, timeout: ACQUIRE_TIMEOUT_MS, maximumAge: 0 }
    )
  }, [classifyFix])

  // Pre-warm with cached fix. Doesn't change state on failure - we silently
  // stay in 'idle' so the user clicks "Get my location" as if nothing tried.
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Only adopt the cached fix if we haven't already started a real
        // acquire (user may have tapped during pre-warm).
        setGpsState(prevState => {
          if (prevState !== 'idle') return prevState
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            capturedAt: Date.now()
          })
          return classifyFix(pos, DEFAULT_MAX_PUNCH_ACCURACY_M)
        })
      },
      () => { /* silent - user will tap to acquire */ },
      { enableHighAccuracy: false, timeout: PREWARM_TIMEOUT_MS, maximumAge: PREWARM_MAX_AGE_MS }
    )
  }, [classifyFix])

  /* ----- Load today's row -----
   * Uses /api/attendance/mine (self-scoped on the server) instead of the
   * HR-style GET / endpoint. The old path failed when employee.userId
   * came back un-populated for plain employee roles - the client-side
   * userId filter dropped the row and the Punch-Out button never
   * appeared. /mine guarantees the caller's row, no filter needed.
   *
   * todayStr is built from LOCAL fields, not UTC. The previous
   * toISOString().slice(0,10) returned yesterday for any non-UTC tz
   * after midnight local time, so today's row would never be matched. */
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const loadToday = useCallback(async () => {
    setLoadingRecord(true)
    try {
      const res = await api.get('/api/attendance/mine', {
        params: { startDate: todayStr, endDate: todayStr }
      })
      const rows = Array.isArray(res.data?.rows) ? res.data.rows : []
      // /mine sorts newest-first and the query window is one day, so
      // rows[0] is today's row if it exists.
      setTodayRecord(rows[0] || null)
    } catch {
      setTodayRecord(null)
    } finally {
      setLoadingRecord(false)
    }
  }, [todayStr])

  useEffect(() => { loadToday() }, [loadToday])

  /* ----- Load punch context ----- */
  const loadCtx = useCallback(async () => {
    setLoadingCtx(true)
    setCtxError('')
    try {
      const res = await api.get('/api/attendance/punch-context')
      setPunchCtx(res.data)
    } catch (err) {
      const data = err?.response?.data || {}
      setCtxError(data.message || 'Failed to load attendance options.')
      setPunchCtx(null)
    } finally {
      setLoadingCtx(false)
    }
  }, [])
  useEffect(() => { loadCtx() }, [loadCtx])

  /* ----- Live shift status (v3) - polled every minute ----- */
  const [shiftStatus, setShiftStatus] = useState(null)
  const loadShiftStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/attendance/shift-status')
      setShiftStatus(res.data)
    } catch {
      setShiftStatus(null)
    }
  }, [])
  useEffect(() => {
    loadShiftStatus()
    const id = setInterval(loadShiftStatus, 60_000)
    return () => clearInterval(id)
  }, [loadShiftStatus])

  /* ----- Derive open-log state ----- */
  const openLog = useMemo(() => {
    const logs = todayRecord?.timeLogs || []
    return logs.find(l => l.timeIn && !l.timeOut) || null
  }, [todayRecord])

  const action = openLog ? 'OUT' : 'IN'

  /* ----- Policy fields from /shift-status (with safe defaults) ----- */
  const maxAccuracy        = Number(shiftStatus?.policy?.maxPunchAccuracyMeters)   || DEFAULT_MAX_PUNCH_ACCURACY_M
  const allowApproximate   = shiftStatus?.policy?.allowApproximatePunch === true
  // enforceGeofence defaults to TRUE - when undefined (shiftStatus not
  // loaded yet) we err on the strict side so we don't accidentally let
  // a punch through. Only an explicit `false` from the server flips
  // the geofence off.
  const enforceGeofence    = shiftStatus?.policy?.enforceGeofence !== false
  const haveCoords         = !!coords
  // Worker can act when GPS is ready, OR when it's low-accuracy AND they
  // explicitly opted into the approximate-punch fallback.
  const coordsActionable   = gpsState === 'ready'
                          || (gpsState === 'low_accuracy' && allowApproximate && useApproximate)

  /* ----- Build candidates with live distance + selection state -----
   * Two distinct fields per candidate:
   *   inRange - strict raw-distance check (distance ≤ radius).
   *                      What "✓ In range" green badge displays.
   *   effectiveInRange - what the BUTTON honors. Folds in policy
   *                      bypasses the server is going to apply anyway:
   *                        - noGeofence location
   *                        - org-wide enforceGeofence = false
   *                        - worker explicitly opted into approximate
   *                      Without this, the client blocks the user from
   *                      pressing a button the server would have accepted.
   */
  const candidates = useMemo(() => {
    if (!punchCtx) return []
    const list = punchCtx.candidates.map(c => {
      let distance = Infinity, inRange = false, distanceKnown = false
      if (haveCoords && c.location?.lat != null) {
        distance = haversineMeters(coords, { lat: c.location.lat, lng: c.location.lng })
        distanceKnown = true
        inRange = c.location.noGeofence || distance <= (c.location.geofenceRadiusMeters || 0)
      } else if (c.location?.noGeofence) {
        inRange = true
      }
      const noGeofence       = !!c.location?.noGeofence
      const geofenceBypassed = !enforceGeofence || noGeofence
      const approximateOk    = allowApproximate && useApproximate
      const effectiveInRange = inRange || geofenceBypassed || approximateOk
      const key = `${c.kind}:${c.location?._id || ''}:${c.project?._id || ''}`
      return { ...c, distance, distanceKnown, inRange, effectiveInRange, geofenceBypassed, approximateOk, key }
    })
    list.sort((a, b) => {
      if (a.effectiveInRange && !b.effectiveInRange) return -1
      if (!a.effectiveInRange && b.effectiveInRange) return 1
      return a.distance - b.distance
    })
    return list
  }, [punchCtx, coords, haveCoords, enforceGeofence, allowApproximate, useApproximate])

  // Selection uses effectiveInRange so policy bypasses count. The strict
  // `inRange` is still available for the green/orange badge UI.
  const inRangeCount = candidates.filter(c => c.effectiveInRange).length

  /* ----- Auto-select when exactly one is selectable -----
   * Honors policy bypasses via effectiveInRange so a worker whose
   * admin disabled enforceGeofence (or who opted into approximate)
   * can have their candidate auto-selected even though the raw
   * distance check would otherwise fail. */
  useEffect(() => {
    if (action !== 'IN') return
    if (inRangeCount === 1) {
      const onlyOne = candidates.find(c => c.effectiveInRange)
      if (onlyOne) setSelectedKey(onlyOne.key)
    } else if (inRangeCount === 0) {
      setSelectedKey(null)
    }
    // 2+ selectable - leave user's pick alone (or null until they pick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRangeCount, action])

  const selectedCandidate = useMemo(() => candidates.find(c => c.key === selectedKey) || null, [candidates, selectedKey])

  /* ----- Live distance for the OPEN log (punch-out screen) -----
   * Same effective-vs-strict split as candidates above:
   *   inRange - strict distance check, drives the badge UI
   *   effectiveInRange - folds in policy bypasses, drives the button */
  const openLogDistance = useMemo(() => {
    if (!openLog) return null
    const refLoc = (openLog.effectiveLocation && typeof openLog.effectiveLocation === 'object')
      ? openLog.effectiveLocation
      : (openLog.referenceId && typeof openLog.referenceId === 'object' && openLog.referenceId.lat != null
        ? openLog.referenceId
        : null)
    if (!refLoc) return null
    if (refLoc.noGeofence) {
      return {
        distance: 0, radius: 0, inRange: true, effectiveInRange: true,
        noGeofence: true, geofenceBypassed: true,
        locationName: refLoc.name, distanceKnown: false
      }
    }
    if (refLoc.lat == null) return null
    if (!coords) return null
    const dist = haversineMeters(coords, { lat: refLoc.lat, lng: refLoc.lng })
    const inRange          = dist <= (refLoc.geofenceRadiusMeters || 0)
    const geofenceBypassed = !enforceGeofence
    const approximateOk    = allowApproximate && useApproximate
    return {
      distance: dist,
      radius: refLoc.geofenceRadiusMeters || 0,
      inRange,
      effectiveInRange: inRange || geofenceBypassed || approximateOk,
      noGeofence: false,
      geofenceBypassed,
      approximateOk,
      locationName: refLoc.name,
      distanceKnown: true
    }
  }, [openLog, coords, enforceGeofence, allowApproximate, useApproximate])

  /* ----- Camera lifecycle (unchanged from v2) ----- */
  const stopCameraStream = useCallback(() => {
    setCameraStream(prev => {
      if (prev) prev.getTracks().forEach(t => t.stop())
      return null
    })
  }, [])
  const closeCamera = useCallback(() => {
    stopCameraStream()
    setCameraOpen(false)
    setCameraStatus('idle')
    setCameraError('')
    setSelfieDataUrl(null)
  }, [stopCameraStream])
  useEffect(() => {
    const v = videoRef.current
    if (v && cameraStream) { v.srcObject = cameraStream; v.play().catch(() => {}) }
  }, [cameraStream, cameraStatus])
  useEffect(() => () => stopCameraStream(), [stopCameraStream])

  const openCamera = useCallback(async () => {
    setCameraError('')
    setSelfieDataUrl(null)
    setCameraOpen(true)
    setCameraStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      setCameraStream(stream)
      setCameraStatus('live')
    } catch (err) {
      const map = {
        NotAllowedError: 'Camera permission denied. Allow access in your browser settings.',
        NotFoundError: 'No camera detected on this device.',
        NotReadableError: 'Camera is in use by another app.',
        OverconstrainedError: 'Camera does not support the requested settings.',
        SecurityError: 'Camera is blocked by browser security policy.'
      }
      setCameraError(map[err.name] || err.message || 'Unable to start camera.')
      setCameraStatus('error')
    }
  }, [])

  const captureSelfie = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) return
    const size = Math.min(vw, vh)
    const sx = (vw - size) / 2
    const sy = (vh - size) / 2
    canvas.width = 400; canvas.height = 400
    canvas.getContext('2d').drawImage(video, sx, sy, size, size, 0, 0, 400, 400)
    stopCameraStream()
    setSelfieDataUrl(compressSelfie(canvas, 50 * 1024))
    setCameraStatus('captured')
  }, [stopCameraStream])
  const retake = useCallback(() => { setSelfieDataUrl(null); openCamera() }, [openCamera])

  /* ----- Submit punch ----- */
  const confirmPunch = useCallback(async () => {
    if (!coords || !selfieDataUrl) return
    setSubmitting(true)
    setNotice(null)
    setCameraError('')
    try {
      const body = {
        action,
        lat: coords.lat,
        lng: coords.lng,
        accuracyMeters: coords.accuracy,
        selfieBase64: selfieDataUrl,
        // Explicit opt-in flag - server uses this to bypass its
        // maxPunchAccuracyMeters check AND marks the row as approximate.
        ...(useApproximate ? { approximate: true } : {})
      }
      // Pass the right pick depending on candidate kind. Project picks send
      // projectId; base/additional/group picks send locationId.
      if (action === 'IN' && selectedCandidate) {
        if (selectedCandidate.kind === 'project' && selectedCandidate.project?._id) {
          body.projectId = selectedCandidate.project._id
        } else if (selectedCandidate.location?._id) {
          body.locationId = selectedCandidate.location._id
        }
      }
      const res = await api.post('/api/attendance/punch', body)
      const data = res.data || {}
      if (data.closedLog || action === 'OUT') {
        setNotice({
          type: 'success',
          title: 'Punched out',
          message: `Today: ${(Number(data.regularHours) || 0).toFixed(2)}h regular + ${(Number(data.otHours) || 0).toFixed(2)}h OT.`
        })
      } else {
        setNotice({
          type: 'success',
          title: 'Punched in',
          message: `At ${data.locationName || data.projectName || 'site'}, ${formatHM(new Date())}.`
        })
      }
      closeCamera()
      loadToday()
    } catch (err) {
      const mapped = mapError(err)
      setCameraError(`${mapped.title}: ${mapped.message}`)
    } finally {
      setSubmitting(false)
    }
  }, [coords, selfieDataUrl, action, selectedCandidate, loadToday, closeCamera, useApproximate])

  /* ----- Render helpers (manual-acquire flow) -----
   * The status pill maps directly off gpsState - no derived quality
   * tiers, no flicker. State only changes when the user acts. */
  const geoStatus =
    gpsState === 'error'        ? 'error' :
    gpsState === 'acquiring'    ? 'acquiring' :
    gpsState === 'low_accuracy' ? 'poor' :
    gpsState === 'ready'        ? 'ok' :
                                  'idle'
  const accuracyTxt = coords?.accuracy != null ? `±${Math.round(coords.accuracy)}m` : ''
  const geoText =
    geoStatus === 'error'     ? (geoError || 'Could not acquire location.') :
    geoStatus === 'acquiring' ? 'Getting your location… (up to ~15 s outdoors, longer indoors)' :
    geoStatus === 'poor'      ? `Position has low accuracy (${accuracyTxt}). Try again from an open area, or use the approximate-punch option if your admin enabled it.` :
    geoStatus === 'ok'        ? `Position ready (${accuracyTxt})` :
                                'Tap "Get my location" to acquire a position.'

  // Punch enable rules - explicit, no quality flicker.
  // IN  is enabled when GPS is actionable AND a candidate is selected.
  // OUT is enabled when GPS is actionable AND we are inside the open
  //     log's geofence (or the open log is at a noGeofence location).
  const punchInEnabled  = action === 'IN'  && coordsActionable && !!selectedCandidate
  const punchOutEnabled = action === 'OUT' && coordsActionable && openLogDistance?.effectiveInRange
  const punchEnabled = action === 'IN' ? punchInEnabled : punchOutEnabled
  const buttonLabel = action === 'IN' ? 'Punch in' : 'Punch out'

  // Disable-reason text for the button - kills the "silently disabled
  // with no explanation" trap. Uses effectiveInRange so bypass-aware
  // states don't show misleading "Move closer" text.
  const disabledReason =
    submitting                            ? null :
    shiftStatus?.nextAction === 'NONE'    ? (shiftStatus?.blockReason?.message || 'Punching is blocked today.') :
    gpsState === 'idle'                   ? 'Tap "Get my location" first' :
    gpsState === 'acquiring'              ? '⏳ Getting your location…' :
    gpsState === 'error'                  ? '⚠ Location error — see message above' :
    gpsState === 'low_accuracy' && !useApproximate ? (
      allowApproximate
        ? 'Low GPS accuracy — use approximate-punch option below'
        : 'GPS too imprecise — move to an open area and try again'
    ) :
    action === 'IN' && !selectedCandidate ? '⚠ Select a location above' :
    action === 'OUT' && openLogDistance && !openLogDistance.effectiveInRange ? '⚠ Move within range to punch out' :
    null

  const totals = useMemo(() => ({
    regularH: Number(todayRecord?.regularHours) || 0,
    otH: Number(todayRecord?.otHours) || 0,
    breakM: Number(todayRecord?.breakMinutes) || 0
  }), [todayRecord])

  return (
    <div className="punch-page">
      <div className="punch-bg">
        <div className="punch-orb punch-orb-1" />
        <div className="punch-orb punch-orb-2" />
      </div>

      <div className="punch-shell">
        <button type="button" className="punch-exit" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">×</button>

        <div className="punch-card">
          <div className="punch-card-glow" />

          <div className="punch-identity">
            <div className="punch-avatar" aria-hidden="true">
              {(currentUser?.name || currentUser?.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="punch-identity-text">
              <div className="punch-name">{currentUser?.name || 'Employee'}</div>
              <div className="punch-role">{punchCtx?.employee?.employeeId || ''} {punchCtx?.employee?.category ? `· ${punchCtx.employee.category.replace(/_/g, ' ')}` : ''}</div>
            </div>
          </div>

          <div className="punch-time-block">
            <div className="punch-date">{formatDate(now)}</div>
            <div className="punch-clock">{formatTime(now)}</div>
          </div>

          <div className={`punch-geo punch-geo-${geoStatus}`}>
            <span className="punch-geo-dot" />
            <span className="punch-geo-text">{geoText}</span>
          </div>

          {/* ----- Manual GPS acquire button -----
           * Primary action when no usable fix yet. Becomes a small
           * "Refresh location" link once a fix is in hand. */}
          {gpsState === 'idle' || gpsState === 'error' || gpsState === 'acquiring' ? (
            <button
              type="button"
              className={`punch-acquire-btn ${gpsState === 'acquiring' ? 'busy' : ''}`}
              onClick={() => acquireLocation({ maxAccuracy })}
              disabled={gpsState === 'acquiring'}
            >
              {gpsState === 'acquiring'
                ? '⏳ Getting your location…'
                : gpsState === 'error'
                  ? '🔄 Try again'
                  : '📍 Get my location'}
            </button>
          ) : (
            <div className="punch-acquire-meta">
              <span>
                Position acquired{coords?.capturedAt ? ` ${Math.max(0, Math.round((Date.now() - coords.capturedAt) / 1000))} s ago` : ''}
              </span>
              <button
                type="button"
                className="punch-acquire-link"
                onClick={() => acquireLocation({ maxAccuracy })}
              >
                🔄 Refresh location
              </button>
            </div>
          )}

          {/* ----- Approximate-punch opt-in -----
           * Shown only when accuracy is worse than the configured cap
           * AND the admin enabled the escape hatch. Worker explicitly
           * opts in by checking the box; their punch is then sent with
           * `approximate: true` and the row is flagged for HR review. */}
          {gpsState === 'low_accuracy' && allowApproximate && (
            <div className="punch-approx">
              <div className="punch-approx-title">⚠ GPS imprecise ({accuracyTxt})</div>
              <div className="punch-approx-msg">
                Your current location can't be confirmed to the usual precision (max {maxAccuracy}m).
                You can punch with what we have, but the row will be flagged for HR review.
              </div>
              <label className="punch-approx-check">
                <input
                  type="checkbox"
                  checked={useApproximate}
                  onChange={(e) => setUseApproximate(e.target.checked)}
                />
                Use my approximate position
              </label>
            </div>
          )}

          {/* ----- PUNCH OUT - open log card with live distance ----- */}
          {action === 'OUT' && openLog && (
            <div className={`punch-openlog ${openLogDistance?.inRange ? 'in' : 'out'}`}>
              <div className="punch-openlog-header">
                <div>
                  <strong>Open log</strong>
                  <span className="punch-openlog-sub">since {formatHM(openLog.timeIn)} · {openLog.type}</span>
                </div>
                <div className="punch-openlog-name">{
                  openLogDistance?.locationName
                    || openLog.effectiveLocation?.name
                    || (typeof openLog.referenceId === 'object' ? openLog.referenceId?.name : '—')
                }</div>
              </div>
              {openLogDistance ? (
                <div className={`punch-distance ${openLogDistance.effectiveInRange ? 'in' : 'out'}`}>
                  {openLogDistance.noGeofence
                    ? <>🌐 <strong>No geofence on this location</strong> — you can punch out from anywhere. Your coordinates are still recorded.</>
                    : openLogDistance.inRange
                      ? <>✓ <strong>Within range</strong> — you are <strong>{formatDistance(openLogDistance.distance)}</strong> from {openLogDistance.locationName} (allowed {openLogDistance.radius}m).</>
                      : openLogDistance.geofenceBypassed
                        ? <>🌐 <strong>Geofence enforcement is off</strong> — you can punch out from anywhere. Your recorded distance is <strong>{formatDistance(openLogDistance.distance)}</strong>.</>
                        : openLogDistance.approximateOk
                          ? <>≈ <strong>Approximate punch confirmed</strong> — your GPS reads <strong>{formatDistance(openLogDistance.distance)}</strong> from {openLogDistance.locationName}, but you've opted to punch with low-confidence position. HR will see this row flagged.</>
                          : <>✗ <strong>Out of range</strong> — you are <strong>{formatDistance(openLogDistance.distance)}</strong> from {openLogDistance.locationName}. Move within {openLogDistance.radius}m to punch out, or contact your supervisor.</>
                  }
                </div>
              ) : (
                <div className="punch-distance muted">
                  ⏳ Waiting for a precise GPS fix before checking your distance from the punch-in location.
                </div>
              )}
            </div>
          )}

          {/* ----- PUNCH IN - multi-candidate picker ----- */}
          {action === 'IN' && (
            <div className="punch-candidates">
              <div className="punch-candidates-header">
                <span>Where are you punching in?</span>
                {inRangeCount > 0 && <span className="punch-candidates-summary">{inRangeCount} in range</span>}
              </div>

              {loadingCtx ? (
                <div className="punch-candidates-empty muted">Loading your locations…</div>
              ) : ctxError ? (
                <div className="punch-candidates-empty error">{ctxError}</div>
              ) : candidates.length === 0 ? (
                <div className="punch-candidates-empty muted">
                  No location or project is configured for you. Ask HR to assign a base location, or your Project Engineer to set a site for your project.
                </div>
              ) : (
                <ul className="punch-card-list">
                  {candidates.map(c => (
                    <PunchCandidateCard
                      key={c.key}
                      candidate={c}
                      selected={selectedKey === c.key}
                      multipleInRange={inRangeCount > 1}
                      onSelect={() => setSelectedKey(c.key)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ----- Today's logs ----- */}
          <div className="punch-logs">
            <div className="punch-logs-header">
              <span>Today's logs</span>
              {(totals.regularH || totals.otH || totals.breakM) > 0 && (
                <span className="punch-logs-summary">
                  {totals.regularH.toFixed(1)}h · OT {totals.otH.toFixed(1)}h · break {totals.breakM}m
                </span>
              )}
            </div>
            {loadingRecord ? (
              <div className="punch-logs-empty muted">Loading…</div>
            ) : (todayRecord?.timeLogs || []).length === 0 ? (
              <div className="punch-logs-empty muted">No logs yet today.</div>
            ) : (
              <ul className="punch-log-list">
                {(todayRecord.timeLogs || []).map((log, i) => {
                  const isOpen = log.timeIn && !log.timeOut
                  const icon = log.type === 'Office' ? '⏰' : log.type === 'Travel' ? '🚗' : '📍'
                  const refName = (log.referenceId && typeof log.referenceId === 'object') ? (log.referenceId.name || '—') : log.type
                  const openSelfie = (which) => {
                    if (!log._id || !todayRecord?._id) return
                    setSelfieView({
                      open: true,
                      attendanceId: String(todayRecord._id),
                      logId: String(log._id),
                      which,
                      meta: {
                        date: todayStr,
                        capturedAt: which === 'in' ? (log.inCoordinates?.capturedAt || log.timeIn) : (log.outCoordinates?.capturedAt || log.timeOut),
                        distanceMeters: which === 'in' ? log.inDistanceMeters : log.outDistanceMeters,
                        gps: which === 'in' ? log.inCoordinates : log.outCoordinates,
                        ip: which === 'in' ? log.inIpAddress : log.outIpAddress,
                        locationName: refName
                      }
                    })
                  }
                  return (
                    <li key={log._id || i} className={`punch-log-row ${isOpen ? 'open' : ''}`}>
                      <span className="punch-log-icon">{icon}</span>
                      <span className="punch-log-time">{formatHM(log.timeIn)} → {log.timeOut ? formatHM(log.timeOut) : '…open'}</span>
                      <span className="punch-log-name">{refName}</span>
                      <span className="punch-log-dur">{isOpen ? '⚠ open' : formatDuration(log.timeIn, log.timeOut)}</span>
                      <span className="punch-log-selfies">
                        {log.inSelfieUrl && (
                          <button
                            type="button"
                            className="punch-log-selfie-btn"
                            title="View Punch In selfie"
                            onClick={() => openSelfie('in')}
                          >📷</button>
                        )}
                        {log.outSelfieUrl && (
                          <button
                            type="button"
                            className="punch-log-selfie-btn punch-log-selfie-btn-out"
                            title="View Punch Out selfie"
                            onClick={() => openSelfie('out')}
                          >📷</button>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <ShiftStatusCard status={shiftStatus} action={action} />

          {notice && (
            <div className={`punch-notice punch-notice-${notice.type}`}>
              <div className="punch-notice-title">{notice.title}</div>
              <div className="punch-notice-msg">{notice.message}</div>
            </div>
          )}

          <button
            type="button"
            className={`punch-btn punch-btn-${action.toLowerCase()}`}
            onClick={openCamera}
            disabled={!punchEnabled || submitting || shiftStatus?.nextAction === 'NONE'}
          >
            <span className="punch-btn-label">
              {submitting
                ? 'Submitting…'
                : disabledReason
                  ? disabledReason
                  : action === 'IN'
                    ? `📸 ${buttonLabel} — ${selectedCandidate?.location?.name || selectedCandidate?.project?.name || ''}`
                    : `📸 ${buttonLabel}`}
            </span>
          </button>

          <div className="punch-foot">
            Tap to take a selfie. The camera stops the instant your photo is captured.
          </div>
        </div>
      </div>

      {/* ============= Camera modal ============= */}
      {cameraOpen && (
        <div className="punch-cam-overlay" role="dialog" aria-modal="true" aria-label="Selfie capture">
          <div className="punch-cam">
            <button type="button" className="punch-cam-close" onClick={closeCamera} aria-label="Cancel">×</button>
            <div className="punch-cam-title">{action === 'IN' ? 'Punch In selfie' : 'Punch Out selfie'}</div>
            {cameraStatus === 'starting' && <div className="punch-cam-msg">Starting camera…</div>}
            {cameraStatus === 'error' && <div className="punch-cam-msg punch-cam-msg-error">{cameraError || 'Camera unavailable.'}</div>}
            {(cameraStatus === 'live' || cameraStatus === 'starting') && <video ref={videoRef} className="punch-cam-video" playsInline muted autoPlay />}
            {cameraStatus === 'captured' && selfieDataUrl && <img className="punch-cam-preview" src={selfieDataUrl} alt="Selfie preview" />}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {cameraStatus === 'captured' && cameraError && <div className="punch-cam-msg punch-cam-msg-error">{cameraError}</div>}
            <div className="punch-cam-actions">
              {cameraStatus === 'live' && <button type="button" className="punch-cam-capture" onClick={captureSelfie} aria-label="Capture selfie" />}
              {cameraStatus === 'captured' && (
                <>
                  <button type="button" className="punch-cam-btn punch-cam-btn-ghost" onClick={retake} disabled={submitting}>Retake</button>
                  <button
                    type="button"
                    className={`punch-cam-btn punch-cam-btn-primary punch-cam-btn-${action.toLowerCase()}`}
                    onClick={confirmPunch}
                    disabled={submitting || !coords}
                  >
                    {submitting ? 'Submitting…' : action === 'IN' ? 'Confirm Punch In' : 'Confirm Punch Out'}
                  </button>
                </>
              )}
              {cameraStatus === 'error' && (
                <button type="button" className="punch-cam-btn punch-cam-btn-primary" onClick={openCamera}>Retry</button>
              )}
            </div>
          </div>
        </div>
      )}

      <SelfieModal
        isOpen={selfieView.open}
        attendanceId={selfieView.attendanceId}
        logId={selfieView.logId}
        which={selfieView.which}
        meta={selfieView.meta}
        onClose={closeSelfieView}
      />
    </div>
  )
}

/* ============= Per-candidate card ============= */

/* ============= Shift status (Attendance v3) ============= */
function ShiftStatusCard({ status, action }) {
  if (!status) return null
  const policy = status.policy || {}
  if (!policy.autoStatusEnabled) return null      // v3 silent when master OFF

  const sched = status.schedule || {}
  const kindLabel = sched.kind === 'site' ? '📍 Site shift' : '🏢 Office shift'

  // Blocked: holiday or weekend
  if (status.blockReason) {
    const isHoliday = status.holiday
    return (
      <div className="punch-shift punch-shift-block">
        <div className="punch-shift-icon">{isHoliday ? '🌴' : '🛌'}</div>
        <div>
          <div className="punch-shift-title">
            {isHoliday ? `Holiday — ${status.holiday.name}` : 'Non-working day'}
          </div>
          <div className="punch-shift-sub">
            {status.blockReason.message}
          </div>
        </div>
      </div>
    )
  }

  // Active leave (warning band - punch still works, but worker should know)
  if (status.leave) {
    return (
      <div className="punch-shift punch-shift-warn">
        <div className="punch-shift-icon">🌴</div>
        <div>
          <div className="punch-shift-title">You are marked on leave</div>
          <div className="punch-shift-sub">
            An approved {status.leave.type} leave covers today. Punching in will mark today as worked and HR will see the overlap.
          </div>
        </div>
      </div>
    )
  }

  // Live classification card
  const cls = action === 'OUT' ? status.punchOut : status.punchIn
  const tone =
    cls?.kind === 'too-early' || cls?.kind === 'past-cap' ? 'block' :
    cls?.kind === 'late' || cls?.kind === 'early-leave' ? 'warn' :
    cls?.kind === 'early' ? 'info' : 'ok'
  const icon =
    cls?.kind === 'too-early' ? '🕐' :
    cls?.kind === 'early'     ? '⏪' :
    cls?.kind === 'late'      ? '⚠️' :
    cls?.kind === 'early-leave' ? '⚠️' :
    cls?.kind === 'past-cap'  ? '🚫' : '✓'

  return (
    <div className={`punch-shift punch-shift-${tone}`}>
      <div className="punch-shift-icon">{icon}</div>
      <div>
        <div className="punch-shift-title">
          {kindLabel} · {sched.startTime}–{sched.endTime} · grace {sched.graceMinutes}m
        </div>
        <div className="punch-shift-sub">{cls?.message || ''}</div>
      </div>
    </div>
  )
}

function PunchCandidateCard({ candidate, selected, multipleInRange, onSelect }) {
  const [workersExpanded, setWorkersExpanded] = useState(false)
  const c = candidate
  const loc = c.location || {}
  const isProject = c.kind === 'project'
  const proj = c.project

  const distanceKnown = !!c.distanceKnown
  const acquiringGps = !loc.noGeofence && !distanceKnown

  // stateClass drives the colour. effectiveInRange (which already folds
  // in noGeofence + enforceGeofence + approximate bypasses) decides the
  // green-vs-orange split so a card never says "out of range" when the
  // server is going to accept the punch anyway.
  const stateClass = acquiringGps
    ? 'acquiring'
    : (c.effectiveInRange ? 'in' : 'out')
  const selectedClass = selected ? 'selected' : ''
  const radius = loc.geofenceRadiusMeters || 0

  return (
    <li className={`punch-cand ${stateClass} ${selectedClass}`}>
      <div className="punch-cand-header">
        <div className="punch-cand-title">
          {loc.noGeofence ? '🌐' : (isProject ? '📍' : '🏢')}{' '}
          <strong>{isProject ? proj?.name : loc.name}</strong>
          {loc.noGeofence && (
            <span className="punch-cand-pill punch-cand-pill-nogeo" title="No geofence — punch from anywhere">
              No geofence
            </span>
          )}
        </div>
        <div className={`punch-cand-badge punch-cand-badge-${loc.noGeofence ? 'in' : stateClass}`}>
          {loc.noGeofence ? '✓ Anywhere'
            : acquiringGps ? '⏳ Acquiring GPS'
            : c.inRange   ? '✓ In range'
            : c.geofenceBypassed ? '🌐 Geofence off'
            : c.approximateOk    ? '≈ Approximate'
            : `${formatDistance(c.distance)} away`}
        </div>
      </div>

      <div className="punch-cand-sub">
        {isProject && proj?._id && <span>ID: <code>{String(proj._id).slice(-6).toUpperCase()}</code></span>}
        {!isProject && <span>Your base location</span>}
        {' · '}
        {loc.name} {loc.address ? `· ${loc.address}` : ''}
      </div>

      <div className={`punch-cand-distance ${loc.noGeofence ? 'in' : stateClass}`}>
        {loc.noGeofence
          ? <>This location has <strong>no geofence</strong> — punch from anywhere. Your coordinates are still recorded for audit.</>
          : acquiringGps
            ? <>Waiting for a precise GPS fix before showing your distance. This can take up to 30 seconds outdoors — usually much less.</>
            : c.inRange
              ? <>You are <strong>{formatDistance(c.distance)}</strong> from this location (allowed {radius}m). You can punch in here.</>
              : c.geofenceBypassed
                ? <>🌐 <strong>Geofence enforcement is off</strong> — you can punch here from anywhere. Your measured distance (<strong>{formatDistance(c.distance)}</strong>) is recorded for audit.</>
                : c.approximateOk
                  ? <>≈ <strong>Approximate punch confirmed</strong> — your GPS reads <strong>{formatDistance(c.distance)}</strong> from this location (allowed {radius}m). You've opted to punch with low-confidence position. The row will be flagged for HR review.</>
                  : <>You are <strong>{formatDistance(c.distance)}</strong> away. Allowed radius is <strong>{radius}m</strong>. Move ~{formatDistance(c.distance - radius)} closer.</>
        }
      </div>

      {isProject && proj && (
        <div className="punch-cand-team">
          {!!(proj.supervisors?.length) && (
            <ContactGroup
              label="Supervisors"
              icon="👤"
              people={proj.supervisors}
            />
          )}
          {(proj.projectEngineers?.length > 0 || proj.siteEngineer) && (
            <ContactGroup
              label="Engineers"
              icon="🛠️"
              people={[
                ...(proj.projectEngineers || []),
                ...(proj.siteEngineer ? [{ ...proj.siteEngineer, _label: 'Site' }] : [])
              ]}
            />
          )}
          {proj.workersTotal > 0 && (
            <div className="punch-cand-workers">
              <div className="punch-cand-workers-label">👷 Site team ({proj.workersTotal}):</div>
              <div className="punch-cand-workers-list">
                {(proj.workersPreview || []).map((w, i) => (
                  <span key={w.userId || i} className="punch-worker-chip">{w.name}</span>
                ))}
                {proj.workersTotal > (proj.workersPreview?.length || 0) && (
                  <span className="punch-worker-chip muted">+ {proj.workersTotal - proj.workersPreview.length} others</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {(multipleInRange && c.effectiveInRange && !selected) && (
        <button type="button" className="punch-cand-select-btn" onClick={onSelect}>
          Use this {isProject ? 'project' : 'location'}
        </button>
      )}
      {selected && (
        <div className="punch-cand-selected-pill">✓ Selected for punch-in</div>
      )}
    </li>
  )
}

/* ============= Contact group with click-to-call ============= */
function ContactGroup({ label, icon, people }) {
  if (!people || people.length === 0) return null
  return (
    <div className="punch-cand-contacts">
      <div className="punch-cand-contacts-label">{icon} {label}:</div>
      <ul className="punch-cand-contacts-list">
        {people.map((p, i) => (
          <li key={p.userId || p._id || i}>
            <span className="punch-contact-name">{p.name}{p._label ? ` (${p._label})` : ''}</span>
            <span className="punch-contact-actions">
              {p.phone && (
                <>
                  <a href={`tel:${p.phone}`} className="punch-contact-link" title={`Call ${p.name}`}>📞 {p.phone}</a>
                  <a href={`sms:${p.phone}`} className="punch-contact-link" title={`Text ${p.name}`}>💬</a>
                </>
              )}
              {p.email && (
                <a href={`mailto:${p.email}`} className="punch-contact-link" title={`Email ${p.name}`}>✉️</a>
              )}
              {!p.phone && !p.email && <span className="muted">no contact on file</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
