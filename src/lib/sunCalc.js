import { getPosition as getPositionRaw, getTimes } from 'suncalc';
import { isValidDate } from './time';

const HOUR_MS = 3600000;
const DEG_TO_RAD = Math.PI / 180;

// Sunrise/sunset are defined with the sun's upper limb on the horizon. SunCalc reports the
// apparent (refraction-corrected) altitude of the sun's centre, which is about -0.35° then.
const SUNRISE_ALTITUDE = -0.35 * DEG_TO_RAD;

/** SunCalc v2 returns degrees, north-based azimuth; the app uses radians from south. */
function adaptPosition({ azimuth, altitude }) {
  const bearingDeg = ((azimuth % 360) + 360) % 360;
  return {
    azimuth: (bearingDeg - 180) * DEG_TO_RAD,
    altitude: altitude * DEG_TO_RAD
  };
}

function sunPositionAt(date, lat, lng) {
  return adaptPosition(getPositionRaw(date, lat, lng));
}

/**
 * Whether the sun is visible, using the same convention as sunrise/sunset times
 * @param {number} altitude - Sun altitude in radians
 */
export function isSunAboveHorizon(altitude) {
  return altitude > SUNRISE_ALTITUDE;
}

/**
 * Get sun times for the solar day closest to a reference instant.
 * Pass the location's local noon for the day you're interested in.
 * @param {Date} date - Reference instant
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Times object with sunrise, sunset, solarNoon, etc.
 */
export function getSunTimes(date, lat, lng) {
  return getTimes(date, lat, lng);
}

/**
 * Get sun position (azimuth, altitude) for a specific instant and location.
 * Azimuth follows the SunCalc convention: radians from south, positive towards west.
 * @param {Date} dateTime - The instant to calculate for
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Position object with azimuth and altitude
 */
export function getSunPosition(dateTime, lat, lng) {
  const validLat = Number(lat);
  const validLng = Number(lng);

  if (!isValidDate(dateTime) || !Number.isFinite(validLat) || !Number.isFinite(validLng)) {
    return { azimuth: 0, altitude: 0 };
  }

  return sunPositionAt(dateTime, validLat, validLng);
}

/**
 * Sun position as a compass bearing and altitude in degrees (the convention of lib/solar.js)
 * @param {{azimuth: number, altitude: number}} position - From getSunPosition
 * @returns {{azimuth: number, altitude: number}}
 */
export function toBearingPosition(position) {
  return { azimuth: azimuthToBearing(position.azimuth), altitude: position.altitude / DEG_TO_RAD };
}

/**
 * Convert a SunCalc azimuth to a compass bearing
 * @param {number} azimuth - Radians from south, positive towards west
 * @returns {number} Degrees clockwise from north (0-360)
 */
export function azimuthToBearing(azimuth) {
  return ((azimuth * 180 / Math.PI + 180) % 360 + 360) % 360;
}

/**
 * Daylight window for the solar day closest to a reference instant
 * @returns {{start: number, end: number, times: Object}|null} Timestamps, or null during polar night
 */
function getDaylightWindow(referenceDate, lat, lng) {
  const times = getSunTimes(referenceDate, lat, lng);

  if (isValidDate(times.sunrise) && isValidDate(times.sunset)) {
    return { start: times.sunrise.getTime(), end: times.sunset.getTime(), times };
  }

  // Polar day: the sun never sets, sample the full day around solar noon
  if (getSunPosition(times.solarNoon, lat, lng).altitude > 0) {
    const noon = times.solarNoon.getTime();
    return { start: noon - 12 * HOUR_MS, end: noon + 12 * HOUR_MS, times };
  }

  return null;
}

/**
 * Calculate sun trajectory points from sunrise to sunset
 * @param {Date} referenceDate - An instant on the day to calculate for (ideally local noon)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} steps - Number of intervals to calculate (default: 48)
 * @returns {Array} Array of points with time, azimuth, altitude
 */
export function getSunTrajectory(referenceDate, lat, lng, steps = 48) {
  lat = Number(lat);
  lng = Number(lng);
  if (!isValidDate(referenceDate) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [];
  }

  const window = getDaylightWindow(referenceDate, lat, lng);
  if (!window) return [];

  const trajectory = [];
  const stepSize = (window.end - window.start) / steps;

  for (let i = 0; i <= steps; i++) {
    const time = new Date(window.start + i * stepSize);
    const position = sunPositionAt(time, lat, lng);
    trajectory.push({ time, azimuth: position.azimuth, altitude: position.altitude });
  }

  return trajectory;
}

/**
 * Calculate the shadow length for an object of given height
 * @param {number} altitude - Sun altitude in radians
 * @param {number} height - Object height in meters (default: 1)
 * @returns {number} Shadow length in meters
 */
export function calculateShadowLength(altitude, height = 1) {
  if (altitude <= 0) return Infinity;
  return height / Math.tan(altitude);
}

/**
 * Solstices and equinoxes for a year, labelled for the location's hemisphere
 * (June is summer in the north but winter in the south).
 * @param {number} year - Year
 * @param {number} lat - Latitude
 * @returns {Array} [{ key, dateString, label, shortLabel, color, icon }]
 */
export function getKeyDates(year, lat) {
  const north = lat >= 0;
  const june = `${year}-06-21`;
  const december = `${year}-12-21`;
  const march = `${year}-03-20`;
  const september = `${year}-09-22`;

  // Colours are a validated colour-blind-safe set shared with the sun-path chart
  return [
    { key: 'summer', dateString: north ? june : december, label: 'Summer Solstice', shortLabel: 'Summer', color: '#eb6834', icon: 'bi-brightness-high' },
    { key: 'winter', dateString: north ? december : june, label: 'Winter Solstice', shortLabel: 'Winter', color: '#2a78d6', icon: 'bi-snow' },
    { key: 'spring', dateString: north ? march : september, label: 'Spring Equinox', shortLabel: 'Spring', color: '#1baf7a', icon: 'bi-flower1' },
    { key: 'fall', dateString: north ? september : march, label: 'Fall Equinox', shortLabel: 'Fall', color: '#e87ba4', icon: 'bi-tree' }
  ];
}

/**
 * Get trajectories for the solstices and equinoxes
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} year - Year to calculate for
 * @param {Function} noonForDate - Maps a 'YYYY-MM-DD' string to the location's local noon instant
 * @param {number} steps - Number of intervals per trajectory
 * @returns {Array} [{ key, label, shortLabel, color, points }]
 */
export function getSeasonalTrajectories(lat, lng, year, noonForDate, steps = 48) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(year)) {
    return [];
  }

  return getKeyDates(year, lat).map(keyDate => ({
    ...keyDate,
    points: getSunTrajectory(noonForDate(keyDate.dateString), lat, lng, steps)
  }));
}
