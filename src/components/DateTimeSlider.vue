<script setup>
import { ref, computed, nextTick } from 'vue';
import { getSunPosition } from '../lib/sunCalc';
import {
  dayOfYear, dateStringFromDayOfYear, daysInYear, getYear, formatDisplayDate,
  formatMinutes, parseMinutes, toZonedMinutes, isValidDate, isValidDateString,
  getTimeZoneOffset, formatUtcOffset
} from '../lib/time';

const props = defineProps({
  // Wall-clock date in the location's time zone, 'YYYY-MM-DD'
  localDate: {
    type: String,
    required: true
  },
  // Wall-clock minutes since midnight in the location's time zone
  minutes: {
    type: Number,
    required: true
  },
  instant: {
    type: Date,
    required: true
  },
  timeZone: {
    type: String,
    required: true
  },
  sunTimes: {
    type: Object,
    required: true
  },
  coordinates: {
    type: Object,
    required: true
  },
  isAnimating: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:localDate', 'update:minutes', 'now', 'toggle-animation']);

const showDateInput = ref(false);
const showTimeInput = ref(false);
const dateInputValue = ref('');
const timeInputValue = ref('');
const dateInput = ref(null);
const timeInput = ref(null);

const year = computed(() => getYear(props.localDate));
const maxDay = computed(() => daysInYear(year.value));
const currentDay = computed(() => dayOfYear(props.localDate));

const timeZoneLabel = computed(() => {
  const offset = formatUtcOffset(getTimeZoneOffset(props.instant, props.timeZone));
  const name = props.timeZone.startsWith('Etc/') || props.timeZone === 'UTC'
    ? 'Ocean / no local zone'
    : props.timeZone.split('/').pop().replace(/_/g, ' ');
  return `${name} · ${offset}`;
});

const percent = (value, total) => `${((value / total) * 100).toFixed(2)}%`;

// Month markers positioned where each month starts
const monthMarkers = computed(() =>
  [['Jan', 1], ['Apr', 4], ['Jul', 7], ['Oct', 10]].map(([label, month]) => ({
    label,
    left: percent(dayOfYear(`${year.value}-${String(month).padStart(2, '0')}-01`) - 1, maxDay.value - 1)
  }))
);

const hourMarkers = ['00:00', '06:00', '12:00', '18:00', '24:00'];

// Season gradient for the date slider (hemisphere aware)
const seasonGradientStyle = computed(() => {
  const isNorthernHemisphere = props.coordinates.lat >= 0;
  const p = (dateString) => percent(dayOfYear(`${year.value}-${dateString}`), maxDay.value);
  const [mar, jun, sep, dec] = [p('03-20'), p('06-21'), p('09-22'), p('12-21')];

  const [winter, spring, summer, fall] = ['#60a5fa', '#34d399', '#fbbf24', '#f97316'];
  const sequence = isNorthernHemisphere
    ? [winter, spring, summer, fall, winter]
    : [summer, fall, winter, spring, summer];

  const gradient = `linear-gradient(to right,
    ${sequence[0]} 0%, ${sequence[0]} ${mar},
    ${sequence[1]} ${mar}, ${sequence[1]} ${jun},
    ${sequence[2]} ${jun}, ${sequence[2]} ${sep},
    ${sequence[3]} ${sep}, ${sequence[3]} ${dec},
    ${sequence[4]} ${dec}, ${sequence[4]} 100%)`;

  return { '--season-gradient': gradient };
});

// Day/night gradient for the time slider, in the location's time zone
const timeGradientStyle = computed(() => {
  const times = props.sunTimes;
  const toMinutes = (date) => (isValidDate(date) ? toZonedMinutes(date, props.timeZone) : null);
  const noon = toMinutes(times.solarNoon);
  const night = '#1e3a5f';
  const twilight = '#7c3aed';

  if (toMinutes(times.sunrise) === null || toMinutes(times.sunset) === null) {
    const { lat, lng } = props.coordinates;
    const polarDay = getSunPosition(times.solarNoon, lat, lng).altitude > 0;
    const gradient = polarDay
      ? 'linear-gradient(to right, #7dd3fc, #0ea5e9 50%, #7dd3fc)'
      : `linear-gradient(to right, ${night}, ${twilight} 50%, ${night})`;
    return { '--time-gradient': gradient };
  }

  // Keep stops ordered around solar noon even if twilight crosses midnight
  const stop = (date, beforeNoon) => {
    let m = toMinutes(date);
    if (m === null) return null;
    if (beforeNoon && m > noon) m -= 1440;
    if (!beforeNoon && m < noon) m += 1440;
    return percent(m, 1440);
  };

  const stops = [
    [night, '0%'],
    [night, stop(times.dawn, true)],
    [twilight, stop(times.dawn, true)],
    ['#f59e0b', stop(times.sunrise, true)],
    ['#7dd3fc', stop(times.sunriseEnd, true)],
    ['#0ea5e9', percent(noon, 1440)],
    ['#7dd3fc', stop(times.sunsetStart, false)],
    ['#f59e0b', stop(times.sunset, false)],
    [twilight, stop(times.dusk, false)],
    [night, stop(times.night, false)],
    [night, '100%']
  ].filter(([, position]) => position !== null);

  return { '--time-gradient': `linear-gradient(to right, ${stops.map(s => s.join(' ')).join(', ')})` };
});

function handleDateSlider(event) {
  emit('update:localDate', dateStringFromDayOfYear(year.value, Number(event.target.value)));
}

function handleTimeSlider(event) {
  emit('update:minutes', Number(event.target.value));
}

async function openDateInput() {
  dateInputValue.value = props.localDate;
  showDateInput.value = true;
  await nextTick();
  dateInput.value?.focus();
}

function commitDateInput() {
  if (!showDateInput.value) return;
  if (isValidDateString(dateInputValue.value)) {
    emit('update:localDate', dateInputValue.value);
  }
  showDateInput.value = false;
}

async function openTimeInput() {
  timeInputValue.value = formatMinutes(props.minutes);
  showTimeInput.value = true;
  await nextTick();
  timeInput.value?.focus();
}

function commitTimeInput() {
  if (!showTimeInput.value) return;
  const minutes = parseMinutes(timeInputValue.value);
  if (minutes !== null) {
    emit('update:minutes', minutes);
  }
  showTimeInput.value = false;
}
</script>

<template>
  <div class="solset-card datetime-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-clock-history"></i>Date &amp; Time</h2>
      <div class="header-actions">
        <button
          type="button"
          class="solset-btn solset-btn-secondary btn-sm"
          :class="{ 'is-playing': isAnimating }"
          @click="emit('toggle-animation')"
          :aria-pressed="isAnimating"
          :title="isAnimating ? 'Pause (Space)' : 'Play through the day (Space)'"
        >
          <i :class="isAnimating ? 'bi bi-pause-fill' : 'bi bi-play-fill'"></i>
          {{ isAnimating ? 'Pause' : 'Play' }}
        </button>
        <button
          type="button"
          class="solset-btn solset-btn-primary btn-sm"
          @click="emit('now')"
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
          <label class="slider-label" for="date-slider">Date</label>
          <button
            v-if="!showDateInput"
            type="button"
            class="value-badge"
            @click="openDateInput"
            title="Click to type a date"
          >
            {{ formatDisplayDate(localDate) }}
            <i class="bi bi-pencil"></i>
          </button>
          <input
            v-else
            ref="dateInput"
            type="date"
            v-model="dateInputValue"
            @blur="commitDateInput"
            @keydown.enter.prevent="commitDateInput"
            @keydown.esc.stop="showDateInput = false"
            class="solset-input date-input"
            aria-label="Date"
          />
        </div>
        <div class="slider-container">
          <input
            id="date-slider"
            type="range"
            class="solset-slider season-slider"
            min="1"
            :max="maxDay"
            :value="currentDay"
            @input="handleDateSlider"
            :style="seasonGradientStyle"
            :aria-valuetext="formatDisplayDate(localDate)"
          />
          <div class="slider-markers">
            <span v-for="m in monthMarkers" :key="m.label" :style="{ left: m.left }">{{ m.label }}</span>
            <span class="end">Dec</span>
          </div>
        </div>
      </div>

      <!-- Time Section -->
      <div class="slider-section">
        <div class="slider-header">
          <label class="slider-label" for="time-slider">Time</label>
          <button
            v-if="!showTimeInput"
            type="button"
            class="value-badge mono"
            @click="openTimeInput"
            title="Click to type a time"
          >
            {{ formatMinutes(minutes) }}
            <i class="bi bi-pencil"></i>
          </button>
          <input
            v-else
            ref="timeInput"
            type="time"
            v-model="timeInputValue"
            @blur="commitTimeInput"
            @keydown.enter.prevent="commitTimeInput"
            @keydown.esc.stop="showTimeInput = false"
            class="solset-input time-input"
            aria-label="Time"
          />
        </div>
        <div class="slider-container">
          <input
            id="time-slider"
            type="range"
            class="solset-slider time-slider"
            min="0"
            max="1439"
            step="5"
            :value="minutes"
            @input="handleTimeSlider"
            :style="timeGradientStyle"
            :aria-valuetext="formatMinutes(minutes)"
          />
          <div class="slider-markers">
            <span
              v-for="(h, i) in hourMarkers"
              :key="h"
              :style="{ left: `${i * 25}%` }"
              :class="{ end: i === hourMarkers.length - 1 }"
            >{{ h }}</span>
          </div>
        </div>
        <div class="timezone-label" :title="timeZone">
          <i class="bi bi-globe2"></i>
          Local time: {{ timeZoneLabel }}
        </div>
      </div>

      <!-- Keyboard Hints -->
      <div class="keyboard-hints">
        <span><span class="kbd">←</span><span class="kbd">→</span> ±15 min</span>
        <span><span class="kbd">⇧</span>+<span class="kbd">←</span><span class="kbd">→</span> ±1 day</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.is-playing {
  border-color: var(--sun-gold);
  color: var(--sun-orange);
}

.slider-section {
  margin-bottom: 20px;
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
  gap: 8px;
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

.value-badge i {
  font-size: 11px;
  color: var(--text-tertiary);
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
  position: relative;
  height: 18px;
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.slider-markers span {
  position: absolute;
  top: 0;
}

.slider-markers span:not(:first-child):not(.end) {
  transform: translateX(-50%);
}

.slider-markers span.end {
  left: auto !important;
  right: 0;
}

.timezone-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* Custom Slider Track Styling */
.season-slider::-webkit-slider-runnable-track {
  background: var(--season-gradient);
}

.season-slider::-moz-range-track {
  background: var(--season-gradient);
}

.time-slider::-webkit-slider-runnable-track {
  background: var(--time-gradient);
}

.time-slider::-moz-range-track {
  background: var(--time-gradient);
}

.keyboard-hints {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-tertiary);
}

.keyboard-hints span {
  display: flex;
  align-items: center;
  gap: 4px;
}

@media (hover: none) {
  .keyboard-hints {
    display: none;
  }
}
</style>
