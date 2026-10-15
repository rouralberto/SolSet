<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { initMap } from '../lib/mapUtils';
import { getSunTrajectory, getSeasonalTrajectories, isSunAboveHorizon } from '../lib/sunCalc';
import { zonedTimeToDate } from '../lib/time';
import HouseLayout from './HouseLayout.vue';
import 'leaflet/dist/leaflet.css';

const props = defineProps({
  coordinates: {
    type: Object,
    required: true
  },
  zoom: {
    type: Number,
    default: 13
  },
  sunPosition: {
    type: Object,
    required: true
  },
  // Local noon of the selected day, used to compute the day's sun path
  noonInstant: {
    type: Date,
    required: true
  },
  timeZone: {
    type: String,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  showHouse: {
    type: Boolean,
    default: true
  },
  showSeasonalPaths: {
    type: Boolean,
    default: false
  },
  houseOrientation: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['update:coordinates', 'update:zoom']);

const mapContainer = ref(null);
let map = null;
let resizeObserver = null;

// Sky overlay geometry
const OVERLAY_SIZE = 300;
const OVERLAY_RADIUS = 120;
const HOUSE_SIZE = 150;
const CENTER = OVERLAY_SIZE / 2;

/**
 * Project a sun position onto the overlay (azimuthal projection, north up).
 * SunCalc azimuth is measured from south, positive towards west; screen y points down (south).
 */
function toOverlayPoint(azimuth, altitude) {
  const distance = OVERLAY_RADIUS * (1 - Math.max(0, altitude) / (Math.PI / 2));
  return {
    x: CENTER - distance * Math.sin(azimuth),
    y: CENTER + distance * Math.cos(azimuth)
  };
}

function toPolyline(points) {
  return points
    .filter(p => p.altitude > 0)
    .map(p => {
      const { x, y } = toOverlayPoint(p.azimuth, p.altitude);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const trajectory = computed(() =>
  getSunTrajectory(props.noonInstant, props.coordinates.lat, props.coordinates.lng, 48)
);

const daytimePoints = computed(() => trajectory.value.filter(p => p.altitude > 0));

const trajectoryPolyline = computed(() => toPolyline(trajectory.value));

const sunriseMarker = computed(() => {
  const first = daytimePoints.value[0];
  return first ? toOverlayPoint(first.azimuth, first.altitude) : null;
});

const sunsetMarker = computed(() => {
  const last = daytimePoints.value[daytimePoints.value.length - 1];
  return last ? toOverlayPoint(last.azimuth, last.altitude) : null;
});

const isSunUp = computed(() => isSunAboveHorizon(props.sunPosition.altitude));

const sunMarker = computed(() =>
  isSunUp.value ? toOverlayPoint(props.sunPosition.azimuth, props.sunPosition.altitude) : null
);

// Shadow of a pole at the map centre, shown when the house is hidden
const poleShadow = computed(() => {
  const { azimuth, altitude } = props.sunPosition;
  if (!(altitude > 0)) return null;
  const length = Math.min(OVERLAY_RADIUS, (OVERLAY_RADIUS * 0.3) / Math.tan(altitude));
  return {
    x: CENTER + Math.sin(azimuth) * length,
    y: CENTER - Math.cos(azimuth) * length
  };
});

const seasonalPaths = computed(() => {
  if (!props.showSeasonalPaths) return [];
  const { lat, lng } = props.coordinates;
  const noonForDate = (dateString) => zonedTimeToDate(dateString, 720, props.timeZone);
  return getSeasonalTrajectories(lat, lng, props.year, noonForDate, 48)
    .map(path => ({ ...path, polyline: toPolyline(path.points) }));
});

const compassLabels = [
  { label: 'N', x: CENTER, y: CENTER - OVERLAY_RADIUS - 12 },
  { label: 'E', x: CENTER + OVERLAY_RADIUS + 12, y: CENTER },
  { label: 'S', x: CENTER, y: CENTER + OVERLAY_RADIUS + 12 },
  { label: 'W', x: CENTER - OVERLAY_RADIUS - 12, y: CENTER }
];

function isMapCenteredOn(coords) {
  const center = map.getCenter();
  return Math.abs(center.lat - coords.lat) < 1e-7 && Math.abs(center.lng - coords.lng) < 1e-7;
}

function handleMapMove() {
  const center = map.getCenter();
  emit('update:coordinates', { lat: center.lat, lng: center.lng });
}

function handleZoomEnd() {
  emit('update:zoom', map.getZoom());
}

function handleMapClick(e) {
  map.panTo(e.latlng);
}

onMounted(() => {
  map = initMap(mapContainer.value, props.coordinates, props.zoom);
  map.on('move', handleMapMove);
  map.on('zoomend', handleZoomEnd);
  map.on('click', handleMapClick);

  // Keep Leaflet in sync when the layout changes size (e.g. responsive breakpoints)
  resizeObserver = new ResizeObserver(() => map.invalidateSize());
  resizeObserver.observe(mapContainer.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (map) {
    map.off();
    map.remove();
    map = null;
  }
});

// Re-centre when coordinates change from outside the map (search, saved locations, ...).
// Changes that originate from panning already match the map centre.
watch(() => props.coordinates, (coords) => {
  if (map && !isMapCenteredOn(coords)) {
    map.setView([coords.lat, coords.lng], map.getZoom(), { animate: false });
  }
});
</script>

<template>
  <div class="sun-map-container">
    <div ref="mapContainer" class="map-container"></div>

    <div v-if="showHouse" class="house-layout-overlay">
      <HouseLayout
        :sun-position="sunPosition"
        :orientation="houseOrientation"
        :size="HOUSE_SIZE"
      />
    </div>

    <div class="sun-overlay-container" aria-hidden="true">
      <svg class="sun-overlay-svg" :viewBox="`0 0 ${OVERLAY_SIZE} ${OVERLAY_SIZE}`">
        <circle :cx="CENTER" :cy="CENTER" :r="OVERLAY_RADIUS" class="horizon-ring" />
        <text
          v-for="c in compassLabels"
          :key="c.label"
          :x="c.x"
          :y="c.y"
          class="compass-label"
          text-anchor="middle"
          dominant-baseline="central"
        >{{ c.label }}</text>

        <polyline
          v-for="path in seasonalPaths"
          :key="path.key"
          :points="path.polyline"
          :stroke="path.color"
          class="seasonal-path"
        />

        <polyline v-if="trajectoryPolyline" :points="trajectoryPolyline" class="trajectory-path" />
        <circle v-if="sunriseMarker" :cx="sunriseMarker.x" :cy="sunriseMarker.y" r="6" class="sunrise-marker" />
        <circle v-if="sunsetMarker" :cx="sunsetMarker.x" :cy="sunsetMarker.y" r="6" class="sunset-marker" />

        <g v-if="!showHouse && poleShadow">
          <line :x1="CENTER" :y1="CENTER" :x2="poleShadow.x" :y2="poleShadow.y" class="pole-shadow" />
          <circle :cx="CENTER" :cy="CENTER" r="4" class="pole" />
        </g>

        <circle v-if="sunMarker" :cx="sunMarker.x" :cy="sunMarker.y" r="14" class="sun-marker" />
      </svg>
    </div>

    <div class="map-crosshair" aria-hidden="true"></div>

    <div class="map-legend">
      <div class="legend-row"><span class="legend-line today"></span>Sun path (selected day)</div>
      <div class="legend-row"><span class="legend-dot sunrise"></span>Sunrise<span class="legend-dot sunset"></span>Sunset</div>
      <template v-if="showSeasonalPaths">
        <div v-for="path in seasonalPaths" :key="path.key" class="legend-row">
          <span class="legend-line dashed" :style="{ borderColor: path.color }"></span>{{ path.label }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sun-map-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.map-container {
  position: absolute;
  inset: 0;
  z-index: 1;
  height: 100%;
  width: 100%;
}

.sun-overlay-container,
.house-layout-overlay,
.map-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.sun-overlay-container {
  width: 300px;
  height: 300px;
  z-index: 15;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.06) 70%, transparent 100%);
}

.sun-overlay-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.house-layout-overlay {
  width: 150px;
  height: 150px;
  z-index: 10;
}

.map-crosshair {
  width: 24px;
  height: 24px;
  z-index: 16;
}

.map-crosshair::before,
.map-crosshair::after {
  content: '';
  position: absolute;
  background: rgba(245, 158, 11, 0.85);
  border-radius: 1px;
}

.map-crosshair::before {
  width: 2px;
  height: 24px;
  left: 11px;
}

.map-crosshair::after {
  width: 24px;
  height: 2px;
  top: 11px;
}

.horizon-ring {
  fill: none;
  stroke: rgba(15, 23, 42, 0.25);
  stroke-width: 1.5;
  stroke-dasharray: 2 4;
}

.compass-label {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  fill: #0f172a;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 3px;
}

.trajectory-path {
  fill: none;
  stroke: var(--sun-gold);
  stroke-width: 3;
  stroke-opacity: 0.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.seasonal-path {
  fill: none;
  stroke-width: 2;
  stroke-opacity: 0.8;
  stroke-dasharray: 6 4;
}

.sunrise-marker,
.sunset-marker,
.sun-marker {
  stroke: white;
  stroke-width: 2;
}

.sunrise-marker { fill: var(--sun-orange); }
.sunset-marker { fill: var(--sky-blue); }

.sun-marker {
  fill: #fbbf24;
  stroke-width: 3;
  filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.7));
}

.pole-shadow {
  stroke: rgba(15, 23, 42, 0.5);
  stroke-width: 3;
  stroke-linecap: round;
}

.pole {
  fill: #0f172a;
  stroke: white;
  stroke-width: 1;
}

.map-legend {
  position: absolute;
  left: 12px;
  bottom: 24px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  font-size: 11px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.85);
  border-radius: var(--radius-md);
  pointer-events: none;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-line {
  width: 20px;
  border-top: 3px solid var(--sun-gold);
}

.legend-line.dashed {
  border-top-width: 2px;
  border-top-style: dashed;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid white;
}

.legend-dot.sunrise { background: var(--sun-orange); }
.legend-dot.sunset { background: var(--sky-blue); margin-left: 8px; }

:deep(.leaflet-container) {
  background-color: var(--bg-tertiary);
  font-family: var(--font-display);
}

:deep(.leaflet-control-layers-expanded) {
  padding: 8px 10px;
  min-width: 170px;
}

:deep(.leaflet-control-layers-base label) {
  margin: 0;
  padding: 5px 6px;
  border-radius: var(--radius-sm);
  display: block;
  transition: background-color 0.15s ease;
}

:deep(.leaflet-control-layers-base label:hover) {
  background-color: var(--bg-tertiary);
}

:deep(.leaflet-control-layers-selector) {
  margin-right: 8px;
  cursor: pointer;
}

:deep(.leaflet-control-zoom a) {
  width: 34px;
  height: 34px;
  line-height: 34px;
}

:deep(.leaflet-control-zoom a:last-child) {
  border-bottom: none !important;
}

@media (max-width: 900px) {
  .map-legend {
    bottom: 20px;
    left: 8px;
    font-size: 10px;
  }
}
</style>
