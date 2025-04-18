<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { dateToDayOfYear, dayOfYearToDate } from '../lib/sunCalc';
import { getSunTimes } from '../lib/sunCalc';

// Props
const props = defineProps({
  currentDate: {
    type: Date,
    default: () => new Date()
  },
  currentTime: {
    type: Date,
    default: () => new Date()
  },
  coordinates: {
    type: Object,
    default: () => ({ lat: 0, lng: 0 })
  }
});

// Emit events
const emit = defineEmits(['update-date', 'update-time']);

// Convert current date to day of year
const dayOfYear = ref(dateToDayOfYear(props.currentDate));

// Maximum day based on leap year
const maxDay = computed(() => {
  const year = props.currentDate.getFullYear();
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
});

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
  return getSunTimes(props.currentDate, props.coordinates.lat, props.coordinates.lng);
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

// Seasonal gradient style based on solstices and equinoxes
const seasonGradientStyle = computed(() => {
  const year = props.currentDate.getFullYear();
  const isNorthernHemisphere = props.coordinates.lat >= 0;
  
  // Define key dates with day of year values
  // Values for typical non-leap year (approximation)
  const springEquinox = dateToDayOfYear(new Date(year, 2, 20)); // March 20
  const summerSolstice = dateToDayOfYear(new Date(year, 5, 21)); // June 21
  const fallEquinox = dateToDayOfYear(new Date(year, 8, 22));    // September 22
  const winterSolstice = dateToDayOfYear(new Date(year, 11, 21)); // December 21
  
  // Calculate percentages based on days
  const getPercent = (day) => {
    return ((day / maxDay.value) * 100).toFixed(1) + '%';
  };
  
  // Determine colors based on hemisphere
  const gradientValue = isNorthernHemisphere ? 
    `linear-gradient(to right, 
      #80a9e0 0%,                           /* Winter (start of year) */
      #80a9e0 ${getPercent(springEquinox)},    /* End of winter */
      #a3d9a5 ${getPercent(springEquinox)},    /* Spring begins */
      #a3d9a5 ${getPercent(summerSolstice)},   /* End of spring */
      #ffdb58 ${getPercent(summerSolstice)},   /* Summer begins */
      #ffdb58 ${getPercent(fallEquinox)},      /* End of summer */
      #d2691e ${getPercent(fallEquinox)},      /* Fall begins */
      #d2691e ${getPercent(winterSolstice)},   /* End of fall */
      #80a9e0 ${getPercent(winterSolstice)},   /* Winter begins */
      #80a9e0 100%                          /* Winter (end of year) */
    )` :
    `linear-gradient(to right, 
      #ffdb58 0%,                           /* Summer (Jan) */
      #ffdb58 ${getPercent(springEquinox)},    /* End of summer */
      #d2691e ${getPercent(springEquinox)},    /* Fall begins */
      #d2691e ${getPercent(summerSolstice)},   /* End of fall */
      #80a9e0 ${getPercent(summerSolstice)},   /* Winter begins */
      #80a9e0 ${getPercent(fallEquinox)},      /* End of winter */
      #a3d9a5 ${getPercent(fallEquinox)},      /* Spring begins */
      #a3d9a5 ${getPercent(winterSolstice)},   /* End of spring */
      #ffdb58 ${getPercent(winterSolstice)},   /* Summer begins */
      #ffdb58 100%                          /* Summer (end of year) */
    )`;
    
  return {
    '--season-gradient': gradientValue
  };
});

// Dynamic gradient style based on sun times
const timeGradientStyle = computed(() => {
  const times = sunTimesInMinutes.value;
  
  // Default to a gray color if sun times aren't available
  if (!times.sunrise || !times.sunset) {
    return {
      '--time-gradient': '#e0e0e0'  // Simple gray color
    };
  }
  
  // Calculate percentages based on actual times
  const getPercent = (minutes) => {
    return ((minutes / 1440) * 100).toFixed(1) + '%';
  };
  
  // Create dynamic gradient with actual sun times
  const gradientValue = `linear-gradient(to right, 
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
  )`;
  
  return {
    '--time-gradient': gradientValue
  };
});

// Watch for external date changes
watch(() => props.currentDate, (newDate) => {
  dayOfYear.value = dateToDayOfYear(newDate);
}, { deep: true });

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

// Format the date as month and day
function formatDate(day) {
  const date = dayOfYearToDate(day, props.currentDate.getFullYear());
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Format time as HH:MM
function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Handle date slider change
function handleDateSliderChange(event) {
  const day = parseInt(event.target.value);
  const newDate = dayOfYearToDate(day, props.currentDate.getFullYear());
  dayOfYear.value = day;
  emit('update-date', newDate);
}

// Handle time slider change
function handleTimeSliderChange(event) {
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

// Set both date and time to current
function setNow() {
  const now = new Date();
  
  // Update date
  const day = dateToDayOfYear(now);
  dayOfYear.value = day;
  emit('update-date', now);
  
  // Update time
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  
  // Calculate current time at location
  let locationHours = (utcHours + locationTimezoneOffset.value) % 24;
  if (locationHours < 0) locationHours += 24;
  
  // Set total minutes for the slider
  totalMinutes.value = locationHours * 60 + utcMinutes;
  
  // Emit time update
  emit('update-time', now);
}

// Initialize Bootstrap tooltips
onMounted(() => {
  // If Bootstrap's Tooltip feature is available, initialize the tooltips
  if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    });
  }
});
</script>

<template>
  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h5 class="mb-0">Date & Time</h5>
      <button 
        @click="setNow" 
        class="btn btn-primary btn-sm d-flex align-items-center gap-2"
      >
        <i class="bi bi-clock"></i>
        Current Time
      </button>
    </div>
    
    <div class="card-body">
      <!-- Date section -->
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted">Date</span>
        <span class="badge bg-light text-dark">{{ formatDate(dayOfYear) }}</span>
      </div>
      <div class="position-relative">
        <input
          type="range"
          class="form-range season-slider"
          :min="1"
          :max="maxDay"
          v-model="dayOfYear"
          @input="handleDateSliderChange"
          :style="seasonGradientStyle"
        />
      </div>
      
      <!-- Time section -->
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted">Time</span>
        <span class="badge bg-light text-dark">{{ formatTime(totalMinutes) }}</span>
      </div>
      <div class="position-relative">
        <input
          type="range"
          class="form-range time-slider"
          min="0"
          max="1439"
          step="15"
          v-model="totalMinutes"
          @input="handleTimeSliderChange"
          :style="timeGradientStyle"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Base styling for range inputs */
.form-range {
  -webkit-appearance: none;
  width: 100%;
  background: transparent;
}

/* Styling for time slider */
.time-slider::-webkit-slider-runnable-track {
  -webkit-appearance: none;
  height: 8px;
  border-radius: 4px;
  width: 100%;
}

.time-slider::-moz-range-track {
  height: 8px;
  border-radius: 4px;
  width: 100%;
}

/* Styling for season slider */
.season-slider::-webkit-slider-runnable-track {
  -webkit-appearance: none;
  height: 8px;
  border-radius: 4px;
  width: 100%;
}

.season-slider::-moz-range-track {
  height: 8px;
  border-radius: 4px;
  width: 100%;
}

/* Add some styling for the thumbs to make them more visible */
.form-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
  margin-top: -4px; /* offset for proper centering */
  box-shadow: 0 0 0 1px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.2);
}

.form-range::-moz-range-thumb {
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.2);
  border: none;
}
</style>

<style>
.season-slider::-webkit-slider-runnable-track {
  background: var(--season-gradient) !important;
}

.season-slider::-moz-range-track {
  background: var(--season-gradient) !important;
}

.time-slider::-webkit-slider-runnable-track {
  background: var(--time-gradient) !important;
}

.time-slider::-moz-range-track {
  background: var(--time-gradient) !important;
}
</style> 
