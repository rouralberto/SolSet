import { isValidDateString, parseMinutes, formatMinutes } from './time';
import { sanitizeObstacle, MAX_OBSTACLES } from './site.js';
import { compassPoint } from './solar.js';

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
    result.zoom = clamp(zoom, 2, 21);
  }

  const date = params.get('date');
  if (date && isValidDateString(date)) {
    result.date = date;
  }

  const minutes = parseMinutes(params.get('time') || '');
  if (minutes !== null) {
    result.minutes = minutes;
  }

  // House: "o" is the bearing the day side faces (or "auto"), "house" is width,depth,wall height,roof pitch
  const settings = {};
  const orientation = params.get('o');
  if (orientation === 'auto') {
    settings.autoOrientHouse = true;
  } else if (orientation !== null && orientation !== '' && Number.isFinite(Number(orientation))) {
    settings.autoOrientHouse = false;
    settings.houseOrientation = Number(orientation);
  }

  const house = (params.get('house') || '').split(',').map(Number);
  if (house.length === 4 && house.every(Number.isFinite)) {
    [settings.houseWidth, settings.houseDepth, settings.houseWallHeight, settings.houseRoofPitch] = house;
  }

  if (Object.keys(settings).length) {
    result.settings = settings;
  }

  return result;
}

/**
 * Update URL hash with current state
 * @param {Object} state - { coordinates, zoom, date, minutes, settings }
 */
export function updateUrlParams(state) {
  const params = new URLSearchParams();

  params.set('lat', state.coordinates.lat.toFixed(6));
  params.set('lng', state.coordinates.lng.toFixed(6));
  if (Number.isFinite(state.zoom)) params.set('z', String(Math.round(state.zoom)));
  params.set('date', state.date);
  params.set('time', formatMinutes(state.minutes));

  if (state.settings) {
    const { autoOrientHouse, houseOrientation, houseWidth, houseDepth, houseWallHeight, houseRoofPitch } = state.settings;
    params.set('o', autoOrientHouse ? 'auto' : String(Math.round(houseOrientation)));
    params.set('house', [houseWidth, houseDepth, houseWallHeight, houseRoofPitch].map(v => Math.round(v * 100) / 100).join(','));
  }

  // Keep the commas in "house" readable
  const newHash = params.toString().replace(/%2C/g, ',');
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
    units: 'metric',
    activeTab: 'sun',
    shadowHeight: 1,
    showSeasonalPaths: false,

    // House (all lengths in metres)
    showHouse: true,
    autoOrientHouse: true,
    houseOrientation: 180,
    houseWidth: 12,
    houseDepth: 8,
    houseWallHeight: 5.5,
    houseRoofPitch: 30,

    // Window overhang
    overhangFacade: 'day',
    windowHeight: 1.5,
    overhangGap: 0.3,
    overhangDepth: 0.6,

    // Solar array
    solarSystemSize: 6.7,
    pvPlacement: 'roof-day',
    pvTilt: 30,
    pvAzimuth: 180,

    // Surroundings
    useTerrain: false
  };
}

export const SIDEBAR_TABS = ['sun', 'house', 'shade', 'solar'];
export const FACADE_KEYS = ['day', 'sideA', 'night', 'sideB'];
export const PV_PLACEMENTS = ['roof-day', 'roof-night', 'custom'];

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

  const choice = (value, options, fallback) => (options.includes(value) ? value : fallback);
  const bearing = (value, fallback) => ((Math.round(number(value, -360, 720, fallback)) % 360) + 360) % 360;

  return {
    theme: choice(s.theme, ['light', 'dark', 'system'], defaults.theme),
    units: choice(s.units, ['metric', 'imperial'], defaults.units),
    activeTab: choice(s.activeTab, SIDEBAR_TABS, defaults.activeTab),
    shadowHeight: number(s.shadowHeight, 0.1, 1000, defaults.shadowHeight),
    showSeasonalPaths: bool(s.showSeasonalPaths, defaults.showSeasonalPaths),

    showHouse: bool(s.showHouse, defaults.showHouse),
    autoOrientHouse: bool(s.autoOrientHouse, defaults.autoOrientHouse),
    houseOrientation: bearing(s.houseOrientation, defaults.houseOrientation),
    houseWidth: number(s.houseWidth, 2, 100, defaults.houseWidth),
    houseDepth: number(s.houseDepth, 2, 100, defaults.houseDepth),
    houseWallHeight: number(s.houseWallHeight, 2, 60, defaults.houseWallHeight),
    houseRoofPitch: number(s.houseRoofPitch, 0, 60, defaults.houseRoofPitch),

    overhangFacade: choice(s.overhangFacade, FACADE_KEYS, defaults.overhangFacade),
    windowHeight: number(s.windowHeight, 0.3, 6, defaults.windowHeight),
    overhangGap: number(s.overhangGap, 0, 3, defaults.overhangGap),
    overhangDepth: number(s.overhangDepth, 0, 5, defaults.overhangDepth),

    solarSystemSize: number(s.solarSystemSize, 0.1, 10000, defaults.solarSystemSize),
    pvPlacement: choice(s.pvPlacement, PV_PLACEMENTS, defaults.pvPlacement),
    pvTilt: number(s.pvTilt, 0, 90, defaults.pvTilt),
    pvAzimuth: bearing(s.pvAzimuth, defaults.pvAzimuth),

    useTerrain: bool(s.useTerrain, defaults.useTerrain)
  };
}

export function getSettings() {
  return sanitizeSettings(readJson(SETTINGS_KEY, {}));
}

export function saveSettings(settings) {
  writeJson(SETTINGS_KEY, settings);
}

/* Obstacles around the plot (trees, neighbouring buildings) */

const OBSTACLES_KEY = 'solset_obstacles';

export function getObstacles() {
  const stored = readJson(OBSTACLES_KEY, []);
  return Array.isArray(stored) ? stored.map(sanitizeObstacle).filter(Boolean).slice(0, MAX_OBSTACLES) : [];
}

export function saveObstacles(obstacles) {
  writeJson(OBSTACLES_KEY, obstacles.slice(0, MAX_OBSTACLES));
}

/**
 * Format a bearing for display, e.g. 178.4 -> "178° S"
 * @param {number} bearing - Degrees clockwise from true north
 */
export function formatBearing(bearing) {
  if (!Number.isFinite(bearing)) return '—';
  const rounded = ((Math.round(bearing) % 360) + 360) % 360;
  return `${rounded}° ${compassPoint(rounded)}`;
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
