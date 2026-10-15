import { getPosition as getPositionRaw, getTimes } from 'suncalc';
import { isValidDate } from './time';

const HOUR_MS = 3600000;
const DEG_TO_RAD = Math.PI / 180;

// Sunrise/sunset are defined with the sun's upper limb on the horizon, including refraction
const SUNRISE_ALTITUDE = -0.833 * DEG_TO_RAD;

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
 * Convert a SunCalc azimuth to a compass bearing
 * @param {number} azimuth - Radians from south, positive towards west
 * @returns {number} Degrees clockwise from north (0-360)
 */
export function azimuthToBearing(azimuth) {
  return ((azimuth * 180 / Math.PI + 180) % 360 + 360) % 360;
}

/**
 * Compass label for a bearing, e.g. 170 -> "S"
 */
export function bearingToCompass(bearing) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
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
 * Calculate optimal house orientation for a given location: the direction the
 * "day" side should face. Uses an irradiance-weighted circular mean of the sun's
 * bearing across the year, favouring winter sun, nudged slightly towards morning sun.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {number} Optimal orientation in degrees (clockwise from north)
 */
export function calculateOptimalHouseOrientation(lat, lng) {
  lat = Number(lat);
  lng = Number(lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0;

  const isNorthernHemisphere = lat >= 0;
  const baseOrientation = isNorthernHemisphere ? 180 : 0;
  const year = 2025; // Sun geometry is effectively identical year to year
  const samplesPerDay = 24;

  let x = 0;
  let y = 0;
  let totalWeight = 0;

  for (let month = 0; month < 12; month++) {
    // Approximate local solar noon on the 15th of each month
    const reference = new Date(Date.UTC(year, month, 15, 12) - (lng / 15) * HOUR_MS);
    const window = getDaylightWindow(reference, lat, lng);
    if (!window) continue;

    // Favour winter sun (passive heating) over summer sun (overheating)
    const isNorthernSummer = month >= 4 && month <= 8;
    const seasonWeight = isNorthernHemisphere === isNorthernSummer ? 0.7 : 1.3;

    for (let i = 0; i <= samplesPerDay; i++) {
      const time = new Date(window.start + (window.end - window.start) * i / samplesPerDay);
      const position = sunPositionAt(time, lat, lng);
      if (position.altitude <= 0) continue;

      const weight = seasonWeight * Math.sin(position.altitude);
      const bearing = (azimuthToBearing(position.azimuth) * Math.PI) / 180;
      x += weight * Math.sin(bearing);
      y += weight * Math.cos(bearing);
      totalWeight += weight;
    }
  }

  // Circular mean; fall back to facing the equator if the sun is evenly spread
  const magnitude = Math.hypot(x, y);
  let optimalOrientation = totalWeight > 0 && magnitude / totalWeight > 0.05
    ? (Math.atan2(x, y) * 180) / Math.PI
    : baseOrientation;

  // Slight adjustment towards morning (east) sun
  const morningAdjustment = 15 - (Math.abs(lat) / 90) * 10;
  optimalOrientation += isNorthernHemisphere ? -morningAdjustment : morningAdjustment;

  return ((optimalOrientation % 360) + 360) % 360;
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

  return [
    { key: 'summer', dateString: north ? june : december, label: 'Summer Solstice', shortLabel: 'Summer', color: '#ef4444', icon: 'bi-brightness-high' },
    { key: 'winter', dateString: north ? december : june, label: 'Winter Solstice', shortLabel: 'Winter', color: '#3b82f6', icon: 'bi-snow' },
    { key: 'spring', dateString: north ? march : september, label: 'Spring Equinox', shortLabel: 'Spring', color: '#22c55e', icon: 'bi-flower1' },
    { key: 'fall', dateString: north ? september : march, label: 'Fall Equinox', shortLabel: 'Fall', color: '#f97316', icon: 'bi-tree' }
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

/**
 * Very rough annual PV yield estimate based on location only
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} systemSize - System size in kW
 * @returns {number} kWh per year
 */
export function estimateAnnualSolarYield(lat, lng, systemSize) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(systemSize > 0)) return 0;

  const baseProduction = 1500;
  const latitudeFactor = Math.cos(Math.abs(lat) * Math.PI / 180);

  let regionalFactor = 1.0;

  // Europe
  if (lng >= -15 && lng <= 40 && lat >= 35 && lat <= 70) {
    if (lat > 55) regionalFactor = 0.75;
    else if (lat > 45) regionalFactor = 0.85;
    else regionalFactor = 0.95;
  }
  // North America
  else if (lng >= -130 && lng <= -60 && lat >= 25 && lat <= 60) {
    if (lat > 45) regionalFactor = 0.8;
    else if (lng < -100) regionalFactor = 1.1;
    else regionalFactor = 0.9;
  }
  // Asia
  else if (lng >= 60 && lng <= 150 && lat >= 10 && lat <= 60) {
    if (lat > 40) regionalFactor = 0.75;
    else regionalFactor = 0.95;
  }
  // Australia
  else if (lng >= 110 && lng <= 180 && lat >= -50 && lat <= -10) {
    regionalFactor = 1.1;
  }
  // Africa
  else if (lng >= -20 && lng <= 50 && lat >= -35 && lat <= 35) {
    regionalFactor = 1.15;
  }
  // South America
  else if (lng >= -80 && lng <= -35 && lat >= -55 && lat <= 15) {
    regionalFactor = 1.05;
  }

  return Math.round(baseProduction * systemSize * latitudeFactor * regionalFactor);
}
