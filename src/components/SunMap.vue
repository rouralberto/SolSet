<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { initMap } from '../lib/mapUtils';
import { getSunPosition, getSunTrajectory } from '../lib/sunCalc';
import 'leaflet/dist/leaflet.css';
import * as d3 from 'd3';

// Props
const props = defineProps({
  coordinates: {
    type: Object,
    default: () => ({ lat: 0, lng: 0 })
  },
  date: {
    type: Date,
    default: () => new Date()
  },
  time: {
    type: Date,
    default: () => new Date()
  }
});

// Emits
const emit = defineEmits(['update:coordinates']);

// Map references
const mapContainer = ref(null);
const mapInstance = ref(null);
const sunOverlayContainer = ref(null);
const sunOverlaySvg = ref(null);
const lastCoordinates = ref({ lat: 0, lng: 0 });

// Fixed dimensions for the sun trajectory overlay
const OVERLAY_SIZE = 300; // pixels for width and height
const OVERLAY_RADIUS = OVERLAY_SIZE / 2.5; // scale to fit within the overlay

// Combine date and time for calculations
const dateTime = computed(() => {
  const result = new Date(props.date);
  
  // If time is provided, set hours and minutes
  if (props.time) {
    result.setHours(
      props.time.getHours(),
      props.time.getMinutes(),
      0, 0
    );
  }
  
  return result;
});

// Current sun position 
const sunPosition = computed(() => {
  return getSunPosition(
    dateTime.value,
    props.coordinates.lat,
    props.coordinates.lng
  );
});

// Daily sun trajectory
const sunTrajectory = computed(() => {
  return getSunTrajectory(
    props.date,
    props.coordinates.lat,
    props.coordinates.lng,
    48 // More points for smoother arc
  );
});

// Initialize map
onMounted(() => {
  if (!mapContainer.value) return;
  
  // Need to import leaflet styles
  if (document.querySelector('#leaflet-styles') === null) {
    const link = document.createElement('link');
    link.id = 'leaflet-styles';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.3/dist/leaflet.css';
    document.head.appendChild(link);
  }
  
  // Initialize the map
  mapInstance.value = initMap('map-container', props.coordinates);
  
  // Add click handler to update coordinates and center
  mapInstance.value.on('click', handleMapClick);
  
  // Add move handler to update coordinates in real-time as the map is being dragged
  mapInstance.value.on('move', handleMapMove);
  
  // Initialize the sun overlay
  initSunOverlay();
  
  // Save initial coordinates
  lastCoordinates.value = { ...props.coordinates };
  
  // Initial update
  updateSunTrajectory();
});

// Initialize the independent sun overlay
function initSunOverlay() {
  if (!sunOverlayContainer.value) return;
  
  // Create the SVG element
  sunOverlaySvg.value = d3.select(sunOverlayContainer.value)
    .append('svg')
    .attr('width', OVERLAY_SIZE)
    .attr('height', OVERLAY_SIZE)
    .attr('class', 'sun-overlay-svg');
  
  // Add groups for trajectory and sun marker
  sunOverlaySvg.value.append('g')
    .attr('class', 'trajectory-path');
  
  sunOverlaySvg.value.append('g')
    .attr('class', 'sun-marker');
}

// Handle map click
function handleMapClick(e) {
  // Get the clicked coordinates
  const newCoordinates = {
    lat: e.latlng.lat,
    lng: e.latlng.lng
  };
  
  // Center map to clicked location
  mapInstance.value.setView([newCoordinates.lat, newCoordinates.lng], mapInstance.value.getZoom());
  
  // Save last coordinates
  lastCoordinates.value = { ...newCoordinates };
  
  // Update coordinates via emit for two-way binding
  emit('update:coordinates', newCoordinates);
}

// Handle real-time map movement
function handleMapMove(e) {
  // Get the new center coordinates
  const center = mapInstance.value.getCenter();
  const newCoordinates = {
    lat: center.lat,
    lng: center.lng
  };
  
  // Update coordinates via emit for two-way binding
  // This updates in real-time as the map moves
  emit('update:coordinates', newCoordinates);
  
  // Only update lastCoordinates (and potentially trigger expensive operations)
  // if the change is significant
  const isDifferentLocation = 
    Math.abs(newCoordinates.lat - lastCoordinates.value.lat) > 0.0001 || 
    Math.abs(newCoordinates.lng - lastCoordinates.value.lng) > 0.0001;
  
  if (isDifferentLocation) {
    // Save last coordinates
    lastCoordinates.value = { ...newCoordinates };
  }
}

// Clean up when component is destroyed
onUnmounted(() => {
  if (mapInstance.value) {
    // Remove event listeners
    mapInstance.value.off('click', handleMapClick);
    mapInstance.value.off('move', handleMapMove);
    // Remove map
    mapInstance.value.remove();
  }
  
  // Clean up SVG if needed
  if (sunOverlaySvg.value) {
    sunOverlaySvg.value.remove();
  }
});

// When coordinates change from outside (from a search), center the map
watch(() => props.coordinates, (newCoords) => {
  // Check if this is a significant change (from search)
  const isDifferentLocation = 
    Math.abs(newCoords.lat - lastCoordinates.value.lat) > 0.001 || 
    Math.abs(newCoords.lng - lastCoordinates.value.lng) > 0.001;
  
  if (mapInstance.value && isDifferentLocation) {
    // This is likely a search result or significant external update
    mapInstance.value.setView([newCoords.lat, newCoords.lng]);
    lastCoordinates.value = { ...newCoords };
  }
}, { deep: true });

// Only update trajectory visualization when any props change
watch([() => props.coordinates, sunPosition, sunTrajectory], () => {
  // Update sun trajectory
  updateSunTrajectory();
});

// Function to update the sun trajectory overlay
function updateSunTrajectory() {
  if (!sunOverlaySvg.value) return;
  
  const svg = sunOverlaySvg.value;
  const center = { x: OVERLAY_SIZE / 2, y: OVERLAY_SIZE / 2 };
  
  // Clear existing elements
  svg.select('.trajectory-path').selectAll('*').remove();
  svg.select('.sun-marker').selectAll('*').remove();
  
  // Skip if no trajectory points
  if (!sunTrajectory.value || sunTrajectory.value.length === 0) return;
  
  // Filter to only include points where the sun is above the horizon (altitude > 0)
  const daytimePoints = sunTrajectory.value.filter(point => point.altitude > 0);
  
  // Convert trajectory points to overlay coordinates
  const pathPoints = daytimePoints.map(point => {
    return sunPositionToOverlayPoint(point.azimuth, point.altitude, center);
  });
  
  // Create path line
  const lineFunction = d3.line()
    .x(d => d.x)
    .y(d => d.y)
    .curve(d3.curveBasis);
  
  svg.select('.trajectory-path')
    .append('path')
    .attr('d', lineFunction(pathPoints))
    .attr('stroke', 'orange')
    .attr('stroke-width', 3)
    .attr('fill', 'none')
    .attr('stroke-opacity', 0.7)
    .attr('class', 'trajectory-path');
  
  // Get times from the trajectory
  if (daytimePoints.length > 0) {
    // Sort the points by time to ensure correct ordering
    const sortedPoints = [...daytimePoints].sort((a, b) => a.time - b.time);
    
    // First point is sunrise (east)
    const sunrisePoint = sortedPoints[0];
    // Last point is sunset (west)
    const sunsetPoint = sortedPoints[sortedPoints.length - 1];
    
    // Add sunrise marker (east)
    if (sunrisePoint) {
      const sunriseOverlayPoint = sunPositionToOverlayPoint(
        sunrisePoint.azimuth, 
        sunrisePoint.altitude, 
        center
      );
      
      svg.select('.trajectory-path')
        .append('circle')
        .attr('cx', sunriseOverlayPoint.x)
        .attr('cy', sunriseOverlayPoint.y)
        .attr('r', 6)
        .attr('fill', 'red')
        .attr('stroke', 'white')
        .attr('stroke-width', 2);
    }
    
    // Add sunset marker (west)
    if (sunsetPoint) {
      const sunsetOverlayPoint = sunPositionToOverlayPoint(
        sunsetPoint.azimuth, 
        sunsetPoint.altitude, 
        center
      );
      
      svg.select('.trajectory-path')
        .append('circle')
        .attr('cx', sunsetOverlayPoint.x)
        .attr('cy', sunsetOverlayPoint.y)
        .attr('r', 6)
        .attr('fill', 'blue')
        .attr('stroke', 'white')
        .attr('stroke-width', 2);
    }
  }
  
  // Add current sun position marker (if above horizon)
  if (sunPosition.value && sunPosition.value.altitude > 0) {
    const sunPoint = sunPositionToOverlayPoint(
      sunPosition.value.azimuth, 
      sunPosition.value.altitude, 
      center
    );
    
    svg.select('.sun-marker')
      .append('circle')
      .attr('cx', sunPoint.x)
      .attr('cy', sunPoint.y)
      .attr('r', 8)
      .attr('fill', 'yellow')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .attr('filter', 'drop-shadow(0 0 6px rgba(255, 255, 0, 0.7))');
      
    // Add shadow line from sun to center (representing shadow at the selected location)
    svg.select('.sun-marker')
      .append('line')
      .attr('x1', sunPoint.x)
      .attr('y1', sunPoint.y)
      .attr('x2', center.x)
      .attr('y2', center.y)
      .attr('stroke', 'rgba(0, 0, 0, 0.4)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4 2');
    
    // Add shadow indicator at center
    svg.select('.sun-marker')
      .append('circle')
      .attr('cx', center.x)
      .attr('cy', center.y)
      .attr('r', 3)
      .attr('fill', 'rgba(0, 0, 0, 0.5)')
      .attr('stroke', 'white')
      .attr('stroke-width', 1);
  }
}

// Convert sun position to overlay coordinates
function sunPositionToOverlayPoint(azimuth, altitude, center) {
  // Below horizon
  if (altitude <= 0) {
    // Extend point to horizon line
    const horizonDist = OVERLAY_RADIUS * 1.5;
    const dx = horizonDist * Math.sin(azimuth);
    const dy = horizonDist * Math.cos(azimuth);
    return { x: center.x + dx, y: center.y - dy };
  }
  
  // Scale distance by altitude (higher altitude = closer to center)
  // 0 altitude = horizon (max distance), π/2 altitude = zenith (min distance)
  const distance = OVERLAY_RADIUS * (1 - altitude / (Math.PI / 2));
  
  // Convert polar to Cartesian coordinates
  // Important: in astronomy, azimuth is measured clockwise from north:
  // North = 0, East = π/2, South = π, West = 3π/2
  
  // Negate the x direction (dx) to flip east and west
  // This ensures the sun rises in the east (right) and sets in the west (left)
  const dx = -distance * Math.sin(azimuth);
  const dy = distance * Math.cos(azimuth);
  
  // In SVG, y-axis is flipped (goes down), so we negate dy
  return { x: center.x + dx, y: center.y - dy };
}
</script>

<template>
  <div class="sun-map-container">
    <div ref="mapContainer" id="map-container" class="map-container"></div>
    <div ref="sunOverlayContainer" class="sun-overlay-container"></div>
  </div>
</template>

<style scoped>
.sun-map-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

.sun-overlay-container {
  position: absolute;
  width: 300px;
  height: 300px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  pointer-events: none;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
}

:deep(.sun-overlay-svg) {
  width: 100%;
  height: 100%;
}

:deep(.leaflet-container) {
  background-color: #f8f8f8;
  height: 100%;
  width: 100%;
}

/* Map Language Indicator */
:deep(.language-info) {
  margin-bottom: 10px !important;
  font-family: Arial, sans-serif;
  user-select: none;
}

:deep(.language-indicator) {
  transition: color 0.3s ease;
}

/* Layer Control Styling */
:deep(.leaflet-control-layers) {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  padding: 8px;
  min-width: 200px;
  font-family: Arial, sans-serif;
  margin-top: 10px;
}

:deep(.leaflet-control-layers-list) {
  margin-bottom: 5px;
}

:deep(.leaflet-control-layers-base label) {
  margin-bottom: 8px;
  padding: 4px;
  border-radius: 4px;
  display: block;
  transition: background-color 0.2s ease;
}

:deep(.leaflet-control-layers-base label:hover) {
  background-color: #f0f8ff;
}

:deep(.leaflet-control-layers-selector) {
  margin-right: 6px;
  cursor: pointer;
}

:deep(.leaflet-control-container) {
  z-index: 10;
}

/* Ensure trajectory elements are visible */
:deep(.trajectory-path) {
  stroke-linecap: round;
}
</style> 
