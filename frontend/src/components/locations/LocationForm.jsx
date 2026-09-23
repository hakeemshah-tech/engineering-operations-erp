import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  useJsApiLoader,
  GoogleMap,
  Circle,
  Autocomplete
} from '@react-google-maps/api'
import { Modal } from '../../design-system/Modal'
import { FormField, FormRow, FormSection } from '../../design-system/FormField'
import { getUser } from '../../lib/roles'
import { userRoleWeight } from '../../lib/roleWeights'
import { api } from '../../lib/api'
import DependencyConfirmationModal from './DependencyConfirmationModal'
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_MAP_ID,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM
} from '../../lib/googleMaps'
import './locations.css'

const TABS = [
  { key: 'manual', label: 'Manual entry' },
  { key: 'device', label: 'Use my device' },
  { key: 'map', label: 'Pick on map' }
]

const TYPE_OPTIONS = [
  { value: 'site', label: 'Site' },
  { value: 'office', label: 'Office' },
  { value: 'remote', label: 'Remote / WFH' },
  { value: 'other', label: 'Other' }
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
]

const emptyForm = {
  name: '',
  type: 'site',
  address: '',
  lat: '',
  lng: '',
  geofenceRadiusMeters: 100,
  noGeofence: false,
  notes: '',
  status: 'active',
  googlePlaceId: ''
}

export default function LocationForm({ isOpen, mode = 'create', initial = null, onClose, onSubmit }) {
  const currentUser = useMemo(() => getUser(), [])
  const myWeight = useMemo(() => userRoleWeight(currentUser), [currentUser])

  const lockedAgainstMe = !!(initial && initial.lockedByRoleWeight > myWeight)

  const [tab, setTab] = useState('manual')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [geoStatus, setGeoStatus] = useState('idle') // idle | acquiring | ok | error
  const [geoMessage, setGeoMessage] = useState('')

  // Confirmation-modal state - only used in edit mode. We resolve the pending
  // payload here so the modal's "Save anyway" handler can reuse it without
  // re-validating the form.
  const [depsOpen, setDepsOpen] = useState(false)
  const [depsLoading, setDepsLoading] = useState(false)
  const [depsData, setDepsData] = useState(null)
  const pendingPayloadRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    if (mode === 'edit' && initial) {
      setForm({
        name: initial.name ?? '',
        type: initial.type ?? 'site',
        address: initial.address ?? '',
        lat: initial.lat ?? '',
        lng: initial.lng ?? '',
        geofenceRadiusMeters: initial.geofenceRadiusMeters ?? 100,
        noGeofence: initial.noGeofence ?? false,
        notes: initial.notes ?? '',
        status: initial.status ?? 'active',
        googlePlaceId: initial.googlePlaceId ?? ''
      })
    } else {
      setForm(emptyForm)
    }
    setTab('manual')
    setError('')
    setGeoStatus('idle')
    setGeoMessage('')
  }, [isOpen, mode, initial])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const useDeviceLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('error')
      setGeoMessage('Geolocation is not supported in this browser.')
      return
    }
    setGeoStatus('acquiring')
    setGeoMessage('Acquiring your position...')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6)
        }))
        setGeoStatus('ok')
        setGeoMessage(`Position acquired (±${Math.round(pos.coords.accuracy)}m).`)
      },
      (err) => {
        setGeoStatus('error')
        const map = {
          1: 'Permission denied. Allow location access in your browser settings.',
          2: 'Position unavailable.',
          3: 'Timed out acquiring position.'
        }
        setGeoMessage(map[err.code] || err.message || 'Unable to acquire position.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const validate = () => {
    if (!form.name.trim()) return 'Name is required.'
    const lat = Number(form.lat)
    const lng = Number(form.lng)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitude must be a number between -90 and 90.'
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'Longitude must be a number between -180 and 180.'
    // Only validate the radius when the geofence is actually in use. If
    // "Disable geofence" is on, any stored value is fine because no check
    // will read it.
    if (!form.noGeofence) {
      const r = Number(form.geofenceRadiusMeters)
      if (!Number.isFinite(r) || r < 50 || r > 200000) {
        return 'Geofence radius must be between 50 and 200000 meters (200 km). Mark the location as "Disable geofence" if a worker has no fixed location.'
      }
    }
    return null
  }

  const doSave = useCallback(async (payload) => {
    setSubmitting(true)
    try {
      await onSubmit(payload)
      setDepsOpen(false)
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Save failed.'
      setError(msg)
      // Surface the error in the underlying form too - close the confirm
      // dialog so the user sees it without an extra click.
      setDepsOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [onSubmit, onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (lockedAgainstMe) return
    const errMsg = validate()
    if (errMsg) {
      setError(errMsg)
      return
    }
    setError('')

    const payload = {
      name: form.name.trim(),
      type: form.type,
      address: form.address.trim(),
      lat: Number(form.lat),
      lng: Number(form.lng),
      geofenceRadiusMeters: Number(form.geofenceRadiusMeters),
      noGeofence: !!form.noGeofence,
      notes: form.notes.trim(),
      status: form.status,
      googlePlaceId: form.googlePlaceId || undefined
    }

    // Create mode: no dependents possible, save straight through.
    if (mode !== 'edit' || !initial?._id) {
      await doSave(payload)
      return
    }

    // Edit mode: probe dependency counts. If the lookup itself fails (network,
    // 5xx), fall back to the legacy "just save" behavior - never block the
    // user behind an unrelated outage.
    setDepsLoading(true)
    try {
      const { data } = await api.get(`/api/locations/${initial._id}/dependencies`)
      pendingPayloadRef.current = payload
      setDepsData(data)
      setDepsOpen(true)
    } catch (err) {
      console.warn('[LocationForm] dependency probe failed, saving without confirmation:', err)
      await doSave(payload)
    } finally {
      setDepsLoading(false)
    }
  }

  const confirmSave = useCallback(() => {
    const payload = pendingPayloadRef.current
    if (!payload) {
      setDepsOpen(false)
      return
    }
    doSave(payload)
  }, [doSave])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit location' : 'New location'}
      size="large"
    >
      {lockedAgainstMe && (
        <div className="loc-banner loc-banner-error">
          🔒 This location was set by a higher-ranked role (weight {initial.lockedByRoleWeight}).
          You can view it, but you cannot save changes.
        </div>
      )}

      <div className="loc-tabs" role="tablist" aria-label="Location entry mode">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`loc-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="loc-tab-panel">
        {tab === 'manual' && (
          <p className="loc-hint">Type or paste latitude and longitude below.</p>
        )}
        {tab === 'device' && (
          <div className="loc-device-block">
            <p className="loc-hint">Capture coordinates from this device's GPS.</p>
            <button
              type="button"
              className="loc-btn loc-btn-secondary"
              onClick={useDeviceLocation}
              disabled={geoStatus === 'acquiring' || lockedAgainstMe}
            >
              {geoStatus === 'acquiring' ? 'Acquiring...' : 'Get my current location'}
            </button>
            {geoMessage && (
              <div className={`loc-geo-status loc-geo-${geoStatus}`}>{geoMessage}</div>
            )}
          </div>
        )}
        {tab === 'map' && (
          <LocationMapPicker
            lat={form.lat}
            lng={form.lng}
            radiusMeters={Number(form.geofenceRadiusMeters) || 100}
            disabled={lockedAgainstMe}
            onPlace={(next) => setForm(prev => ({ ...prev, ...next }))}
          />
        )}
      </div>

      <form onSubmit={handleSubmit} className="loc-form">
        <FormSection title="Identity">
          <FormRow>
            <FormField label="Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                disabled={lockedAgainstMe || submitting}
                placeholder="e.g. Marina Tower Site"
                required
              />
            </FormField>
            <FormField label="Type">
              <select
                value={form.type}
                onChange={(e) => update('type', e.target.value)}
                disabled={lockedAgainstMe || submitting}
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Status">
              <select
                value={form.status}
                onChange={(e) => update('status', e.target.value)}
                disabled={lockedAgainstMe || submitting}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FormField>
          </FormRow>
          <FormField label="Address">
            <input
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              disabled={lockedAgainstMe || submitting}
              placeholder="Street, city, country"
            />
          </FormField>
        </FormSection>

        <FormSection title="Coordinates">
          <FormRow>
            <FormField label="Latitude" required>
              <input
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                value={form.lat}
                onChange={(e) => update('lat', e.target.value)}
                disabled={lockedAgainstMe || submitting}
                required
              />
            </FormField>
            <FormField label="Longitude" required>
              <input
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                value={form.lng}
                onChange={(e) => update('lng', e.target.value)}
                disabled={lockedAgainstMe || submitting}
                required
              />
            </FormField>
          </FormRow>
        </FormSection>

        <FormSection title="Geofence">
          <FormRow>
            <FormField label={`Radius — ${form.geofenceRadiusMeters || 0} m`} required>
              <input
                type="range"
                min="50"
                max="50000"
                step="10"
                value={Math.min(Math.max(form.geofenceRadiusMeters || 100, 50), 50000)}
                onChange={(e) => update('geofenceRadiusMeters', Number(e.target.value))}
                disabled={lockedAgainstMe || submitting || form.noGeofence}
              />
            </FormField>
            <FormField label="Exact value (m)">
              <input
                type="number"
                min="50"
                max="200000"
                step="1"
                value={form.geofenceRadiusMeters}
                onChange={(e) => update('geofenceRadiusMeters', Number(e.target.value))}
                disabled={lockedAgainstMe || submitting || form.noGeofence}
              />
            </FormField>
          </FormRow>
          {!form.noGeofence && Number(form.geofenceRadiusMeters) < 50 && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(245,158,11,.10)',
              border: '1px solid rgba(245,158,11,.40)',
              color: 'var(--text)',
              fontSize: 12
            }}>
              ⚠ Radius below 50 m is unreliable — consumer GPS accuracy bottoms out around ±30–100 m even outdoors. Workers will hit constant false rejections. Set to at least 50 m, or use "Disable geofence" below for travelling/remote staff.
            </div>
          )}
          <FormField label="Disable geofence (any GPS coordinates pass)">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={!!form.noGeofence}
                onChange={(e) => update('noGeofence', e.target.checked)}
                disabled={lockedAgainstMe || submitting}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                Use for fully remote / travelling staff. Selfie + IP audit still apply; the distance is still recorded for traceability.
              </span>
            </label>
          </FormField>
          {form.noGeofence && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.10)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#b45309',
              fontSize: '0.85rem',
              lineHeight: 1.5
            }}>
              ⚠ With geofence disabled, employees can punch from anywhere. Use this only for roles where physical location can't be validated (sales/travel, fully remote).
            </div>
          )}
        </FormSection>

        <FormSection title="Notes">
          <FormField label="Internal notes">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              disabled={lockedAgainstMe || submitting}
              placeholder="Optional — context for HR or Project teams"
            />
          </FormField>
        </FormSection>

        {error && <div className="loc-banner loc-banner-error">{error}</div>}

        <div className="loc-form-actions">
          <button
            type="button"
            className="loc-btn loc-btn-ghost"
            onClick={onClose}
            disabled={submitting}
          >Cancel</button>
          <button
            type="submit"
            className="loc-btn loc-btn-primary"
            disabled={lockedAgainstMe || submitting || depsLoading}
          >
            {depsLoading
              ? 'Checking…'
              : submitting
                ? 'Saving...'
                : (mode === 'edit' ? 'Save changes' : 'Create location')}
          </button>
        </div>
      </form>

      <DependencyConfirmationModal
        isOpen={depsOpen}
        onClose={() => { if (!submitting) setDepsOpen(false) }}
        onConfirm={confirmSave}
        loading={submitting}
        entityType="location"
        entityName={initial?.name || form.name}
        deps={depsData}
      />
    </Modal>
  )
}

function LocationMapPicker({ lat, lng, radiusMeters, disabled, onPlace }) {
  const hasKey = !!GOOGLE_MAPS_API_KEY

  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES
  })

  // Refs for the JS-API instances we own imperatively.
  // - autocompleteRef: Autocomplete instance (replaces SearchBox)
  // - advancedMarkerRef: AdvancedMarkerElement instance (replaces <Marker>)
  // - mapRef: the underlying google.maps.Map
  const autocompleteRef = useRef(null)
  const advancedMarkerRef = useRef(null)
  const mapRef = useRef(null)

  const numericLat = Number(lat)
  const numericLng = Number(lng)
  const hasPosition = Number.isFinite(numericLat) && Number.isFinite(numericLng)

  const center = hasPosition
    ? { lat: numericLat, lng: numericLng }
    : DEFAULT_MAP_CENTER
  const zoom = hasPosition ? 16 : DEFAULT_MAP_ZOOM

  const updateLatLng = useCallback((nextLat, nextLng, extras = {}) => {
    if (disabled) return
    onPlace({
      lat: nextLat.toFixed(6),
      lng: nextLng.toFixed(6),
      ...extras
    })
  }, [disabled, onPlace])

  const handleMapClick = useCallback((e) => {
    if (!e.latLng) return
    updateLatLng(e.latLng.lat(), e.latLng.lng())
  }, [updateLatLng])

  // Autocomplete fires onPlaceChanged with a single selected place - call
  // getPlace() (NOT getPlaces()). Falls back gracefully when the user types
  // free text instead of picking a suggestion.
  const handlePlaceChanged = useCallback(() => {
    const ac = autocompleteRef.current
    if (!ac) return
    const place = ac.getPlace()
    if (!place || !place.geometry?.location) return
    const pLat = place.geometry.location.lat()
    const pLng = place.geometry.location.lng()
    updateLatLng(pLat, pLng, {
      address: place.formatted_address || place.name || '',
      googlePlaceId: place.place_id || ''
    })
    if (mapRef.current) {
      mapRef.current.panTo({ lat: pLat, lng: pLng })
      mapRef.current.setZoom(16)
    }
  }, [updateLatLng])

  /* -------------------- AdvancedMarkerElement lifecycle --------------------
   * @react-google-maps/api doesn't ship a React wrapper for
   * AdvancedMarkerElement, so we instantiate it imperatively against the
   * underlying map. Created once, then mutated as lat/lng/disabled change,
   * and detached on unmount.
   */
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return

    const markerLib = window.google?.maps?.marker
    if (!markerLib?.AdvancedMarkerElement) {
      // Defensive - should never hit when GOOGLE_MAPS_LIBRARIES includes 'marker'
      console.warn('[LocationMapPicker] AdvancedMarkerElement unavailable. Ensure GOOGLE_MAPS_LIBRARIES includes "marker".')
      return
    }

    if (!hasPosition) {
      // Detach the marker when the form clears its coordinates.
      if (advancedMarkerRef.current) {
        advancedMarkerRef.current.map = null
        advancedMarkerRef.current = null
      }
      return
    }

    const position = { lat: numericLat, lng: numericLng }

    if (!advancedMarkerRef.current) {
      const marker = new markerLib.AdvancedMarkerElement({
        map: mapRef.current,
        position,
        gmpDraggable: !disabled
      })

      // dragend on AdvancedMarkerElement: read the new position back off the
      // marker (e.latLng may not be populated on all SDK versions).
      marker.addListener('dragend', (e) => {
        let lat2, lng2
        if (e?.latLng && typeof e.latLng.lat === 'function') {
          lat2 = e.latLng.lat()
          lng2 = e.latLng.lng()
        } else {
          const p = marker.position
          if (!p) return
          lat2 = typeof p.lat === 'function' ? p.lat() : p.lat
          lng2 = typeof p.lng === 'function' ? p.lng() : p.lng
        }
        if (Number.isFinite(lat2) && Number.isFinite(lng2)) updateLatLng(lat2, lng2)
      })

      advancedMarkerRef.current = marker
    } else {
      advancedMarkerRef.current.position = position
      advancedMarkerRef.current.gmpDraggable = !disabled
    }
  }, [isLoaded, hasPosition, numericLat, numericLng, disabled, updateLatLng])

  // Tear the marker off the map on unmount.
  useEffect(() => () => {
    if (advancedMarkerRef.current) {
      advancedMarkerRef.current.map = null
      advancedMarkerRef.current = null
    }
  }, [])

  if (!hasKey) {
    return (
      <div className="loc-map-placeholder">
        <div className="loc-map-placeholder-icon">🗝️</div>
        <div className="loc-map-placeholder-title">Google Maps API key not configured</div>
        <div className="loc-map-placeholder-text">
          Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>client/.env</code> and restart the dev server.
          Until then, use Manual entry or Use my device to set coordinates.
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="loc-map-placeholder">
        <div className="loc-map-placeholder-icon">⚠️</div>
        <div className="loc-map-placeholder-title">Failed to load Google Maps</div>
        <div className="loc-map-placeholder-text">
          {String(loadError.message || loadError)}.
          Verify the API key has Maps JavaScript API + Places API enabled,
          and that the current host is in the key's HTTP referrer allowlist.
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="loc-map-loading">Loading map…</div>
    )
  }

  return (
    <div className="loc-map-container">
      <Autocomplete
        onLoad={(ref) => { autocompleteRef.current = ref }}
        onPlaceChanged={handlePlaceChanged}
        options={{
          // Limit returned fields for cheaper / faster Places billing.
          fields: ['geometry', 'formatted_address', 'name', 'place_id']
        }}
      >
        <input
          type="text"
          className="loc-map-search"
          placeholder="Search a place or address..."
          disabled={disabled}
        />
      </Autocomplete>

      <GoogleMap
        mapContainerClassName="loc-map"
        center={center}
        zoom={zoom}
        onLoad={(map) => { mapRef.current = map }}
        onClick={disabled ? undefined : handleMapClick}
        options={{
          // mapId is REQUIRED for AdvancedMarkerElement to render.
          mapId: GOOGLE_MAPS_MAP_ID,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false
        }}
      >
        {/* The marker is created imperatively in the useEffect above -
            AdvancedMarkerElement is not a React-wrapped component in
            @react-google-maps/api. The radius preview stays as a Circle. */}
        {hasPosition && (
          <Circle
            center={{ lat: numericLat, lng: numericLng }}
            radius={Math.max(10, Math.min(5000, radiusMeters))}
            options={{
              fillColor: '#6366f1',
              fillOpacity: 0.15,
              strokeColor: '#4f46e5',
              strokeOpacity: 0.7,
              strokeWeight: 2,
              clickable: false
            }}
          />
        )}
      </GoogleMap>

      <div className="loc-map-hint">
        {hasPosition
          ? `Marker at ${numericLat.toFixed(5)}, ${numericLng.toFixed(5)} — drag to refine, or click elsewhere to move.`
          : 'Click on the map or search a place to drop a marker.'}
      </div>
    </div>
  )
}
