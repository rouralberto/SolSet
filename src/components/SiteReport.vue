<script setup>
import { ref, computed, onMounted } from 'vue';
import { getPosition } from 'suncalc';
import SunPathChart from './SunPathChart.vue';
import SiteScene from './SiteScene.vue';
import {
  simulatePv, findOptimalPlane, sampleByBearing, overhangMonthlyShading, normalizeBearing,
  bearingDifference, houseGeometry, MONTH_NAMES
} from '../lib/solar';
import { summarizeSunlight, solarAccessWindow, formatDuration } from '../lib/analysis';
import { trueToMagnetic } from '../lib/geo';
import { formatLength } from '../lib/units';
import { formatBearing, formatCoordinates } from '../lib/utils';
import { zonedTimeToDate, formatDisplayDate, getTimeZoneOffset, formatUtcOffset } from '../lib/time';

/**
 * A printable summary of the site: sun path, shadow diagrams for the solstices
 * and equinox, sun on each wall, overhang and solar yield. Print it or save it
 * as a PDF from the browser's print dialog.
 */
const props = defineProps({
  settings: { type: Object, required: true },
  coordinates: { type: Object, required: true },
  locationName: { type: String, default: null },
  timeZone: { type: String, required: true },
  localDate: { type: String, required: true },
  keyDates: { type: Array, required: true },
  sun: { type: Object, required: true },
  house: { type: Object, required: true },
  houseOrientation: { type: Number, required: true },
  optimalOrientation: { type: Number, required: true },
  scores: { type: Object, required: true },
  facades: { type: Array, required: true },
  days: { type: Object, required: true },
  obstacles: { type: Array, default: () => [] },
  siteHorizon: { type: Object, default: null },
  arrayHorizon: { type: Object, default: null },
  terrain: { type: Object, required: true },
  climate: { type: Object, required: true },
  climateYear: { type: Array, required: true },
  declination: { type: Number, default: null }
});

const emit = defineEmits(['close']);

const dialog = ref(null);
onMounted(() => dialog.value?.focus());

const units = computed(() => props.settings.units);
const length = (meters, digits = 1) => formatLength(meters, units.value, digits);
const keyDate = (key) => props.keyDates.find(k => k.key === key).dateString;
const shortDate = (dateString) => formatDisplayDate(dateString, { month: 'short', day: 'numeric' });

const title = computed(() => props.locationName || formatCoordinates(props.coordinates.lat, props.coordinates.lng));
const generated = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

const zoneLabel = computed(() => {
  const offset = formatUtcOffset(getTimeZoneOffset(zonedTimeToDate(props.localDate, 720, props.timeZone), props.timeZone));
  return `${props.timeZone.replace(/_/g, ' ')} (${offset} on ${shortDate(props.localDate)})`;
});

const declinationLabel = computed(() => {
  if (props.declination === null) return null;
  return `${Math.abs(props.declination).toFixed(1)}° ${props.declination >= 0 ? 'east' : 'west'}`;
});

const magneticOrientation = computed(() =>
  props.declination === null ? null : Math.round(trueToMagnetic(props.houseOrientation, props.declination)) % 360
);

/* Orientation */
const at = (series, bearing) => sampleByBearing(props.scores.bearings, series, bearing);
const orientation = computed(() => {
  const usefulBest = at(props.scores.useful, props.optimalOrientation);
  const unwantedBest = at(props.scores.unwanted, props.optimalOrientation);
  return {
    off: Math.round(Math.abs(bearingDifference(props.houseOrientation, props.optimalOrientation))),
    useful: usefulBest > 0 ? Math.round((at(props.scores.useful, props.houseOrientation) / usefulBest) * 100) : null,
    unwanted: unwantedBest > 0 ? Math.round((at(props.scores.unwanted, props.houseOrientation) / unwantedBest - 1) * 100) : null
  };
});

const ridgeHeight = computed(() => houseGeometry(props.house, 0).ridgeHeight);

/* Shadow diagrams */
const DIAGRAM_HOURS = [9, 12, 15];
const diagramRadius = computed(() => {
  const size = Math.max(props.house.width, props.house.depth);
  const furthest = props.obstacles.reduce((max, item) => (item.distance < 60 ? Math.max(max, item.distance + 8) : max), 0);
  return Math.max(24, Math.min(80, Math.max(size * 2.4, furthest)));
});

const scaleBar = computed(() => {
  const imperial = units.value === 'imperial';
  const target = diagramRadius.value * 0.5;
  const steps = imperial ? [10, 20, 50, 100, 200] : [5, 10, 20, 50];
  const unitMeters = imperial ? 0.3048 : 1;
  const value = steps.filter(step => step * unitMeters <= target).pop() || steps[0];
  return { meters: value * unitMeters, label: `${value} ${imperial ? 'ft' : 'm'}` };
});

const diagrams = computed(() =>
  [
    { key: 'winter', label: 'Winter solstice' },
    { key: 'spring', label: 'Equinox' },
    { key: 'summer', label: 'Summer solstice' }
  ].map(season => ({
    ...season,
    date: shortDate(keyDate(season.key)),
    times: DIAGRAM_HOURS.map(hour => {
      const position = getPosition(
        zonedTimeToDate(keyDate(season.key), hour * 60, props.timeZone), props.coordinates.lat, props.coordinates.lng
      );
      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        sun: position.altitude > 0 ? position : null,
        detail: position.altitude > 0
          ? `sun ${Math.round(position.altitude)}° high, ${formatBearing(position.azimuth)}`
          : 'sun below the horizon'
      };
    })
  }))
);

/* Sun on each side */
const FACADE_TITLES = { day: 'Day side', night: 'Night side', sideA: 'End wall', sideB: 'End wall' };
const facadeRows = computed(() =>
  props.facades.map(facade => {
    const hours = (day, window = null) => formatDuration(
      summarizeSunlight(day, { facadeAzimuth: facade.bearing, horizon: facade.horizon, window }).sunMinutes
    );
    return {
      key: facade.key,
      title: FACADE_TITLES[facade.key],
      bearing: formatBearing(facade.bearing),
      length: length(facade.length),
      winter: hours(props.days.winter),
      winterCore: hours(props.days.winter, solarAccessWindow(props.days.winter)),
      equinox: hours(props.days.equinox),
      summer: hours(props.days.summer)
    };
  })
);

/* Overhang */
const overhangFacade = computed(() => props.facades.find(f => f.key === props.settings.overhangFacade) || props.facades[0]);
const overhangMonths = computed(() =>
  overhangMonthlyShading(props.coordinates.lat, overhangFacade.value.bearing, {
    depth: props.settings.overhangDepth,
    gap: props.settings.overhangGap,
    windowHeight: props.settings.windowHeight
  })
);

/* Solar */
const plane = computed(() => {
  if (props.settings.pvPlacement === 'custom') return { tilt: props.settings.pvTilt, azimuth: props.settings.pvAzimuth };
  return {
    tilt: props.house.roofPitch,
    azimuth: normalizeBearing(props.houseOrientation + (props.settings.pvPlacement === 'roof-night' ? 180 : 0))
  };
});

const pv = computed(() => simulatePv({
  year: props.climateYear,
  tilt: plane.value.tilt,
  azimuth: plane.value.azimuth,
  kwp: props.settings.solarSystemSize,
  horizon: props.arrayHorizon
}));

const pvOptimum = computed(() => findOptimalPlane(props.climateYear, props.coordinates.lat));
const round = (value) => Math.round(value).toLocaleString();

const surroundings = computed(() => {
  const parts = [];
  if (props.obstacles.length) {
    const assumed = props.obstacles.filter(item => item.obstacle.heightAssumed).length;
    parts.push(`${props.obstacles.length} surrounding object${props.obstacles.length === 1 ? '' : 's'}${assumed ? ` (${assumed} with an assumed height)` : ''}`);
  }
  if (props.terrain.status === 'ready') {
    parts.push(`terrain horizon up to ${props.terrain.maxAngle.toFixed(1)}° towards ${formatBearing(props.terrain.maxBearing)}`);
  }
  return parts.length ? parts.join(' and ') : 'none entered: figures assume an open, unobstructed site';
});

function print() {
  window.print();
}
</script>

<template>
  <Teleport to="body">
    <div class="report-overlay" @click.self="emit('close')">
      <div ref="dialog" class="report" role="dialog" aria-modal="true" aria-labelledby="report-title" tabindex="-1">
        <div class="report-toolbar">
          <span class="toolbar-title"><i class="bi bi-file-earmark-text"></i>Site report</span>
          <span class="toolbar-actions">
            <button type="button" class="solset-btn solset-btn-primary" @click="print">
              <i class="bi bi-printer"></i>Print / save as PDF
            </button>
            <button type="button" class="solset-btn solset-btn-ghost solset-btn-icon" @click="emit('close')" aria-label="Close report">
              <i class="bi bi-x-lg"></i>
            </button>
          </span>
        </div>

        <div class="report-page">
          <header class="report-header">
            <div>
              <p class="eyebrow">Sun &amp; shadow site report</p>
              <h1 id="report-title">{{ title }}</h1>
              <p class="meta">
                {{ coordinates.lat.toFixed(5) }}, {{ coordinates.lng.toFixed(5) }} · {{ zoneLabel }}
              </p>
            </div>
            <p class="meta right">Prepared {{ generated }}<br>with SolSet</p>
          </header>

          <section class="summary">
            <div class="summary-item">
              <span class="summary-label">House</span>
              <span class="summary-value">{{ length(house.width) }} × {{ length(house.depth) }}</span>
              <span class="summary-note">eaves {{ length(house.wallHeight) }}, {{ house.roofPitch > 0 ? `ridge ${length(ridgeHeight)} (${Math.round(house.roofPitch)}° roof)` : 'flat roof' }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Day side faces</span>
              <span class="summary-value">{{ formatBearing(houseOrientation) }}</span>
              <span class="summary-note">
                true north<template v-if="magneticOrientation !== null"> · {{ magneticOrientation }}° on a compass</template>
              </span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Against the best orientation</span>
              <span class="summary-value">{{ orientation.off < 2 ? 'On it' : `${orientation.off}° off` }}</span>
              <span class="summary-note">
                best is {{ formatBearing(optimalOrientation) }}<template v-if="orientation.useful !== null"> · {{ orientation.useful }}% of the useful winter sun</template><template v-if="orientation.unwanted !== null && orientation.unwanted !== 0"> · {{ orientation.unwanted > 0 ? '+' : '' }}{{ orientation.unwanted }}% hot-weather sun</template>
              </span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Solar, {{ settings.solarSystemSize }} kW</span>
              <span class="summary-value">{{ round(pv.annual) }} kWh/yr</span>
              <span class="summary-note">{{ round(pv.specificYield) }} kWh per kW · panels {{ Math.round(plane.tilt) }}° facing {{ formatBearing(plane.azimuth) }}</span>
            </div>
          </section>

          <section>
            <h2>Sun path</h2>
            <p class="lead">
              The sun's height and direction through the day, seen facing {{ coordinates.lat >= 0 ? 'south' : 'north' }}.
              <template v-if="siteHorizon">The grey area is the sky hidden by terrain and surrounding objects, seen from the middle of the house.</template>
            </p>
            <div class="chart-wrap">
              <SunPathChart
                large
                :latitude="coordinates.lat"
                :longitude="coordinates.lng"
                :time-zone="timeZone"
                :local-date="localDate"
                :key-dates="keyDates"
                :sun="sun"
                :horizon="siteHorizon"
                :house-orientation="houseOrientation"
              />
            </div>
          </section>

          <section class="break-before">
            <h2>Shadow diagrams</h2>
            <p class="lead">
              Shadows of the house<template v-if="obstacles.length"> and its surroundings</template> at 9:00, 12:00 and 15:00 local clock time.
              North is up; all nine drawings share one scale.
            </p>
            <div class="diagram-grid">
              <template v-for="season in diagrams" :key="season.key">
                <div class="diagram-season">
                  <strong>{{ season.label }}</strong>
                  <span>{{ season.date }}</span>
                </div>
                <figure v-for="time in season.times" :key="time.hour" class="diagram">
                  <svg :viewBox="`${-diagramRadius} ${-diagramRadius} ${diagramRadius * 2} ${diagramRadius * 2}`" role="img" :aria-label="`${season.label}, ${time.label}: ${time.detail}`">
                    <rect class="diagram-ground" :x="-diagramRadius" :y="-diagramRadius" :width="diagramRadius * 2" :height="diagramRadius * 2" />
                    <SiteScene
                      :house="house"
                      :facing="houseOrientation"
                      :sun="time.sun"
                      :obstacles="obstacles"
                      :max-shadow="diagramRadius * 3"
                      :show-labels="false"
                      :units="units"
                    />
                    <!-- North arrow -->
                    <g :transform="`translate(${diagramRadius * 0.82}, ${-diagramRadius * 0.74}) scale(${diagramRadius / 30})`" class="north-arrow">
                      <path d="M 0 -4 L 2 2.5 L 0 1.2 L -2 2.5 Z" />
                      <text x="0" y="-5" text-anchor="middle">N</text>
                    </g>
                    <!-- Scale bar -->
                    <g class="scale-bar" :transform="`translate(${-diagramRadius * 0.9}, ${diagramRadius * 0.88})`">
                      <line x1="0" y1="0" :x2="scaleBar.meters" y2="0" />
                      <text :x="scaleBar.meters / 2" :y="-diagramRadius * 0.035" text-anchor="middle" :font-size="diagramRadius * 0.085">{{ scaleBar.label }}</text>
                    </g>
                  </svg>
                  <figcaption><strong>{{ time.label }}</strong> {{ time.detail }}</figcaption>
                </figure>
              </template>
            </div>
          </section>

          <section>
            <h2>Sun on each side of the house</h2>
            <p class="lead">Hours of direct sun on each wall on a clear day, at window height, after shade from: {{ surroundings }}.</p>
            <table class="report-table">
              <thead>
                <tr>
                  <th scope="col">Wall</th>
                  <th scope="col">Faces</th>
                  <th scope="col">Length</th>
                  <th scope="col">Winter solstice</th>
                  <th scope="col">of which 9–3</th>
                  <th scope="col">Equinox</th>
                  <th scope="col">Summer solstice</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in facadeRows" :key="row.key">
                  <th scope="row">{{ row.title }}</th>
                  <td>{{ row.bearing }}</td>
                  <td>{{ row.length }}</td>
                  <td>{{ row.winter }}</td>
                  <td>{{ row.winterCore }}</td>
                  <td>{{ row.equinox }}</td>
                  <td>{{ row.summer }}</td>
                </tr>
              </tbody>
            </table>
            <p class="footnote">"9–3" counts the six hours centred on solar noon, the window most solar-access rules test (commonly at least 3 hours in midwinter).</p>
          </section>

          <section class="avoid-break">
            <h2>Window overhang</h2>
            <p class="lead">
              {{ FACADE_TITLES[overhangFacade.key] }} ({{ formatBearing(overhangFacade.bearing) }}): a {{ length(settings.overhangDepth, 2) }} overhang,
              {{ length(settings.overhangGap, 2) }} above a {{ length(settings.windowHeight, 2) }} tall window. Share of the clear-day direct sun it keeps off the glass:
            </p>
            <table class="report-table months">
              <thead>
                <tr><th v-for="m in overhangMonths" :key="m.month" scope="col">{{ MONTH_NAMES[m.month] }}</th></tr>
              </thead>
              <tbody>
                <tr><td v-for="m in overhangMonths" :key="m.month">{{ m.blocked === null ? '–' : `${Math.round(m.blocked * 100)}%` }}</td></tr>
              </tbody>
            </table>
            <p class="footnote">"–" means no direct sun reaches this wall that month.</p>
          </section>

          <section class="avoid-break">
            <h2>Solar production estimate</h2>
            <p class="lead">
              {{ settings.solarSystemSize }} kW of panels tilted {{ Math.round(plane.tilt) }}° facing {{ formatBearing(plane.azimuth) }}:
              about <strong>{{ round(pv.annual) }} kWh a year</strong> ({{ round(pv.specificYield) }} kWh per kW installed),
              {{ Math.round((pv.specificYield / pvOptimum.specificYield) * 100) }}% of the best fixed position here
              ({{ pvOptimum.tilt }}° tilt facing {{ formatBearing(pvOptimum.azimuth) }}).
              <template v-if="pv.shadingLoss >= 0.005">Shading takes {{ (pv.shadingLoss * 100).toFixed(0) }}%.</template>
            </p>
            <table class="report-table months">
              <thead>
                <tr><th v-for="(kwh, month) in pv.monthly" :key="month" scope="col">{{ MONTH_NAMES[month] }}</th></tr>
              </thead>
              <tbody>
                <tr><td v-for="(kwh, month) in pv.monthly" :key="month">{{ round(kwh) }}</td></tr>
              </tbody>
            </table>
            <p class="footnote">kWh per month.</p>
          </section>

          <section class="notes avoid-break">
            <h2>Basis and limits</h2>
            <ul>
              <li>All bearings are from <strong>true north</strong>.<template v-if="declinationLabel"> Magnetic declination here is {{ declinationLabel }} (World Magnetic Model): a compass reads {{ Math.abs(declination).toFixed(0) }}° {{ declination >= 0 ? 'less' : 'more' }} than the true bearing.</template></li>
              <li>Sun positions: SunCalc (Meeus' algorithms, about 0.1° accuracy). Times are local clock time for {{ timeZone.replace(/_/g, ' ') }}, including daylight saving where it applies.</li>
              <li>Surroundings: {{ surroundings }}. Objects are treated as flat-topped blocks; trees as solid cylinders, which overstates their shade in winter if they lose their leaves.</li>
              <li>
                Climate: {{ climate.source === 'nasa-power' ? `NASA POWER monthly normals${climate.period ? ` (${climate.period})` : ''}` : 'no local record available, so a typical climate for the latitude was used and the energy figures are rough' }}.
                Solar yield assumes crystalline panels and 14% system losses; expect about ±10% against a detailed simulation.
              </li>
              <li>The orientation comparison assumes most glazing on the day side under a typical eave. It is a guide for early siting decisions, not a substitute for an energy model or a surveyed shadow study where one is required.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.report-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  overflow-y: auto;
  padding: 24px 16px 48px;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
}

.report {
  max-width: 860px;
  margin: 0 auto;
  outline: none;
}

.report-toolbar {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 10px 18px;
  margin-bottom: 12px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* The page itself is always printed-paper white, whatever the app theme */
.report-page {
  --bg-secondary: #ffffff;
  --bg-tertiary: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #64748b;
  --border-color: #e2e8f0;
  --border-color-strong: #cbd5e1;
  --chart-grid: #e2e8f0;
  --chart-axis: #cbd5e1;
  --series-winter: #2a78d6;
  --series-summer: #eb6834;
  --series-equinox: #1baf7a;
  --series-selected: #eda100;
  color-scheme: light;
  padding: 40px 44px;
  color: #0f172a;
  background: #ffffff;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  line-height: 1.5;
}

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #0f172a;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #b45309;
}

.report-header h1 {
  font-size: 24px;
  line-height: 1.2;
}

.meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: #475569;
}

.meta.right {
  text-align: right;
  white-space: nowrap;
}

.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 20px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 10px;
  border-top: 1px solid #cbd5e1;
}

.summary-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #64748b;
}

.summary-value {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}

.summary-note {
  font-size: 11px;
  line-height: 1.4;
  color: #475569;
}

section {
  margin-top: 30px;
}

section h2 {
  font-size: 15px;
  margin-bottom: 4px;
}

.lead {
  margin: 0 0 12px;
  color: #334155;
}

.chart-wrap {
  max-width: 620px;
}

.diagram-grid {
  display: grid;
  grid-template-columns: 92px repeat(3, 1fr);
  gap: 12px;
  align-items: start;
}

.diagram-season {
  display: flex;
  flex-direction: column;
  padding-top: 4px;
  font-size: 12px;
  line-height: 1.3;
}

.diagram-season span {
  color: #64748b;
}

.diagram {
  margin: 0;
}

.diagram svg {
  display: block;
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  overflow: hidden;
}

.diagram-ground {
  fill: #f8fafc;
}

.diagram figcaption {
  margin-top: 4px;
  font-size: 10.5px;
  line-height: 1.35;
  color: #475569;
}

.diagram figcaption strong {
  font-family: var(--font-mono);
  color: #0f172a;
}

.north-arrow path {
  fill: #0f172a;
}

.north-arrow text {
  font-size: 3.4px;
  font-weight: 700;
  fill: #0f172a;
}

.scale-bar line {
  stroke: #0f172a;
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}

.scale-bar text {
  fill: #0f172a;
  font-family: var(--font-mono);
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.report-table th,
.report-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #e2e8f0;
  text-align: right;
}

.report-table thead th {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #64748b;
  border-bottom-color: #94a3b8;
}

.report-table th:first-child,
.report-table td:first-child {
  text-align: left;
  padding-left: 0;
}

.report-table tbody th {
  font-weight: 600;
}

.report-table td {
  font-family: var(--font-mono);
}

.report-table.months th,
.report-table.months td {
  padding: 6px 2px;
  text-align: center;
}

.footnote {
  margin: 6px 0 0;
  font-size: 11px;
  color: #64748b;
}

.notes ul {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 11.5px;
  color: #334155;
}

.notes li {
  margin-bottom: 4px;
}

@media (max-width: 720px) {
  .report-overlay {
    padding: 8px 8px 32px;
  }

  .report-page {
    padding: 20px 16px;
  }

  .report-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .meta.right {
    text-align: left;
  }

  .summary {
    grid-template-columns: 1fr 1fr;
  }

  .diagram-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .diagram-season {
    grid-column: 1 / -1;
    flex-direction: row;
    gap: 8px;
  }

  .report-table {
    font-size: 11px;
  }

  .report-table th,
  .report-table td {
    padding: 5px 3px;
  }
}

@media print {
  .report-overlay {
    position: static;
    padding: 0;
    overflow: visible;
    background: none;
    backdrop-filter: none;
  }

  .report {
    max-width: none;
  }

  .report-toolbar {
    display: none;
  }

  .report-page {
    padding: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .break-before {
    break-before: page;
    margin-top: 0;
  }

  .avoid-break,
  .diagram,
  .summary {
    break-inside: avoid;
  }
}
</style>
