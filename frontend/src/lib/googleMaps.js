// Shared Google Maps loader configuration.
// Read once, used by every component that needs Maps + Places.
// Centralized so the script is loaded exactly once across the app.
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

// 'places' powers Autocomplete; 'marker' is required by AdvancedMarkerElement.
// Replacing the legacy Marker + SearchBox classes cleared the deprecation
// warnings Google ships for them.
export const GOOGLE_MAPS_LIBRARIES = ['places', 'marker']

// Stable id so useJsApiLoader doesn't warn about library list mismatch
// when multiple components mount the loader.
export const GOOGLE_MAPS_LOADER_ID = 'erp-google-maps-loader'

// AdvancedMarkerElement requires the map to have a mapId. 'DEMO_MAP_ID' is
// Google's documented placeholder that supports advanced markers without any
// Cloud Console setup. Replace with a project-specific Map ID (created in
// Google Cloud Console → Map Management) once you want custom styling.
export const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

// Default map view if no coordinates are set yet (Dubai - matches the
// company's UAE focus; safe to change without impacting logic).
export const DEFAULT_MAP_CENTER = { lat: 25.2048, lng: 55.2708 }
export const DEFAULT_MAP_ZOOM = 11
