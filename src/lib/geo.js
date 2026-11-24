import geomagnetism from 'geomagnetism';

/**
 * Small-area geodesy for working at the scale of a building plot, plus magnetic north.
 * Ground offsets are metres as { x: east, y: north }.
 */

const EARTH_RADIUS = 6371008.8;
const DEG = Math.PI / 180;
const METERS_PER_DEGREE = EARTH_RADIUS * DEG;

/** Metres east/north from one coordinate to another (flat-earth approximation, fine within a few km) */
export function offsetBetween(from, to) {
  let dLng = to.lng - from.lng;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  return {
    x: dLng * METERS_PER_DEGREE * Math.cos(((from.lat + to.lat) / 2) * DEG),
    y: (to.lat - from.lat) * METERS_PER_DEGREE
  };
}

/** Coordinate reached by moving `offset` metres from `origin` */
export function offsetCoordinate(origin, offset) {
  const lat = origin.lat + offset.y / METERS_PER_DEGREE;
  const lng = origin.lng + offset.x / (METERS_PER_DEGREE * Math.cos(((origin.lat + lat) / 2) * DEG));
  return { lat, lng: ((lng + 540) % 360) - 180 };
}

/** Bounds of a square of ±halfSize metres around a point, as [[south, west], [north, east]] */
export function squareBounds(center, halfSize) {
  const dLat = halfSize / METERS_PER_DEGREE;
  const dLng = halfSize / (METERS_PER_DEGREE * Math.cos(center.lat * DEG));
  return [[center.lat - dLat, center.lng - dLng], [center.lat + dLat, center.lng + dLng]];
}

/** Ground resolution of a Web Mercator map */
export function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos(lat * DEG)) / Math.pow(2, zoom);
}

export function distanceBetween(a, b) {
  const offset = offsetBetween(a, b);
  return Math.hypot(offset.x, offset.y);
}

/**
 * Magnetic declination from the World Magnetic Model: how far magnetic north
 * lies east (+) or west (−) of true north.
 * @returns {number|null} Degrees, or null if the model can't be evaluated
 */
export function magneticDeclination(lat, lng, date = new Date()) {
  try {
    const declination = geomagnetism.model(date).point([lat, lng]).decl;
    return Number.isFinite(declination) ? declination : null;
  } catch {
    return null;
  }
}

/** Convert a true bearing to what a magnetic compass reads */
export function trueToMagnetic(bearing, declination) {
  return (((bearing - declination) % 360) + 360) % 360;
}
