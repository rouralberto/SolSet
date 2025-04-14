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
      <div class="d-flex justify-content-end small text-muted mb-2">
        <span>Times shown in location's local time</span>
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
        {{ isSunUp ? 'Sun is up' : 'Sun is down' }}
      </div>
    </div>
  </div>
</template> 
