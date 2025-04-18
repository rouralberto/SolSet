<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { initMap } from '../lib/mapUtils';
import { getSunPosition, getSunTrajectory, getSeasonalTrajectories } from '../lib/sunCalc';
import HouseLayout from './HouseLayout.vue';
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
  },
  showHouse: {
    type: Boolean,
    default: true
  },
  showSeasonalPaths: {
    type: Boolean,
    default: false
  }
});

// Emits
const emit = defineEmits(['update:coordinates', 'update:showHouse', 'update-house-orientation']);

// Map references
const mapContainer = ref(null);
const mapInstance = ref(null);
const sunOverlayContainer = ref(null);
const sunOverlaySvg = ref(null);
const seasonalLegendContainer = ref(null);
const houseVisible = computed(() => props.showHouse);
const lastCoordinates = ref({ lat: 0, lng: 0 });

// Fixed dimensions for the sun trajectory overlay
const OVERLAY_SIZE = 300; // pixels for width and height
const OVERLAY_RADIUS = OVERLAY_SIZE / 2.5; // scale to fit within the overlay
const HOUSE_SIZE = 150; // Size of the house in the center

// Combine date and time for calculations
const dateTime = computed(() => {
  // Create date with today's date
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
  const position = getSunPosition(
    dateTime.value,
    props.coordinates.lat,
    props.coordinates.lng
  );
  
  return position;
});

// Daily sun trajectory
const sunTrajectory = computed(() => {
  // Log relevant information for debugging
  const result = getSunTrajectory(
    props.date,
    props.coordinates.lat,
    props.coordinates.lng,
    48 // More points for smoother arc
  );
  
  return result;
});

// Seasonal trajectories cached to avoid recalculation
const seasonalTrajectories = ref(null);

// Add a section for orientation info near other computed properties
const houseOrientation = ref({
  angle: 0,
  label: '0° (N)'
});

// Handle orientation updates from HouseLayout
function handleOrientationChange(orientation) {
  houseOrientation.value = orientation;
  emit('update-house-orientation', orientation);
}

// Add state for throttling map updates
const lastUpdateTime = ref(0);
const updateThrottleMs = 100; // Throttle to max 10 updates per second

// Initialize map
onMounted(() => {
  if (!mapContainer.value) return;
  
  // Need to import leaflet styles
  if (document.querySelector('#leaflet-styles') === null) {
    const link = document.createElement('link');
    link.id = 'leaflet-styles';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
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
  
  // Initialize the seasonal legend
  initSeasonalLegend();
  
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

// Initialize the seasonal legend in the bottom right corner
function initSeasonalLegend() {
  if (!seasonalLegendContainer.value) return;
  
  // Create the SVG element for the legend
  d3.select(seasonalLegendContainer.value)
    .append('svg')
    .attr('width', 130)
    .attr('height', 150) // Increased height to accommodate the additional entry
    .attr('class', 'seasonal-legend-svg');
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
  // if the change is significant and we're not updating too frequently
  const isDifferentLocation = 
    Math.abs(newCoordinates.lat - lastCoordinates.value.lat) > 0.0001 || 
    Math.abs(newCoordinates.lng - lastCoordinates.value.lng) > 0.0001;
  
  const now = Date.now();
  const timeSinceLastUpdate = now - lastUpdateTime.value;
  
  if (isDifferentLocation && (timeSinceLastUpdate > updateThrottleMs || timeSinceLastUpdate > 1000)) {
    // Save last coordinates
    lastCoordinates.value = { ...newCoordinates };
    lastUpdateTime.value = now;
    
    // Clear seasonal trajectories cache to force recalculation
    if (props.showSeasonalPaths) {
      seasonalTrajectories.value = null;
      updateSunTrajectory();
    }
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
  
  // Clean up seasonal legend
  if (seasonalLegendContainer.value) {
    const legendSvg = d3.select(seasonalLegendContainer.value).select('svg');
    if (!legendSvg.empty()) {
      legendSvg.remove();
    }
  }
});

// When coordinates change from outside (from a search), center the map
watch(() => props.coordinates, (newCoords) => {
  // Check if this is a significant change (from search) or if forceUpdate flag is set
  const isDifferentLocation = 
    Math.abs(newCoords.lat - lastCoordinates.value.lat) > 0.001 || 
    Math.abs(newCoords.lng - lastCoordinates.value.lng) > 0.001 ||
    newCoords.forceUpdate === true;
  
  if (mapInstance.value && isDifferentLocation) {
    // This is likely a search result or significant external update
    // Force map to refresh by invalidating size first
    mapInstance.value.invalidateSize();
    // Then set the view to the new coordinates
    mapInstance.value.setView([newCoords.lat, newCoords.lng], mapInstance.value.getZoom());
    // Ensure it's really centered by forcing another update after a tiny delay
    setTimeout(() => {
      mapInstance.value?.setView([newCoords.lat, newCoords.lng], mapInstance.value.getZoom());
    }, 10);
    
    lastCoordinates.value = { ...newCoords };
    
    // Remove the forceUpdate flag after using it
    delete lastCoordinates.value.forceUpdate;
    
    // Clear seasonal trajectories cache when location changes significantly
    if (props.showSeasonalPaths) {
      seasonalTrajectories.value = null;
    }
  }
}, { deep: true });

// Only update trajectory visualization when any props change
watch([() => props.coordinates, sunPosition, sunTrajectory], () => {
  try {
    // Update sun trajectory
    updateSunTrajectory();
  } catch (error) {
    console.error("Error updating sun trajectory from watch:", error);
  }
});

// Add watch for house visibility changes to update shadow elements immediately
watch(() => houseVisible.value, () => {
  try {
    updateSunTrajectory();
  } catch (error) {
    console.error("Error updating sun trajectory from house visibility change:", error);
  }
});

// Add watch for seasonal paths visibility changes
watch(() => props.showSeasonalPaths, (isVisible) => {
  try {
    updateSunTrajectory();
    
    // If turning off, make sure legend is cleared
    if (!isVisible) {
      clearSeasonalLegend();
    }
  } catch (error) {
    console.error("Error updating sun trajectory from seasonal paths toggle:", error);
  }
});

// Function to get seasonal trajectories with caching
function getAndCacheSeasonalTrajectories() {
  try {
    // Check if we have cached trajectories for the current coordinates
    if (!seasonalTrajectories.value || 
        Math.abs(lastCoordinates.value.lat - props.coordinates.lat) > 0.01 || 
        Math.abs(lastCoordinates.value.lng - props.coordinates.lng) > 0.01) {
      
      // Use a local coords reference to avoid race conditions during calculation
      const currentCoords = {
        lat: props.coordinates.lat,
        lng: props.coordinates.lng
      };
      
      // Validate coordinates before calculation
      if (isNaN(currentCoords.lat) || isNaN(currentCoords.lng)) {
        console.error("Invalid coordinates for seasonal trajectories:", currentCoords);
        return null;
      }
      
      // Create the seasonal trajectories
      try {
        const trajectories = getSeasonalTrajectories(
          currentCoords.lat,
          currentCoords.lng,
          new Date().getFullYear(),
          48 // More points for smoother arcs
        );
        
        // Validate trajectories before caching
        if (!trajectories) {
          console.warn("Seasonal trajectories calculation returned null or undefined");
          return null;
        }
        
        // Store the calculated trajectories
        seasonalTrajectories.value = trajectories;
        
        // Store the coordinates used for this calculation
        seasonalTrajectories.value.calculatedFor = {
          lat: currentCoords.lat,
          lng: currentCoords.lng
        };
      } catch (calcError) {
        console.error("Error calculating seasonal trajectories:", calcError);
        return null;
      }
    }
    
    return seasonalTrajectories.value;
  } catch (error) {
    console.error("Error in getAndCacheSeasonalTrajectories:", error);
    return null;
  }
}

// Function to update the sun trajectory overlay
function updateSunTrajectory() {
  if (!sunOverlaySvg.value) return;
  
  try {
    const svg = sunOverlaySvg.value;
    const center = { x: OVERLAY_SIZE / 2, y: OVERLAY_SIZE / 2 };
    
    // Clear existing elements
    svg.select('.trajectory-path').selectAll('*').remove();
    svg.select('.sun-marker').selectAll('*').remove();
    
    // Skip if no trajectory points
    if (!sunTrajectory.value || sunTrajectory.value.length === 0) return;  
    
    // Filter to only include points where the sun is above the horizon (altitude > 0)
    const daytimePoints = sunTrajectory.value.filter(point => point.altitude > 0);
    
    // Skip if no daytime points
    if (daytimePoints.length === 0) {
      return;
    }
    
    // Render seasonal trajectories if enabled
    if (props.showSeasonalPaths) {
      try {
        renderSeasonalTrajectories(svg, center);
        updateSeasonalLegend();
      } catch (error) {
        console.error("Error rendering seasonal trajectories:", error);
        // Continue with regular trajectory even if seasonal fails
      }
    } else {
      // Clear legend when not showing seasonal paths
      clearSeasonalLegend();
    }
    
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
        .attr('r', 12)
        .attr('fill', 'yellow')
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('filter', 'drop-shadow(0 0 6px rgba(255, 255, 0, 0.7))');
        
      // Add shadow line from sun to center (representing shadow at the selected location)
      // Only show if house is not visible
      if (!houseVisible.value) {
        svg.select('.sun-marker')
          .append('line')
          .attr('x1', sunPoint.x)
          .attr('y1', sunPoint.y)
          .attr('x2', center.x)
          .attr('y2', center.y)
          .attr('stroke', 'rgba(0, 0, 0, 0.4)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4 2');
      }
      
      // Add shadow indicator at center, but only if house is not visible
      if (!houseVisible.value) {
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
  } catch (error) {
    console.error("Error in updateSunTrajectory:", error);
  }
}

// Function to render seasonal trajectories (only paths, no legend)
function renderSeasonalTrajectories(svg, center) {
  const seasonal = getAndCacheSeasonalTrajectories();
  if (!seasonal) return;
  
  // Count how many valid trajectories we have
  let validTrajectoryCount = 0;
  const validTrajectories = {};
  
  // Validate all trajectories first
  Object.entries(seasonal).forEach(([key, trajectory]) => {
    if (trajectory && trajectory.points && trajectory.points.length > 0) {
      const daytimePoints = trajectory.points.filter(point => point && point.altitude > 0);
      if (daytimePoints.length > 0) {
        validTrajectoryCount++;
        validTrajectories[key] = {
          ...trajectory,
          daytimePoints
        };
      }
    }
  });
  
  // If we have no valid trajectories, don't render anything
  if (validTrajectoryCount === 0) return;
  
  const lineFunction = d3.line()
    .x(d => d.x)
    .y(d => d.y)
    .curve(d3.curveBasis);
    
  // Create a group for seasonal paths
  const seasonalGroup = svg.select('.trajectory-path')
    .append('g')
    .attr('class', 'seasonal-paths');
  
  // Process each valid seasonal trajectory
  Object.entries(validTrajectories).forEach(([key, data]) => {
    // Convert to overlay points
    const pathPoints = data.daytimePoints.map(point => {
      return sunPositionToOverlayPoint(point.azimuth, point.altitude, center);
    });
    
    // Draw the path
    seasonalGroup.append('path')
      .attr('d', lineFunction(pathPoints))
      .attr('stroke', data.color)
      .attr('stroke-width', 2)
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.8)
      .attr('stroke-dasharray', '5,3')
      .attr('class', `seasonal-path-${key}`);
  });
}

// Function to update the seasonal legend in the bottom right corner
function updateSeasonalLegend() {
  if (!seasonalLegendContainer.value) return;
  
  // Get the legend SVG
  const legendSvg = d3.select(seasonalLegendContainer.value).select('svg');
  if (!legendSvg.empty()) {
    // Clear previous legend
    legendSvg.selectAll('*').remove();
    
    const seasonal = getAndCacheSeasonalTrajectories();
    if (!seasonal) return;
    
    // Count valid trajectories
    let validTrajectoryCount = 0;
    const validTrajectories = {};
    
    // Validate trajectories
    Object.entries(seasonal).forEach(([key, trajectory]) => {
      if (trajectory && trajectory.points && trajectory.points.length > 0) {
        validTrajectoryCount++;
        validTrajectories[key] = trajectory;
      }
    });
    
    // If no valid trajectories, don't render legend
    if (validTrajectoryCount === 0) return;
    
    // Create a group for the legend contents
    const legend = legendSvg.append('g')
      .attr('class', 'legend-content')
      .attr('transform', 'translate(5, 20)');
    
    // Add legend title
    legend.append('text')
      .attr('x', 5)
      .attr('y', -5)
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .attr('text-shadow', '1px 1px 2px rgba(0,0,0,0.8)')
      .text('Sun Paths');
    
    // Add Today's Path first (solid line)
    legend.append('line')
      .attr('x1', 0)
      .attr('y1', 5)
      .attr('x2', 20)
      .attr('y2', 5)
      .attr('stroke', 'orange')
      .attr('stroke-width', 3)
      .attr('stroke-opacity', 0.9);
    
    legend.append('text')
      .attr('x', 25)
      .attr('y', 9)
      .attr('font-size', '11px')
      .attr('fill', 'white')
      .attr('text-shadow', '1px 1px 2px rgba(0,0,0,0.8)')
      .text("Today's Path");
    
    // Start seasonal paths after today's path
    let index = 1;
    
    // Add entries for each season
    Object.entries(validTrajectories).forEach(([key, data]) => {
      // Add line
      legend.append('line')
        .attr('x1', 0)
        .attr('y1', index * 18 + 5)
        .attr('x2', 20)
        .attr('y2', index * 18 + 5)
        .attr('stroke', data.color)
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.8)
        .attr('stroke-dasharray', '5,3');
      
      // Add label
      legend.append('text')
        .attr('x', 25)
        .attr('y', index * 18 + 9)
        .attr('font-size', '11px')
        .attr('fill', 'white')
        .attr('text-shadow', '1px 1px 2px rgba(0,0,0,0.8)')
        .text(data.label);
      
      index++;
    });
    
    // Add background rectangle - adjust height to include Today's Path
    legend.insert('rect', ':first-child')
      .attr('x', -5)
      .attr('y', -20)
      .attr('width', 125)
      .attr('height', index * 18 + 25)
      .attr('fill', 'rgba(0, 0, 0, 0.6)')
      .attr('rx', 5);
  }
}

// Function to clear the seasonal legend
function clearSeasonalLegend() {
  if (!seasonalLegendContainer.value) return;
  
  const legendSvg = d3.select(seasonalLegendContainer.value).select('svg');
  if (!legendSvg.empty()) {
    legendSvg.selectAll('*').remove();
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
    
    <!-- Add the house layout overlay centered on the map -->
    <div v-if="houseVisible" class="house-layout-overlay">
      <HouseLayout 
        :sun-position="sunPosition"
        :location="props.coordinates"
        :auto-orient="true"
        :size="HOUSE_SIZE"
        @orientation-changed="handleOrientationChange"
      />
    </div>
    
    <!-- Seasonal paths legend in bottom right corner -->
    <div 
      v-if="props.showSeasonalPaths"
      ref="seasonalLegendContainer" 
      class="seasonal-legend-container"
    ></div>
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
  z-index: 15;
  pointer-events: none;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
}

.seasonal-legend-container {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 20;
  pointer-events: none;
}

.house-layout-overlay {
  position: absolute;
  width: 150px;
  height: 150px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  border-radius: 5px;
  padding: 0;
  overflow: visible; /* Allow shadows to extend beyond container */
}

:deep(.house-layout-svg) {
  width: 100%;
  height: 100%;
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
