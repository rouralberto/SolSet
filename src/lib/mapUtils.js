import L from 'leaflet';
import { debounce } from './utils';

/**
 * Initialize a Leaflet map with custom styling
 * @param {string} elementId - The ID of the DOM element to attach the map to
 * @param {Object} coords - Initial coordinates { lat, lng }
 * @param {number} zoom - Initial zoom level
 * @returns {Object} Leaflet map instance
 */
export function initMap(elementId, coords, zoom = 13) {
  // Create map instance
  const map = L.map(elementId, {
    center: [coords.lat, coords.lng],
    zoom: zoom,
    zoomControl: true,
    attributionControl: true
  });

  // Standard OpenStreetMap
  const openStreetMapLocal = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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

  // Add the default layer
  openStreetMapLocal.addTo(map);

  // Create basemap groups
  const baseLayers = {
    "🗺️ OpenStreetMap": openStreetMapLocal,
    "🌍 ESRI Street": esriWorldStreet,
    "🛰️ Satellite + Labels": esriWorldImageryLabeled,
    "🛰️ Satellite Only": esriWorldImagery,
  };

  // Add layer control
  L.control.layers(baseLayers, {}, {
    position: 'topright',
    collapsed: false
  }).addTo(map);

  // Add crosshair indicator at center
  const crosshairIcon = L.divIcon({
    className: 'map-crosshair',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div class="crosshair-inner"></div>`
  });

  // Create a non-interactive marker at map center
  const centerMarker = L.marker(map.getCenter(), {
    icon: crosshairIcon,
    interactive: false,
    keyboard: false
  }).addTo(map);

  // Update marker position when map moves
  map.on('move', () => {
    centerMarker.setLatLng(map.getCenter());
  });

  // Add custom CSS for crosshair
  if (!document.getElementById('solset-map-styles')) {
    const style = document.createElement('style');
    style.id = 'solset-map-styles';
    style.textContent = `
      .map-crosshair {
        background: transparent;
        border: none;
        pointer-events: none;
      }
      .crosshair-inner {
        width: 24px;
        height: 24px;
        position: relative;
      }
      .crosshair-inner::before,
      .crosshair-inner::after {
        content: '';
        position: absolute;
        background: rgba(245, 158, 11, 0.8);
        border-radius: 1px;
      }
      .crosshair-inner::before {
        width: 2px;
        height: 24px;
        left: 50%;
        transform: translateX(-50%);
      }
      .crosshair-inner::after {
        width: 24px;
        height: 2px;
        top: 50%;
        transform: translateY(-50%);
      }

      [data-theme="dark"] .leaflet-control-layers {
        background: #1e293b !important;
        border-color: #334155 !important;
      }

      [data-theme="dark"] .leaflet-control-layers-base label {
        color: #f1f5f9 !important;
      }

      [data-theme="dark"] .leaflet-control-layers-base label:hover {
        background-color: #334155 !important;
      }

      [data-theme="dark"] .leaflet-control-zoom a {
        background: #1e293b !important;
        color: #f1f5f9 !important;
        border-color: #334155 !important;
      }

      [data-theme="dark"] .leaflet-control-zoom a:hover {
        background: #334155 !important;
      }
    `;
    document.head.appendChild(style);
  }

  return map;
}

/**
 * Get coordinates from address using Nominatim API (debounced)
 * @param {string} address - The address to geocode
 * @returns {Promise} Promise resolving to { lat, lng } coordinates
 */
export async function geocodeAddress(address) {
  const encodedAddress = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SolSet Sun Tracker (https://solset.guztia.com)'
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.length === 0) {
      throw new Error('Location not found. Try a more specific address.');
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name
    };
  } catch (error) {
    if (error.message.includes('Location not found')) {
      throw error;
    }
    throw new Error('Unable to search. Check your connection and try again.');
  }
}

/**
 * Reverse geocode coordinates to get address
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise} Promise resolving to address string
 */
export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SolSet Sun Tracker (https://solset.guztia.com)'
      }
    });

    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.display_name) {
      return null;
    }

    return {
      displayName: data.display_name,
      city: data.address?.city || data.address?.town || data.address?.village,
      country: data.address?.country
    };
  } catch (error) {
    return null;
  }
}
