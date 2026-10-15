import L from 'leaflet';

const BASE_LAYER_KEY = 'solset_base_layer';

/**
 * Initialize a Leaflet map with the available base layers
 * @param {HTMLElement} element - The DOM element to attach the map to
 * @param {Object} coords - Initial coordinates { lat, lng }
 * @param {number} zoom - Initial zoom level
 * @returns {Object} Leaflet map instance
 */
export function initMap(element, coords, zoom = 13) {
  const map = L.map(element, {
    center: [coords.lat, coords.lng],
    zoom: zoom,
    zoomControl: true,
    attributionControl: true,
    // Arrow keys are reserved for the app's time shortcuts
    keyboard: false
  });

  // Standard OpenStreetMap
  const openStreetMap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  });

  // ESRI World Street Map
  const esriWorldStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
  });

  // ESRI World Imagery (satellite)
  const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Maxar, GeoEye, Earthstar',
    maxZoom: 19
  });

  // ESRI World Imagery with labels
  const esriWorldImageryLabeled = L.layerGroup([
    esriWorldImagery,
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Labels &copy; Esri',
      maxZoom: 19,
      pane: 'overlayPane'
    })
  ]);

  const baseLayers = {
    'OpenStreetMap': openStreetMap,
    'Street (Esri)': esriWorldStreet,
    'Satellite + Labels': esriWorldImageryLabeled,
    'Satellite': esriWorldImagery
  };

  // Restore the last used base layer (satellite is popular for checking a specific roof/garden)
  let savedLayer = null;
  try {
    savedLayer = localStorage.getItem(BASE_LAYER_KEY);
  } catch {
    // Storage unavailable
  }
  (baseLayers[savedLayer] || openStreetMap).addTo(map);

  map.on('baselayerchange', (e) => {
    try {
      localStorage.setItem(BASE_LAYER_KEY, e.name);
    } catch {
      // Storage unavailable
    }
  });

  L.control.layers(baseLayers, {}, {
    position: 'topright',
    collapsed: window.matchMedia('(max-width: 900px)').matches
  }).addTo(map);

  return map;
}

function shortenDisplayName(displayName, parts = 3) {
  return displayName ? displayName.split(',').slice(0, parts).map(s => s.trim()).join(', ') : null;
}

/**
 * Get coordinates from address using the Nominatim API.
 * Only call this on explicit user action: Nominatim's usage policy forbids autocomplete.
 * @param {string} address - The address to geocode
 * @returns {Promise} Promise resolving to { lat, lng, name }
 */
export async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;

  let data;
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }
    data = await response.json();
  } catch {
    throw new Error('Unable to search. Check your connection and try again.');
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Location not found. Try a more specific address.');
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    name: shortenDisplayName(data[0].display_name)
  };
}

/**
 * Reverse geocode coordinates to get a short place name
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string|null>} Place name, or null if unavailable
 */
export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&lat=${lat}&lon=${lng}`;

  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) return null;
    const data = await response.json();
    return shortenDisplayName(data.display_name, 2);
  } catch {
    return null;
  }
}
