<script setup>
import { ref, computed, watch } from 'vue';
import { dateToDayOfYear, dayOfYearToDate, getSunTimes } from '../lib/sunCalc';
import { getApproximateTimezone } from '../lib/utils';

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
  },
  isAnimating: {
    type: Boolean,
    default: false
  }
});

// Emit events
const emit = defineEmits(['update-date', 'update-time', 'toggle-animation']);

// State
const dayOfYear = ref(dateToDayOfYear(props.currentDate));
const showDateInput = ref(false);
const showTimeInput = ref(false);
const dateInputValue = ref('');
const timeInputValue = ref('');

// Maximum day based on leap year
const maxDay = computed(() => {
  const year = props.currentDate.getFullYear();
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
});

// Timezone offset based on longitude
const locationTimezoneOffset = computed(() => {
  return getApproximateTimezone(props.coordinates.lng);
});

// Convert time to minutes since midnight
const totalMinutes = ref(0);

// Get sun times for the current location
const sunTimes = computed(() => {
  return getSunTimes(props.currentDate, props.coordinates.lat, props.coordinates.lng);
});

// Convert sun times to minutes for gradient
const sunTimesInMinutes = computed(() => {
  const times = sunTimes.value;

  const getMinutesSinceMidnight = (date) => {
    if (!date || isNaN(date.getTime())) return null;

    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();

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

// Season gradient style
const seasonGradientStyle = computed(() => {
  const year = props.currentDate.getFullYear();
  const isNorthernHemisphere = props.coordinates.lat >= 0;

  const springEquinox = dateToDayOfYear(new Date(year, 2, 20));
  const summerSolstice = dateToDayOfYear(new Date(year, 5, 21));
  const fallEquinox = dateToDayOfYear(new Date(year, 8, 22));
  const winterSolstice = dateToDayOfYear(new Date(year, 11, 21));

  const getPercent = (day) => ((day / maxDay.value) * 100).toFixed(1) + '%';

  const gradientValue = isNorthernHemisphere ?
    `linear-gradient(to right,
      #60a5fa 0%,
      #60a5fa ${getPercent(springEquinox)},
      #34d399 ${getPercent(springEquinox)},
      #34d399 ${getPercent(summerSolstice)},
      #fbbf24 ${getPercent(summerSolstice)},
      #fbbf24 ${getPercent(fallEquinox)},
      #f97316 ${getPercent(fallEquinox)},
      #f97316 ${getPercent(winterSolstice)},
      #60a5fa ${getPercent(winterSolstice)},
      #60a5fa 100%
    )` :
    `linear-gradient(to right,
      #fbbf24 0%,
      #fbbf24 ${getPercent(springEquinox)},
      #f97316 ${getPercent(springEquinox)},
      #f97316 ${getPercent(summerSolstice)},
      #60a5fa ${getPercent(summerSolstice)},
      #60a5fa ${getPercent(fallEquinox)},
      #34d399 ${getPercent(fallEquinox)},
      #34d399 ${getPercent(winterSolstice)},
      #fbbf24 ${getPercent(winterSolstice)},
      #fbbf24 100%
    )`;

  return { '--season-gradient': gradientValue };
});

// Time gradient style
const timeGradientStyle = computed(() => {
  const times = sunTimesInMinutes.value;

  if (!times.sunrise || !times.sunset) {
    return { '--time-gradient': 'var(--bg-tertiary)' };
  }

  const getPercent = (minutes) => ((minutes / 1440) * 100).toFixed(1) + '%';

  const gradientValue = `linear-gradient(to right,
    #1e3a5f 0%,
    #1e3a5f ${getPercent(times.dawn || 360)},
    #7c3aed ${getPercent(times.dawn || 360)},
    #f59e0b ${getPercent(times.sunrise || 400)},
    #7dd3fc ${getPercent(times.sunriseEnd || 420)},
    #0ea5e9 ${getPercent(times.solarNoon || 720)},
    #7dd3fc ${getPercent(times.sunsetStart || 1020)},
    #f59e0b ${getPercent(times.sunset || 1040)},
    #7c3aed ${getPercent(times.dusk || 1080)},
    #1e3a5f ${getPercent(times.night || 1140)},
    #1e3a5f 100%
  )`;

  return { '--time-gradient': gradientValue };
});

// Watch for external date changes
watch(() => props.currentDate, (newDate) => {
  dayOfYear.value = dateToDayOfYear(newDate);
}, { deep: true });

// Update minutes when time or coordinates change
watch([() => props.currentTime, () => props.coordinates], () => {
  const utcHours = props.currentTime.getUTCHours();
  const utcMinutes = props.currentTime.getUTCMinutes();

  let locationHours = (utcHours + locationTimezoneOffset.value) % 24;
  if (locationHours < 0) locationHours += 24;

  totalMinutes.value = locationHours * 60 + utcMinutes;
}, { immediate: true });

// Format date
function formatDate(day) {
  const date = dayOfYearToDate(day, props.currentDate.getFullYear());
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Format time
function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Handle date slider
function handleDateSliderChange(event) {
  const day = parseInt(event.target.value);
  const newDate = dayOfYearToDate(day, props.currentDate.getFullYear());
  dayOfYear.value = day;
  emit('update-date', newDate);
}

// Handle time slider
function handleTimeSliderChange(event) {
  const minutes = parseInt(event.target.value);
  totalMinutes.value = minutes;

  const utcDate = new Date(props.currentTime);
  utcDate.setUTCHours(0, 0, 0, 0);

  const locationHours = Math.floor(minutes / 60);
  const locationMinutes = minutes % 60;

  let utcHours = (locationHours - locationTimezoneOffset.value);
  if (utcHours < 0) utcHours += 24;
  if (utcHours >= 24) utcHours -= 24;

  utcDate.setUTCHours(utcHours, locationMinutes, 0, 0);

  emit('update-time', new Date(utcDate));
}

// Set to now
function setNow() {
  const now = new Date();

  dayOfYear.value = dateToDayOfYear(now);
  emit('update-date', now);

  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();

  let locationHours = (utcHours + locationTimezoneOffset.value) % 24;
  if (locationHours < 0) locationHours += 24;

  totalMinutes.value = locationHours * 60 + utcMinutes;
  emit('update-time', now);
}

// Direct date input
function openDateInput() {
  const date = dayOfYearToDate(dayOfYear.value, props.currentDate.getFullYear());
  dateInputValue.value = date.toISOString().split('T')[0];
  showDateInput.value = true;
}

function handleDateInput() {
  const newDate = new Date(dateInputValue.value);
  if (!isNaN(newDate.getTime())) {
    dayOfYear.value = dateToDayOfYear(newDate);
    emit('update-date', newDate);
  }
  showDateInput.value = false;
}

// Direct time input
function openTimeInput() {
  timeInputValue.value = formatTime(totalMinutes.value);
  showTimeInput.value = true;
}

function handleTimeInput() {
  const [hours, mins] = timeInputValue.value.split(':').map(Number);
  if (!isNaN(hours) && !isNaN(mins)) {
    const minutes = hours * 60 + mins;
    totalMinutes.value = minutes;

    const utcDate = new Date(props.currentTime);
    utcDate.setUTCHours(0, 0, 0, 0);

    let utcHours = (hours - locationTimezoneOffset.value);
    if (utcHours < 0) utcHours += 24;
    if (utcHours >= 24) utcHours -= 24;

    utcDate.setUTCHours(utcHours, mins, 0, 0);
    emit('update-time', new Date(utcDate));
  }
  showTimeInput.value = false;
}
</script>

<template>
  <div class="solset-card datetime-card">
    <div class="solset-card-header">
      <h5><i class="bi bi-clock-history me-2"></i>Date & Time</h5>
      <div class="header-actions">
        <button
          class="solset-btn solset-btn-ghost solset-btn-icon"
          :class="{ 'animate-glow': isAnimating }"
          @click="emit('toggle-animation')"
          :aria-label="isAnimating ? 'Stop animation' : 'Start animation'"
          :title="isAnimating ? 'Stop (Space)' : 'Animate (Space)'"
        >
          <i :class="isAnimating ? 'bi bi-pause-fill' : 'bi bi-play-fill'"></i>
        </button>
        <button
          class="solset-btn solset-btn-primary btn-sm"
          @click="setNow"
          title="Jump to now (N)"
        >
          <i class="bi bi-clock"></i>
          Now
        </button>
      </div>
    </div>

    <div class="solset-card-body">
      <!-- Date Section -->
      <div class="slider-section">
        <div class="slider-header">
          <span class="slider-label">Date</span>
          <button
            v-if="!showDateInput"
            class="value-badge"
            @click="openDateInput"
            title="Click to edit"
          >
            {{ formatDate(dayOfYear) }}
          </button>
          <input
            v-else
            type="date"
            v-model="dateInputValue"
            @blur="handleDateInput"
            @keyup.enter="handleDateInput"
            class="solset-input date-input"
            autofocus
          />
        </div>
        <div class="slider-container">
          <input
            type="range"
            class="solset-slider season-slider"
            :min="1"
            :max="maxDay"
            v-model="dayOfYear"
            @input="handleDateSliderChange"
            :style="seasonGradientStyle"
            aria-label="Date slider"
          />
          <div class="slider-markers">
            <span>Jan</span>
            <span>Jul</span>
            <span>Dec</span>
          </div>
        </div>
      </div>

      <!-- Time Section -->
      <div class="slider-section">
        <div class="slider-header">
          <span class="slider-label">Time</span>
          <button
            v-if="!showTimeInput"
            class="value-badge mono"
            @click="openTimeInput"
            title="Click to edit"
          >
            {{ formatTime(totalMinutes) }}
          </button>
          <input
            v-else
            type="time"
            v-model="timeInputValue"
            @blur="handleTimeInput"
            @keyup.enter="handleTimeInput"
            class="solset-input time-input"
            autofocus
          />
        </div>
        <div class="slider-container">
          <input
            type="range"
            class="solset-slider time-slider"
            min="0"
            max="1439"
            step="5"
            v-model="totalMinutes"
            @input="handleTimeSliderChange"
            :style="timeGradientStyle"
            aria-label="Time slider"
          />
          <div class="slider-markers">
            <span>00:00</span>
            <span>12:00</span>
            <span>24:00</span>
          </div>
        </div>
      </div>

      <!-- Keyboard Hints -->
      <div class="keyboard-hints">
        <span><span class="kbd">←</span><span class="kbd">→</span> ±15min</span>
        <span><span class="kbd">⇧</span>+<span class="kbd">←</span><span class="kbd">→</span> ±1day</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.datetime-card {
  overflow: visible;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.slider-section {
  margin-bottom: 20px;
}

.slider-section:last-of-type {
  margin-bottom: 12px;
}

.slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.slider-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
}

.value-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.value-badge:hover {
  background: var(--bg-accent);
  border-color: var(--sun-gold);
  color: var(--sun-orange);
}

.value-badge.mono {
  font-family: var(--font-mono);
}

.date-input,
.time-input {
  padding: 4px 8px;
  font-size: 13px;
  width: auto;
}

.slider-container {
  position: relative;
}

.slider-markers {
  display: flex;
  justify-content: space-between;
  padding: 4px 2px 0;
  font-size: 10px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

/* Custom Slider Track Styling */
.season-slider,
.time-slider {
  height: 10px;
}

.season-slider::-webkit-slider-runnable-track {
  background: var(--season-gradient) !important;
  height: 10px;
  border-radius: 9999px;
}

.season-slider::-webkit-slider-thumb {
  margin-top: -5px;
}

.season-slider::-moz-range-track {
  background: var(--season-gradient) !important;
  height: 10px;
  border-radius: 9999px;
}

.time-slider::-webkit-slider-runnable-track {
  background: var(--time-gradient) !important;
  height: 10px;
  border-radius: 9999px;
}

.time-slider::-webkit-slider-thumb {
  margin-top: -5px;
}

.time-slider::-moz-range-track {
  background: var(--time-gradient) !important;
  height: 10px;
  border-radius: 9999px;
}

.keyboard-hints {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-tertiary);
}

.keyboard-hints span {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
