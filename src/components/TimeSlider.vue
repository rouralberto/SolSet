<script setup>
import { ref, watch, computed } from 'vue';
import { getSunTimes } from '../lib/sunCalc';

// Props
const props = defineProps({
  currentTime: {
    type: Date,
    default: () => new Date()
  },
  coordinates: {
    type: Object,
    default: () => ({ lat: 0, lng: 0 })
  },
  date: {
    type: Date,
    default: null
  }
});

// Emit events
const emit = defineEmits(['update-time']);

// Calculate approximate timezone offset based on longitude
// Each 15 degrees of longitude roughly corresponds to 1 hour time difference
const locationTimezoneOffset = computed(() => {
  // Calculate hours offset from UTC based on longitude
  return Math.round(props.coordinates.lng / 15);
});

// Convert time to minutes since midnight (0-1439) for the location's timezone
const totalMinutes = ref(0);

// Get sun times for the current location using the provided date
const sunTimes = computed(() => {
  // Use the provided date for sun calculations, but keep time intact
  const calculationDate = props.date || props.currentTime;
  return getSunTimes(calculationDate, props.coordinates.lat, props.coordinates.lng);
});

// Convert sun times to minutes since midnight in the location's timezone
const sunTimesInMinutes = computed(() => {
  const times = sunTimes.value;
  
  // Helper function to get minutes since midnight for a date, adjusting for location timezone
  const getMinutesSinceMidnight = (date) => {
    if (!date || isNaN(date.getTime())) return null;
    
    // Get UTC hours and minutes
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    
    // Adjust for location's timezone
    let locationHours = (utcHours + locationTimezoneOffset.value) % 24;
    if (locationHours < 0) locationHours += 24;
    
    return locationHours * 60 + utcMinutes;
  };
  
  return {
    dawn: getMinutesSinceMidnight(times.dawn),
    sunrise: getMinutesSinceMidnight(times.sunrise),
    sunriseEnd: getMinutesSinceMidnight(times.sunriseEnd),
    solarNoon: getMinutesSinceMidnight(times.solarNoon),
    sunsetStart: getMinutesSinceMidnight(times.sunsetStart),
    sunset: getMinutesSinceMidnight(times.sunset),
    dusk: getMinutesSinceMidnight(times.dusk),
    night: getMinutesSinceMidnight(times.night)
  };
});

// Dynamic gradient style based on sun times
const timeGradientStyle = computed(() => {
  const times = sunTimesInMinutes.value;
  
  // Default to a gray color if sun times aren't available
  if (!times.sunrise || !times.sunset) {
    return {
      background: '#e0e0e0'  // Simple gray color
    };
  }
  
  // Calculate percentages based on actual times
  const getPercent = (minutes) => {
    return ((minutes / 1440) * 100).toFixed(1) + '%';
  };
  
  // Create dynamic gradient with actual sun times
  return {
    background: `linear-gradient(to right, 
      #0a1a40 0%,                           /* Night (midnight) */
      #0a1a40 ${getPercent(times.dawn || 360)},       /* Night end */
      #7986cb ${getPercent(times.dawn || 360)},       /* Dawn twilight starts */
      #ffb74d ${getPercent(times.sunrise || 400)},    /* Sunrise */
      #90caf9 ${getPercent(times.sunriseEnd || 420)}, /* Morning */
      #64b5f6 ${getPercent(times.solarNoon || 720)},  /* Midday */
      #90caf9 ${getPercent(times.sunsetStart || 1020)}, /* Afternoon */
      #ffb74d ${getPercent(times.sunset || 1040)},      /* Sunset */
      #7986cb ${getPercent(times.dusk || 1080)},        /* Dusk twilight */
      #0a1a40 ${getPercent(times.night || 1140)},       /* Night begins */
      #0a1a40 100%                           /* Night (end of day) */
    )`
  };
});

// Watch for date changes to update the gradient
watch(() => props.date, () => {
  // This empty watch handler ensures reactivity when date changes
}, { immediate: true });

// Update minutes whenever currentTime or coordinates change
watch([() => props.currentTime, () => props.coordinates], () => {
  // Calculate location time by adjusting for timezone difference
  // Get the UTC time first
  const utcHours = props.currentTime.getUTCHours();
  const utcMinutes = props.currentTime.getUTCMinutes();
  
  // Apply location's timezone offset
  let locationHours = (utcHours + locationTimezoneOffset.value) % 24;
  if (locationHours < 0) locationHours += 24;
  
  // Set total minutes based on location time
  totalMinutes.value = locationHours * 60 + utcMinutes;
}, { immediate: true });

// Format time as HH:MM
function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Handle slider change
function handleSliderChange(event) {
  const minutes = parseInt(event.target.value);
  totalMinutes.value = minutes;
  
  // Create new time in location's timezone, then convert back to local time for the app
  // First get the current UTC time
  const utcDate = new Date(props.currentTime);
  utcDate.setUTCHours(0, 0, 0, 0); // Reset to midnight UTC
  
  // Calculate hours and minutes in location time
  const locationHours = Math.floor(minutes / 60);
  const locationMinutes = minutes % 60;
  
  // Convert from location time to UTC
  let utcHours = (locationHours - locationTimezoneOffset.value);
  if (utcHours < 0) utcHours += 24;
  if (utcHours >= 24) utcHours -= 24;
  
  // Set UTC time
  utcDate.setUTCHours(utcHours, locationMinutes, 0, 0);
  
  // Convert to local time
  const newTime = new Date(utcDate);
  
  emit('update-time', newTime);
}

// Set time to current time at the specified location
function setNowTime() {
  // Get current UTC time
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  
  // Calculate current time at location
  let locationHours = (utcHours + locationTimezoneOffset.value) % 24;
  if (locationHours < 0) locationHours += 24;
  
  // Set total minutes for the slider
  totalMinutes.value = locationHours * 60 + utcMinutes;
  
  // Create a date object with the correct time
  const utcDate = new Date();
  utcDate.setUTCHours(utcHours, utcMinutes, 0, 0);
  
  // Convert to local time
  const newTime = new Date(utcDate);
  
  emit('update-time', newTime);
}

// Key times for markers
const keyTimes = [
  { minutes: 0, label: '00:00' },     // Midnight
  { minutes: 360, label: '06:00' },   // 6 AM
  { minutes: 720, label: '12:00' },   // Noon
  { minutes: 1080, label: '18:00' },  // 6 PM
  { minutes: 1439, label: '23:59' }   // End of day
];
</script>

<template>
  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h5 class="mb-0">Time</h5>
      <div class="d-flex align-items-center gap-2">
        <div class="text-muted small">{{ formatTime(totalMinutes) }}</div>
        <button 
          @click="setNowTime" 
          class="btn btn-primary btn-sm"
        >
          Now
        </button>
      </div>
    </div>
    
    <div class="card-body">
      <div class="position-relative">
        <div class="time-gradient mb-1" :style="timeGradientStyle"></div>
        <input
          type="range"
          class="form-range"
          min="0"
          max="1439"
          step="15"
          v-model="totalMinutes"
          @input="handleSliderChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styling for time slider */
.time-gradient {
  height: 8px;
  border-radius: 4px;
  width: 100%;
}

/* Custom styling for slider if needed */
</style>
