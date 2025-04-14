<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { initMap, createSunOverlay } from '../lib/mapUtils';
import { getSunPosition, getSunTrajectory } from '../lib/sunCalc';
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
  }
});

// Emits
const emit = defineEmits(['update:coordinates']);

// Map references
const mapContainer = ref(null);
const mapInstance = ref(null);
const sunOverlay = ref(null);

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
  
  // Create sun overlay
  sunOverlay.value = createSunOverlay(mapInstance.value);
  
  // Add click handler to update coordinates and center
  mapInstance.value.on('click', handleMapClick);
  
  // Initial update
  updateMap();
});

// Handle map click
function handleMapClick(e) {
  // Get the clicked coordinates
  const newCoordinates = {
    lat: e.latlng.lat,
    lng: e.latlng.lng
  };
  
  // Center map to clicked location
  mapInstance.value.setView([newCoordinates.lat, newCoordinates.lng], mapInstance.value.getZoom());
  
  // Update coordinates via emit for two-way binding
  emit('update:coordinates', newCoordinates);
}

// Clean up when component is destroyed
onUnmounted(() => {
  if (mapInstance.value) {
    // Remove event listeners
    mapInstance.value.off('click', handleMapClick);
    // Remove map
    mapInstance.value.remove();
  }
});

// Update map when props change
watch([() => props.coordinates, sunPosition, sunTrajectory], updateMap);

// Function to update the map
function updateMap() {
  if (!mapInstance.value || !sunOverlay.value) return;
  
  // Set map center to current coordinates
  mapInstance.value.setView([props.coordinates.lat, props.coordinates.lng]);
  
  // Update sun trajectory path
  sunOverlay.value.updateSunPath(sunTrajectory.value, props.coordinates);
  
  // Update current sun position marker
  sunOverlay.value.updateSunPosition(sunPosition.value, props.coordinates);
}
</script>

<template>
  <div ref="mapContainer" id="map-container" class="map-container"></div>
</template>

<style scoped>
.map-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
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

:deep(.leaflet-overlay-pane svg) {
  pointer-events: none;
}
</style> 
