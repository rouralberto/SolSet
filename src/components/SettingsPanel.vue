<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { getRecentLocations, clearRecentLocations, downloadFile, formatCoordinates } from '../lib/utils';
import ToggleSwitch from './ToggleSwitch.vue';

const props = defineProps({
  settings: {
    type: Object,
    required: true
  },
  savedLocations: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update-settings', 'select-location', 'remove-location', 'share', 'close']);

const recentLocations = ref(getRecentLocations());
const activeTab = ref('general');
const panel = ref(null);

const tabs = [
  { id: 'general', label: 'General', icon: 'bi-sliders' },
  { id: 'locations', label: 'Locations', icon: 'bi-geo-alt' },
  { id: 'export', label: 'Share & Export', icon: 'bi-box-arrow-up' }
];

const themes = [
  { id: 'light', label: 'Light', icon: 'bi-sun' },
  { id: 'dark', label: 'Dark', icon: 'bi-moon' },
  { id: 'system', label: 'System', icon: 'bi-laptop' }
];

onMounted(() => panel.value?.focus());

function update(patch) {
  emit('update-settings', patch);
}

// Number inputs commit on change (blur/enter) so values aren't clamped mid-typing
async function updateNumber(key, event) {
  const input = event.target;
  update({ [key]: input.value === '' ? null : Number(input.value) });
  // Reflect the sanitised value back if the input was invalid or out of range
  await nextTick();
  input.value = props.settings[key];
}

function goTo(location) {
  emit('select-location', { lat: location.lat, lng: location.lng, name: location.name || null });
  emit('close');
}

function clearRecent() {
  recentLocations.value = clearRecentLocations();
}

function exportData() {
  const data = {
    settings: props.settings,
    savedLocations: props.savedLocations,
    exportedAt: new Date().toISOString()
  };
  downloadFile(JSON.stringify(data, null, 2), 'solset-export.json');
}
</script>

<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="emit('close')">
      <div
        ref="panel"
        class="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex="-1"
      >
        <div class="settings-header">
          <h2 id="settings-title"><i class="bi bi-gear"></i>Settings</h2>
          <button type="button" class="solset-btn solset-btn-ghost solset-btn-icon" @click="emit('close')" aria-label="Close settings">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="settings-tabs" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :class="['tab-btn', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            <i :class="['bi', tab.icon]"></i>
            {{ tab.label }}
          </button>
        </div>

        <div class="settings-content">
          <!-- General Settings -->
          <div v-if="activeTab === 'general'" class="settings-section">
            <div class="setting-group">
              <h3>Theme</h3>
              <div class="theme-selector">
                <button
                  v-for="theme in themes"
                  :key="theme.id"
                  type="button"
                  :class="['theme-btn', { active: settings.theme === theme.id }]"
                  :aria-pressed="settings.theme === theme.id"
                  @click="update({ theme: theme.id })"
                >
                  <i :class="['bi', theme.icon]"></i>
                  {{ theme.label }}
                </button>
              </div>
            </div>

            <div class="setting-group">
              <h3>Shadow Calculation</h3>
              <div class="setting-row">
                <label class="setting-label" for="shadow-height">
                  Object height (m)
                  <span class="setting-hint">Height of a wall, tree or fence to calculate its shadow length</span>
                </label>
                <input
                  id="shadow-height"
                  type="number"
                  :value="settings.shadowHeight"
                  @change="updateNumber('shadowHeight', $event)"
                  min="0.1"
                  max="1000"
                  step="0.1"
                  inputmode="decimal"
                  class="solset-input setting-input-small"
                />
              </div>
            </div>

            <div class="setting-group">
              <h3>Solar Production</h3>
              <div class="setting-row">
                <label class="setting-label" for="system-size">
                  System size (kW)
                  <span class="setting-hint">Peak power of the solar panel system for the production estimate</span>
                </label>
                <input
                  id="system-size"
                  type="number"
                  :value="settings.solarSystemSize"
                  @change="updateNumber('solarSystemSize', $event)"
                  min="0.1"
                  max="10000"
                  step="0.1"
                  inputmode="decimal"
                  class="solset-input setting-input-small"
                />
              </div>
            </div>

            <div class="setting-group">
              <h3>House Layout</h3>
              <div class="setting-row">
                <span class="setting-label">Show house layout on map</span>
                <ToggleSwitch
                  :model-value="settings.showHouse"
                  @update:model-value="update({ showHouse: $event })"
                  label="Show house layout on map"
                />
              </div>
              <div class="setting-row">
                <span class="setting-label">Auto-orient house to optimal position</span>
                <ToggleSwitch
                  :model-value="settings.autoOrientHouse"
                  @update:model-value="update({ autoOrientHouse: $event })"
                  label="Auto-orient house to optimal position"
                />
              </div>
            </div>
          </div>

          <!-- Locations -->
          <div v-if="activeTab === 'locations'" class="settings-section">
            <div class="setting-group">
              <h3>Saved Locations</h3>
              <div v-if="savedLocations.length === 0" class="empty-state">
                <i class="bi bi-bookmark"></i>
                <p>No saved locations yet</p>
                <span class="text-muted">Use the <i class="bi bi-bookmark"></i> button in the Sun Data panel to save the current location.</span>
              </div>
              <div v-else class="locations-list">
                <div v-for="loc in savedLocations" :key="loc.id" class="location-item">
                  <button type="button" class="location-info" @click="goTo(loc)" title="Go to this location">
                    <span class="location-name">{{ loc.name || 'Unnamed location' }}</span>
                    <span class="location-coords">{{ formatCoordinates(loc.lat, loc.lng) }}</span>
                  </button>
                  <button
                    type="button"
                    class="solset-btn solset-btn-ghost solset-btn-icon"
                    @click="emit('remove-location', loc.id)"
                    :aria-label="`Remove ${loc.name || 'location'}`"
                    title="Remove"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="setting-group">
              <div class="group-header">
                <h3>Recent Locations</h3>
                <button v-if="recentLocations.length" type="button" class="solset-btn solset-btn-ghost link-btn" @click="clearRecent">
                  Clear
                </button>
              </div>
              <div v-if="recentLocations.length === 0" class="empty-state">
                <i class="bi bi-clock-history"></i>
                <p>No recent locations</p>
              </div>
              <div v-else class="locations-list">
                <div v-for="(loc, idx) in recentLocations" :key="idx" class="location-item">
                  <button type="button" class="location-info" @click="goTo(loc)" title="Go to this location">
                    <span class="location-name">{{ loc.name || formatCoordinates(loc.lat, loc.lng) }}</span>
                    <span v-if="loc.name" class="location-coords">{{ formatCoordinates(loc.lat, loc.lng) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Share & Export -->
          <div v-if="activeTab === 'export'" class="settings-section">
            <div class="setting-group">
              <h3>Share Current View</h3>
              <p class="text-muted">Copy a link to this exact location, date and time.</p>
              <button type="button" class="solset-btn solset-btn-secondary" @click="emit('share')">
                <i class="bi bi-link-45deg"></i>
                Copy Share Link
              </button>
            </div>

            <div class="setting-group">
              <h3>Export Data</h3>
              <p class="text-muted">Download your settings and saved locations as a JSON file.</p>
              <button type="button" class="solset-btn solset-btn-secondary" @click="exportData">
                <i class="bi bi-download"></i>
                Export to JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
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

.settings-panel {
  width: 520px;
  max-width: 100%;
  max-height: min(80vh, 720px);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fade-in 0.3s ease;
}

.settings-panel:focus {
  outline: none;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.settings-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 8px;
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.tab-btn.active {
  color: var(--sun-orange);
  border-bottom-color: var(--sun-gold);
  background: var(--bg-secondary);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.setting-group h3 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.setting-group p {
  margin: 0 0 12px;
}

.group-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.link-btn {
  padding: 2px 8px;
  font-size: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  color: var(--text-primary);
}

.setting-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.setting-input-small {
  width: 90px;
  flex-shrink: 0;
  text-align: right;
  padding: 8px 12px;
}

.theme-selector {
  display: flex;
  gap: 8px;
}

.theme-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--bg-tertiary);
  border: 2px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-display);
  font-size: 13px;
  color: var(--text-secondary);
}

.theme-btn:hover {
  border-color: var(--border-color-strong);
}

.theme-btn.active {
  border-color: var(--sun-gold);
  color: var(--sun-orange);
  background: var(--bg-accent);
}

.theme-btn i {
  font-size: 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
}

.empty-state > i {
  font-size: 32px;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
  color: var(--text-secondary);
}

.locations-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.location-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding-right: 6px;
  transition: border-color var(--transition-fast);
}

.location-item:hover {
  border-color: var(--sun-gold);
}

.location-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-display);
}

.location-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-coords {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
}

@media (max-width: 480px) {
  .tab-btn i {
    display: none;
  }

  .theme-btn {
    padding: 12px 8px;
  }
}
</style>
