<script setup>
import { ref, computed } from 'vue';
import {
  getSunPosition, isSunAboveHorizon, calculateShadowLength, azimuthToBearing, bearingToCompass, estimateAnnualSolarYield
} from '../lib/sunCalc';
import { formatZonedTime, formatMinutes, formatDisplayDate, isValidDate } from '../lib/time';
import { copyToClipboard, formatCoordinates } from '../lib/utils';
import { showToast } from '../lib/toast';

const props = defineProps({
  coordinates: {
    type: Object,
    required: true
  },
  locationName: {
    type: String,
    default: null
  },
  sunPosition: {
    type: Object,
    required: true
  },
  sunTimes: {
    type: Object,
    required: true
  },
  timeZone: {
    type: String,
    required: true
  },
  localDate: {
    type: String,
    required: true
  },
  minutes: {
    type: Number,
    required: true
  },
  isSaved: {
    type: Boolean,
    default: false
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

const emit = defineEmits(['toggle-save']);

const copied = ref(false);

const toDegrees = (radians) => radians * (180 / Math.PI);

const bearing = computed(() => azimuthToBearing(props.sunPosition.azimuth));
const azimuthLabel = computed(() => bearing.value.toFixed(1));
const azimuthDirection = computed(() => bearingToCompass(bearing.value));
const altitudeDegrees = computed(() => toDegrees(props.sunPosition.altitude).toFixed(1));

const isSunUp = computed(() => isSunAboveHorizon(props.sunPosition.altitude));

const hasSunriseAndSunset = computed(() =>
  isValidDate(props.sunTimes.sunrise) && isValidDate(props.sunTimes.sunset)
);

// Maximum altitude of the day, at solar noon
const noonAltitude = computed(() => {
  const { lat, lng } = props.coordinates;
  return getSunPosition(props.sunTimes.solarNoon, lat, lng).altitude;
});

const isPolarDay = computed(() => !hasSunriseAndSunset.value && noonAltitude.value > 0);

const daylightDuration = computed(() => {
  if (!hasSunriseAndSunset.value) {
    return isPolarDay.value ? '24h (midnight sun)' : '0h (polar night)';
  }
  const totalMinutes = Math.round((props.sunTimes.sunset - props.sunTimes.sunrise) / 60000);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
});

const sunrise = computed(() => formatZonedTime(props.sunTimes.sunrise, props.timeZone));
const sunset = computed(() => formatZonedTime(props.sunTimes.sunset, props.timeZone));
const solarNoon = computed(() => formatZonedTime(props.sunTimes.solarNoon, props.timeZone));

const shadowLength = computed(() => calculateShadowLength(props.sunPosition.altitude, props.shadowHeight));

const shadowLabel = computed(() => {
  if (!(props.sunPosition.altitude > 0)) return '—';
  const length = shadowLength.value;
  return length > 1000 ? '> 1 km' : `${length.toFixed(1)} m`;
});

const yearlyKwh = computed(() =>
  estimateAnnualSolarYield(props.coordinates.lat, props.coordinates.lng, props.solarSystemSize)
);
const monthlyKwh = computed(() => Math.round(yearlyKwh.value / 12));

const coordinatesLabel = computed(() => formatCoordinates(props.coordinates.lat, props.coordinates.lng));

async function copyData() {
  const { lat, lng } = props.coordinates;
  const data = `SolSet Sun Data
Location: ${props.locationName ? props.locationName + ' — ' : ''}${lat.toFixed(6)}, ${lng.toFixed(6)}
Date: ${formatDisplayDate(props.localDate)}
Time: ${formatMinutes(props.minutes)} (${props.timeZone})

Sunrise: ${sunrise.value}
Solar noon: ${solarNoon.value} (max altitude ${toDegrees(noonAltitude.value).toFixed(1)}°)
Sunset: ${sunset.value}
Daylight: ${daylightDuration.value}

Azimuth: ${azimuthLabel.value}° (${azimuthDirection.value})
Altitude: ${altitudeDegrees.value}°
Shadow length: ${shadowLabel.value} (${props.shadowHeight} m object)

Solar production estimate: ~${yearlyKwh.value.toLocaleString()} kWh/year (${props.solarSystemSize} kW system)
${window.location.href}`;

  if (await copyToClipboard(data)) {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } else {
    showToast('Could not copy to clipboard');
  }
}
</script>

<template>
  <div class="solset-card sun-info-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-sun"></i>Sun Data</h2>
      <button
        type="button"
        class="solset-btn solset-btn-ghost btn-sm"
        @click="copyData"
        :title="copied ? 'Copied!' : 'Copy sun data to clipboard'"
      >
        <i :class="copied ? 'bi bi-check2' : 'bi bi-clipboard'"></i>
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </div>

    <div class="solset-card-body">
      <!-- Location -->
      <div class="section-title">Location</div>
      <div class="location-row">
        <div class="location-text">
          <span v-if="locationName" class="location-name" :title="locationName">{{ locationName }}</span>
          <span class="mono location-coords">{{ coordinatesLabel }}</span>
        </div>
        <button
          type="button"
          class="solset-btn solset-btn-ghost solset-btn-icon"
          :class="{ saved: isSaved }"
          @click="emit('toggle-save')"
          :aria-pressed="isSaved"
          :aria-label="isSaved ? 'Remove from saved locations' : 'Save this location'"
          :title="isSaved ? 'Remove from saved locations' : 'Save this location'"
        >
          <i :class="isSaved ? 'bi bi-bookmark-fill' : 'bi bi-bookmark'"></i>
        </button>
      </div>

      <!-- Sun Times -->
      <div class="section-title spaced">Day Cycle</div>
      <div class="sun-times-grid">
        <div class="sun-time sunrise">
          <i class="bi bi-sunrise"></i>
          <span class="time-label">Sunrise</span>
          <span class="time-value">{{ sunrise }}</span>
        </div>
        <div class="sun-time sunset">
          <i class="bi bi-sunset"></i>
          <span class="time-label">Sunset</span>
          <span class="time-value">{{ sunset }}</span>
        </div>
      </div>

      <div class="data-row">
        <span class="label">Daylight</span>
        <span class="value">{{ daylightDuration }}</span>
      </div>
      <div class="data-row">
        <span class="label">Solar noon</span>
        <span class="value">{{ solarNoon }} · {{ toDegrees(noonAltitude).toFixed(1) }}° high</span>
      </div>

      <!-- Current Position -->
      <div class="section-title spaced">At {{ formatMinutes(minutes) }}</div>
      <div class="data-row">
        <span class="label">Azimuth</span>
        <span class="value">
          <span class="mono">{{ azimuthLabel }}°</span>
          <span class="solset-badge">{{ azimuthDirection }}</span>
        </span>
      </div>
      <div class="data-row">
        <span class="label">Altitude</span>
        <span class="value mono">{{ altitudeDegrees }}°</span>
      </div>
      <div class="data-row">
        <span class="label">Shadow of a {{ shadowHeight }} m object</span>
        <span class="value mono">{{ shadowLabel }}</span>
      </div>

      <div :class="['sun-status', isSunUp ? 'up' : 'down']">
        <span class="icon">
          <i :class="isSunUp ? 'bi bi-brightness-high-fill' : 'bi bi-moon-stars-fill'"></i>
        </span>
        <span>Sun is {{ isSunUp ? 'above' : 'below' }} the horizon</span>
      </div>

      <!-- Solar Production -->
      <div class="section-title spaced">Solar Production Estimate</div>
      <div class="solar-estimate">
        <div class="solar-main">
          <i class="bi bi-lightning-charge-fill"></i>
          <div class="solar-values">
            <span class="solar-yearly">~{{ yearlyKwh.toLocaleString() }} kWh/year</span>
            <span class="solar-monthly">~{{ monthlyKwh.toLocaleString() }} kWh/month avg</span>
          </div>
        </div>
        <span class="solar-system-size">{{ solarSystemSize }} kW</span>
      </div>
      <div class="note">
        <i class="bi bi-info-circle"></i>
        Rough estimate from latitude and region only. Ignores roof tilt, orientation, shading and weather.
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-sm {
  padding: 6px 10px;
  font-size: 12px;
}

.data-row .value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title.spaced {
  margin-top: 20px;
}

.location-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.location-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.location-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-coords {
  font-size: 13px;
  color: var(--text-secondary);
}

.saved {
  color: var(--sun-orange);
}

.sun-times-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 8px;
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

.note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-tertiary);
}

.note i {
  margin-top: 1px;
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
  color: var(--success-text);
  background: rgba(16, 185, 129, 0.15);
  padding: 4px 8px;
  border-radius: var(--radius-full);
}
</style>
