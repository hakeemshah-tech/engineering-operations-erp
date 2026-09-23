// Great-circle distance between two lat/lng points, in meters.
// Used for geofence validation on the attendance punch endpoint.
const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const lat1 = Number(a.lat);
  const lat2 = Number(b.lat);
  const lng1 = Number(a.lng);
  const lng2 = Number(b.lng);
  if (![lat1, lat2, lng1, lng2].every(Number.isFinite)) return Infinity;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

module.exports = { haversineMeters };
