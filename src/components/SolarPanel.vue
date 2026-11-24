<script setup>
import { ref, computed } from 'vue';
import NumberField from './NumberField.vue';
import { simulatePv, findOptimalPlane, bearingDifference, normalizeBearing, MONTH_NAMES } from '../lib/solar';
import { formatBearing } from '../lib/utils';

const props = defineProps({
  settings: { type: Object, required: true },
  latitude: { type: Number, required: true },
  // From buildClimateYear()
  climateYear: { type: Array, required: true },
  climate: { type: Object, required: true },
  climateLoading: { type: Boolean, default: false },
  houseOrientation: { type: Number, required: true },
  // Obstruction horizon at the array, or null
  horizon: { type: Object, default: null }
});

const emit = defineEmits(['update-settings']);
const update = (patch) => emit('update-settings', patch);

const PLACEMENTS = [
  { id: 'roof-day', label: 'Day-side roof' },
  { id: 'roof-night', label: 'Night-side roof' },
  { id: 'custom', label: 'Custom' }
];

const isCustom = computed(() => props.settings.pvPlacement === 'custom');

const plane = computed(() => {
  if (isCustom.value) return { tilt: props.settings.pvTilt, azimuth: props.settings.pvAzimuth };
  return {
    tilt: props.settings.houseRoofPitch,
    azimuth: normalizeBearing(props.houseOrientation + (props.settings.pvPlacement === 'roof-night' ? 180 : 0))
  };
});

const result = computed(() => simulatePv({
  year: props.climateYear,
  tilt: plane.value.tilt,
  azimuth: plane.value.azimuth,
  kwp: props.settings.solarSystemSize,
  horizon: props.horizon
}));

// Best the site could do with a freely placed, unshaded array
const optimum = computed(() => findOptimalPlane(props.climateYear, props.latitude));

const relativeToBest = computed(() => {
  const best = optimum.value.specificYield;
  return best > 0 ? result.value.specificYield / best : 0;
});

const offBest = computed(() => {
  const tiltGap = Math.round(plane.value.tilt - optimum.value.tilt);
  const turn = Math.round(Math.abs(bearingDifference(plane.value.azimuth, optimum.value.azimuth)));
  const parts = [];
  if (optimum.value.tilt > 3 && turn >= 10) parts.push(`${turn}° off the best direction`);
  if (Math.abs(tiltGap) >= 5) parts.push(`${Math.abs(tiltGap)}° ${tiltGap > 0 ? 'steeper' : 'flatter'} than ideal`);
  return parts.join(', ');
});

const format = (value) => Math.round(value).toLocaleString();

const months = computed(() => {
  const max = Math.max(...result.value.monthly, 1);
  return result.value.monthly.map((kwh, month) => ({
    month,
    name: MONTH_NAMES[month],
    kwh,
    height: `${(kwh / max) * 100}%`,
    perDay: kwh / props.climateYear[month].days
  }));
});

const extremes = computed(() => {
  const sorted = [...months.value].sort((a, b) => a.kwh - b.kwh);
  return { low: sorted[0], high: sorted[sorted.length - 1] };
});

const hovered = ref(null);
const highlighted = computed(() => hovered.value ?? extremes.value.high.month);

const isFlatRoof = computed(() => !isCustom.value && props.settings.houseRoofPitch < 3);
const facesAway = computed(() => relativeToBest.value < 0.75 && plane.value.tilt > 10);

const sourceNote = computed(() => {
  if (props.climateLoading) return 'Loading local sunshine data…';
  return props.climate.source === 'nasa-power'
    ? `Sunshine and temperature: NASA POWER monthly normals${props.climate.period ? ` (${props.climate.period})` : ''}. Typically within about 10% of PVGIS.`
    : 'Local sunshine data unavailable: this uses typical cloudiness for the latitude and can be 25% off. It refreshes when you are back online.';
});
</script>

<template>
  <div class="solset-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-lightning-charge"></i>Solar panels</h2>
    </div>
    <div class="solset-card-body">
      <label class="field" for="pv-size">
        <span>System size <small>peak power</small></span>
        <NumberField
          id="pv-size" suffix="kW" :min="0.1" :max="10000" :step="0.1"
          :model-value="settings.solarSystemSize" @update:model-value="update({ solarSystemSize: $event })"
        />
      </label>

      <div class="segmented" role="group" aria-label="Where the panels go">
        <button
          v-for="option in PLACEMENTS"
          :key="option.id"
          type="button"
          :class="{ active: settings.pvPlacement === option.id }"
          :aria-pressed="settings.pvPlacement === option.id"
          @click="update({ pvPlacement: option.id })"
        >{{ option.label }}</button>
      </div>

      <div v-if="isCustom" class="field-grid">
        <label class="field" for="pv-tilt">
          <span>Tilt <small>0 = flat</small></span>
          <NumberField
            id="pv-tilt" suffix="°" :min="0" :max="90" :step="1"
            :model-value="settings.pvTilt" @update:model-value="update({ pvTilt: $event })"
          />
        </label>
        <label class="field" for="pv-azimuth">
          <span>Facing <small>from north</small></span>
          <NumberField
            id="pv-azimuth" suffix="°" :min="0" :max="359" :step="5"
            :model-value="settings.pvAzimuth" @update:model-value="update({ pvAzimuth: $event })"
          />
        </label>
      </div>
      <p class="plane-note">
        Panels tilted {{ Math.round(plane.tilt) }}°<template v-if="plane.tilt >= 1">, facing {{ formatBearing(plane.azimuth) }}</template>
        <template v-if="!isCustom"> (follows the house's roof pitch and orientation)</template>.
      </p>

      <div class="headline">
        <div class="headline-main">
          <span class="headline-value">{{ format(result.annual) }}</span>
          <span class="headline-unit">kWh per year</span>
        </div>
        <div class="headline-side">
          <span><strong>{{ format(result.specificYield) }}</strong> kWh per kW</span>
          <span><strong>{{ format(result.annual / 365) }}</strong> kWh per day avg</span>
        </div>
      </div>

      <div class="meter" role="img" :aria-label="`${Math.round(relativeToBest * 100)}% of the best possible position`">
        <div class="meter-track"><div class="meter-fill" :style="{ width: `${Math.min(100, relativeToBest * 100)}%` }"></div></div>
        <div class="meter-label">
          <span><strong>{{ Math.round(relativeToBest * 100) }}%</strong> of the best possible position</span>
          <span v-if="offBest" class="muted">{{ offBest }}</span>
        </div>
      </div>

      <div class="data-row">
        <span class="label">Best fixed position here</span>
        <span class="value">{{ optimum.tilt }}° tilt<template v-if="optimum.tilt > 3"> · {{ formatBearing(optimum.azimuth) }}</template></span>
      </div>
      <div class="data-row">
        <span class="label">Lost to shading</span>
        <span class="value">{{ result.shadingLoss >= 0.005 ? `${(result.shadingLoss * 100).toFixed(0)}%` : 'none' }}</span>
      </div>
      <div class="data-row">
        <span class="label">Leanest month</span>
        <span class="value">{{ extremes.low.name }} · {{ extremes.low.perDay.toFixed(1) }} kWh/day</span>
      </div>

      <div class="section-title spaced">Production by month · kWh</div>
      <div
        class="month-chart"
        role="img"
        :aria-label="`Monthly production in kWh: ${months.map(m => `${m.name} ${format(m.kwh)}`).join(', ')}`"
        @pointerleave="hovered = null"
      >
        <div
          v-for="m in months"
          :key="m.month"
          :class="['month-column', { active: m.month === highlighted }]"
          @pointerenter="hovered = m.month"
          @click="hovered = m.month"
        >
          <span class="column-value">{{ m.month === highlighted ? format(m.kwh) : '' }}</span>
          <span class="column-track"><span class="column-bar" :style="{ height: m.height }"></span></span>
          <span class="column-label">{{ m.name[0] }}</span>
        </div>
      </div>
      <p class="chart-caption">
        {{ months[highlighted].name }}: {{ format(months[highlighted].kwh) }} kWh
        ({{ months[highlighted].perDay.toFixed(1) }} kWh per day)
      </p>

      <p v-if="isFlatRoof" class="hint warn">
        <i class="bi bi-lightbulb"></i>
        A flat roof: panels are normally propped up on frames. Choose Custom to try a tilt (about {{ optimum.tilt }}° is best here; 10–15° packs more panels in).
      </p>
      <p v-else-if="facesAway" class="hint warn">
        <i class="bi bi-lightbulb"></i>
        This roof plane faces away from the sun's main path. Try the other side of the roof, or turn the house.
      </p>
      <p class="hint subtle">
        {{ sourceNote }} Assumes standard crystalline panels with 14% system losses; shade from the objects and terrain in the Shading tab is included.
      </p>
    </div>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.field > span:first-child {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.field small {
  font-size: 11px;
  color: var(--text-tertiary);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  margin-top: 12px;
}

.field-grid .number-field {
  width: 78px;
}

.segmented {
  display: flex;
  margin-top: 12px;
  padding: 3px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.segmented button {
  flex: 1;
  padding: 6px 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 7px;
  transition: all var(--transition-fast);
}

.segmented button.active {
  color: var(--text-primary);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
}

.plane-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.headline {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.headline-main {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.headline-value {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.headline-unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.headline-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 11px;
  color: var(--text-secondary);
}

.headline-side strong {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}

.meter {
  margin: 14px 0 8px;
}

.meter-track {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  background: var(--chart-bar);
  border-radius: var(--radius-full);
}

.meter-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-secondary);
}

.meter-label strong {
  color: var(--text-primary);
}

.muted {
  color: var(--text-tertiary);
  text-align: right;
}

.section-title.spaced {
  margin-top: 16px;
}

.month-chart {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
}

.month-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: default;
}

.column-value {
  height: 14px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.column-track {
  position: relative;
  width: 100%;
  height: 84px;
  border-bottom: 1px solid var(--chart-axis);
}

.column-bar {
  position: absolute;
  left: 22%;
  right: 22%;
  bottom: 0;
  min-height: 2px;
  background: var(--chart-bar);
  border-radius: 4px 4px 0 0;
  opacity: 0.55;
  transition: opacity var(--transition-fast);
}

.month-column.active .column-bar {
  opacity: 1;
}

.column-label {
  font-size: 10px;
  color: var(--text-tertiary);
}

.month-column.active .column-label {
  color: var(--text-primary);
  font-weight: 600;
}

.chart-caption {
  margin: 6px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

.hint {
  display: flex;
  gap: 6px;
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.hint.subtle {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
}

.hint.warn {
  color: var(--sun-orange);
}

.hint i {
  margin-top: 2px;
}
</style>
