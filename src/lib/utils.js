import { isValidDateString, parseMinutes, formatMinutes } from './time';

/**
 * Debounce function - delays execution until after wait ms have elapsed since last call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parse URL hash params for state persistence.
 * Date and time are wall-clock values in the location's time zone.
 * @returns {Object} Parsed parameters (only the valid ones)
 */
export function parseUrlParams() {
  const hash = window.location.hash.slice(1);
  const result = {};
  if (!hash) return result;

  const params = new URLSearchParams(hash);

  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng'));
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    result.coordinates = { lat, lng };
  }

  const zoom = parseFloat(params.get('z'));
  if (Number.isFinite(zoom)) {
    result.zoom = clamp(zoom, 2, 19);
  }

  const date = params.get('date');
  if (date && isValidDateString(date)) {
    result.date = date;
  }

  const minutes = parseMinutes(params.get('time') || '');
  if (minutes !== null) {
    result.minutes = minutes;
  }

  return result;
}

/**
 * Update URL hash with current state
 * @param {Object} state - { coordinates, zoom, date, minutes }
 */
export function updateUrlParams(state) {
  const params = new URLSearchParams();

  params.set('lat', state.coordinates.lat.toFixed(6));
  params.set('lng', state.coordinates.lng.toFixed(6));
  if (Number.isFinite(state.zoom)) params.set('z', String(Math.round(state.zoom)));
  params.set('date', state.date);
  params.set('time', formatMinutes(state.minutes));

  const newHash = params.toString();
  if (window.location.hash.slice(1) !== newHash) {
    history.replaceState(null, '', `#${newHash}`);
  }
}

/**
 * Local storage helpers. Storage can be unavailable (private mode, blocked
 * cookies), so every access is guarded.
 */
const SAVED_LOCATIONS_KEY = 'solset_saved_locations';
const RECENT_LOCATIONS_KEY = 'solset_recent_locations';
const MAX_RECENT_LOCATIONS = 10;
const SETTINGS_KEY = 'solset_settings';

function readJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable; state still works for this session
  }
}

export function isSameLocation(a, b, tolerance = 0.0001) {
  return Math.abs(a.lat - b.lat) < tolerance && Math.abs(a.lng - b.lng) < tolerance;
}

function isValidLocation(location) {
  return location && Number.isFinite(location.lat) && Number.isFinite(location.lng);
}

export function getSavedLocations() {
  const locations = readJson(SAVED_LOCATIONS_KEY, []);
  return Array.isArray(locations) ? locations.filter(isValidLocation) : [];
}

export function saveLocation(location) {
  const locations = getSavedLocations();

  if (!locations.some(l => isSameLocation(l, location))) {
    locations.push({
      lat: location.lat,
      lng: location.lng,
      name: location.name || null,
      id: Date.now(),
      savedAt: new Date().toISOString()
    });
    writeJson(SAVED_LOCATIONS_KEY, locations);
  }

  return locations;
}

export function removeLocation(id) {
  const locations = getSavedLocations().filter(l => l.id !== id);
  writeJson(SAVED_LOCATIONS_KEY, locations);
  return locations;
}

export function getRecentLocations() {
  const locations = readJson(RECENT_LOCATIONS_KEY, []);
  return Array.isArray(locations) ? locations.filter(isValidLocation) : [];
}

export function addRecentLocation(location) {
  const locations = [
    { lat: location.lat, lng: location.lng, name: location.name || null, visitedAt: new Date().toISOString() },
    ...getRecentLocations().filter(l => !isSameLocation(l, location))
  ].slice(0, MAX_RECENT_LOCATIONS);

  writeJson(RECENT_LOCATIONS_KEY, locations);
  return locations;
}

export function clearRecentLocations() {
  writeJson(RECENT_LOCATIONS_KEY, []);
  return [];
}

export function getDefaultSettings() {
  return {
    theme: 'system',
    shadowHeight: 1,
    solarSystemSize: 6.7,
    showHouse: true,
    autoOrientHouse: true,
    houseOrientation: 180,
    showSeasonalPaths: false
  };
}

/**
 * Validate settings, falling back to defaults for anything missing or invalid
 * @param {Object} settings - Possibly partial or malformed settings
 * @returns {Object} Complete, valid settings
 */
export function sanitizeSettings(settings) {
  const defaults = getDefaultSettings();
  const s = settings && typeof settings === 'object' ? settings : {};
  const number = (value, min, max, fallback) => {
    const n = Number(value);
    return value !== '' && value !== null && Number.isFinite(n) ? clamp(n, min, max) : fallback;
  };
  const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

  return {
    theme: ['light', 'dark', 'system'].includes(s.theme) ? s.theme : defaults.theme,
    shadowHeight: number(s.shadowHeight, 0.1, 1000, defaults.shadowHeight),
    solarSystemSize: number(s.solarSystemSize, 0.1, 10000, defaults.solarSystemSize),
    showHouse: bool(s.showHouse, defaults.showHouse),
    autoOrientHouse: bool(s.autoOrientHouse, defaults.autoOrientHouse),
    houseOrientation: ((Math.round(number(s.houseOrientation, -360, 720, defaults.houseOrientation)) % 360) + 360) % 360,
    showSeasonalPaths: bool(s.showSeasonalPaths, defaults.showSeasonalPaths)
  };
}

export function getSettings() {
  return sanitizeSettings(readJson(SETTINGS_KEY, {}));
}

export function saveSettings(settings) {
  writeJson(SETTINGS_KEY, settings);
}

/**
 * Format coordinates for display
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} precision - Decimal places
 * @returns {string} Formatted coordinates
 */
export function formatCoordinates(lat, lng, precision = 4) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(precision)}°${latDir}, ${Math.abs(lng).toFixed(precision)}°${lngDir}`;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

/**
 * Download data as file
 * @param {string} data - Data to download
 * @param {string} filename - File name
 * @param {string} type - MIME type
 */
export function downloadFile(data, filename, type = 'application/json') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
