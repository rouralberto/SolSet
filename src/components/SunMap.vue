<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import L from 'leaflet';
import { initMap } from '../lib/mapUtils';
import { getSunTrajectory, getSeasonalTrajectories, isSunAboveHorizon, toBearingPosition } from '../lib/sunCalc';
import { zonedTimeToDate } from '../lib/time';
import { metersPerPixel, squareBounds } from '../lib/geo';
import SiteScene from './SiteScene.vue';
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
  },
  // { width, depth, wallHeight, roofPitch }
  house: {
    type: Object,
    required: true
  },
  // Obstacles in metres relative to the map centre, from localObstacles()
  obstacles: {
    type: Array,
    default: () => []
  },
  selectedObstacleId: {
    type: String,
    default: null
  },
  // 'tree' | 'building' while the next map click places an obstacle
  placingKind: {
    type: String,
    default: null
  },
  units: {
    type: String,
    default: 'metric'
  }
});

const emit = defineEmits([
  'update:coordinates', 'update:zoom', 'place-obstacle', 'select-obstacle', 'move-obstacle'
]);

const mapContainer = ref(null);
const sceneSvg = ref(null);
let map = null;
let sceneOverlay = null;
let scaleControl = null;
let resizeObserver = null;

// Sky overlay geometry (fixed size on screen)
const OVERLAY_SIZE = 300;
const OVERLAY_RADIUS = 120;
const CENTER = OVERLAY_SIZE / 2;

// The site scene is drawn in metres; this is half the side of its SVG viewBox.
// Content further out still renders (overflow is visible).
const SCENE_HALF = 60;
// Below this size on screen the house is drawn larger than life so it stays readable
const MIN_HOUSE_PIXELS = 44;

const resolution = ref(metersPerPixel(props.coordinates.lat, props.zoom));

const houseScale = computed(() => {
  const pixels = Math.max(props.house.width, props.house.depth) / resolution.value;
  return pixels >= MIN_HOUSE_PIXELS ? 1 : MIN_HOUSE_PIXELS / pixels;
});

const isToScale = computed(() => houseScale.value === 1);
const sunBearing = computed(() => toBearingPosition(props.sunPosition));

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

// Tick marks every 15° around the horizon ring, longer every 45°
const compassTicks = Array.from({ length: 24 }, (_, i) => {
  const angle = (i * 15 * Math.PI) / 180;
  const inner = OVERLAY_RADIUS - (i % 3 === 0 ? 7 : 4);
  return {
    x1: CENTER + Math.sin(angle) * inner,
    y1: CENTER - Math.cos(angle) * inner,
    x2: CENTER + Math.sin(angle) * OVERLAY_RADIUS,
    y2: CENTER - Math.cos(angle) * OVERLAY_RADIUS
  };
});

function isMapCenteredOn(coords) {
  const center = map.getCenter();
  return Math.abs(center.lat - coords.lat) < 1e-7 && Math.abs(center.lng - coords.lng) < 1e-7;
}

function updateResolution() {
  resolution.value = metersPerPixel(map.getCenter().lat, map.getZoom());
}

function handleMapMove() {
  const center = map.getCenter();
  emit('update:coordinates', { lat: center.lat, lng: center.lng });
}

function handleZoomEnd() {
  updateResolution();
  emit('update:zoom', map.getZoom());
}

function handleMapClick(e) {
  if (props.placingKind) {
    emit('place-obstacle', { lat: e.latlng.lat, lng: e.latlng.lng });
    return;
  }
  if (props.selectedObstacleId) {
    emit('select-obstacle', null);
    return;
  }
  map.panTo(e.latlng);
}

function sceneBounds(coords) {
  return L.latLngBounds(squareBounds(coords, SCENE_HALF));
}

function updateScaleControl() {
  if (!map) return;
  scaleControl?.remove();
  scaleControl = L.control.scale({
    position: 'bottomright',
    metric: props.units !== 'imperial',
    imperial: props.units === 'imperial',
    maxWidth: 140
  }).addTo(map);
}

// Dragging an obstacle moves it on the ground; the map itself stays put
let drag = null;

function handleObstaclePointerDown({ id, event }) {
  emit('select-obstacle', id);
  if (event.button > 0) return;

  const item = props.obstacles.find(o => o.obstacle.id === id);
  if (!item) return;
  const pointer = map.mouseEventToLatLng(event);
  drag = {
    id,
    pointerId: event.pointerId,
    // Keep the grab point under the pointer
    dLat: item.obstacle.lat - pointer.lat,
    dLng: item.obstacle.lng - pointer.lng,
    moved: false,
    startX: event.clientX,
    startY: event.clientY
  };
  map.dragging.disable();
  window.addEventListener('pointermove', handleDragMove);
  window.addEventListener('pointerup', handleDragEnd);
  window.addEventListener('pointercancel', handleDragEnd);
}

function handleDragMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
  drag.moved = true;
  const pointer = map.mouseEventToLatLng(event);
  emit('move-obstacle', { id: drag.id, lat: pointer.lat + drag.dLat, lng: pointer.lng + drag.dLng });
}

function handleDragEnd() {
  drag = null;
  map?.dragging.enable();
  window.removeEventListener('pointermove', handleDragMove);
  window.removeEventListener('pointerup', handleDragEnd);
  window.removeEventListener('pointercancel', handleDragEnd);
}

onMounted(() => {
  map = initMap(mapContainer.value, props.coordinates, props.zoom);
  map.on('move', handleMapMove);
  map.on('zoomend', handleZoomEnd);
  map.on('click', handleMapClick);
  updateResolution();
  updateScaleControl();

  // Leaflet takes over the scene's <svg>, keeping it glued to the ground through pans and zooms
  sceneOverlay = L.svgOverlay(sceneSvg.value, sceneBounds(props.coordinates), { interactive: false }).addTo(map);

  // Keep Leaflet in sync when the layout changes size (e.g. responsive breakpoints)
  resizeObserver = new ResizeObserver(() => map.invalidateSize());
  resizeObserver.observe(mapContainer.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  handleDragEnd();
  if (map) {
    map.off();
    map.remove();
    map = null;
  }
});

// Re-centre when coordinates change from outside the map (search, saved locations, ...).
// Changes that originate from panning already match the map centre.
watch(() => props.coordinates, (coords) => {
  if (!map) return;
  if (!isMapCenteredOn(coords)) {
    map.setView([coords.lat, coords.lng], map.getZoom(), { animate: false });
  }
  sceneOverlay?.setBounds(sceneBounds(coords));
  updateResolution();
});

watch(() => props.units, updateScaleControl);

defineExpose({
  /** Zoom in far enough to see the house at its real size */
  zoomToHouse() {
    if (map && map.getZoom() < 19) map.setZoom(19);
  }
});
</script>

<template>
  <div :class="['sun-map-container', { placing: !!placingKind }]">
    <div ref="mapContainer" class="map-container"></div>

    <!-- Moved into the map by Leaflet (see onMounted) -->
    <div class="scene-holder">
      <svg
        ref="sceneSvg"
        class="site-scene-svg"
        :viewBox="`${-SCENE_HALF} ${-SCENE_HALF} ${SCENE_HALF * 2} ${SCENE_HALF * 2}`"
        role="img"
        aria-label="House and surrounding objects with their shadows"
      >
        <SiteScene
          :house="house"
          :facing="houseOrientation"
          :sun="isSunUp ? sunBearing : null"
          :obstacles="obstacles"
          :show-house="showHouse"
          :house-scale="houseScale"
          :selected-id="selectedObstacleId"
          :units="units"
          interactive
          @obstacle-pointerdown="handleObstaclePointerDown"
        />
      </svg>
    </div>

    <div class="sun-overlay-container" aria-hidden="true">
      <svg class="sun-overlay-svg" :viewBox="`0 0 ${OVERLAY_SIZE} ${OVERLAY_SIZE}`">
        <circle :cx="CENTER" :cy="CENTER" :r="OVERLAY_RADIUS" class="horizon-ring" />
        <line v-for="(t, i) in compassTicks" :key="i" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" class="compass-tick" />
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

    <div v-if="placingKind" class="placing-hint" role="status">
      <i class="bi bi-cursor"></i>
      Click the map where the {{ placingKind }} stands
    </div>

    <div class="map-legend">
      <div class="legend-row"><span class="legend-line today"></span>Sun path (selected day)</div>
      <div class="legend-row"><span class="legend-dot sunrise"></span>Sunrise<span class="legend-dot sunset"></span>Sunset</div>
      <template v-if="showSeasonalPaths">
        <div v-for="path in seasonalPaths" :key="path.key" class="legend-row">
          <span class="legend-line dashed" :style="{ borderColor: path.color }"></span>{{ path.label }}
        </div>
      </template>
      <div v-if="showHouse" class="legend-row scale-note">
        <template v-if="isToScale"><i class="bi bi-rulers"></i>House and shadows to scale</template>
        <template v-else><i class="bi bi-zoom-in"></i>House enlarged: zoom in for true scale</template>
      </div>
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

.scene-holder {
  display: none;
}

:deep(.site-scene-svg) {
  overflow: visible;
}

.placing :deep(.leaflet-container),
.placing :deep(.leaflet-interactive) {
  cursor: crosshair;
}

.placing-hint {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #0f172a;
  background: var(--sun-gold);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  pointer-events: none;
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

.compass-tick {
  stroke: rgba(15, 23, 42, 0.35);
  stroke-width: 1;
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

.scale-note {
  margin-top: 2px;
  padding-top: 4px;
  border-top: 1px solid rgba(226, 232, 240, 0.2);
  color: #cbd5e1;
}

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
