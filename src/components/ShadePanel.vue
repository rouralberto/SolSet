<script setup>
import { ref, computed } from 'vue';
import ToggleSwitch from './ToggleSwitch.vue';
import NumberField from './NumberField.vue';
import { summarizeSunlight, solarAccessWindow, formatDuration, formatSunPeriods } from '../lib/analysis';
import { compassPoint } from '../lib/solar';
import { formatLength } from '../lib/units';
import { formatBearing } from '../lib/utils';
import { formatZonedTime } from '../lib/time';

const props = defineProps({
  settings: { type: Object, required: true },
  timeZone: { type: String, required: true },
  // Obstacles near the house, from localObstacles()
  obstacles: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
  placingKind: { type: String, default: null },
  importing: { type: Boolean, default: false },
  // { status: 'off' | 'loading' | 'ready' | 'error', maxAngle, maxBearing, elevation, message }
  terrain: { type: Object, required: true },
  // { winter, equinox, summer, selected }: days from sampleSolarDay()
  days: { type: Object, required: true },
  // The day-side façade: { bearing, horizon }
  dayFacade: { type: Object, required: true },
  // Obstacles overlapping the house itself
  overlapping: { type: Array, default: () => [] }
});

const emit = defineEmits([
  'update-settings', 'start-placing', 'cancel-placing', 'select', 'update-obstacle',
  'remove-obstacle', 'remove-imported', 'remove-all', 'import-buildings'
]);

const units = computed(() => props.settings.units);
const showAll = ref(false);
const VISIBLE = 8;

const sorted = computed(() => [...props.obstacles].sort((a, b) => a.distance - b.distance));
const visible = computed(() => {
  const list = showAll.value ? sorted.value : sorted.value.slice(0, VISIBLE);
  // Always keep the selected one in view
  const selected = sorted.value.find(item => item.obstacle.id === props.selectedId);
  return selected && !list.includes(selected) ? [...list, selected] : list;
});

const importedCount = computed(() => props.obstacles.filter(item => item.obstacle.kind === 'imported').length);
const assumedCount = computed(() => props.obstacles.filter(item => item.obstacle.heightAssumed).length);

const ICONS = { tree: 'bi-tree', building: 'bi-building', imported: 'bi-buildings' };

function describe(item) {
  const bearing = (Math.atan2(item.center.x, item.center.y) * 180) / Math.PI;
  const where = item.distance < 1 ? 'at the house' : `${formatLength(item.distance, units.value, 0)} ${compassPoint(bearing)}`;
  return `${formatLength(item.height, units.value)} tall · ${where}`;
}

const patch = (id, changes) => emit('update-obstacle', { id, patch: changes });

/* Solar access on the day side */
const DAY_ROWS = [
  { key: 'winter', label: 'Winter solstice', icon: 'bi-snow' },
  { key: 'equinox', label: 'Equinox', icon: 'bi-flower1' },
  { key: 'summer', label: 'Summer solstice', icon: 'bi-brightness-high' },
  { key: 'selected', label: 'Selected day', icon: 'bi-calendar-event' }
];

const accessRows = computed(() =>
  DAY_ROWS.map(row => {
    const day = props.days[row.key];
    const options = { facadeAzimuth: props.dayFacade.bearing, horizon: props.dayFacade.horizon };
    const all = summarizeSunlight(day, options);
    const core = summarizeSunlight(day, { ...options, window: solarAccessWindow(day) });
    return {
      ...row,
      sun: formatDuration(all.sunMinutes),
      lost: all.blockedMinutes >= 10 ? formatDuration(all.blockedMinutes) : null,
      core: formatDuration(core.sunMinutes),
      coreMinutes: core.sunMinutes,
      corePossible: core.possibleMinutes,
      span: formatSunPeriods(all.periods, (date) => formatZonedTime(date, props.timeZone))
    };
  })
);

// The common planning test: hours of midwinter sun between 9am and 3pm
const winterVerdict = computed(() => {
  const winter = accessRows.value[0];
  const hours = winter.coreMinutes / 60;
  if (winter.corePossible < 30) {
    return { key: 'fair', icon: 'bi-info-circle', text: 'The day side faces away from the midwinter sun, so it gets none around midday whatever surrounds it.' };
  }
  if (hours >= 5) {
    return { key: 'excellent', icon: 'bi-check-circle-fill', text: `Open to the winter sun: ${winter.core} of the 6 midday hours reach the day side on the shortest day.` };
  }
  if (hours >= 3) {
    return { key: 'good', icon: 'bi-check-circle', text: `${winter.core} of midwinter midday sun on the day side. That passes the usual 3-hour planning test, but some winter sun is lost.` };
  }
  return { key: 'poor', icon: 'bi-exclamation-circle', text: `Only ${winter.core} of midwinter midday sun on the day side: below the 3 hours most solar-access rules ask for. Move the house, or turn it away from what blocks it.` };
});

const terrainSummary = computed(() => {
  const t = props.terrain;
  if (t.status === 'loading') return 'Reading the terrain around the site…';
  if (t.status === 'error') return t.message || 'Terrain data could not be loaded.';
  if (t.status !== 'ready') return 'Adds hills and mountains up to 40 km away, so sunrise and sunset behind them are counted.';
  const elevation = units.value === 'imperial'
    ? `${Math.round(t.elevation * 3.28084).toLocaleString()} ft`
    : `${Math.round(t.elevation).toLocaleString()} m`;
  const ground = `Ground level about ${elevation} above sea level.`;
  return t.maxAngle < 1
    ? `Open horizon: no terrain rises more than 1° above the horizontal. ${ground}`
    : `Terrain rises up to ${t.maxAngle.toFixed(1)}° above the horizontal, highest towards ${formatBearing(t.maxBearing)}. ${ground}`;
});
</script>

<template>
  <!-- Solar access -->
  <div class="solset-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-brightness-alt-high"></i>Sun reaching the day side</h2>
    </div>
    <div class="solset-card-body">
      <div :class="['verdict', winterVerdict.key]">
        <i :class="['bi', winterVerdict.icon]"></i>
        <span>{{ winterVerdict.text }}</span>
      </div>

      <table class="access-table">
        <thead>
          <tr>
            <th scope="col">Clear day</th>
            <th scope="col">Direct sun</th>
            <th scope="col" title="Within 3 hours either side of solar noon">9–3</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in accessRows" :key="row.key">
            <th scope="row">
              <i :class="['bi', row.icon]"></i>{{ row.label }}
              <small>{{ row.span }}</small>
            </th>
            <td>
              {{ row.sun }}
              <small v-if="row.lost">−{{ row.lost }} shaded</small>
            </td>
            <td>{{ row.core }}</td>
          </tr>
        </tbody>
      </table>
      <p class="hint subtle">
        Measured at window height in the middle of the day side ({{ formatBearing(dayFacade.bearing) }}).
        "9–3" is the six hours around solar noon that carry most of the winter sun's energy.
      </p>
    </div>
  </div>

  <!-- Surroundings -->
  <div class="solset-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-tree"></i>Trees &amp; buildings</h2>
      <span v-if="obstacles.length" class="count">{{ obstacles.length }}</span>
    </div>
    <div class="solset-card-body">
      <div class="add-row">
        <button
          type="button"
          :class="['solset-btn', placingKind === 'tree' ? 'solset-btn-primary' : 'solset-btn-secondary']"
          :aria-pressed="placingKind === 'tree'"
          @click="placingKind === 'tree' ? emit('cancel-placing') : emit('start-placing', 'tree')"
        >
          <i class="bi bi-tree"></i>Add tree
        </button>
        <button
          type="button"
          :class="['solset-btn', placingKind === 'building' ? 'solset-btn-primary' : 'solset-btn-secondary']"
          :aria-pressed="placingKind === 'building'"
          @click="placingKind === 'building' ? emit('cancel-placing') : emit('start-placing', 'building')"
        >
          <i class="bi bi-building"></i>Add building
        </button>
      </div>
      <p v-if="placingKind" class="hint placing">
        <i class="bi bi-cursor"></i>Now click the map where the {{ placingKind }} stands. Press Esc to cancel.
      </p>

      <button type="button" class="solset-btn solset-btn-ghost btn-block" :disabled="importing" @click="emit('import-buildings')">
        <i :class="importing ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-cloud-download'"></i>
        {{ importing ? 'Fetching buildings… (can take a minute)' : 'Import nearby buildings from OpenStreetMap' }}
      </button>

      <p v-if="overlapping.length" class="hint warn">
        <i class="bi bi-exclamation-triangle"></i>
        {{ overlapping.length === 1 ? `"${overlapping[0].name || 'An object'}" overlaps` : `${overlapping.length} objects overlap` }}
        the house position, so {{ overlapping.length === 1 ? 'it is' : 'they are' }} ignored in the shade figures. Remove it if it's being replaced.
      </p>
      <p v-if="assumedCount" class="hint warn">
        <i class="bi bi-rulers"></i>
        {{ assumedCount }} imported {{ assumedCount === 1 ? 'building has' : 'buildings have' }} no height in OpenStreetMap and {{ assumedCount === 1 ? 'is' : 'are' }} assumed to be {{ formatLength(6, units, 0) }} (dashed outline). Correct the ones that matter.
      </p>

      <ul v-if="obstacles.length" class="obstacle-list">
        <li v-for="item in visible" :key="item.obstacle.id" :class="{ selected: item.obstacle.id === selectedId }">
          <div class="obstacle-row">
            <button
              type="button"
              class="obstacle-main"
              :aria-expanded="item.obstacle.id === selectedId"
              @click="emit('select', item.obstacle.id === selectedId ? null : item.obstacle.id)"
            >
              <i :class="['bi', ICONS[item.obstacle.kind]]"></i>
              <span class="obstacle-text">
                <span class="obstacle-name">{{ item.obstacle.name || 'Object' }}</span>
                <span class="obstacle-meta">{{ describe(item) }}<template v-if="item.obstacle.heightAssumed"> · height assumed</template></span>
              </span>
            </button>
            <button
              type="button"
              class="solset-btn solset-btn-ghost solset-btn-icon"
              :aria-label="`Remove ${item.obstacle.name || 'object'}`"
              title="Remove"
              @click="emit('remove-obstacle', item.obstacle.id)"
            >
              <i class="bi bi-trash"></i>
            </button>
          </div>

          <div v-if="item.obstacle.id === selectedId" class="obstacle-fields">
            <label class="field">
              <span>Height</span>
              <NumberField
                length :units="units" :min="0.5" :max="500" :step="0.5" label="Height"
                :model-value="item.obstacle.height"
                @update:model-value="patch(item.obstacle.id, { height: $event, heightAssumed: false })"
              />
            </label>
            <label v-if="item.obstacle.kind === 'tree'" class="field">
              <span>Crown width</span>
              <NumberField
                length :units="units" :min="0.6" :max="100" :step="0.5" label="Crown width"
                :model-value="item.obstacle.radius * 2"
                @update:model-value="patch(item.obstacle.id, { radius: $event / 2 })"
              />
            </label>
            <template v-if="item.obstacle.kind === 'building'">
              <label class="field">
                <span>Width</span>
                <NumberField
                  length :units="units" :min="0.5" :max="300" :step="0.5" label="Width"
                  :model-value="item.obstacle.width" @update:model-value="patch(item.obstacle.id, { width: $event })"
                />
              </label>
              <label class="field">
                <span>Depth</span>
                <NumberField
                  length :units="units" :min="0.2" :max="300" :step="0.5" label="Depth"
                  :model-value="item.obstacle.depth" @update:model-value="patch(item.obstacle.id, { depth: $event })"
                />
              </label>
              <label class="field">
                <span>Turned</span>
                <NumberField
                  suffix="°" :min="0" :max="359" :step="5" label="Rotation in degrees"
                  :model-value="item.obstacle.rotation" @update:model-value="patch(item.obstacle.id, { rotation: $event })"
                />
              </label>
            </template>
            <p class="hint subtle">Drag it on the map to move it.</p>
          </div>
        </li>
      </ul>
      <p v-else class="hint">
        Mark what stands around the plot (the neighbour's house, a tall hedge, the tree you'd like to keep) and
        SolSet draws its shadow to scale and counts the sun it takes from the house and the panels.
      </p>

      <div v-if="obstacles.length" class="list-actions">
        <button v-if="sorted.length > VISIBLE" type="button" class="solset-btn solset-btn-ghost link-btn" @click="showAll = !showAll">
          {{ showAll ? 'Show nearest only' : `Show all ${sorted.length}` }}
        </button>
        <button v-if="importedCount" type="button" class="solset-btn solset-btn-ghost link-btn" @click="emit('remove-imported')">
          Remove imported
        </button>
        <button type="button" class="solset-btn solset-btn-ghost link-btn" @click="emit('remove-all')">
          Remove all
        </button>
      </div>
    </div>
  </div>

  <!-- Terrain -->
  <div class="solset-card">
    <div class="solset-card-header">
      <h2 class="card-title"><i class="bi bi-triangle"></i>Hills &amp; mountains</h2>
      <ToggleSwitch
        :model-value="settings.useTerrain"
        @update:model-value="emit('update-settings', { useTerrain: $event })"
        label="Include the terrain horizon"
      />
    </div>
    <div class="solset-card-body">
      <p :class="['hint', 'first', { warn: terrain.status === 'error' }]">
        <i v-if="terrain.status === 'loading'" class="bi bi-arrow-repeat animate-spin"></i>
        {{ terrainSummary }}
      </p>
      <p v-if="settings.useTerrain" class="hint subtle">
        From open elevation data (about 30 m detail near the site): good for hills and valleys, blind to buildings and trees.
        The terrain line is drawn on the sun-path chart in the Sun tab.
      </p>
    </div>
  </div>
</template>

<style scoped>
.count {
  padding: 1px 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
}

.verdict {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-left: 4px solid var(--success);
  border-radius: var(--radius-md);
}

.verdict i { margin-top: 1px; font-size: 14px; }
.verdict.excellent i { color: var(--success); }
.verdict.good { border-left-color: #84cc16; }
.verdict.good i { color: #65a30d; }
.verdict.fair { border-left-color: var(--warning); }
.verdict.fair i { color: var(--warning); }
.verdict.poor { border-left-color: var(--error); }
.verdict.poor i { color: var(--error); }

.access-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 12px;
}

.access-table thead th {
  padding: 0 0 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-tertiary);
  text-align: right;
}

.access-table thead th:first-child { text-align: left; }

.access-table tbody th,
.access-table tbody td {
  padding: 6px 0;
  border-top: 1px solid var(--border-color);
  vertical-align: top;
}

.access-table tbody th {
  text-align: left;
  font-weight: 500;
  color: var(--text-primary);
}

.access-table tbody th i {
  margin-right: 6px;
  color: var(--text-tertiary);
}

.access-table tbody td {
  text-align: right;
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.access-table small {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.access-table tbody th small { margin-left: 20px; }

.add-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.add-row .solset-btn,
.btn-block {
  font-size: 12px;
  padding: 8px 10px;
}

.btn-block {
  width: 100%;
  margin-top: 8px;
}

.hint {
  display: flex;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.hint.first { margin-top: 0; }
.hint.subtle { display: block; font-size: 11px; color: var(--text-tertiary); }
.hint.warn { color: var(--sun-orange); }
.hint.placing { color: var(--text-primary); font-weight: 500; }
.hint i { margin-top: 2px; }

.obstacle-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.obstacle-list li {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.obstacle-list li.selected {
  border-color: var(--sun-gold);
}

.obstacle-row {
  display: flex;
  align-items: center;
  padding-right: 4px;
}

.obstacle-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: none;
  border: none;
  text-align: left;
}

.obstacle-main > i {
  font-size: 16px;
  color: var(--text-secondary);
}

.obstacle-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.obstacle-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obstacle-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}

.obstacle-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 4px 10px 10px;
}

.obstacle-fields .hint {
  grid-column: 1 / -1;
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--text-secondary);
}

.field .number-field {
  width: 100%;
}

.list-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
}

.link-btn {
  padding: 2px 8px;
  font-size: 12px;
}
</style>
