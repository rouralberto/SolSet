/**
 * Debounce function - delays execution until after wait ms have elapsed since last call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function - limits execution to once per wait ms
 * @param {Function} func - Function to throttle
 * @param {number} wait - Milliseconds to wait between executions
 * @returns {Function} Throttled function
 */
export function throttle(func, wait) {
  let lastTime = 0;
  return function executedFunction(...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      func(...args);
    }
  };
}

/**
 * Combine date and time into a single Date object
 * @param {Date} date - The date part
 * @param {Date} time - The time part
 * @returns {Date} Combined date and time
 */
export function combineDateAndTime(date, time) {
  const result = new Date(date);
  if (time) {
    result.setHours(time.getHours(), time.getMinutes(), 0, 0);
  }
  return result;
}

/**
 * Parse URL hash params for state persistence
 * @returns {Object} Parsed parameters
 */
export function parseUrlParams() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;

  try {
    const params = new URLSearchParams(hash);
    const result = {};

    if (params.has('lat') && params.has('lng')) {
      result.coordinates = {
        lat: parseFloat(params.get('lat')),
        lng: parseFloat(params.get('lng'))
      };
    }

    if (params.has('date')) {
      result.date = new Date(params.get('date'));
    }

    if (params.has('time')) {
      const [hours, minutes] = params.get('time').split(':').map(Number);
      const time = new Date();
      time.setHours(hours, minutes, 0, 0);
      result.time = time;
    }

    if (params.has('theme')) {
      result.theme = params.get('theme');
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    return null;
  }
}

/**
 * Update URL hash with current state
 * @param {Object} state - State to persist
 */
export function updateUrlParams(state) {
  const params = new URLSearchParams();

  if (state.coordinates) {
    params.set('lat', state.coordinates.lat.toFixed(6));
    params.set('lng', state.coordinates.lng.toFixed(6));
  }

  if (state.date) {
    params.set('date', state.date.toISOString().split('T')[0]);
  }

  if (state.time) {
    const hours = state.time.getHours().toString().padStart(2, '0');
    const minutes = state.time.getMinutes().toString().padStart(2, '0');
    params.set('time', `${hours}:${minutes}`);
  }

  if (state.theme) {
    params.set('theme', state.theme);
  }

  const newHash = params.toString();
  if (window.location.hash.slice(1) !== newHash) {
    history.replaceState(null, '', `#${newHash}`);
  }
}

/**
 * Local storage helper for saved locations
 */
const SAVED_LOCATIONS_KEY = 'solset_saved_locations';
const RECENT_LOCATIONS_KEY = 'solset_recent_locations';
const MAX_RECENT_LOCATIONS = 10;
const SETTINGS_KEY = 'solset_settings';

export function getSavedLocations() {
  try {
    const stored = localStorage.getItem(SAVED_LOCATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveLocation(location) {
  const locations = getSavedLocations();
  const exists = locations.some(
    l => l.lat === location.lat && l.lng === location.lng
  );

  if (!exists) {
    locations.push({
      ...location,
      id: Date.now(),
      savedAt: new Date().toISOString()
    });
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(locations));
  }

  return locations;
}

export function removeLocation(id) {
  const locations = getSavedLocations().filter(l => l.id !== id);
  localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(locations));
  return locations;
}

export function getRecentLocations() {
  try {
    const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentLocation(location) {
  let locations = getRecentLocations();

  // Remove if already exists (we'll add it to the front)
  locations = locations.filter(
    l => !(Math.abs(l.lat - location.lat) < 0.0001 && Math.abs(l.lng - location.lng) < 0.0001)
  );

  // Add to front
  locations.unshift({
    ...location,
    visitedAt: new Date().toISOString()
  });

  // Limit size
  locations = locations.slice(0, MAX_RECENT_LOCATIONS);

  localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(locations));
  return locations;
}

export function getSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? JSON.parse(stored) : getDefaultSettings();
  } catch {
    return getDefaultSettings();
  }
}

export function getDefaultSettings() {
  return {
    theme: 'system',
    shadowHeight: 1,
    solarSystemSize: 6.7,
    showHouse: true,
    autoOrientHouse: true
  };
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
 * Calculate timezone offset based on longitude (rough approximation)
 * @param {number} lng - Longitude
 * @returns {number} Offset in hours from UTC
 */
export function getApproximateTimezone(lng) {
  return Math.round(lng / 15);
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
      document.execCommand('copy');
      return true;
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

