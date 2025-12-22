<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import SunMap from './components/SunMap.vue';
import LocationInput from './components/LocationInput.vue';
import DateTimeSlider from './components/DateTimeSlider.vue';
import SunInfo from './components/SunInfo.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import { parseUrlParams, updateUrlParams, getSettings, saveSettings, addRecentLocation } from './lib/utils';

// Theme management
const theme = ref('system');
const resolvedTheme = computed(() => {
  if (theme.value === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme.value;
});

// Core state
const coordinates = ref({ lat: 43.3183, lng: -1.9812 }); // Donostia - San Sebastián
const date = ref(new Date());
const time = ref(new Date());
const loading = ref(false);

// Feature toggles
const showHouse = ref(true);
const showSeasonalPaths = ref(false);
const autoOrientHouse = ref(true);
const houseOrientation = ref({ angle: 0, label: '0° (N)' });
const manualOrientation = ref(0);

// Settings
const settings = ref(getSettings());
const showSettings = ref(false);

// Animation state
const isAnimating = ref(false);
const animationSpeed = ref(1);
let animationInterval = null;

// Keyboard shortcuts
const showShortcuts = ref(false);

// Apply theme to document
watch(resolvedTheme, (newTheme) => {
  document.documentElement.setAttribute('data-theme', newTheme);
}, { immediate: true });

// Listen for system theme changes
onMounted(() => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    if (theme.value === 'system') {
      document.documentElement.setAttribute('data-theme', resolvedTheme.value);
    }
  };
  mediaQuery.addEventListener('change', handleChange);

  // Load from URL or defaults
  const urlParams = parseUrlParams();
  if (urlParams) {
    if (urlParams.coordinates) coordinates.value = urlParams.coordinates;
    if (urlParams.date) date.value = urlParams.date;
    if (urlParams.time) time.value = urlParams.time;
    if (urlParams.theme) theme.value = urlParams.theme;
  } else {
    // Try to get user location
    if (navigator.geolocation) {
      loading.value = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          coordinates.value = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          loading.value = false;
        },
        () => {
          loading.value = false;
        }
      );
    }
  }

  // Load settings
  const savedSettings = getSettings();
  settings.value = savedSettings;
  showHouse.value = savedSettings.showHouse;
  autoOrientHouse.value = savedSettings.autoOrientHouse;

  // Keyboard shortcuts
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  stopAnimation();
});

// Update URL when state changes
watch([coordinates, date, time, theme], () => {
  updateUrlParams({
    coordinates: coordinates.value,
    date: date.value,
    time: time.value,
    theme: theme.value
  });
}, { deep: true });

// Keyboard shortcuts handler
function handleKeydown(e) {
  // Don't trigger if typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'n':
    case 'N':
      setNow();
      break;
    case 'h':
    case 'H':
      showHouse.value = !showHouse.value;
      break;
    case 's':
    case 'S':
      showSeasonalPaths.value = !showSeasonalPaths.value;
      break;
    case 'd':
    case 'D':
      toggleTheme();
      break;
    case ' ':
      e.preventDefault();
      toggleAnimation();
      break;
    case 'ArrowLeft':
      if (e.shiftKey) {
        adjustDate(-1);
      } else {
        adjustTime(-15);
      }
      break;
    case 'ArrowRight':
      if (e.shiftKey) {
        adjustDate(1);
      } else {
        adjustTime(15);
      }
      break;
    case '?':
      showShortcuts.value = !showShortcuts.value;
      break;
    case 'Escape':
      showShortcuts.value = false;
      showSettings.value = false;
      break;
  }
}

function adjustTime(minutes) {
  const newTime = new Date(time.value);
  newTime.setMinutes(newTime.getMinutes() + minutes);
  time.value = newTime;
}

function adjustDate(days) {
  const newDate = new Date(date.value);
  newDate.setDate(newDate.getDate() + days);
  date.value = newDate;
}

function toggleTheme() {
  const themes = ['light', 'dark', 'system'];
  const currentIndex = themes.indexOf(theme.value);
  theme.value = themes[(currentIndex + 1) % themes.length];
}

function setNow() {
  const now = new Date();
  date.value = now;
  time.value = now;
}

function toggleAnimation() {
  if (isAnimating.value) {
    stopAnimation();
  } else {
    startAnimation();
  }
}

function startAnimation() {
  isAnimating.value = true;
  animationInterval = setInterval(() => {
    adjustTime(5 * animationSpeed.value);
  }, 100);
}

function stopAnimation() {
  isAnimating.value = false;
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
}

// Event handlers
const updateCoordinates = (newCoords) => {
  coordinates.value = { ...newCoords };
  addRecentLocation({
    lat: newCoords.lat,
    lng: newCoords.lng,
    name: newCoords.name || null
  });
};

const updateDate = (newDate) => {
  date.value = newDate;
};

const updateTime = (newTime) => {
  time.value = newTime;
};

const setLoading = (isLoading) => {
  loading.value = isLoading;
};

const updateHouseOrientation = (orientation) => {
  houseOrientation.value = orientation;
};

const updateManualOrientation = (angle) => {
  manualOrientation.value = angle;
};

const updateSettings = (newSettings) => {
  settings.value = newSettings;
  saveSettings(newSettings);
  showHouse.value = newSettings.showHouse;
  autoOrientHouse.value = newSettings.autoOrientHouse;
};

// Quick date buttons
const goToSummerSolstice = () => {
  date.value = new Date(date.value.getFullYear(), 5, 21);
};

const goToWinterSolstice = () => {
  date.value = new Date(date.value.getFullYear(), 11, 21);
};

const goToSpringEquinox = () => {
  date.value = new Date(date.value.getFullYear(), 2, 20);
};

const goToFallEquinox = () => {
  date.value = new Date(date.value.getFullYear(), 8, 22);
};
</script>

<template>
  <main class="app-container">
    <!-- Header -->
    <header class="app-header">
      <div class="header-brand">
        <div class="brand-icon">
          <i class="bi bi-sun-fill"></i>
        </div>
        <div class="brand-text">
          <h1>SolSet</h1>
          <span class="brand-tagline">Sun Position Tracker</span>
        </div>
      </div>

      <div class="header-search">
        <LocationInput
          @update-coordinates="updateCoordinates"
          @loading="setLoading"
          :coordinates="coordinates"
        />
      </div>

      <div class="header-actions">
        <button
          class="solset-btn solset-btn-ghost solset-btn-icon solset-tooltip"
          data-tooltip="Keyboard shortcuts (?)"
          @click="showShortcuts = true"
          aria-label="Show keyboard shortcuts"
        >
          <i class="bi bi-keyboard"></i>
        </button>

        <button
          class="solset-btn solset-btn-ghost solset-btn-icon solset-tooltip"
          :data-tooltip="resolvedTheme === 'dark' ? 'Light mode (D)' : 'Dark mode (D)'"
          @click="toggleTheme"
          aria-label="Toggle theme"
        >
          <i :class="resolvedTheme === 'dark' ? 'bi bi-sun' : 'bi bi-moon'"></i>
        </button>

        <button
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
          class="solset-btn solset-btn-ghost solset-btn-icon solset-tooltip"
          data-tooltip="View on GitHub"
          aria-label="View on GitHub"
        >
          <i class="bi bi-github"></i>
        </a>
      </div>
    </header>

    <!-- Main Content -->
    <div class="app-content">
      <!-- Sidebar -->
      <aside class="app-sidebar">
        <!-- Date & Time Controls -->
        <DateTimeSlider
          :current-date="date"
          :current-time="time"
          :coordinates="coordinates"
          :is-animating="isAnimating"
          @update-date="updateDate"
          @update-time="updateTime"
          @toggle-animation="toggleAnimation"
        />

        <!-- Quick Date Jumps -->
        <div class="solset-card">
          <div class="solset-card-header">
            <h5><i class="bi bi-calendar-event me-2"></i>Quick Dates</h5>
          </div>
          <div class="solset-card-body">
            <div class="quick-dates-grid">
              <button class="quick-date-btn" @click="goToSummerSolstice">
                <i class="bi bi-brightness-high text-orange"></i>
                <span>Summer Solstice</span>
              </button>
              <button class="quick-date-btn" @click="goToWinterSolstice">
                <i class="bi bi-snow text-blue"></i>
                <span>Winter Solstice</span>
              </button>
              <button class="quick-date-btn" @click="goToSpringEquinox">
                <i class="bi bi-flower1" style="color: #10b981"></i>
                <span>Spring Equinox</span>
              </button>
              <button class="quick-date-btn" @click="goToFallEquinox">
                <i class="bi bi-tree" style="color: #d97706"></i>
                <span>Fall Equinox</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Feature Toggles -->
        <div class="solset-card">
          <div class="solset-card-header">
            <h5><i class="bi bi-toggles me-2"></i>Visualization</h5>
          </div>
          <div class="solset-card-body">
            <div class="toggle-row">
              <div class="toggle-info">
                <i class="bi bi-house"></i>
                <span>House Layout</span>
                <span class="kbd">H</span>
              </div>
              <div
                class="solset-toggle"
                :class="{ active: showHouse }"
                @click="showHouse = !showHouse"
                role="switch"
                :aria-checked="showHouse"
                tabindex="0"
                @keydown.enter="showHouse = !showHouse"
                @keydown.space.prevent="showHouse = !showHouse"
              ></div>
            </div>

            <div class="toggle-row" v-if="showHouse">
              <div class="toggle-info">
                <i class="bi bi-compass"></i>
                <span>Auto-Orient</span>
              </div>
              <div
                class="solset-toggle"
                :class="{ active: autoOrientHouse }"
                @click="autoOrientHouse = !autoOrientHouse"
                role="switch"
                :aria-checked="autoOrientHouse"
                tabindex="0"
                @keydown.enter="autoOrientHouse = !autoOrientHouse"
                @keydown.space.prevent="autoOrientHouse = !autoOrientHouse"
              ></div>
            </div>

            <div v-if="showHouse" class="orientation-display">
              <span class="text-muted">Optimal:</span>
              <span class="solset-badge solset-badge-gold">{{ houseOrientation.label }}</span>
            </div>

            <div class="solset-divider"></div>

            <div class="toggle-row">
              <div class="toggle-info">
                <i class="bi bi-calendar3"></i>
                <span>Seasonal Paths</span>
                <span class="kbd">S</span>
              </div>
              <div
                class="solset-toggle"
                :class="{ active: showSeasonalPaths }"
                @click="showSeasonalPaths = !showSeasonalPaths"
                role="switch"
                :aria-checked="showSeasonalPaths"
                tabindex="0"
                @keydown.enter="showSeasonalPaths = !showSeasonalPaths"
                @keydown.space.prevent="showSeasonalPaths = !showSeasonalPaths"
              ></div>
            </div>
          </div>
        </div>

        <!-- Sun Data -->
        <SunInfo
          :coordinates="coordinates"
          :date="date"
          :time="time"
          :house-orientation="houseOrientation"
          :shadow-height="settings.shadowHeight"
          :solar-system-size="settings.solarSystemSize"
        />
      </aside>

      <!-- Map Area -->
      <div class="app-map">
        <!-- Loading Overlay -->
        <div v-if="loading" class="loading-overlay">
          <div class="loading-spinner">
            <i class="bi bi-sun-fill animate-spin"></i>
          </div>
          <span>Loading...</span>
        </div>

        <!-- Animation Controls -->
        <div v-if="isAnimating" class="animation-controls">
          <div class="animation-badge">
            <i class="bi bi-play-circle animate-glow"></i>
            <span>Animating</span>
          </div>
          <button class="solset-btn solset-btn-secondary" @click="stopAnimation">
            <i class="bi bi-stop-fill"></i>
            Stop
          </button>
        </div>

        <SunMap
          v-model:coordinates="coordinates"
          :date="date"
          :time="time"
          v-model:showHouse="showHouse"
          :show-seasonal-paths="showSeasonalPaths"
          :auto-orient="autoOrientHouse"
          :manual-orientation="manualOrientation"
          @update-house-orientation="updateHouseOrientation"
        />
      </div>
    </div>

    <!-- Keyboard Shortcuts Modal -->
    <Teleport to="body">
      <div v-if="showShortcuts" class="modal-overlay" @click.self="showShortcuts = false">
        <div class="shortcuts-modal">
          <div class="modal-header">
            <h3><i class="bi bi-keyboard me-2"></i>Keyboard Shortcuts</h3>
            <button class="solset-btn solset-btn-ghost solset-btn-icon" @click="showShortcuts = false">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="shortcut-group">
              <h4>Time Control</h4>
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
                <span>Play/Pause animation</span>
              </div>
            </div>

            <div class="shortcut-group">
              <h4>Visualization</h4>
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
              <h4>General</h4>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">?</span></span>
                <span>Show this help</span>
              </div>
              <div class="shortcut-row">
                <span class="shortcut-keys"><span class="kbd">Esc</span></span>
                <span>Close modals</span>
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
      @update-settings="updateSettings"
      @close="showSettings = false"
    />
  </main>
</template>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

/* Header */
.app-header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  z-index: 100;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 200px;
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
  margin: 0;
  line-height: 1.2;
}

.brand-tagline {
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.header-search {
  flex: 1;
  max-width: 600px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Main Content */
.app-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Sidebar */
.app-sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(100vh - var(--header-height));
}

/* Map Area */
.app-map {
  flex: 1;
  position: relative;
  background: var(--bg-tertiary);
}

/* Loading Overlay */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(var(--bg-primary), 0.9);
  backdrop-filter: blur(4px);
  z-index: 50;
  color: var(--text-secondary);
}

.loading-spinner {
  font-size: 48px;
  color: var(--sun-gold);
}

/* Animation Controls */
.animation-controls {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-lg);
  z-index: 30;
}

.animation-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sun-gold);
  font-weight: 500;
}

/* Quick Dates */
.quick-dates-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.quick-date-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
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

.quick-date-btn i {
  font-size: 18px;
}

.quick-date-btn span {
  font-size: 11px;
  font-weight: 500;
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
  padding: 8px 0;
  font-size: 13px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1000;
  animation: fade-in 0.2s ease;
}

.shortcuts-modal {
  width: 480px;
  max-height: 80vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: fade-in 0.3s ease;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
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

.shortcut-group h4 {
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
</style>
