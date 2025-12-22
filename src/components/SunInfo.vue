<script setup>
import { computed } from 'vue';
import { getSunTimes, getSunPosition, formatTime, calculateShadowLength } from '../lib/sunCalc';
import { combineDateAndTime, copyToClipboard } from '../lib/utils';

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
  },
  shadowHeight: {
    type: Number,
    default: 1
  },
  solarSystemSize: {
    type: Number,
    default: 6.7
  }
});

// Combined date and time
const dateTime = computed(() => combineDateAndTime(props.date, props.time));

// Sun position
const position = computed(() => {
  if (!props.coordinates.lat || !props.coordinates.lng) {
    return { azimuth: 0, altitude: 0 };
  }
  return getSunPosition(dateTime.value, props.coordinates.lat, props.coordinates.lng);
});

// Azimuth in degrees
const azimuthDegrees = computed(() => {
  const degrees = position.value.azimuth * (180 / Math.PI);
  return ((degrees + 360) % 360).toFixed(1);
});

// Altitude in degrees
const altitudeDegrees = computed(() => {
  return (position.value.altitude * (180 / Math.PI)).toFixed(1);
});

// Sun times
const sunTimes = computed(() => {
  if (!props.coordinates.lat || !props.coordinates.lng) {
    return { sunrise: null, sunset: null };
  }
  return getSunTimes(props.date, props.coordinates.lat, props.coordinates.lng);
});

// Daylight duration
const daylightDuration = computed(() => {
  if (!sunTimes.value.sunrise || !sunTimes.value.sunset) return null;
  const diff = sunTimes.value.sunset - sunTimes.value.sunrise;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
});

// Shadow length with custom height
const shadowLength = computed(() => {
  const baseLength = calculateShadowLength(position.value.altitude);
  return baseLength * props.shadowHeight;
});

// Is sun up
const isSunUp = computed(() => position.value.altitude > 0);

// Compass direction
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

// Solar production with custom system size
const yearlyKwh = computed(() => {
  if (!props.coordinates.lat || !props.coordinates.lng) return 0;
  return calculateSolarProduction(props.coordinates.lat, props.coordinates.lng, props.solarSystemSize);
});

// Monthly breakdown estimate
const monthlyKwh = computed(() => Math.round(yearlyKwh.value / 12));

function calculateSolarProduction(lat, lng, systemSize) {
  const baseProduction = 1500;
  const latitudeFactor = Math.cos(Math.abs(lat) * Math.PI / 180);

  let regionalFactor = 1.0;

  // Europe
  if (lng >= -15 && lng <= 40 && lat >= 35 && lat <= 70) {
    if (lat > 55) regionalFactor = 0.75;
    else if (lat > 45) regionalFactor = 0.85;
    else regionalFactor = 0.95;
  }
  // North America
  else if (lng >= -130 && lng <= -60 && lat >= 25 && lat <= 60) {
    if (lat > 45) regionalFactor = 0.8;
    else if (lng < -100) regionalFactor = 1.1;
    else regionalFactor = 0.9;
  }
  // Asia
  else if (lng >= 60 && lng <= 150 && lat >= 10 && lat <= 60) {
    if (lat > 40) regionalFactor = 0.75;
    else regionalFactor = 0.95;
  }
  // Australia
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

  return Math.round(baseProduction * systemSize * latitudeFactor * regionalFactor);
}

// Copy data to clipboard
async function copyData() {
  const data = `SolSet Sun Data
Location: ${props.coordinates.lat.toFixed(6)}, ${props.coordinates.lng.toFixed(6)}
Date: ${props.date.toLocaleDateString()}
Time: ${props.time.toLocaleTimeString()}

Sunrise: ${formatTime(sunTimes.value.sunrise, props.coordinates.lng)}
Sunset: ${formatTime(sunTimes.value.sunset, props.coordinates.lng)}
Daylight: ${daylightDuration.value || 'N/A'}

Azimuth: ${azimuthDegrees.value}° (${azimuthDirection.value})
Altitude: ${altitudeDegrees.value}°
Shadow Length: ${isSunUp.value ? shadowLength.value.toFixed(1) + 'm' : 'N/A'} (${props.shadowHeight}m object)

Solar Production Estimate: ~${yearlyKwh.value.toLocaleString()} kWh/year (${props.solarSystemSize}kW system)`;

  await copyToClipboard(data);
}
</script>

<template>
  <div class="solset-card sun-info-card">
    <div class="solset-card-header">
      <h5><i class="bi bi-sun me-2"></i>Sun Data</h5>
      <button
        class="solset-btn solset-btn-ghost solset-btn-icon"
        @click="copyData"
        title="Copy data to clipboard"
        aria-label="Copy sun data"
      >
        <i class="bi bi-clipboard"></i>
      </button>
    </div>

    <div class="solset-card-body">
      <!-- Location -->
      <div class="section-title">Location</div>
      <div class="data-row">
        <span class="label">Coordinates</span>
        <span class="value mono">{{ coordinates.lat.toFixed(4) }}°, {{ coordinates.lng.toFixed(4) }}°</span>
      </div>

      <!-- Sun Times -->
      <div class="section-title" style="margin-top: 16px;">Day Cycle</div>
      <div class="sun-times-grid">
        <div class="sun-time sunrise">
          <i class="bi bi-sunrise"></i>
          <span class="time-label">Sunrise</span>
          <span class="time-value">{{ formatTime(sunTimes.sunrise, coordinates.lng) }}</span>
        </div>
        <div class="sun-time sunset">
          <i class="bi bi-sunset"></i>
          <span class="time-label">Sunset</span>
          <span class="time-value">{{ formatTime(sunTimes.sunset, coordinates.lng) }}</span>
        </div>
      </div>

      <div class="data-row">
        <span class="label">Daylight Duration</span>
        <span class="value">{{ daylightDuration || 'N/A' }}</span>
      </div>

      <div class="timezone-note">
        <i class="bi bi-info-circle"></i>
        Times in location's approximate timezone
      </div>

      <!-- Current Position -->
      <div class="section-title" style="margin-top: 16px;">Current Position</div>
      <div class="data-row">
        <span class="label">Azimuth</span>
        <span class="value">
          <span class="mono">{{ azimuthDegrees }}°</span>
          <span class="solset-badge">{{ azimuthDirection }}</span>
        </span>
      </div>
      <div class="data-row">
        <span class="label">Altitude</span>
        <span class="value mono">{{ altitudeDegrees }}°</span>
      </div>
      <div class="data-row">
        <span class="label">Shadow ({{ shadowHeight }}m object)</span>
        <span class="value mono">
          {{ isSunUp ? shadowLength.toFixed(1) + 'm' : '—' }}
        </span>
      </div>

      <!-- Sun Status -->
      <div :class="['sun-status', isSunUp ? 'up' : 'down']">
        <span class="icon">
          <i :class="isSunUp ? 'bi bi-brightness-high-fill' : 'bi bi-moon-stars-fill'"></i>
        </span>
        <span>Sun is {{ isSunUp ? 'above' : 'below' }} the horizon</span>
      </div>

      <!-- Solar Production -->
      <div class="section-title" style="margin-top: 16px;">Solar Production Estimate</div>
      <div class="solar-estimate">
        <div class="solar-main">
          <i class="bi bi-lightning-charge-fill"></i>
          <div class="solar-values">
            <span class="solar-yearly">~{{ yearlyKwh.toLocaleString() }} kWh/year</span>
            <span class="solar-monthly">~{{ monthlyKwh.toLocaleString() }} kWh/month avg</span>
          </div>
        </div>
        <span class="solar-system-size">{{ solarSystemSize }}kW system</span>
      </div>
      <div class="timezone-note">
        <i class="bi bi-info-circle"></i>
        Rough estimate based on location only
      </div>
    </div>
  </div>
</template>

<style scoped>
.sun-info-card {
  flex-shrink: 0;
}

.data-row .value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sun-times-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.sun-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  border-radius: var(--radius-md);
  text-align: center;
}

.sun-time.sunrise {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(251, 191, 36, 0.15) 100%);
}

.sun-time.sunset {
  background: linear-gradient(135deg, rgba(234, 88, 12, 0.1) 0%, rgba(239, 68, 68, 0.1) 100%);
}

.sun-time i {
  font-size: 24px;
  color: var(--sun-gold);
}

.sun-time.sunset i {
  color: var(--sun-orange);
}

.time-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
}

.time-value {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.timezone-note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  font-size: 11px;
  color: var(--text-tertiary);
}

.sun-status {
  margin-top: 12px;
}

.solar-estimate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
}

.solar-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.solar-main i {
  font-size: 24px;
  color: var(--success);
}

.solar-values {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.solar-yearly {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.solar-monthly {
  font-size: 11px;
  color: var(--text-tertiary);
}

.solar-system-size {
  font-size: 12px;
  font-weight: 500;
  color: var(--success);
  background: rgba(16, 185, 129, 0.15);
  padding: 4px 8px;
  border-radius: var(--radius-full);
}
</style>
