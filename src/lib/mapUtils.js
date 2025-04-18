import L from 'leaflet';

/**
 * Initialize a Leaflet map
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
  
  // Standard OpenStreetMap with local language labels
  const openStreetMapLocal = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  });
  
  // ESRI World Street Map with English labels
  const esriWorldStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Sources: Esri, HERE, Garmin, USGS, Intermap, NRCAN',
    maxZoom: 19
  });
  
  // ESRI World Imagery (satellite)
  const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics, USGS, METI',
    maxZoom: 19
  });
  
  // ESRI World Imagery with English labels overlay
  const esriWorldImageryLabeled = L.layerGroup([
    esriWorldImagery,
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Labels &copy; Esri &mdash; Sources: Esri, HERE, Garmin',
      maxZoom: 19,
      pane: 'overlayPane'
    })
  ]);
  
  // Add the default OSM layer to start
  openStreetMapLocal.addTo(map);
  
  // Create basemap groups
  const baseLayers = {
    // Local language options
    "OSM Map (Local Labels)": openStreetMapLocal,
    "ESRI Map (English Labels)": esriWorldStreet,
    "ESRI Satellite (English Labels)": esriWorldImageryLabeled,
    "ESRI Satellite (No Labels)": esriWorldImagery,
  };
  
  // Add layer control
  L.control.layers(baseLayers, {}, { 
    position: 'topright',
    collapsed: false
  }).addTo(map);
  
  // Add a custom language indicator in the top-right corner
  const languageInfo = L.control({ position: 'topright' });
  languageInfo.onAdd = function() {
    const div = L.DomUtil.create('div', 'language-info');
    div.innerHTML = '<div class="language-indicator">Map Language: Local</div>';
    div.style.backgroundColor = 'white';
    div.style.padding = '5px 10px';
    div.style.border = '2px solid rgba(0,0,0,0.2)';
    div.style.borderRadius = '4px';
    div.style.marginBottom = '5px';
    div.style.fontWeight = 'bold';
    div.style.fontSize = '12px';
    return div;
  };
  languageInfo.addTo(map);
  
  // Update language indicator when base layer changes
  map.on('baselayerchange', function(e) {
    const isEnglish = e.name.includes('English');
    const indicator = document.querySelector('.language-indicator');
    if (indicator) {
      indicator.textContent = `Map Language: ${isEnglish ? 'English' : 'Local'}`;
      indicator.style.color = isEnglish ? '#1976d2' : '#333';
    }
  });
  
  return map;
}

/**
 * Get coordinates from address using Nominatim API
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
        'User-Agent': 'SolSet Sun Tracker App (albert.dev)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Geocoding error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.length === 0) {
      throw new Error('Address not found');
    }
    
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    throw error;
  }
} 
