<script setup>
import { computed } from 'vue';
import ToggleSwitch from './ToggleSwitch.vue';
import NumberField from './NumberField.vue';
import {
  bearingDifference, sampleByBearing, solarPosition, profileAngle, overhangMonthlyShading,
  overhangDepthForFullShade, overhangDepthForNoShade, overhangShadeFraction, houseGeometry, MONTH_NAMES
} from '../lib/solar';
import { summarizeSunlight, formatDuration, formatSunPeriods } from '../lib/analysis';
import { trueToMagnetic } from '../lib/geo';
import { formatLength } from '../lib/units';
import { formatBearing } from '../lib/utils';
import { formatZonedTime } from '../lib/time';

const props = defineProps({
  settings: { type: Object, required: true },
  latitude: { type: Number, required: true },
  timeZone: { type: String, required: true },
  houseOrientation: { type: Number, required: true },
  optimalOrientation: { type: Number, required: true },
  // From scoreOrientations()
  scores: { type: Object, required: true },
  // { source, period }
  climate: { type: Object, required: true },
  climateLoading: { type: Boolean, default: false },
  // houseFacades() with a `horizon` each
  facades: { type: Array, required: true },
  // { winter, equinox, summer, selected }: days from sampleSolarDay()
  days: { type: Object, required: true },
  // Magnetic declination in degrees, or null
  declination: { type: Number, default: null },
  hasObstructions: { type: Boolean, default: false }
});

const emit = defineEmits(['update-settings']);

const update = (patch) => emit('update-settings', patch);
const units = computed(() => props.settings.units);
const isNorth = computed(() => props.latitude >= 0);
const equatorBearing = computed(() => (isNorth.value ? 180 : 0));
const equatorName = computed(() => (isNorth.value ? 'south' : 'north'));
const isTropical = computed(() => Math.abs(props.latitude) < 23.44);

/* ------------------------------------------------------------------------ */
/* House                                                                    */
/* ------------------------------------------------------------------------ */

const house = computed(() => ({
  width: props.settings.houseWidth,
  depth: props.settings.houseDepth,
  wallHeight: props.settings.houseWallHeight,
  roofPitch: props.settings.houseRoofPitch
}));

const ridgeHeight = computed(() => houseGeometry(house.value, 0).ridgeHeight);

const houseSummary = computed(() => {
  const area = house.value.width * house.value.depth;
  const areaLabel = units.value === 'imperial'
    ? `${Math.round(area * 10.7639).toLocaleString()} sq ft`
    : `${Math.round(area)} m²`;
  const roof = house.value.roofPitch > 0
    ? `ridge at ${formatLength(ridgeHeight.value, units.value)}`
    : 'flat roof';
  return `${areaLabel} footprint · ${roof}`;
});

/* ------------------------------------------------------------------------ */
/* Orientation                                                              */
/* ------------------------------------------------------------------------ */

const magneticLabel = computed(() => {
  if (props.declination === null || Math.abs(props.declination) < 0.5) return null;
  return `${Math.round(trueToMagnetic(props.houseOrientation, props.declination)) % 360}°`;
});

const at = (series, bearing) => sampleByBearing(props.scores.bearings, series, bearing);

const hasHeating = computed(() => props.scores.heatingMonths.length > 0);
const hasCooling = computed(() => props.scores.coolingMonths.length > 0);

const scoreRange = computed(() => {
  const max = Math.max(...props.scores.score);
  const min = Math.min(...props.scores.score);
  return { min, max, span: max - min };
});

// 0 = as good as the best orientation, 1 = as bad as the worst
const lossAt = (bearing) =>
  scoreRange.value.span > 0 ? (scoreRange.value.max - at(props.scores.score, bearing)) / scoreRange.value.span : 0;

const verdict = computed(() => {
  const loss = lossAt(props.houseOrientation);
  const off = bearingDifference(props.houseOrientation, props.optimalOrientation);

  const usefulBest = at(props.scores.useful, props.optimalOrientation);
  const unwantedBest = at(props.scores.unwanted, props.optimalOrientation);
  const useful = usefulBest > 0 ? at(props.scores.useful, props.houseOrientation) / usefulBest : null;
  const unwanted = unwantedBest > 0 ? at(props.scores.unwanted, props.houseOrientation) / unwantedBest - 1 : null;

  let rating;
  if (loss <= 0.04) rating = { key: 'excellent', label: 'Excellent', icon: 'bi-check-circle-fill' };
  else if (loss <= 0.15) rating = { key: 'good', label: 'Good', icon: 'bi-check-circle' };
  else if (loss <= 0.45) rating = { key: 'fair', label: 'Compromise', icon: 'bi-exclamation-circle' };
  else rating = { key: 'poor', label: 'Poor', icon: 'bi-x-circle' };

  const offRounded = Math.round(Math.abs(off));
  // Turning clockwise from south goes west; from north it goes east
  const side = off > 0 === isNorth.value ? 'west' : 'east';
  const offLabel = offRounded < 2
    ? 'On the best direction'
    : `${offRounded}° ${offRounded > 150 ? 'away from' : `${side} of`} the best direction`;

  return { rating, useful, unwanted, offLabel };
});

function formatChange(fraction) {
  const percent = Math.round(fraction * 100);
  if (percent === 0) return 'same as the best';
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}% vs the best`;
}

// Coloured strip above the slider: where the good orientations are
const qualityStrip = computed(() => {
  const stops = props.scores.bearings.map((bearing) => {
    const loss = lossAt(bearing);
    // Green (best) through amber to red (worst)
    const hue = 140 - 140 * Math.min(1, loss * 1.15);
    return `hsl(${hue.toFixed(0)} 70% 48%) ${((bearing / 360) * 100).toFixed(2)}%`;
  });
  stops.push(`${stops[0].split(' ').slice(0, 3).join(' ')} 100%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
});

const markerLeft = (bearing) => `${((((bearing % 360) + 360) % 360) / 360) * 100}%`;

const climateAdvice = computed(() => {
  const heating = props.scores.heatingMonths.length;
  const cooling = props.scores.coolingMonths.length;
  const best = formatBearing(props.optimalOrientation);

  if (heating && !cooling) {
    return `Heating matters ${heating} months a year here and overheating is rare: point the day side at the low winter sun (${best}). Turning up to about 20° either way costs only a few percent.`;
  }
  if (heating && cooling) {
    return `Winters need heating (${heating} months) and summers get hot (${cooling} months): face the day side ${best} and shade its windows in summer. Turning towards the west adds hot afternoon sun.`;
  }
  if (cooling) {
    return `No real heating season here: the goal is to keep the sun out. Face the main glazing ${best}, where a roof overhang shades the high sun, and keep the east and west walls short and well shaded.`;
  }
  return `Mild all year: face the day side ${best} for daylight and winter sun.`;
});

const climateSource = computed(() => {
  if (props.climateLoading) return 'Loading local climate…';
  if (props.climate.source === 'nasa-power') {
    return `Local climate: NASA POWER monthly normals${props.climate.period ? ` (${props.climate.period})` : ''}.`;
  }
  return 'Local climate unavailable: using a typical climate for this latitude.';
});

/* ------------------------------------------------------------------------ */
/* Sun on each side                                                         */
/* ------------------------------------------------------------------------ */

function facadeRole(bearing) {
  const fromEquator = Math.abs(bearingDifference(bearing, equatorBearing.value));
  if (fromEquator <= 45) return 'equator';
  if (fromEquator >= 135) return 'polar';
  return bearing > 0 && bearing < 180 ? 'east' : 'west';
}

const ROOM_HINTS = {
  equator: 'Living, dining, main bedrooms: low winter sun reaches deep inside, and an overhang shades it in summer.',
  east: 'Kitchen, breakfast area, bedrooms: bright mornings, cool afternoons.',
  west: 'Evening terrace or living room. Keep windows small or shade them outside: low, hot afternoon sun slips under any overhang.',
  polar: 'Garage, utility, bathrooms, stairs, storage. Also a studio or office: even light with no glare.'
};

const TROPICAL_HINTS = {
  equator: 'Main rooms: the sun stays high on this side and a roof overhang shades it.',
  polar: 'Main rooms: the sun stays high on this side and a roof overhang shades it.',
  east: 'Keep this wall short: low morning sun. Good for bathrooms, storage, a shaded veranda.',
  west: 'Keep this wall short and shaded: low, hot afternoon sun. Garage, storage, service rooms.'
};

// Where overheating isn't a concern, the evening sun on the west side is simply welcome
const COOL_WEST_HINT = 'Evening living room or terrace: catches the last of the sun. It comes in low, so plan for blinds against glare.';

function roomHint(role) {
  if (isTropical.value) return TROPICAL_HINTS[role];
  if (role === 'west' && !hasCooling.value) return COOL_WEST_HINT;
  return ROOM_HINTS[role];
}

const FACADE_TITLES = { day: 'Day side', night: 'Night side', sideA: 'End wall', sideB: 'End wall' };

const facadeRows = computed(() =>
  props.facades.map((facade) => {
    const role = facadeRole(facade.bearing);
    const cell = (day) => {
      const summary = summarizeSunlight(day, { facadeAzimuth: facade.bearing, horizon: facade.horizon });
      return {
        label: formatDuration(summary.sunMinutes),
        shaded: summary.blockedMinutes >= 10 ? formatDuration(summary.blockedMinutes) : null,
        none: summary.sunMinutes === 0
      };
    };
    const today = summarizeSunlight(props.days.selected, { facadeAzimuth: facade.bearing, horizon: facade.horizon });

    return {
      key: facade.key,
      title: FACADE_TITLES[facade.key],
      bearing: formatBearing(facade.bearing),
      hint: roomHint(role),
      winter: cell(props.days.winter),
      equinox: cell(props.days.equinox),
      summer: cell(props.days.summer),
      today: formatSunPeriods(today.periods, (date) => formatZonedTime(date, props.timeZone))
    };
  })
);

/* ------------------------------------------------------------------------ */
/* Window overhang                                                          */
/* ------------------------------------------------------------------------ */

const overhang = computed(() => ({
  depth: props.settings.overhangDepth,
  gap: props.settings.overhangGap,
  windowHeight: props.settings.windowHeight
}));

const overhangFacade = computed(() =>
  props.facades.find(f => f.key === props.settings.overhangFacade) || props.facades[0]
);

const overhangRole = computed(() => facadeRole(overhangFacade.value.bearing));

const overhangMonths = computed(() =>
  overhangMonthlyShading(props.latitude, overhangFacade.value.bearing, overhang.value).map(m => ({
    ...m,
    name: MONTH_NAMES[m.month],
    percent: m.blocked === null ? null : Math.round(m.blocked * 100)
  }))
);

// Noon on the two solstices, seen in a section through this wall
const solsticeProfiles = computed(() => {
  const summerDeclination = isNorth.value ? 23.44 : -23.44;
  const profile = (declination) => profileAngle(solarPosition(props.latitude, declination, 0), overhangFacade.value.bearing);
  return { summer: profile(summerDeclination), winter: profile(-summerDeclination) };
});

const overhangAdvice = computed(() => {
  const { summer, winter } = solsticeProfiles.value;
  const lines = [];

  if (summer !== null) {
    const depth = overhangDepthForFullShade(overhang.value, summer);
    const shade = Math.round(overhangShadeFraction(overhang.value, summer) * 100);
    lines.push({
      icon: 'bi-brightness-high',
      text: `Midsummer noon: ${shade}% of the window shaded. Full shade needs ${formatLength(depth, units.value, 2)}.`
    });
  }
  if (winter !== null) {
    const depth = overhangDepthForNoShade(overhang.value, winter);
    const shade = Math.round(overhangShadeFraction(overhang.value, winter) * 100);
    lines.push({
      icon: 'bi-snow',
      text: shade === 0
        ? `Midwinter noon: full sun on the window (stays that way up to ${formatLength(depth, units.value, 2)}).`
        : `Midwinter noon: ${shade}% of the window shaded. Full sun needs it under ${formatLength(depth, units.value, 2)}.`
    });
  }
  if (overhangRole.value === 'east' || overhangRole.value === 'west') {
    lines.push({
      icon: 'bi-exclamation-triangle',
      text: `${overhangRole.value === 'east' ? 'Morning' : 'Afternoon'} sun is low on this side and gets under an overhang. Use external blinds, shutters, vertical fins or planting instead.`
    });
  }
  if (!lines.length) {
    lines.push({ icon: 'bi-info-circle', text: 'This side gets no direct sun at noon on the solstices.' });
  }
  return lines;
});

// Section drawing: wall on the left, overhang sticking out to the right
const sectionDrawing = computed(() => {
  const { depth, gap, windowHeight } = overhang.value;
  const height = gap + windowHeight + 0.5;
  const reach = Math.max(depth, 0.6) + 0.5;
  const scale = Math.min(150 / height, 150 / reach);
  const wallX = 84;
  const topY = 18;
  const y = (meters) => topY + meters * scale;

  const ray = (profile) => {
    if (profile === null) return null;
    // From the overhang's edge down to where its shadow line meets the wall
    const drop = depth * Math.tan((profile * Math.PI) / 180);
    const hit = Math.min(drop, height);
    const tipX = wallX + depth * scale;
    // Extend the ray up and away from the wall, towards the sun
    const back = 0.45;
    return {
      x1: tipX + back * scale,
      y1: y(0) - back * scale * Math.tan((profile * Math.PI) / 180),
      x2: wallX + (drop > height ? depth * (1 - hit / drop) * scale : 0),
      y2: y(hit),
      shadeTo: y(Math.min(Math.max(hit, gap), gap + windowHeight)),
      shaded: hit > gap
    };
  };

  return {
    width: 250,
    height: topY + height * scale + 14,
    wallX,
    wallTop: y(-0.15),
    wallBottom: y(height),
    overhangY: y(0),
    overhangX2: wallX + depth * scale,
    windowTop: y(gap),
    windowBottom: y(gap + windowHeight),
    summer: ray(solsticeProfiles.value.summer),
    winter: ray(solsticeProfiles.value.winter)
  };
});

const facadeOptions = computed(() =>
  props.facades.map(f => ({ key: f.key, label: `${FACADE_TITLES[f.key]} · ${formatBearing(f.bearing)}` }))
);
</script>

<template>
  <!-- House -->
  <div class="solset-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-house"></i>House</h2>
      <div class="header-toggle">
        <span class="kbd hide-on-touch">H</span>
        <ToggleSwitch
          :model-value="settings.showHouse"
          @update:model-value="update({ showHouse: $event })"
          label="Show the house on the map"
        />
      </div>
    </div>
    <div class="solset-card-body">
      <div class="field-grid">
        <label class="field" for="house-width">
          <span>Width <small>day side</small></span>
          <NumberField
            id="house-width" length :units="units" :min="2" :max="100" :step="0.5"
            :model-value="settings.houseWidth" @update:model-value="update({ houseWidth: $event })"
          />
        </label>
        <label class="field" for="house-depth">
          <span>Depth</span>
          <NumberField
            id="house-depth" length :units="units" :min="2" :max="100" :step="0.5"
            :model-value="settings.houseDepth" @update:model-value="update({ houseDepth: $event })"
          />
        </label>
        <label class="field" for="house-wall">
          <span>Wall height <small>to eaves</small></span>
          <NumberField
            id="house-wall" length :units="units" :min="2" :max="60" :step="0.1"
            :model-value="settings.houseWallHeight" @update:model-value="update({ houseWallHeight: $event })"
          />
        </label>
        <label class="field" for="house-pitch">
          <span>Roof pitch <small>0 = flat</small></span>
          <NumberField
            id="house-pitch" suffix="°" :min="0" :max="60" :step="1"
            :model-value="settings.houseRoofPitch" @update:model-value="update({ houseRoofPitch: $event })"
          />
        </label>
      </div>
      <p class="hint">{{ houseSummary }}. Drawn to scale on the map with its real shadow: zoom in and drag the map to place it on your plot.</p>
      <p v-if="settings.houseDepth > settings.houseWidth" class="hint warn">
        <i class="bi bi-lightbulb"></i>
        The short side is facing the sun. Making the day side the long one puts more rooms in the light.
      </p>
    </div>
  </div>

  <!-- Orientation -->
  <div class="solset-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-compass"></i>Orientation</h2>
      <div class="header-toggle">
        <span class="toggle-caption">Auto</span>
        <ToggleSwitch
          :model-value="settings.autoOrientHouse"
          @update:model-value="update({ autoOrientHouse: $event })"
          label="Use the best orientation automatically"
        />
      </div>
    </div>
    <div class="solset-card-body">
      <div class="orientation-display">
        <span class="text-muted">Day side faces</span>
        <span>
          <span class="solset-badge solset-badge-gold">{{ formatBearing(houseOrientation) }}</span>
          <span v-if="magneticLabel" class="magnetic" title="What a magnetic compass reads here">{{ magneticLabel }} on a compass</span>
        </span>
      </div>

      <div class="orientation-control">
        <div class="quality-strip" :style="{ background: qualityStrip }" aria-hidden="true">
          <span class="strip-marker best" :style="{ left: markerLeft(optimalOrientation) }" title="Best orientation"></span>
          <span class="strip-marker current" :style="{ left: markerLeft(houseOrientation) }"></span>
        </div>
        <input
          type="range"
          class="solset-slider orientation-slider"
          min="0"
          max="359"
          step="1"
          :value="Math.round(houseOrientation) % 360"
          @input="update({ houseOrientation: Number($event.target.value), autoOrientHouse: false })"
          aria-label="Direction the day side faces, in degrees from true north"
          :aria-valuetext="formatBearing(houseOrientation)"
        />
        <div class="orientation-markers">
          <span>N</span><span>E</span><span>S</span><span>W</span><span>N</span>
        </div>
      </div>

      <div :class="['verdict', verdict.rating.key]">
        <div class="verdict-head">
          <i :class="['bi', verdict.rating.icon]"></i>
          <strong>{{ verdict.rating.label }}</strong>
          <span>{{ verdict.offLabel }}</span>
        </div>
        <div v-if="hasHeating && verdict.useful !== null" class="verdict-row">
          <span>Useful winter sun through the windows</span>
          <span class="mono">{{ Math.round(verdict.useful * 100) }}% of the best</span>
        </div>
        <div v-if="hasCooling && verdict.unwanted !== null" class="verdict-row">
          <span>Unwanted hot-weather sun</span>
          <span class="mono">{{ formatChange(verdict.unwanted) }}</span>
        </div>
      </div>

      <button
        v-if="!settings.autoOrientHouse && Math.abs(bearingDifference(houseOrientation, optimalOrientation)) >= 1"
        type="button"
        class="solset-btn solset-btn-secondary btn-block"
        @click="update({ houseOrientation: Math.round(optimalOrientation) })"
      >
        <i class="bi bi-magic"></i>
        Turn to the best direction ({{ formatBearing(optimalOrientation) }})
      </button>

      <p class="hint">{{ climateAdvice }}</p>
      <p class="hint subtle">
        {{ climateSource }}
        Compares the sun reaching the windows through the year, assuming most glazing on the day side under a typical eave<template v-if="hasObstructions">, and counting the shade from surroundings</template>.
        Bearings are from true north.
      </p>
    </div>
  </div>

  <!-- Sun on each side -->
  <div class="solset-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-layout-three-columns"></i>Sun on each side</h2>
    </div>
    <div class="solset-card-body">
      <table class="facade-table">
        <thead>
          <tr>
            <th scope="col">Direct sun per day</th>
            <th scope="col"><i class="bi bi-snow" title="Winter solstice"></i><span class="sr-only">Winter solstice</span></th>
            <th scope="col"><i class="bi bi-flower1" title="Equinox"></i><span class="sr-only">Equinox</span></th>
            <th scope="col"><i class="bi bi-brightness-high" title="Summer solstice"></i><span class="sr-only">Summer solstice</span></th>
          </tr>
        </thead>
        <tbody v-for="row in facadeRows" :key="row.key">
          <tr class="facade-row">
            <th scope="row">
              <span class="facade-name">{{ row.title }}</span>
              <span class="facade-bearing">{{ row.bearing }}</span>
            </th>
            <td v-for="cell in [row.winter, row.equinox, row.summer]" :key="cell.label + cell.shaded" :class="{ none: cell.none }">
              {{ cell.label }}
              <span v-if="cell.shaded" class="shaded" :title="`${cell.shaded} lost to surroundings`">−{{ cell.shaded }}</span>
            </td>
          </tr>
          <tr class="facade-hint">
            <td colspan="4">
              <span class="today"><i class="bi bi-clock"></i>Selected day: {{ row.today }}</span>
              {{ row.hint }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="hint subtle">
        Hours the sun shines on each wall at window height on a clear day<template v-if="hasObstructions">; the grey figures are hours lost to surrounding objects and terrain</template>.
      </p>
    </div>
  </div>

  <!-- Window overhang -->
  <div class="solset-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-border-top"></i>Window overhang</h2>
    </div>
    <div class="solset-card-body">
      <label class="field wide" for="overhang-facade">
        <span>Wall</span>
        <select
          id="overhang-facade"
          class="solset-input select"
          :value="settings.overhangFacade"
          @change="update({ overhangFacade: $event.target.value })"
        >
          <option v-for="option in facadeOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
        </select>
      </label>

      <div class="field-grid three">
        <label class="field stacked" for="overhang-depth">
          <span>Overhang</span>
          <NumberField
            id="overhang-depth" length :units="units" :min="0" :max="5" :step="0.05"
            :model-value="settings.overhangDepth" @update:model-value="update({ overhangDepth: $event })"
          />
        </label>
        <label class="field stacked" for="overhang-gap">
          <span>Above window</span>
          <NumberField
            id="overhang-gap" length :units="units" :min="0" :max="3" :step="0.05"
            :model-value="settings.overhangGap" @update:model-value="update({ overhangGap: $event })"
          />
        </label>
        <label class="field stacked" for="window-height">
          <span>Window height</span>
          <NumberField
            id="window-height" length :units="units" :min="0.3" :max="6" :step="0.05"
            :model-value="settings.windowHeight" @update:model-value="update({ windowHeight: $event })"
          />
        </label>
      </div>

      <svg
        class="section-drawing"
        :viewBox="`0 0 ${sectionDrawing.width} ${sectionDrawing.height}`"
        role="img"
        aria-label="Section through the wall showing the overhang's shadow at noon in midsummer and midwinter"
      >
        <rect
          v-if="sectionDrawing.summer?.shaded"
          class="shade-band"
          :x="sectionDrawing.wallX - 5" :y="sectionDrawing.windowTop"
          width="10" :height="sectionDrawing.summer.shadeTo - sectionDrawing.windowTop"
        />
        <line class="wall" :x1="sectionDrawing.wallX" :y1="sectionDrawing.wallTop" :x2="sectionDrawing.wallX" :y2="sectionDrawing.wallBottom" />
        <line class="window" :x1="sectionDrawing.wallX" :y1="sectionDrawing.windowTop" :x2="sectionDrawing.wallX" :y2="sectionDrawing.windowBottom" />
        <line class="overhang" :x1="sectionDrawing.wallX - 4" :y1="sectionDrawing.overhangY" :x2="sectionDrawing.overhangX2" :y2="sectionDrawing.overhangY" />
        <template v-for="season in ['summer', 'winter']" :key="season">
          <line
            v-if="sectionDrawing[season]"
            :class="['ray', season]"
            :x1="sectionDrawing[season].x1" :y1="sectionDrawing[season].y1"
            :x2="sectionDrawing[season].x2" :y2="sectionDrawing[season].y2"
          />
        </template>
        <text class="section-label summer" :x="sectionDrawing.width - 4" y="14" text-anchor="end">Midsummer noon</text>
        <text class="section-label winter" :x="sectionDrawing.width - 4" y="30" text-anchor="end">Midwinter noon</text>
        <text class="section-label muted" :x="sectionDrawing.wallX - 12" :y="(sectionDrawing.windowTop + sectionDrawing.windowBottom) / 2 + 4" text-anchor="end">window</text>
        <text class="section-label muted" :x="sectionDrawing.wallX - 12" :y="sectionDrawing.wallTop + 8" text-anchor="end">inside</text>
      </svg>

      <ul class="advice">
        <li v-for="line in overhangAdvice" :key="line.text"><i :class="['bi', line.icon]"></i>{{ line.text }}</li>
      </ul>

      <div class="section-title spaced">Direct sun blocked, month by month</div>
      <div class="month-bars" role="img" :aria-label="`Share of direct sun on the window blocked by the overhang: ${overhangMonths.map(m => `${m.name} ${m.percent === null ? 'no sun' : m.percent + '%'}`).join(', ')}`">
        <div v-for="m in overhangMonths" :key="m.month" class="month-bar" :title="m.percent === null ? `${m.name}: no direct sun on this wall` : `${m.name}: ${m.percent}% blocked`">
          <span class="bar-value">{{ m.percent === null ? '·' : m.percent }}</span>
          <span class="bar-track"><span class="bar-fill" :style="{ height: `${m.percent ?? 0}%` }"></span></span>
          <span class="bar-label">{{ m.name[0] }}</span>
        </div>
      </div>
      <p class="hint subtle">Percent of the clear-day direct sun on the window that the overhang stops. Aim high in the hot months and low in the cold ones.</p>
    </div>
  </div>
</template>

<style scoped>
.header-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-caption {
  font-size: 12px;
  color: var(--text-secondary);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}

.field-grid.three {
  grid-template-columns: repeat(3, 1fr);
  margin-top: 10px;
}

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

.field .number-field {
  width: 84px;
}

.field.stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field.stacked .number-field {
  width: 100%;
}

.field.wide .select {
  width: auto;
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 13px;
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.hint.subtle {
  color: var(--text-tertiary);
  font-size: 11px;
}

.hint.warn {
  display: flex;
  gap: 6px;
  color: var(--sun-orange);
}

.orientation-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.magnetic {
  margin-left: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.orientation-control {
  padding: 12px 0 0;
}

.quality-strip {
  position: relative;
  height: 8px;
  margin: 0 10px 8px;
  border-radius: var(--radius-full);
}

.strip-marker {
  position: absolute;
  top: -4px;
  width: 2px;
  height: 16px;
  margin-left: -1px;
  background: var(--text-primary);
  border-radius: 1px;
}

.strip-marker.best {
  width: 10px;
  height: 10px;
  top: -1px;
  margin-left: -5px;
  background: #fff;
  border: 2px solid #15803d;
  border-radius: 50%;
}

.orientation-slider {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
}

.orientation-markers {
  display: flex;
  justify-content: space-between;
  padding: 4px 6px 0;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-tertiary);
}

.verdict {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border-left: 4px solid var(--success);
  background: var(--bg-tertiary);
  font-size: 12px;
}

.verdict.good { border-left-color: #84cc16; }
.verdict.fair { border-left-color: var(--warning); }
.verdict.poor { border-left-color: var(--error); }

.verdict-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-primary);
}

.verdict-head span {
  color: var(--text-secondary);
  font-size: 12px;
}

.verdict.excellent .verdict-head i { color: var(--success); }
.verdict.good .verdict-head i { color: #65a30d; }
.verdict.fair .verdict-head i { color: var(--warning); }
.verdict.poor .verdict-head i { color: var(--error); }

.verdict-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  color: var(--text-secondary);
}

.verdict-row .mono {
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
}

.btn-block {
  width: 100%;
  margin-top: 10px;
  font-size: 12px;
}

.facade-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.facade-table thead th {
  padding: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  text-align: right;
}

.facade-table thead th:first-child {
  text-align: left;
}

.facade-table thead i {
  font-size: 14px;
}

.facade-row th {
  padding: 8px 0 2px;
  text-align: left;
  font-weight: 400;
  border-top: 1px solid var(--border-color);
}

.facade-row td {
  padding: 8px 0 2px;
  text-align: right;
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--text-primary);
  border-top: 1px solid var(--border-color);
  white-space: nowrap;
  vertical-align: top;
}

.facade-row td.none {
  color: var(--text-tertiary);
  font-weight: 400;
}

.facade-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.facade-bearing {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}

.shaded {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.facade-hint td {
  padding: 2px 0 8px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.today {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.section-drawing {
  display: block;
  width: 100%;
  max-width: 280px;
  margin: 14px auto 4px;
}

.section-drawing .wall {
  stroke: var(--text-primary);
  stroke-width: 3;
}

.section-drawing .window {
  stroke: var(--sky-blue);
  stroke-width: 5;
}

.section-drawing .overhang {
  stroke: var(--text-primary);
  stroke-width: 4;
  stroke-linecap: round;
}

.section-drawing .shade-band {
  fill: rgba(15, 23, 42, 0.45);
}

[data-theme="dark"] .section-drawing .shade-band {
  fill: rgba(0, 0, 0, 0.6);
}

.ray {
  stroke-width: 1.5;
  stroke-dasharray: 5 3;
}

.ray.summer { stroke: var(--sun-orange); }
.ray.winter { stroke: var(--info); }

.section-label {
  font-size: 10px;
  font-family: var(--font-display);
}

.section-label.summer { fill: var(--sun-orange); }
.section-label.winter { fill: var(--info); }
.section-label.muted { fill: var(--text-tertiary); }

.advice {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.advice li {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.advice i {
  margin-top: 1px;
  color: var(--text-tertiary);
}

.section-title.spaced {
  margin-top: 16px;
}

.month-bars {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 4px;
}

.month-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.bar-value {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-tertiary);
}

.bar-track {
  position: relative;
  width: 100%;
  height: 56px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: #64748b;
}

[data-theme="dark"] .bar-fill {
  background: #94a3b8;
}

.bar-label {
  font-size: 10px;
  color: var(--text-tertiary);
}
</style>
