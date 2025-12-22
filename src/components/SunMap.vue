<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { select, line, curveBasis } from 'd3';
import { initMap } from '../lib/mapUtils';
import { getSunPosition, getSunTrajectory, getSeasonalTrajectories } from '../lib/sunCalc';
import { combineDateAndTime, throttle } from '../lib/utils';
import HouseLayout from './HouseLayout.vue';
import 'leaflet/dist/leaflet.css';

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
  },
  autoOrient: {
    type: Boolean,
    default: true
  },
  manualOrientation: {
    type: Number,
    default: 0
  }
});

// Emits
const emit = defineEmits(['update:coordinates', 'update:showHouse', 'update-house-orientation']);

// Refs
const mapContainer = ref(null);
const mapInstance = ref(null);
const sunOverlayContainer = ref(null);
const sunOverlaySvg = ref(null);
const seasonalLegendContainer = ref(null);
const houseVisible = computed(() => props.showHouse);
const lastCoordinates = ref({ lat: 0, lng: 0 });
const isExternalUpdate = ref(false); // Flag to prevent emitting during external updates

// Constants
const OVERLAY_SIZE = 300;
const OVERLAY_RADIUS = OVERLAY_SIZE / 2.5;
const HOUSE_SIZE = 150;

// Combined date/time
const dateTime = computed(() => combineDateAndTime(props.date, props.time));

// Sun position
const sunPosition = computed(() => {
  return getSunPosition(dateTime.value, props.coordinates.lat, props.coordinates.lng);
});

// Sun trajectory
const sunTrajectory = computed(() => {
  return getSunTrajectory(props.date, props.coordinates.lat, props.coordinates.lng, 48);
});

// Seasonal trajectories cache
const seasonalTrajectories = ref(null);

// House orientation
const houseOrientation = ref({ angle: 0, label: '0° (N)' });

function handleOrientationChange(orientation) {
  houseOrientation.value = orientation;
  emit('update-house-orientation', orientation);
}

// Throttled map move handler
const throttledMapMove = throttle((newCoords) => {
  const isDifferentLocation =
    Math.abs(newCoords.lat - lastCoordinates.value.lat) > 0.0001 ||
    Math.abs(newCoords.lng - lastCoordinates.value.lng) > 0.0001;

  if (isDifferentLocation) {
    lastCoordinates.value = { ...newCoords };

    if (props.showSeasonalPaths) {
      seasonalTrajectories.value = null;
      updateSunTrajectory();
    }
  }
}, 100);

// Initialize map
onMounted(() => {
  if (!mapContainer.value) return;

  mapInstance.value = initMap('map-container', props.coordinates);

  mapInstance.value.on('click', handleMapClick);
  mapInstance.value.on('move', handleMapMove);

  initSunOverlay();
  initSeasonalLegend();

  lastCoordinates.value = { ...props.coordinates };
  updateSunTrajectory();
});

// Initialize sun overlay
function initSunOverlay() {
  if (!sunOverlayContainer.value) return;

  sunOverlaySvg.value = select(sunOverlayContainer.value)
    .append('svg')
    .attr('width', OVERLAY_SIZE)
    .attr('height', OVERLAY_SIZE)
    .attr('class', 'sun-overlay-svg');

  sunOverlaySvg.value.append('g').attr('class', 'trajectory-path');
  sunOverlaySvg.value.append('g').attr('class', 'sun-marker');
}

// Initialize seasonal legend
function initSeasonalLegend() {
  if (!seasonalLegendContainer.value) return;

  select(seasonalLegendContainer.value)
    .append('svg')
    .attr('width', 130)
    .attr('height', 150)
    .attr('class', 'seasonal-legend-svg');
}

// Handle map click
function handleMapClick(e) {
  const newCoordinates = {
    lat: e.latlng.lat,
    lng: e.latlng.lng
  };

  mapInstance.value.setView([newCoordinates.lat, newCoordinates.lng], mapInstance.value.getZoom());
  lastCoordinates.value = { ...newCoordinates };
  emit('update:coordinates', newCoordinates);
}

// Handle map move
function handleMapMove() {
  // Skip emitting during external updates to prevent race conditions
  if (isExternalUpdate.value) return;

  const center = mapInstance.value.getCenter();
  const newCoordinates = {
    lat: center.lat,
    lng: center.lng
  };

  emit('update:coordinates', newCoordinates);
  throttledMapMove(newCoordinates);
}

// Cleanup
onUnmounted(() => {
  if (mapInstance.value) {
    mapInstance.value.off('click', handleMapClick);
    mapInstance.value.off('move', handleMapMove);
    mapInstance.value.remove();
  }

  if (sunOverlaySvg.value) {
    sunOverlaySvg.value.remove();
  }

  if (seasonalLegendContainer.value) {
    const legendSvg = select(seasonalLegendContainer.value).select('svg');
    if (!legendSvg.empty()) {
      legendSvg.remove();
    }
  }
});

// Watch coordinate changes from external sources
watch(() => props.coordinates, (newCoords) => {
  // Always center the map if forceUpdate is true (e.g., from "My Location" or search)
  const hasForceUpdate = newCoords.forceUpdate === true;
  const isDifferentLocation =
    Math.abs(newCoords.lat - lastCoordinates.value.lat) > 0.001 ||
    Math.abs(newCoords.lng - lastCoordinates.value.lng) > 0.001;

  if (mapInstance.value && (isDifferentLocation || hasForceUpdate)) {
    // Set flag to prevent move events from overwriting coordinates
    isExternalUpdate.value = true;

    mapInstance.value.invalidateSize();
    mapInstance.value.setView([newCoords.lat, newCoords.lng], mapInstance.value.getZoom(), {
      animate: false // Instant center without animation to avoid multiple move events
    });

    lastCoordinates.value = { lat: newCoords.lat, lng: newCoords.lng };

    if (props.showSeasonalPaths) {
      seasonalTrajectories.value = null;
    }

    // Clear flag after a brief delay to allow map to settle
    setTimeout(() => {
      isExternalUpdate.value = false;
    }, 50);
  }
}, { deep: true });

// Update trajectory on changes
watch([() => props.coordinates, sunPosition, sunTrajectory], () => {
  try {
    updateSunTrajectory();
  } catch (error) {
    // Silent error handling in production
  }
});

// Watch house visibility
watch(() => houseVisible.value, () => {
  try {
    updateSunTrajectory();
  } catch (error) {
    // Silent error handling
  }
});

// Watch seasonal paths toggle
watch(() => props.showSeasonalPaths, (isVisible) => {
  try {
    if (isVisible) {
      setTimeout(() => {
        if (seasonalLegendContainer.value) {
          const existingSvg = select(seasonalLegendContainer.value).select('svg');
          if (existingSvg.empty()) {
            select(seasonalLegendContainer.value)
              .append('svg')
              .attr('width', 130)
              .attr('height', 150)
              .attr('class', 'seasonal-legend-svg');
          }
        }
        updateSunTrajectory();
      }, 0);
    } else {
      clearSeasonalLegend();
      updateSunTrajectory();
    }
  } catch (error) {
    // Silent error handling
  }
});

// Get and cache seasonal trajectories
function getAndCacheSeasonalTrajectories() {
  try {
    if (!seasonalTrajectories.value ||
        Math.abs(lastCoordinates.value.lat - props.coordinates.lat) > 0.01 ||
        Math.abs(lastCoordinates.value.lng - props.coordinates.lng) > 0.01) {

      const currentCoords = {
        lat: props.coordinates.lat,
        lng: props.coordinates.lng
      };

      if (isNaN(currentCoords.lat) || isNaN(currentCoords.lng)) {
        return null;
      }

      try {
        const trajectories = getSeasonalTrajectories(
          currentCoords.lat,
          currentCoords.lng,
          new Date().getFullYear(),
          48
        );

        if (!trajectories) {
          return null;
        }

        seasonalTrajectories.value = trajectories;
        seasonalTrajectories.value.calculatedFor = {
          lat: currentCoords.lat,
          lng: currentCoords.lng
        };
      } catch (calcError) {
        return null;
      }
    }

    return seasonalTrajectories.value;
  } catch (error) {
    return null;
  }
}

// Update sun trajectory visualization
function updateSunTrajectory() {
  if (!sunOverlaySvg.value) return;

  try {
    const svg = sunOverlaySvg.value;
    const center = { x: OVERLAY_SIZE / 2, y: OVERLAY_SIZE / 2 };

    svg.select('.trajectory-path').selectAll('*').remove();
    svg.select('.sun-marker').selectAll('*').remove();

    if (!sunTrajectory.value || sunTrajectory.value.length === 0) return;

    const daytimePoints = sunTrajectory.value.filter(point => point.altitude > 0);

    if (daytimePoints.length === 0) return;

    // Render seasonal trajectories if enabled
    if (props.showSeasonalPaths) {
      try {
        renderSeasonalTrajectories(svg, center);
        updateSeasonalLegend();
      } catch (error) {
        // Continue with regular trajectory
      }
    } else {
      clearSeasonalLegend();
    }

    // Convert trajectory points to overlay coordinates
    const pathPoints = daytimePoints.map(point => {
      return sunPositionToOverlayPoint(point.azimuth, point.altitude, center);
    });

    // Create path
    const lineFunction = line()
      .x(d => d.x)
      .y(d => d.y)
      .curve(curveBasis);

    svg.select('.trajectory-path')
      .append('path')
      .attr('d', lineFunction(pathPoints))
      .attr('stroke', 'var(--sun-gold, #f59e0b)')
      .attr('stroke-width', 3)
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.8)
      .attr('class', 'trajectory-path');

    // Add sunrise/sunset markers
    if (daytimePoints.length > 0) {
      const sortedPoints = [...daytimePoints].sort((a, b) => a.time - b.time);
      const sunrisePoint = sortedPoints[0];
      const sunsetPoint = sortedPoints[sortedPoints.length - 1];

      if (sunrisePoint) {
        const sunriseOverlayPoint = sunPositionToOverlayPoint(sunrisePoint.azimuth, sunrisePoint.altitude, center);
        svg.select('.trajectory-path')
          .append('circle')
          .attr('cx', sunriseOverlayPoint.x)
          .attr('cy', sunriseOverlayPoint.y)
          .attr('r', 6)
          .attr('fill', 'var(--sun-orange, #ea580c)')
          .attr('stroke', 'white')
          .attr('stroke-width', 2);
      }

      if (sunsetPoint) {
        const sunsetOverlayPoint = sunPositionToOverlayPoint(sunsetPoint.azimuth, sunsetPoint.altitude, center);
        svg.select('.trajectory-path')
          .append('circle')
          .attr('cx', sunsetOverlayPoint.x)
          .attr('cy', sunsetOverlayPoint.y)
          .attr('r', 6)
          .attr('fill', 'var(--sky-blue, #0ea5e9)')
          .attr('stroke', 'white')
          .attr('stroke-width', 2);
      }
    }

    // Add current sun position
    if (sunPosition.value && sunPosition.value.altitude > 0) {
      const sunPoint = sunPositionToOverlayPoint(sunPosition.value.azimuth, sunPosition.value.altitude, center);

      svg.select('.sun-marker')
        .append('circle')
        .attr('cx', sunPoint.x)
        .attr('cy', sunPoint.y)
        .attr('r', 14)
        .attr('fill', 'var(--sun-gold, #fbbf24)')
        .attr('stroke', 'white')
        .attr('stroke-width', 3)
        .attr('filter', 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))');

      // Shadow line when house not visible
      if (!houseVisible.value) {
        svg.select('.sun-marker')
          .append('line')
          .attr('x1', sunPoint.x)
          .attr('y1', sunPoint.y)
          .attr('x2', center.x)
          .attr('y2', center.y)
          .attr('stroke', 'rgba(0, 0, 0, 0.3)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '6 3');

        svg.select('.sun-marker')
          .append('circle')
          .attr('cx', center.x)
          .attr('cy', center.y)
          .attr('r', 4)
          .attr('fill', 'rgba(0, 0, 0, 0.4)')
          .attr('stroke', 'white')
          .attr('stroke-width', 1);
      }
    }
  } catch (error) {
    // Silent error handling
  }
}

// Render seasonal trajectories
function renderSeasonalTrajectories(svg, center) {
  const seasonal = getAndCacheSeasonalTrajectories();
  if (!seasonal) return;

  const validTrajectories = {};

  Object.entries(seasonal).forEach(([key, trajectory]) => {
    if (trajectory && trajectory.points && trajectory.points.length > 0) {
      const daytimePoints = trajectory.points.filter(point => point && point.altitude > 0);
      if (daytimePoints.length > 0) {
        validTrajectories[key] = {
          ...trajectory,
          daytimePoints
        };
      }
    }
  });

  if (Object.keys(validTrajectories).length === 0) return;

  const lineFunction = line()
    .x(d => d.x)
    .y(d => d.y)
    .curve(curveBasis);

  const seasonalGroup = svg.select('.trajectory-path')
    .append('g')
    .attr('class', 'seasonal-paths');

  Object.entries(validTrajectories).forEach(([key, data]) => {
    const pathPoints = data.daytimePoints.map(point => {
      return sunPositionToOverlayPoint(point.azimuth, point.altitude, center);
    });

    seasonalGroup.append('path')
      .attr('d', lineFunction(pathPoints))
      .attr('stroke', data.color)
      .attr('stroke-width', 2)
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.7)
      .attr('stroke-dasharray', '6,4')
      .attr('class', `seasonal-path-${key}`);
  });
}

// Update seasonal legend
function updateSeasonalLegend() {
  if (!seasonalLegendContainer.value) return;

  const legendSvg = select(seasonalLegendContainer.value).select('svg');
  if (legendSvg.empty()) {
    select(seasonalLegendContainer.value)
      .append('svg')
      .attr('width', 130)
      .attr('height', 150)
      .attr('class', 'seasonal-legend-svg');
  }

  const svgElement = select(seasonalLegendContainer.value).select('svg');
  svgElement.selectAll('*').remove();

  const seasonal = getAndCacheSeasonalTrajectories();
  if (!seasonal) return;

  const validTrajectories = {};
  Object.entries(seasonal).forEach(([key, trajectory]) => {
    if (trajectory && trajectory.points && trajectory.points.length > 0) {
      validTrajectories[key] = trajectory;
    }
  });

  if (Object.keys(validTrajectories).length === 0) return;

  const legend = svgElement.append('g')
    .attr('class', 'legend-content')
    .attr('transform', 'translate(5, 20)');

  // Title
  legend.append('text')
    .attr('x', 5)
    .attr('y', -5)
    .attr('font-size', '11px')
    .attr('font-weight', '600')
    .attr('fill', 'white')
    .text('Sun Paths');

  // Today's path
  legend.append('line')
    .attr('x1', 0)
    .attr('y1', 8)
    .attr('x2', 20)
    .attr('y2', 8)
    .attr('stroke', '#f59e0b')
    .attr('stroke-width', 3)
    .attr('stroke-opacity', 0.9);

  legend.append('text')
    .attr('x', 26)
    .attr('y', 12)
    .attr('font-size', '11px')
    .attr('fill', 'white')
    .text("Today");

  let index = 1;

  Object.entries(validTrajectories).forEach(([key, data]) => {
    legend.append('line')
      .attr('x1', 0)
      .attr('y1', index * 20 + 8)
      .attr('x2', 20)
      .attr('y2', index * 20 + 8)
      .attr('stroke', data.color)
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.8)
      .attr('stroke-dasharray', '6,4');

    legend.append('text')
      .attr('x', 26)
      .attr('y', index * 20 + 12)
      .attr('font-size', '10px')
      .attr('fill', 'white')
      .text(data.label.replace(' Solstice', '').replace(' Equinox', ''));

    index++;
  });

  // Background
  legend.insert('rect', ':first-child')
    .attr('x', -8)
    .attr('y', -22)
    .attr('width', 125)
    .attr('height', index * 20 + 30)
    .attr('fill', 'rgba(15, 23, 42, 0.85)')
    .attr('rx', 8);
}

// Clear seasonal legend
function clearSeasonalLegend() {
  if (!seasonalLegendContainer.value) return;

  const legendSvg = select(seasonalLegendContainer.value).select('svg');
  if (!legendSvg.empty()) {
    legendSvg.selectAll('*').remove();
  }
}

// Convert sun position to overlay coordinates
function sunPositionToOverlayPoint(azimuth, altitude, center) {
  if (altitude <= 0) {
    const horizonDist = OVERLAY_RADIUS * 1.5;
    const dx = horizonDist * Math.sin(azimuth);
    const dy = horizonDist * Math.cos(azimuth);
    return { x: center.x + dx, y: center.y - dy };
  }

  const distance = OVERLAY_RADIUS * (1 - altitude / (Math.PI / 2));
  const dx = -distance * Math.sin(azimuth);
  const dy = distance * Math.cos(azimuth);

  return { x: center.x + dx, y: center.y - dy };
}
</script>

<template>
  <div class="sun-map-container">
    <div ref="mapContainer" id="map-container" class="map-container"></div>
    <div ref="sunOverlayContainer" class="sun-overlay-container"></div>

    <div v-if="houseVisible" class="house-layout-overlay">
      <HouseLayout
        :sun-position="sunPosition"
        :location="props.coordinates"
        :auto-orient="props.autoOrient"
        :manual-orientation="props.manualOrientation"
        :size="HOUSE_SIZE"
        @orientation-changed="handleOrientationChange"
      />
    </div>

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
  background: radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 70%, transparent 100%);
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.1);
}

.seasonal-legend-container {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 20;
  pointer-events: none;
  min-width: 130px;
  min-height: 30px;
}

.house-layout-overlay {
  position: absolute;
  width: 150px;
  height: 150px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  overflow: visible;
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
  background-color: var(--bg-tertiary);
  height: 100%;
  width: 100%;
  font-family: var(--font-display);
}

:deep(.language-info) {
  margin-bottom: 10px !important;
  font-family: var(--font-display);
  user-select: none;
}

:deep(.leaflet-control-layers) {
  background: var(--bg-secondary) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: var(--shadow-md) !important;
  padding: 10px;
  min-width: 180px;
  font-family: var(--font-display);
  margin-top: 10px;
}

:deep(.leaflet-control-layers-base label) {
  margin-bottom: 6px;
  padding: 6px;
  border-radius: var(--radius-sm);
  display: block;
  transition: background-color 0.15s ease;
  color: var(--text-primary);
}

:deep(.leaflet-control-layers-base label:hover) {
  background-color: var(--bg-tertiary);
}

:deep(.leaflet-control-layers-selector) {
  margin-right: 8px;
  cursor: pointer;
}

:deep(.leaflet-control-zoom) {
  border: 1px solid var(--border-color) !important;
  border-radius: var(--radius-md) !important;
  overflow: hidden;
  box-shadow: var(--shadow-sm) !important;
}

:deep(.leaflet-control-zoom a) {
  background: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  border-bottom: 1px solid var(--border-color) !important;
  width: 34px !important;
  height: 34px !important;
  line-height: 34px !important;
}

:deep(.leaflet-control-zoom a:hover) {
  background: var(--bg-tertiary) !important;
}

:deep(.leaflet-control-zoom a:last-child) {
  border-bottom: none !important;
}

:deep(.trajectory-path) {
  stroke-linecap: round;
}
</style>
