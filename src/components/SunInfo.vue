<script setup>
import { computed } from 'vue';
import { getSunTimes, getSunPosition, formatTime, calculateShadowLength } from '../lib/sunCalc';

// Props
const props = defineProps({
  coordinates: {
    type: Object,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: Date,
    required: true
  },
  houseOrientation: {
    type: Object,
    default: () => ({ angle: 0, label: '0° (N)' })
  }
});

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

// Sun position data
const position = computed(() => {
  if (!props.coordinates.lat || !props.coordinates.lng) {
    return { azimuth: 0, altitude: 0 };
  }
  
  return getSunPosition(
    dateTime.value,
    props.coordinates.lat,
    props.coordinates.lng
  );
});

// Convert azimuth from radians to degrees (0-360)
const azimuthDegrees = computed(() => {
  const degrees = position.value.azimuth * (180 / Math.PI);
  return ((degrees + 360) % 360).toFixed(1);
});

// Convert altitude from radians to degrees (-90 to 90)
const altitudeDegrees = computed(() => {
  return (position.value.altitude * (180 / Math.PI)).toFixed(1);
});

// Sun times for the day
const sunTimes = computed(() => {
  if (!props.coordinates.lat || !props.coordinates.lng) {
    return { sunrise: null, sunset: null };
  }
  
  return getSunTimes(props.date, props.coordinates.lat, props.coordinates.lng);
});

// Shadow length of a 1-meter object
const shadowLength = computed(() => {
  return calculateShadowLength(position.value.altitude);
});

// Check if sun is up
const isSunUp = computed(() => {
  return position.value.altitude > 0;
});

// Compass directions for azimuth
const azimuthDirection = computed(() => {
  const deg = parseFloat(azimuthDegrees.value);
  
  if (deg >= 337.5 || deg < 22.5) return 'N';
  if (deg >= 22.5 && deg < 67.5) return 'NE';
  if (deg >= 67.5 && deg < 112.5) return 'E';
  if (deg >= 112.5 && deg < 157.5) return 'SE';
  if (deg >= 157.5 && deg < 202.5) return 'S';
  if (deg >= 202.5 && deg < 247.5) return 'SW';
  if (deg >= 247.5 && deg < 292.5) return 'W';
  return 'NW';
});

// Calculate yearly kWh produced by a 6.7kW solar system
const yearlyKwh = computed(() => {
  if (!props.coordinates.lat || !props.coordinates.lng) {
    return 0;
  }
  
  return calculateSolarProduction(props.coordinates.lat, props.coordinates.lng);
});

// Solar production calculation function
function calculateSolarProduction(lat, lng) {
  // Base production at equator (ideal conditions)
  const baseProduction = 1500; // kWh per kW installed capacity at equator
  
  // Adjustment factors
  const latitudeFactor = Math.cos(Math.abs(lat) * Math.PI / 180);
  
  // Regional adjustment (rough estimates based on solar irradiance)
  let regionalFactor = 1.0;
  
  // Europe
  if (lng >= -15 && lng <= 40 && lat >= 35 && lat <= 70) {
    if (lat > 55) regionalFactor = 0.75; // Northern Europe
    else if (lat > 45) regionalFactor = 0.85; // Central Europe
    else regionalFactor = 0.95; // Southern Europe
  }
  // North America
  else if (lng >= -130 && lng <= -60 && lat >= 25 && lat <= 60) {
    if (lat > 45) regionalFactor = 0.8; // Northern US/Canada
    else if (lng < -100) regionalFactor = 1.1; // Southwest US
    else regionalFactor = 0.9; // Eastern US
  }
  // Asia
  else if (lng >= 60 && lng <= 150 && lat >= 10 && lat <= 60) {
    if (lat > 40) regionalFactor = 0.75; // Northern Asia
    else regionalFactor = 0.95; // Southern Asia
  }
  // Australia/Oceania
  else if (lng >= 110 && lng <= 180 && lat >= -50 && lat <= -10) {
    regionalFactor = 1.1;
  }
  // Africa
  else if (lng >= -20 && lng <= 50 && lat >= -35 && lat <= 35) {
    regionalFactor = 1.15;
  }
  // South America
  else if (lng >= -80 && lng <= -35 && lat >= -55 && lat <= 15) {
    regionalFactor = 1.05;
  }
  
  // System size in kW
  const systemSize = 6.7;
  
  // Calculate estimated yearly production
  const estimatedYearlyKwh = Math.round(baseProduction * systemSize * latitudeFactor * regionalFactor);
  
  return estimatedYearlyKwh;
}
</script>

<template>
  <div class="card">
    <div class="card-header">
      <h5 class="mb-0">Sun Data</h5>
    </div>
    
    <div class="card-body">
      <!-- Location coordinates -->
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted">Location:</span>
        <span class="text-end text-truncate ms-2" style="max-width: 60%;">
          {{ coordinates.lat.toFixed(4) }}, {{ coordinates.lng.toFixed(4) }}
        </span>
      </div>
      
      <!-- Sunrise and sunset -->
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted">Sunrise:</span>
        <span class="fw-medium ms-2">{{ formatTime(sunTimes.sunrise, coordinates.lng) }}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted">Sunset:</span>
        <span class="fw-medium ms-2">{{ formatTime(sunTimes.sunset, coordinates.lng) }}</span>
      </div>
      
      <!-- Local time indicator -->
      <div class="small text-muted mb-2">
        <i class="bi bi-info-circle me-1"></i>
        Times in location's local time
      </div>
      
      <hr class="my-3">
      
      <!-- Current sun position -->
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted">Azimuth:</span>
        <span class="fw-medium ms-2">{{ azimuthDegrees }}° ({{ azimuthDirection }})</span>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted">Altitude:</span>
        <span class="fw-medium ms-2">{{ altitudeDegrees }}°</span>
      </div>
      
      <!-- Shadow length -->
      <div class="d-flex justify-content-between align-items-center mb-3">
        <span class="text-muted">Shadow:</span>
        <span class="fw-medium ms-2">
          <template v-if="isSunUp">{{ shadowLength.toFixed(1) }}m</template>
          <template v-else>--</template>
        </span>
      </div>
      
      <!-- Status -->
      <div class="mt-3 py-1 px-2 rounded text-center small" 
        :class="isSunUp ? 'bg-warning-subtle text-warning-emphasis' : 'bg-info-subtle text-info-emphasis'">
        Sun is {{ isSunUp ? 'up' : 'down' }}
      </div>
      
      <!-- Solar Production Estimator -->
      <hr class="my-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted">Solar Production:</span>
        <span class="fw-medium small text-success ms-2">~{{ yearlyKwh.toLocaleString() }}kWh</span>
      </div>
      <div class="small text-muted mb-1" title="Rough estimate based on location data only">
        <i class="bi bi-info-circle me-1"></i>
        Annually for a 6.7kW system
      </div>
    </div>
  </div>
</template> 
