// =============================================================================
// Haversine Distance Formula
// Returns the great-circle distance between two GPS points in METRES.
// Used for:
//   - Geofence check (is driver within 200m of facility?)
//   - Cumulative distance tracking (sum of distances between GPS updates)
// =============================================================================

const EARTH_RADIUS_M = 6371000; // Earth's mean radius in metres

/**
 * Calculate distance between two GPS coordinates.
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lng1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lng2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in metres
 */
export function distanceMetres(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}
