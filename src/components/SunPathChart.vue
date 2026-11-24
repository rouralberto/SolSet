<script setup>
import { ref, computed } from 'vue';
import { getPosition } from 'suncalc';
import { sampleSolarDay } from '../lib/analysis';
import { bearingDifference, horizonAt, hasObstructions, normalizeBearing, compassPoint, shadowLengthFactor } from '../lib/solar';
import { zonedTimeToDate, formatZonedTime, formatDisplayDate, isValidDate } from '../lib/time';
import { formatBearing } from '../lib/utils';
import { formatDuration } from '../lib/analysis';

/**
 * Sun-path chart: the sun's height against its compass direction, as seen when
 * facing the equator. Shows the solstices, the equinox and the selected day,
 * with the surrounding horizon (terrain, buildings, trees) drawn over it.
 */
const props = defineProps({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  timeZone: { type: String, required: true },
  localDate: { type: String, required: true },
  // From getKeyDates()
  keyDates: { type: Array, required: true },
  // Current sun as { azimuth, altitude } in degrees from north
  sun: { type: Object, required: true },
  horizon: { type: Object, default: null },
  houseOrientation: { type: Number, default: null },
  // Larger rendering for the printed report
  large: { type: Boolean, default: false }
});

const WIDTH = 360;
const HEIGHT = 236;
const PLOT = { left: 30, right: 352, top: 12, bottom: 196 };

const centerBearing = computed(() => (props.latitude >= 0 ? 180 : 0));
const relative = (bearing) => bearingDifference(bearing, centerBearing.value);
const noonOf = (dateString) => zonedTimeToDate(dateString, 720, props.timeZone);

function describeDay(key, label, dateString, color) {
  const day = sampleSolarDay(noonOf(dateString), props.latitude, props.longitude, 10);
  const noon = getPosition(day.times.solarNoon, props.latitude, props.longitude);
  const rise = isValidDate(day.times.sunrise) ? getPosition(day.times.sunrise, props.latitude, props.longitude) : null;
  const set = isValidDate(day.times.sunset) ? getPosition(day.times.sunset, props.latitude, props.longitude) : null;
  return {
    key,
    label,
    dateString,
    color,
    samples: day.samples,
    noonAltitude: noon.altitude,
    noonBearing: noon.azimuth,
    sunrise: rise ? { time: formatZonedTime(day.times.sunrise, props.timeZone), bearing: rise.azimuth } : null,
    sunset: set ? { time: formatZonedTime(day.times.sunset, props.timeZone), bearing: set.azimuth } : null,
    daylight: rise && set ? (day.times.sunset - day.times.sunrise) / 60000 : (day.times.alwaysUp ? 1440 : 0),
    solarNoon: formatZonedTime(day.times.solarNoon, props.timeZone)
  };
}

const referenceDays = computed(() => {
  const find = (key) => props.keyDates.find(k => k.key === key);
  const short = (dateString) => formatDisplayDate(dateString, { month: 'short', day: 'numeric' });
  return [
    describeDay('winter', `Winter solstice · ${short(find('winter').dateString)}`, find('winter').dateString, 'var(--series-winter)'),
    describeDay('summer', `Summer solstice · ${short(find('summer').dateString)}`, find('summer').dateString, 'var(--series-summer)'),
    describeDay('equinox', `Equinox · ${short(find('spring').dateString)}`, find('spring').dateString, 'var(--series-equinox)')
  ];
});

const selectedDay = computed(() =>
  describeDay('selected', `Selected day · ${formatDisplayDate(props.localDate, { month: 'short', day: 'numeric' })}`, props.localDate, 'var(--series-selected)')
);

const isKeyDateSelected = computed(() => props.keyDates.some(k => k.dateString === props.localDate));
const allDays = computed(() => [...referenceDays.value, selectedDay.value]);

// Horizontal extent: wide enough for the widest sun path, in steps of 30°
const xMax = computed(() => {
  let widest = 90;
  for (const day of allDays.value) {
    for (const sample of day.samples) widest = Math.max(widest, Math.abs(relative(sample.azimuth)));
  }
  return Math.min(180, Math.ceil((widest + 4) / 30) * 30);
});

const xScale = (relativeBearing) =>
  PLOT.left + ((relativeBearing + xMax.value) / (2 * xMax.value)) * (PLOT.right - PLOT.left);
const yScale = (altitude) => PLOT.bottom - (Math.max(0, Math.min(90, altitude)) / 90) * (PLOT.bottom - PLOT.top);

/** Polyline segments, broken where the path wraps around the edge of the chart */
function toSegments(samples) {
  const segments = [];
  let current = [];
  let previous = null;
  for (const sample of samples) {
    const x = relative(sample.azimuth);
    if (previous !== null && Math.abs(x - previous) > 180) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
    }
    current.push(`${xScale(x).toFixed(1)},${yScale(sample.altitude).toFixed(1)}`);
    previous = x;
  }
  if (current.length > 1) segments.push(current.join(' '));
  return segments;
}

const curves = computed(() =>
  allDays.value
    .filter(day => day.key !== 'selected' || !isKeyDateSelected.value)
    .map(day => {
      const peak = day.samples.reduce((best, s) => (best && best.altitude >= s.altitude ? best : s), null);
      return {
        ...day,
        segments: toSegments(day.samples),
        peak: peak ? { x: xScale(relative(peak.azimuth)), y: yScale(peak.altitude), altitude: peak.altitude } : null
      };
    })
);

// Direct labels at each curve's highest point, dropped where they would collide
const curveLabels = computed(() => {
  const placed = [];
  const labels = [];
  const order = ['summer', 'winter', 'equinox', 'selected'];
  for (const key of order) {
    const curve = curves.value.find(c => c.key === key);
    if (!curve?.peak) continue;
    const y = Math.max(PLOT.top + 9, curve.peak.y - 6);
    if (placed.some(other => Math.abs(other - y) < 12)) continue;
    placed.push(y);
    labels.push({
      key,
      x: Math.min(PLOT.right - 34, Math.max(PLOT.left + 34, curve.peak.x)),
      y,
      text: `${curve.label.split(' · ')[1]} · ${Math.round(curve.peak.altitude)}°`
    });
  }
  return labels;
});

// Whole clock hours along the selected day's path
const hourMarks = computed(() => {
  const marks = [];
  for (let hour = 0; hour < 24; hour++) {
    const position = getPosition(zonedTimeToDate(props.localDate, hour * 60, props.timeZone), props.latitude, props.longitude);
    if (!(position.altitude > 1)) continue;
    marks.push({ hour, x: xScale(relative(position.azimuth)), y: yScale(position.altitude) });
  }
  // Label every hour when there is room, otherwise every second or third
  const spacing = marks.length > 1 ? Math.abs(marks[marks.length - 1].x - marks[0].x) / (marks.length - 1) : 99;
  const every = spacing >= 20 ? 1 : spacing >= 11 ? 2 : 3;
  return marks.map(m => ({ ...m, labelled: m.hour % every === 0 }));
});

const xTicks = computed(() => {
  const step = xMax.value > 135 ? 45 : xMax.value > 90 ? 45 : 45;
  const ticks = [];
  for (let value = -Math.floor(xMax.value / step) * step; value <= xMax.value; value += step) {
    const bearing = normalizeBearing(centerBearing.value + value);
    // The two ends of a full-circle chart are the same direction
    if (xMax.value === 180 && value === 180) continue;
    ticks.push({ x: xScale(value), label: compassPoint(bearing), bearing });
  }
  return ticks;
});

const yTicks = [0, 30, 60, 90];

const horizonArea = computed(() => {
  if (!hasObstructions(props.horizon)) return null;
  const points = [`${PLOT.left},${PLOT.bottom}`];
  for (let value = -xMax.value; value <= xMax.value; value += 1) {
    const elevation = horizonAt(props.horizon, centerBearing.value + value);
    points.push(`${xScale(value).toFixed(1)},${yScale(elevation).toFixed(1)}`);
  }
  points.push(`${PLOT.right},${PLOT.bottom}`);
  return points.join(' ');
});

const sunMarker = computed(() => {
  if (!(props.sun.altitude > 0)) return null;
  const x = relative(props.sun.azimuth);
  if (Math.abs(x) > xMax.value) return null;
  return { x: xScale(x), y: yScale(props.sun.altitude) };
});

const sunIsBlocked = computed(() =>
  props.sun.altitude > 0 && hasObstructions(props.horizon) && props.sun.altitude < horizonAt(props.horizon, props.sun.azimuth)
);

// Part of the sky the day side of the house looks at (±90° of its bearing)
const daySideSpan = computed(() => {
  if (props.houseOrientation === null) return null;
  const middle = relative(props.houseOrientation);
  const spans = [];
  for (const shift of [-360, 0, 360]) {
    const from = Math.max(-xMax.value, middle - 90 + shift);
    const to = Math.min(xMax.value, middle + 90 + shift);
    if (to - from > 2) spans.push({ x1: xScale(from), x2: xScale(to) });
  }
  return spans;
});

/* Hover: read the selected day's path under the pointer */
const svg = ref(null);
const hover = ref(null);

function handlePointerMove(event) {
  const samples = selectedDay.value.samples;
  if (!svg.value || !samples.length) return;
  const rect = svg.value.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  if (x < PLOT.left - 4 || x > PLOT.right + 4) {
    hover.value = null;
    return;
  }

  let nearest = null;
  let best = Infinity;
  for (const sample of samples) {
    const distance = Math.abs(xScale(relative(sample.azimuth)) - x);
    if (distance < best) {
      best = distance;
      nearest = sample;
    }
  }
  if (!nearest || best > 14) {
    hover.value = null;
    return;
  }

  const blocked = hasObstructions(props.horizon) && nearest.altitude < horizonAt(props.horizon, nearest.azimuth);
  const px = xScale(relative(nearest.azimuth));
  hover.value = {
    x: px,
    y: yScale(nearest.altitude),
    left: `${(px / WIDTH) * 100}%`,
    alignRight: px > WIDTH * 0.6,
    time: formatZonedTime(new Date(nearest.time), props.timeZone),
    bearing: formatBearing(nearest.azimuth),
    altitude: `${nearest.altitude.toFixed(0)}° high`,
    blocked
  };
}

const tableRows = computed(() =>
  allDays.value.map(day => ({
    key: day.key,
    color: day.color,
    label: day.label,
    sunrise: day.sunrise ? `${day.sunrise.time} · ${formatBearing(day.sunrise.bearing)}` : '—',
    sunset: day.sunset ? `${day.sunset.time} · ${formatBearing(day.sunset.bearing)}` : '—',
    noon: day.noonAltitude > 0 ? `${day.noonAltitude.toFixed(1)}°` : 'below horizon',
    daylight: formatDuration(day.daylight),
    shadow: day.noonAltitude > 0.5 ? `×${shadowLengthFactor(day.noonAltitude).toFixed(shadowLengthFactor(day.noonAltitude) >= 10 ? 0 : 1)}` : '—'
  }))
);

defineExpose({ tableRows });
</script>

<template>
  <div :class="['sun-path-chart', { large }]">
    <div class="chart-frame">
      <svg
        ref="svg"
        :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
        role="img"
        :aria-label="`Sun path chart facing ${latitude >= 0 ? 'south' : 'north'}: sun height against compass direction for the solstices, the equinox and the selected day. The table below has the same figures.`"
        @pointermove="handlePointerMove"
        @pointerleave="hover = null"
      >
        <!-- Grid -->
        <g class="grid">
          <line v-for="tick in yTicks" :key="`y${tick}`" :x1="PLOT.left" :x2="PLOT.right" :y1="yScale(tick)" :y2="yScale(tick)" :class="{ baseline: tick === 0 }" />
          <line v-for="tick in xTicks" :key="`x${tick.x}`" :x1="tick.x" :x2="tick.x" :y1="PLOT.top" :y2="PLOT.bottom" />
        </g>
        <g class="axis-labels">
          <text v-for="tick in yTicks" :key="`yl${tick}`" :x="PLOT.left - 5" :y="yScale(tick) + 3" text-anchor="end">{{ tick }}°</text>
          <text v-for="tick in xTicks" :key="`xl${tick.x}`" :x="tick.x" :y="PLOT.bottom + 13" text-anchor="middle">{{ tick.label }}</text>
        </g>

        <!-- Sky the day side faces -->
        <g v-if="daySideSpan" class="day-side">
          <line v-for="(span, i) in daySideSpan" :key="i" :x1="span.x1" :x2="span.x2" :y1="PLOT.bottom + 22" :y2="PLOT.bottom + 22" />
          <text :x="(PLOT.left + PLOT.right) / 2" :y="PLOT.bottom + 35" text-anchor="middle">sky seen from the day side</text>
        </g>

        <!-- Sun paths -->
        <g v-for="curve in curves" :key="curve.key" :class="['curve', curve.key]" :style="{ stroke: curve.color }">
          <polyline v-for="(segment, i) in curve.segments" :key="i" :points="segment" />
        </g>

        <!-- Surroundings drawn over the paths they hide -->
        <polygon v-if="horizonArea" class="horizon-area" :points="horizonArea" />

        <!-- Hours along the selected day -->
        <g class="hours">
          <template v-for="mark in hourMarks" :key="mark.hour">
            <circle :cx="mark.x" :cy="mark.y" r="2.5" />
            <text v-if="mark.labelled" :x="mark.x" :y="mark.y + 13" text-anchor="middle">{{ mark.hour }}</text>
          </template>
        </g>

        <g class="curve-labels">
          <text v-for="label in curveLabels" :key="label.key" :x="label.x" :y="label.y" text-anchor="middle">{{ label.text }}</text>
        </g>

        <circle v-if="sunMarker" :class="['sun-now', { blocked: sunIsBlocked }]" :cx="sunMarker.x" :cy="sunMarker.y" r="6.5" />

        <g v-if="hover" class="hover">
          <line :x1="hover.x" :x2="hover.x" :y1="PLOT.top" :y2="PLOT.bottom" />
          <circle :cx="hover.x" :cy="hover.y" r="4" />
        </g>
      </svg>

      <div v-if="hover" :class="['chart-tooltip', { right: hover.alignRight }]" :style="{ left: hover.left }">
        <strong>{{ hover.time }}</strong>
        <span>{{ hover.bearing }} · {{ hover.altitude }}</span>
        <span v-if="hover.blocked" class="blocked"><i class="bi bi-cloud-slash"></i>behind an obstruction</span>
      </div>
    </div>

    <div class="chart-legend">
      <span v-for="curve in curves" :key="curve.key" class="legend-item">
        <span class="swatch" :style="{ background: curve.color }"></span>{{ curve.label }}
      </span>
      <span v-if="horizonArea" class="legend-item"><span class="swatch horizon"></span>Terrain &amp; objects</span>
      <span class="legend-item"><span class="swatch dot"></span>Sun now</span>
    </div>

    <table class="chart-table">
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col">Sunrise</th>
          <th scope="col">Sunset</th>
          <th scope="col">Noon</th>
          <th scope="col" title="Length of the noon shadow as a multiple of the object's height">Shadow</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in tableRows" :key="row.key">
          <th scope="row">
            <span class="swatch" :style="{ background: row.color }"></span>{{ row.label.split(' · ')[0] }}
            <small>{{ row.label.split(' · ')[1] }} · {{ row.daylight }}</small>
          </th>
          <td>{{ row.sunrise.split(' · ')[0] }}<small>{{ row.sunrise.split(' · ')[1] }}</small></td>
          <td>{{ row.sunset.split(' · ')[0] }}<small>{{ row.sunset.split(' · ')[1] }}</small></td>
          <td>{{ row.noon }}</td>
          <td>{{ row.shadow }}</td>
        </tr>
      </tbody>
    </table>
    <p class="chart-note">
      Hours on the path are local clock time. Shadow is the length of a noon shadow as a multiple of the object's height.
    </p>
  </div>
</template>

<style scoped>
.chart-frame {
  position: relative;
}

svg {
  display: block;
  width: 100%;
  height: auto;
  touch-action: pan-y;
}

.grid line {
  stroke: var(--chart-grid);
  stroke-width: 1;
}

.grid line.baseline {
  stroke: var(--chart-axis);
}

.axis-labels text,
.day-side text {
  font-family: var(--font-mono);
  font-size: 9px;
  fill: var(--text-tertiary);
}

.day-side line {
  stroke: var(--text-tertiary);
  stroke-width: 3;
  stroke-linecap: round;
}

.curve polyline {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.curve.selected polyline {
  stroke-width: 3;
}

.horizon-area {
  fill: var(--text-secondary);
  fill-opacity: 0.55;
  stroke: var(--text-secondary);
  stroke-width: 1;
}

.hours circle {
  fill: var(--bg-secondary);
  stroke: var(--text-secondary);
  stroke-width: 1.25;
}

.hours text {
  font-family: var(--font-mono);
  font-size: 8.5px;
  fill: var(--text-secondary);
  paint-order: stroke;
  stroke: var(--bg-secondary);
  stroke-width: 2.5px;
}

.curve-labels text {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 600;
  fill: var(--text-primary);
  paint-order: stroke;
  stroke: var(--bg-secondary);
  stroke-width: 3px;
}

.sun-now {
  fill: #fbbf24;
  stroke: var(--bg-secondary);
  stroke-width: 2;
  filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.8));
}

.sun-now.blocked {
  fill: var(--text-tertiary);
  filter: none;
}

.hover line {
  stroke: var(--text-tertiary);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.hover circle {
  fill: var(--text-primary);
  stroke: var(--bg-secondary);
  stroke-width: 2;
}

.chart-tooltip {
  position: absolute;
  top: 4px;
  transform: translateX(8px);
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}

.chart-tooltip.right {
  transform: translateX(calc(-100% - 8px));
}

.chart-tooltip strong {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
}

.chart-tooltip .blocked {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-primary);
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 3px;
  border-radius: 2px;
  flex-shrink: 0;
}

.swatch.horizon {
  height: 8px;
  background: var(--text-secondary);
  opacity: 0.55;
}

.swatch.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fbbf24;
}

.chart-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.chart-table thead th {
  padding: 0 0 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-tertiary);
  text-align: right;
}

.chart-table thead th:first-child {
  text-align: left;
}

.chart-table tbody th,
.chart-table tbody td {
  padding: 5px 0;
  border-top: 1px solid var(--border-color);
  vertical-align: top;
}

.chart-table tbody th {
  text-align: left;
  font-weight: 500;
  color: var(--text-primary);
}

.chart-table tbody th .swatch {
  margin-right: 5px;
  vertical-align: middle;
}

.chart-table thead th,
.chart-table tbody td {
  padding-left: 8px;
}

.chart-table tbody td {
  text-align: right;
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.chart-table small {
  display: block;
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.chart-note {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-tertiary);
}

.large .chart-table,
.large .chart-legend {
  font-size: 12px;
}
</style>
