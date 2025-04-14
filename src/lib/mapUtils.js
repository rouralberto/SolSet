import L from 'leaflet';
import * as d3 from 'd3';

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
    "Street Map (Local Labels)": openStreetMapLocal,
    "Satellite (No Labels)": esriWorldImagery,
    
    // English options
    "Street Map (English Labels)": esriWorldStreet,
    "Satellite (English Labels)": esriWorldImageryLabeled
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
 * Create an SVG overlay for the sun trajectory
 * @param {Object} map - Leaflet map instance
 * @returns {Object} SVG overlay and utility methods
 */
export function createSunOverlay(map) {
  // Create an SVG overlay for the trajectory
  const svgOverlay = L.svg().addTo(map);
  const svg = d3.select(svgOverlay._container);
  
  // Initialize groups for different elements
  const pathGroup = svg.append('g').attr('class', 'trajectory-path');
  const markersGroup = svg.append('g').attr('class', 'sun-markers');
  
  return {
    map,
    svg,
    pathGroup,
    markersGroup,
    
    /**
     * Calculate map position from azimuth, altitude and center point
     * @param {number} azimuth - Sun azimuth in radians
     * @param {number} altitude - Sun altitude in radians
     * @param {Object} center - Center coordinates { lat, lng }
     * @param {number} radius - Radius in meters for scaling (default: 1000)
     * @returns {Object} Leaflet LatLng object
     */
    sunPositionToLatLng(azimuth, altitude, center, radius = 1000) {
      // Below horizon
      if (altitude <= 0) {
        // Extend point to horizon line
        const horizonDist = radius * 1.5;
        const dx = horizonDist * Math.sin(azimuth);
        const dy = horizonDist * Math.cos(azimuth);
        return L.latLng(center.lat + dy / 111111, center.lng + dx / (111111 * Math.cos(center.lat * Math.PI / 180)));
      }
      
      // Scale distance by altitude (higher altitude = closer to center)
      // 0 altitude = horizon (max distance), π/2 altitude = zenith (min distance)
      const distance = radius * (1 - altitude / (Math.PI / 2));
      
      // Convert polar to Cartesian
      const dx = distance * Math.sin(azimuth);
      const dy = distance * Math.cos(azimuth);
      
      // Convert meters to approximate degrees (very approximate)
      // 111,111 meters per degree of latitude
      const latOffset = dy / 111111;
      // Longitude degrees vary by latitude
      const lngOffset = dx / (111111 * Math.cos(center.lat * Math.PI / 180));
      
      return L.latLng(center.lat + latOffset, center.lng + lngOffset);
    },
    
    /**
     * Update the sun trajectory path on the map
     * @param {Array} trajectory - Array of trajectory points
     * @param {Object} center - Center coordinates { lat, lng }
     */
    updateSunPath(trajectory, center) {
      // Clear existing path
      pathGroup.selectAll('*').remove();
      
      if (trajectory.length === 0) return;
      
      // Convert trajectory points to map coordinates
      const pathPoints = trajectory.map(point => {
        const latlng = this.sunPositionToLatLng(point.azimuth, point.altitude, center);
        return map.latLngToLayerPoint(latlng);
      });
      
      // Create path line
      const lineFunction = d3.line()
        .x(d => d.x)
        .y(d => d.y)
        .curve(d3.curveBasis);
      
      // Add the path
      pathGroup.append('path')
        .attr('d', lineFunction(pathPoints))
        .attr('stroke', 'orange')
        .attr('stroke-width', 3)
        .attr('fill', 'none')
        .attr('stroke-opacity', 0.7);
      
      // Add sunrise point (first point)
      if (trajectory[0].altitude >= 0) {
        const sunrisePoint = map.latLngToLayerPoint(
          this.sunPositionToLatLng(trajectory[0].azimuth, trajectory[0].altitude, center)
        );
        
        pathGroup.append('circle')
          .attr('cx', sunrisePoint.x)
          .attr('cy', sunrisePoint.y)
          .attr('r', 6)
          .attr('fill', 'red')
          .attr('stroke', 'white')
          .attr('stroke-width', 2);
      }
      
      // Add sunset point (last point)
      if (trajectory[trajectory.length-1].altitude >= 0) {
        const sunsetPoint = map.latLngToLayerPoint(
          this.sunPositionToLatLng(
            trajectory[trajectory.length-1].azimuth, 
            trajectory[trajectory.length-1].altitude, 
            center
          )
        );
        
        pathGroup.append('circle')
          .attr('cx', sunsetPoint.x)
          .attr('cy', sunsetPoint.y)
          .attr('r', 6)
          .attr('fill', 'blue')
          .attr('stroke', 'white')
          .attr('stroke-width', 2);
      }
    },
    
    /**
     * Update the current sun position marker
     * @param {Object} position - Sun position { azimuth, altitude }
     * @param {Object} center - Center coordinates { lat, lng }
     */
    updateSunPosition(position, center) {
      // Clear existing markers
      markersGroup.selectAll('*').remove();
      
      // If sun is below horizon, don't show marker
      if (position.altitude <= 0) return;
      
      // Convert position to map coordinates
      const latLng = this.sunPositionToLatLng(position.azimuth, position.altitude, center);
      const point = map.latLngToLayerPoint(latLng);
      
      // Add sun marker
      markersGroup.append('circle')
        .attr('cx', point.x)
        .attr('cy', point.y)
        .attr('r', 8)
        .attr('fill', 'yellow')
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('filter', 'drop-shadow(0 0 6px rgba(255, 255, 0, 0.7))');
      
      // Add shadow line (if sun is above horizon)
      if (position.altitude > 0) {
        // Calculate shadow direction (opposite to sun azimuth)
        const shadowAzimuth = position.azimuth + Math.PI;
        
        // Shadow length depends on altitude
        const shadowScale = Math.min(30 / Math.tan(position.altitude), 100);
        
        // Calculate shadow end point
        const shadowX = point.x + shadowScale * Math.sin(shadowAzimuth);
        const shadowY = point.y - shadowScale * Math.cos(shadowAzimuth);
        
        // Draw shadow line
        markersGroup.append('line')
          .attr('x1', point.x)
          .attr('y1', point.y)
          .attr('x2', shadowX)
          .attr('y2', shadowY)
          .attr('stroke', 'rgba(0, 0, 0, 0.4)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4 2');
      }
    },
    
    /**
     * Update the overlay when the map view changes
     */
    updateOnMapChange() {
      // This method is called when the map is moved or zoomed
      // Update existing elements to match new map view
      map.on('zoomend moveend', () => {
        // This will be handled by Vue's reactive system when props change
      });
    }
  };
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
