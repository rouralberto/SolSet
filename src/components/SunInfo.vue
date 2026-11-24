<script setup>
import { ref, computed } from 'vue';
import {
  getSunPosition, isSunAboveHorizon, calculateShadowLength, azimuthToBearing, toBearingPosition
} from '../lib/sunCalc';
import { formatZonedTime, formatMinutes, formatDisplayDate, isValidDate, toZonedMinutes } from '../lib/time';
import { copyToClipboard, formatCoordinates, formatBearing } from '../lib/utils';
import { compassPoint, shadowLengthFactor } from '../lib/solar';
import { formatLength } from '../lib/units';
import { showToast } from '../lib/toast';
import NumberField from './NumberField.vue';

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
  units: {
    type: String,
    default: 'metric'
  },
  // Magnetic declination in degrees (east positive), or null if unknown
  declination: {
    type: Number,
    default: null
  }
});

const emit = defineEmits(['toggle-save', 'update:shadowHeight']);

const copied = ref(false);

const toDegrees = (radians) => radians * (180 / Math.PI);

const sun = computed(() => toBearingPosition(props.sunPosition));
const bearing = computed(() => azimuthToBearing(props.sunPosition.azimuth));
const azimuthLabel = computed(() => bearing.value.toFixed(1));
const azimuthDirection = computed(() => compassPoint(bearing.value));
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

// Where on the horizon the sun comes up and goes down
const bearingAt = (date) => {
  if (!isValidDate(date)) return null;
  const { lat, lng } = props.coordinates;
  return formatBearing(azimuthToBearing(getSunPosition(date, lat, lng).azimuth));
};
const sunriseBearing = computed(() => bearingAt(props.sunTimes.sunrise));
const sunsetBearing = computed(() => bearingAt(props.sunTimes.sunset));

const twilight = computed(() => {
  const { dawn, dusk } = props.sunTimes;
  if (!isValidDate(dawn) || !isValidDate(dusk)) return null;
  return `${formatZonedTime(dawn, props.timeZone)} – ${formatZonedTime(dusk, props.timeZone)}`;
});

// The sun is due south/north at solar noon, which is rarely 12:00 on the clock
const noonOffset = computed(() => {
  if (!isValidDate(props.sunTimes.solarNoon)) return null;
  const offset = toZonedMinutes(props.sunTimes.solarNoon, props.timeZone) - 720;
  if (Math.abs(offset) < 2) return 'at 12:00';
  return `${Math.abs(offset)} min ${offset > 0 ? 'after' : 'before'} 12:00`;
});

const shadowLength = computed(() => calculateShadowLength(props.sunPosition.altitude, props.shadowHeight));

const shadowLabel = computed(() => {
  if (!(props.sunPosition.altitude > 0)) return '—';
  const length = shadowLength.value;
  return length > 1000 ? (props.units === 'imperial' ? '> 3,000 ft' : '> 1 km') : formatLength(length, props.units);
});

const shadowDirection = computed(() =>
  props.sunPosition.altitude > 0 ? compassPoint(bearing.value + 180) : null
);

const shadowFactor = computed(() => {
  const factor = shadowLengthFactor(sun.value.altitude);
  return Number.isFinite(factor) && factor < 1000 ? `×${factor.toFixed(factor >= 10 ? 0 : 1)}` : null;
});

const declinationLabel = computed(() => {
  if (props.declination === null) return null;
  const rounded = Math.abs(props.declination).toFixed(1);
  if (Math.abs(props.declination) < 0.05) return '0°';
  return `${rounded}° ${props.declination > 0 ? 'E' : 'W'}`;
});

const declinationHint = computed(() => {
  if (props.declination === null) return '';
  const amount = Math.abs(props.declination);
  if (amount < 0.5) return 'A compass points to true north here, near enough.';
  const degrees = `${amount.toFixed(0)}°`;
  const correction = props.declination > 0 ? `add ${degrees} to` : `subtract ${degrees} from`;
  return `A compass needle points ${degrees} ${props.declination > 0 ? 'east' : 'west'} of true north here: ${correction} a compass reading to get the true bearing.`;
});

const coordinatesLabel = computed(() => formatCoordinates(props.coordinates.lat, props.coordinates.lng));

async function copyData() {
  const { lat, lng } = props.coordinates;
  const data = `SolSet Sun Data
Location: ${props.locationName ? props.locationName + ' — ' : ''}${lat.toFixed(6)}, ${lng.toFixed(6)}
Date: ${formatDisplayDate(props.localDate)}
Time: ${formatMinutes(props.minutes)} (${props.timeZone})

Sunrise: ${sunrise.value}${sunriseBearing.value ? ` at ${sunriseBearing.value}` : ''}
Solar noon: ${solarNoon.value} (max altitude ${toDegrees(noonAltitude.value).toFixed(1)}°)
Sunset: ${sunset.value}${sunsetBearing.value ? ` at ${sunsetBearing.value}` : ''}
Daylight: ${daylightDuration.value}

Azimuth: ${azimuthLabel.value}° (${azimuthDirection.value}), from true north
Altitude: ${altitudeDegrees.value}°
Shadow length: ${shadowLabel.value} (${formatLength(props.shadowHeight, props.units)} object)${declinationLabel.value ? `
Magnetic declination: ${declinationLabel.value}` : ''}
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
          <span v-if="sunriseBearing" class="time-bearing">{{ sunriseBearing }}</span>
        </div>
        <div class="sun-time sunset">
          <i class="bi bi-sunset"></i>
          <span class="time-label">Sunset</span>
          <span class="time-value">{{ sunset }}</span>
          <span v-if="sunsetBearing" class="time-bearing">{{ sunsetBearing }}</span>
        </div>
      </div>

      <div class="data-row">
        <span class="label">Daylight</span>
        <span class="value">{{ daylightDuration }}</span>
      </div>
      <div class="data-row">
        <span class="label">Solar noon <small v-if="noonOffset">{{ noonOffset }}</small></span>
        <span class="value">{{ solarNoon }} · {{ toDegrees(noonAltitude).toFixed(1) }}° high</span>
      </div>
      <div v-if="twilight" class="data-row">
        <span class="label">First to last light <small>civil twilight</small></span>
        <span class="value">{{ twilight }}</span>
      </div>

      <!-- Current Position -->
      <div class="section-title spaced">At {{ formatMinutes(minutes) }}</div>
      <div class="data-row">
        <span class="label">Azimuth <small>from true north</small></span>
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
        <div class="label">
          Shadow length
          <label class="shadow-label" for="shadow-object">
            of an object
            <NumberField
              id="shadow-object" length :units="units" :min="0.1" :max="1000" :step="0.1"
              :model-value="shadowHeight" @update:model-value="emit('update:shadowHeight', $event)"
            />
            tall
          </label>
        </div>
        <span class="value mono nowrap">
          {{ shadowLabel }}
          <span v-if="shadowDirection" class="solset-badge" :title="`The shadow points ${shadowDirection}; it is ${shadowFactor || 'many times'} the object's height`">→ {{ shadowDirection }}</span>
        </span>
      </div>

      <div :class="['sun-status', isSunUp ? 'up' : 'down']">
        <span class="icon">
          <i :class="isSunUp ? 'bi bi-brightness-high-fill' : 'bi bi-moon-stars-fill'"></i>
        </span>
        <span>Sun is {{ isSunUp ? 'above' : 'below' }} the horizon</span>
      </div>

      <!-- North -->
      <template v-if="declinationLabel">
        <div class="section-title spaced">Finding true north</div>
        <div class="data-row">
          <span class="label">Magnetic declination</span>
          <span class="value mono">{{ declinationLabel }}</span>
        </div>
        <div class="note">
          <i class="bi bi-compass"></i>
          <span>
            {{ declinationHint }}
            Or use the sun: at solar noon ({{ solarNoon }}) the shadow of a plumb line runs exactly north–south.
          </span>
        </div>
      </template>
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

.time-bearing {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

.data-row .label small {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
}

.shadow-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.shadow-label .number-field {
  width: 74px;
}

.nowrap {
  white-space: nowrap;
}
</style>
