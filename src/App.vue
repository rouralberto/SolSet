<script setup>
import { ref, computed, watch, watchEffect, onMounted, onUnmounted, nextTick } from 'vue';
import SunMap from './components/SunMap.vue';
import LocationInput from './components/LocationInput.vue';
import DateTimeSlider from './components/DateTimeSlider.vue';
import SunInfo from './components/SunInfo.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import ToggleSwitch from './components/ToggleSwitch.vue';
import {
  parseUrlParams, updateUrlParams, getSettings, saveSettings, sanitizeSettings, debounce,
  addRecentLocation, getRecentLocations, getSavedLocations, saveLocation, removeLocation,
  isSameLocation, formatCoordinates, copyToClipboard
} from './lib/utils';
import {
  getSunTimes, getSunPosition, isSunAboveHorizon, getKeyDates, calculateOptimalHouseOrientation, bearingToCompass
} from './lib/sunCalc';
import {
  getTimeZone, zonedTimeToDate, toZonedDateString, toZonedMinutes, addDays, getYear,
  formatDisplayDate, isValidDate
} from './lib/time';
import { reverseGeocode } from './lib/mapUtils';
import { toast, showToast, hideToast } from './lib/toast';

const DEFAULT_LOCATION = { lat: 43.3183, lng: -1.9812, name: 'Donostia / San Sebastián' };
const MINUTES_PER_DAY = 1440;

// ---------------------------------------------------------------------------
// Initial state: URL hash > most recent location > default
// ---------------------------------------------------------------------------
const initialUrl = parseUrlParams();
const initialLocation = initialUrl.coordinates || getRecentLocations()[0] || DEFAULT_LOCATION;

const settings = ref(getSettings());
const coordinates = ref({ lat: initialLocation.lat, lng: initialLocation.lng });
const zoom = ref(initialUrl.zoom ?? 13);
const locationName = ref(initialUrl.coordinates ? null : initialLocation.name || null);
let namedCoordinates = locationName.value ? { ...coordinates.value } : null;

// All dates/times are wall-clock values in the location's own time zone
const timeZone = computed(() => getTimeZone(coordinates.value.lat, coordinates.value.lng));
const initialNow = new Date();
const localDate = ref(initialUrl.date ?? toZonedDateString(initialNow, timeZone.value));
const minutes = ref(initialUrl.minutes ?? toZonedMinutes(initialNow, timeZone.value));

const instant = computed(() => zonedTimeToDate(localDate.value, minutes.value, timeZone.value));
const noonInstant = computed(() => zonedTimeToDate(localDate.value, 720, timeZone.value));
const year = computed(() => getYear(localDate.value));

const sunTimes = computed(() => getSunTimes(noonInstant.value, coordinates.value.lat, coordinates.value.lng));
const sunPosition = computed(() => getSunPosition(instant.value, coordinates.value.lat, coordinates.value.lng));
const isSunUp = computed(() => isSunAboveHorizon(sunPosition.value.altitude));

const loading = ref(false);
const showSettings = ref(false);
const showShortcuts = ref(false);
const shortcutsDialog = ref(null);

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const systemPrefersDark = ref(darkQuery.matches);
const handleSystemThemeChange = (e) => { systemPrefersDark.value = e.matches; };

const resolvedTheme = computed(() => {
  if (settings.value.theme === 'system') {
    return systemPrefersDark.value ? 'dark' : 'light';
  }
  return settings.value.theme;
});

watchEffect(() => {
  document.documentElement.setAttribute('data-theme', resolvedTheme.value);
});

function toggleTheme() {
  updateSettings({ theme: resolvedTheme.value === 'dark' ? 'light' : 'dark' });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function updateSettings(patch) {
  settings.value = sanitizeSettings({ ...settings.value, ...patch });
  saveSettings(settings.value);
}

// ---------------------------------------------------------------------------
// House orientation
// ---------------------------------------------------------------------------
// Orientation barely changes over short distances; only recompute per ~0.1° of lat/lng
const orientationKey = computed(() => `${coordinates.value.lat.toFixed(1)},${coordinates.value.lng.toFixed(1)}`);
const optimalOrientation = computed(() => {
  const [lat, lng] = orientationKey.value.split(',').map(Number);
  return calculateOptimalHouseOrientation(lat, lng);
});

const houseOrientation = computed(() =>
  settings.value.autoOrientHouse ? optimalOrientation.value : settings.value.houseOrientation
);

const formatOrientation = (degrees) => `${Math.round(degrees) % 360}° (${bearingToCompass(degrees)})`;

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
const savedLocations = ref(getSavedLocations());

const currentSavedLocation = computed(() =>
  savedLocations.value.find(l => isSameLocation(l, coordinates.value, 0.0005))
);

function selectLocation({ lat, lng, name }) {
  coordinates.value = { lat, lng };
  locationName.value = name || null;
  namedCoordinates = { lat, lng };
  addRecentLocation({ lat, lng, name });
}

// Map panning/clicking emits plain coordinates; drop the place name once we move away from it
function updateCoordinatesFromMap(coords) {
  coordinates.value = coords;
  if (namedCoordinates && !isSameLocation(coords, namedCoordinates, 0.0005)) {
    locationName.value = null;
    namedCoordinates = null;
  }
}

async function toggleSaveLocation() {
  if (currentSavedLocation.value) {
    savedLocations.value = removeLocation(currentSavedLocation.value.id);
    showToast('Removed from saved locations', 'success');
    return;
  }

  const { lat, lng } = coordinates.value;
  const name = locationName.value || await reverseGeocode(lat, lng) || formatCoordinates(lat, lng);
  savedLocations.value = [...saveLocation({ lat, lng, name })];
  showToast(`Saved "${name}"`, 'success');
}

function handleRemoveLocation(id) {
  savedLocations.value = removeLocation(id);
}

// ---------------------------------------------------------------------------
// URL state (debounced: browsers throttle frequent history.replaceState calls)
// ---------------------------------------------------------------------------
function syncUrl() {
  updateUrlParams({
    coordinates: coordinates.value,
    zoom: zoom.value,
    date: localDate.value,
    minutes: minutes.value
  });
}

const debouncedSyncUrl = debounce(syncUrl, 300);
watch([coordinates, zoom, localDate, minutes], debouncedSyncUrl);

async function shareView() {
  syncUrl();
  if (await copyToClipboard(window.location.href)) {
    showToast('Link copied. It opens this exact location, date and time.', 'success');
  } else {
    showToast('Could not copy the link. Copy it from the address bar instead.');
  }
}

// ---------------------------------------------------------------------------
// Date & time
// ---------------------------------------------------------------------------
function setNow() {
  const now = new Date();
  localDate.value = toZonedDateString(now, timeZone.value);
  minutes.value = toZonedMinutes(now, timeZone.value);
}

function adjustTime(delta) {
  const total = minutes.value + delta;
  const dayShift = Math.floor(total / MINUTES_PER_DAY);
  minutes.value = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (dayShift !== 0) {
    localDate.value = addDays(localDate.value, dayShift);
  }
}

function adjustDate(days) {
  localDate.value = addDays(localDate.value, days);
}

const keyDates = computed(() => getKeyDates(year.value, coordinates.value.lat));

// ---------------------------------------------------------------------------
// Animation: plays through the selected day, skipping the night
// ---------------------------------------------------------------------------
const isAnimating = ref(false);
const ANIMATION_STEP_MINUTES = 5;
const ANIMATION_INTERVAL_MS = 100;
let animationInterval = null;

const daylightWindow = computed(() => {
  const { sunrise, sunset } = sunTimes.value;
  if (!isValidDate(sunrise) || !isValidDate(sunset)) return null;
  const start = toZonedMinutes(sunrise, timeZone.value) - 30;
  const end = toZonedMinutes(sunset, timeZone.value) + 30;
  return start < end ? { start: Math.max(0, start), end: Math.min(MINUTES_PER_DAY - 1, end) } : null;
});

function stepAnimation() {
  const range = daylightWindow.value;
  let next = minutes.value + ANIMATION_STEP_MINUTES;

  if (range) {
    if (next > range.end || next < range.start) next = range.start;
  } else {
    next %= MINUTES_PER_DAY;
  }

  minutes.value = next;
}

function startAnimation() {
  if (animationInterval) return;
  const range = daylightWindow.value;
  if (range && (minutes.value < range.start || minutes.value >= range.end)) {
    minutes.value = range.start;
  }
  isAnimating.value = true;
  animationInterval = setInterval(stepAnimation, ANIMATION_INTERVAL_MS);
}

function stopAnimation() {
  isAnimating.value = false;
  clearInterval(animationInterval);
  animationInterval = null;
}

function toggleAnimation() {
  if (isAnimating.value) {
    stopAnimation();
  } else {
    startAnimation();
  }
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
function isEditable(target) {
  return target.closest?.('input, textarea, select, [contenteditable="true"]');
}

function handleKeydown(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (isEditable(e.target)) return;

  if (e.key === 'Escape') {
    showShortcuts.value = false;
    showSettings.value = false;
    return;
  }

  if (e.key === '?') {
    showShortcuts.value = !showShortcuts.value;
    return;
  }

  // Don't act behind an open dialog
  if (showShortcuts.value || showSettings.value) return;

  switch (e.key.toLowerCase()) {
    case 'n':
      setNow();
      break;
    case 'h':
      updateSettings({ showHouse: !settings.value.showHouse });
      break;
    case 's':
      updateSettings({ showSeasonalPaths: !settings.value.showSeasonalPaths });
      break;
    case 'd':
      toggleTheme();
      break;
    case ' ':
      // Let Space activate a focused button/switch/link as usual
      if (e.target.closest?.('button, a, [role="switch"]')) return;
      e.preventDefault();
      toggleAnimation();
      break;
    case 'arrowleft':
    case 'arrowright': {
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      e.preventDefault();
      if (e.shiftKey) {
        adjustDate(direction);
      } else {
        adjustTime(direction * 15);
      }
      break;
    }
  }
}

watch(showShortcuts, async (open) => {
  if (open) {
    await nextTick();
    shortcutsDialog.value?.focus();
  }
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onMounted(() => {
  darkQuery.addEventListener('change', handleSystemThemeChange);
  window.addEventListener('keydown', handleKeydown);

  // Only auto-locate first-time visitors if they already granted permission;
  // otherwise they can use "My Location" (prompting on page load is intrusive)
  if (!initialUrl.coordinates && !getRecentLocations().length && navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (status.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          selectLocation({ lat: position.coords.latitude, lng: position.coords.longitude, name: 'My location' });
          if (initialUrl.date === undefined && initialUrl.minutes === undefined) {
            setNow();
          }
        },
        () => {},
        { timeout: 10000, maximumAge: 600000 }
      );
    }).catch(() => {});
  }
});

onUnmounted(() => {
  darkQuery.removeEventListener('change', handleSystemThemeChange);
  window.removeEventListener('keydown', handleKeydown);
  stopAnimation();
});
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <div class="header-brand">
        <div class="brand-icon" aria-hidden="true">
          <i class="bi bi-sun-fill"></i>
        </div>
        <div class="brand-text">
          <h1>SolSet</h1>
          <span class="brand-tagline">Sun Position Tracker</span>
        </div>
      </div>

      <div class="header-search">
        <LocationInput
          :saved-locations="savedLocations"
          @select-location="selectLocation"
          @loading="loading = $event"
        />
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="solset-btn solset-btn-ghost solset-btn-icon solset-tooltip"
          data-tooltip="Copy share link"
          @click="shareView"
          aria-label="Copy share link"
        >
          <i class="bi bi-share"></i>
        </button>

        <button
          type="button"
          class="solset-btn solset-btn-ghost solset-btn-icon solset-tooltip hide-on-touch"
          data-tooltip="Keyboard shortcuts (?)"
          @click="showShortcuts = true"
          aria-label="Show keyboard shortcuts"
        >
          <i class="bi bi-keyboard"></i>
        </button>

        <button
          type="button"
          class="solset-btn solset-btn-ghost solset-btn-icon solset-tooltip"
          :data-tooltip="resolvedTheme === 'dark' ? 'Light mode (D)' : 'Dark mode (D)'"
          @click="toggleTheme"
          :aria-label="resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <i :class="resolvedTheme === 'dark' ? 'bi bi-sun' : 'bi bi-moon'"></i>
        </button>

        <button
          type="button"
          class="solset-btn solset-btn-ghost solset-btn-icon solset-tooltip"
          data-tooltip="Settings"
          @click="showSettings = true"
          aria-label="Open settings"
        >
          <i class="bi bi-gear"></i>
        </button>

        <a
          href="https://github.com/rouralberto/solset"
          target="_blank"
          rel="noopener"
          class="solset-btn solset-btn-ghost solset-btn-icon solset-tooltip tooltip-end"
          data-tooltip="View on GitHub"
          aria-label="View on GitHub"
        >
          <i class="bi bi-github"></i>
        </a>
      </div>
    </header>

    <!-- Main Content -->
    <main class="app-content">
      <!-- Sidebar -->
      <aside class="app-sidebar">
        <DateTimeSlider
          v-model:local-date="localDate"
          v-model:minutes="minutes"
          :instant="instant"
          :time-zone="timeZone"
          :sun-times="sunTimes"
          :coordinates="coordinates"
          :is-animating="isAnimating"
          @now="setNow"
          @toggle-animation="toggleAnimation"
        />

        <!-- Quick Date Jumps -->
        <div class="solset-card">
          <div class="solset-card-header">
            <h2 class="card-title"><i class="bi bi-calendar-event"></i>Key Dates {{ year }}</h2>
            <span class="hemisphere-note">{{ coordinates.lat >= 0 ? 'Northern' : 'Southern' }} hemisphere</span>
          </div>
          <div class="solset-card-body">
            <div class="quick-dates-grid">
              <button
                v-for="keyDate in keyDates"
                :key="keyDate.key"
                type="button"
                class="quick-date-btn"
                :class="{ active: localDate === keyDate.dateString }"
                :aria-pressed="localDate === keyDate.dateString"
                @click="localDate = keyDate.dateString"
              >
                <i :class="['bi', keyDate.icon]" :style="{ color: keyDate.color }"></i>
                <span class="quick-date-label">{{ keyDate.label }}</span>
                <span class="quick-date-date">{{ formatDisplayDate(keyDate.dateString, { month: 'short', day: 'numeric' }) }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Feature Toggles -->
        <div class="solset-card">
          <div class="solset-card-header">
            <h2 class="card-title"><i class="bi bi-toggles"></i>Visualization</h2>
          </div>
          <div class="solset-card-body">
            <div class="toggle-row">
              <div class="toggle-info">
                <i class="bi bi-house"></i>
                <span>House layout</span>
                <span class="kbd hide-on-touch">H</span>
              </div>
              <ToggleSwitch
                :model-value="settings.showHouse"
                @update:model-value="updateSettings({ showHouse: $event })"
                label="House layout"
              />
            </div>

            <template v-if="settings.showHouse">
              <div class="toggle-row">
                <div class="toggle-info">
                  <i class="bi bi-compass"></i>
                  <span>Auto-orient</span>
                </div>
                <ToggleSwitch
                  :model-value="settings.autoOrientHouse"
                  @update:model-value="updateSettings({ autoOrientHouse: $event })"
                  label="Auto-orient house"
                />
              </div>

              <div class="orientation-display">
                <span class="text-muted">{{ settings.autoOrientHouse ? 'Optimal: day side faces' : 'Day side faces' }}</span>
                <span class="solset-badge solset-badge-gold">{{ formatOrientation(houseOrientation) }}</span>
              </div>

              <div v-if="!settings.autoOrientHouse" class="orientation-control">
                <input
                  type="range"
                  class="solset-slider orientation-slider"
                  min="0"
                  max="359"
                  step="1"
                  :value="settings.houseOrientation"
                  @input="updateSettings({ houseOrientation: Number($event.target.value) })"
                  aria-label="House orientation in degrees"
                  :aria-valuetext="formatOrientation(settings.houseOrientation)"
                />
                <div class="orientation-markers">
                  <span>N</span><span>E</span><span>S</span><span>W</span><span>N</span>
                </div>
                <button
                  type="button"
                  class="solset-btn solset-btn-ghost btn-xs"
                  @click="updateSettings({ houseOrientation: Math.round(optimalOrientation) })"
                >
                  Reset to optimal ({{ formatOrientation(optimalOrientation) }})
                </button>
              </div>
              <p v-else class="hint">
                Faces the {{ coordinates.lat >= 0 ? 'south' : 'north' }} for winter sun, turned slightly east for morning light.
              </p>
            </template>

            <div class="solset-divider"></div>

            <div class="toggle-row">
              <div class="toggle-info">
                <i class="bi bi-calendar3"></i>
                <span>Seasonal sun paths</span>
                <span class="kbd hide-on-touch">S</span>
              </div>
              <ToggleSwitch
                :model-value="settings.showSeasonalPaths"
                @update:model-value="updateSettings({ showSeasonalPaths: $event })"
                label="Seasonal sun paths"
              />
            </div>
          </div>
        </div>

        <!-- Sun Data -->
        <SunInfo
          :coordinates="coordinates"
          :location-name="locationName"
          :sun-position="sunPosition"
          :sun-times="sunTimes"
          :time-zone="timeZone"
          :local-date="localDate"
          :minutes="minutes"
          :is-saved="!!currentSavedLocation"
          :shadow-height="settings.shadowHeight"
          :solar-system-size="settings.solarSystemSize"
          @toggle-save="toggleSaveLocation"
        />
      </aside>

      <!-- Map Area -->
      <div class="app-map">
        <div class="map-status">
          <div v-if="loading" class="status-chip">
            <i class="bi bi-arrow-repeat animate-spin"></i>
            Searching…
          </div>
          <div v-if="isAnimating" class="status-chip">
            <i class="bi bi-play-circle"></i>
            Playing through the day
            <button type="button" class="chip-btn" @click="stopAnimation">
              <i class="bi bi-pause-fill"></i> Pause
            </button>
          </div>
          <div v-else-if="!isSunUp" class="status-chip">
            <i class="bi bi-moon-stars-fill"></i>
            Sun is below the horizon
          </div>
        </div>

        <SunMap
          :coordinates="coordinates"
          @update:coordinates="updateCoordinatesFromMap"
          v-model:zoom="zoom"
          :sun-position="sunPosition"
          :noon-instant="noonInstant"
          :time-zone="timeZone"
          :year="year"
          :show-house="settings.showHouse"
          :show-seasonal-paths="settings.showSeasonalPaths"
          :house-orientation="houseOrientation"
        />
      </div>
    </main>

    <!-- Keyboard Shortcuts Modal -->
    <Teleport to="body">
      <div v-if="showShortcuts" class="modal-overlay" @click.self="showShortcuts = false">
        <div
          ref="shortcutsDialog"
          class="shortcuts-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          tabindex="-1"
        >
          <div class="modal-header">
            <h2 id="shortcuts-title"><i class="bi bi-keyboard"></i>Keyboard Shortcuts</h2>
            <button type="button" class="solset-btn solset-btn-ghost solset-btn-icon" @click="showShortcuts = false" aria-label="Close">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="shortcut-group">
              <h3>Time Control</h3>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">←</span> <span class="kbd">→</span></span>
                <span>Adjust time ±15 min</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">⇧</span> + <span class="kbd">←</span> <span class="kbd">→</span></span>
                <span>Adjust date ±1 day</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">N</span></span>
                <span>Jump to now</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">Space</span></span>
                <span>Play/pause through the day</span>
              </div>
            </div>

            <div class="shortcut-group">
              <h3>Visualization</h3>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">H</span></span>
                <span>Toggle house layout</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">S</span></span>
                <span>Toggle seasonal paths</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">D</span></span>
                <span>Toggle dark mode</span>
              </div>
            </div>

            <div class="shortcut-group">
              <h3>General</h3>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">?</span></span>
                <span>Show this help</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">Esc</span></span>
                <span>Close dialogs</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Settings Panel -->
    <SettingsPanel
      v-if="showSettings"
      :settings="settings"
      :saved-locations="savedLocations"
      @update-settings="updateSettings"
      @select-location="selectLocation"
      @remove-location="handleRemoveLocation"
      @share="shareView"
      @close="showSettings = false"
    />

    <!-- Toast Notification -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast.show" :class="['solset-toast', toast.type]" role="status" aria-live="polite">
          <i :class="toast.type === 'error' ? 'bi bi-exclamation-circle' : 'bi bi-check-circle'"></i>
          <span>{{ toast.message }}</span>
          <button type="button" class="solset-btn solset-btn-ghost solset-btn-icon" @click="hideToast" aria-label="Dismiss">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.app-container {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

/* Header */
.app-header {
  min-height: var(--header-height);
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  z-index: 1050;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.brand-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--sun-gold) 0%, var(--sun-orange) 100%);
  border-radius: var(--radius-md);
  color: white;
  font-size: 20px;
  box-shadow: var(--shadow-glow);
}

.brand-text h1 {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--sun-gold) 0%, var(--sun-orange) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}

.brand-tagline {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.header-search {
  flex: 1;
  min-width: 0;
  max-width: 640px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

/* Main Content */
.app-content {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* Sidebar */
.app-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  overflow-x: hidden;
}

/* Cards must keep their natural height inside the scrolling column */
.app-sidebar > * {
  flex-shrink: 0;
}

/* Map Area */
.app-map {
  flex: 1;
  min-width: 0;
  position: relative;
  background: var(--bg-tertiary);
}

.map-status {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.status-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.85);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-md);
  white-space: nowrap;
}

.chip-btn {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  padding: 2px 10px;
  font: inherit;
  font-size: 12px;
  color: #0f172a;
  background: var(--sun-gold);
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
}

/* Quick Dates */
.hemisphere-note {
  font-size: 11px;
  color: var(--text-tertiary);
}

.quick-dates-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.quick-date-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-display);
  color: var(--text-primary);
}

.quick-date-btn:hover {
  background: var(--bg-primary);
  border-color: var(--sun-gold);
}

.quick-date-btn.active {
  border-color: var(--sun-gold);
  background: var(--bg-accent);
}

.quick-date-btn i {
  font-size: 18px;
}

.quick-date-label {
  font-size: 12px;
  font-weight: 500;
}

.quick-date-date {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* Toggle Row */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.toggle-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-size: 13px;
}

.toggle-info i {
  color: var(--text-secondary);
  font-size: 16px;
}

.orientation-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 4px;
  font-size: 13px;
}

.orientation-control {
  padding: 8px 0 0;
}

.orientation-slider {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
}

.orientation-markers {
  display: flex;
  justify-content: space-between;
  padding: 4px 2px 0;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-tertiary);
}

.btn-xs {
  margin-top: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-tertiary);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 2000;
  animation: fade-in 0.2s ease;
}

.shortcuts-modal {
  width: 480px;
  max-width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: fade-in 0.3s ease;
}

.shortcuts-modal:focus {
  outline: none;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.shortcut-group {
  margin-bottom: 20px;
}

.shortcut-group:last-child {
  margin-bottom: 0;
}

.shortcut-group h3 {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  color: var(--text-secondary);
}

.shortcut-row:last-child {
  border-bottom: none;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Toast Transition */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Responsive: stack map above controls on narrow screens */
@media (max-width: 900px) {
  .app-container {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }

  .app-header {
    position: sticky;
    top: 0;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 8px 12px;
  }

  .brand-icon {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }

  .brand-tagline {
    display: none;
  }

  .header-search {
    order: 3;
    flex-basis: 100%;
    max-width: none;
  }

  .app-content {
    flex-direction: column;
    overflow: visible;
  }

  .app-map {
    order: -1;
    height: 60vh;
    height: 60svh;
    min-height: 340px;
    flex: none;
  }

  .app-sidebar {
    width: 100%;
    border-right: none;
    overflow: visible;
    padding: 12px;
  }
}
</style>
