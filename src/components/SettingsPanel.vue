<script setup>
import { ref, watch } from 'vue';
import { getSavedLocations, removeLocation, getRecentLocations, copyToClipboard, downloadFile } from '../lib/utils';

const props = defineProps({
  settings: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update-settings', 'close']);

// Local copy of settings
const localSettings = ref({ ...props.settings });

// Saved locations
const savedLocations = ref(getSavedLocations());
const recentLocations = ref(getRecentLocations());

// Active tab
const activeTab = ref('general');

// Watch for changes and emit
watch(localSettings, (newSettings) => {
  emit('update-settings', newSettings);
}, { deep: true });

function handleRemoveLocation(id) {
  savedLocations.value = removeLocation(id);
}

function exportData() {
  const data = {
    settings: localSettings.value,
    savedLocations: savedLocations.value,
    exportedAt: new Date().toISOString()
  };
  downloadFile(JSON.stringify(data, null, 2), 'solset-export.json');
}

async function copyShareLink() {
  const url = window.location.href;
  const success = await copyToClipboard(url);
  if (success) {
    // Could show a toast here
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="emit('close')">
      <div class="settings-panel">
        <div class="settings-header">
          <h2><i class="bi bi-gear me-2"></i>Settings</h2>
          <button class="solset-btn solset-btn-ghost solset-btn-icon" @click="emit('close')">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="settings-tabs">
          <button
            :class="['tab-btn', { active: activeTab === 'general' }]"
            @click="activeTab = 'general'"
          >
            <i class="bi bi-sliders"></i>
            General
          </button>
          <button
            :class="['tab-btn', { active: activeTab === 'locations' }]"
            @click="activeTab = 'locations'"
          >
            <i class="bi bi-geo-alt"></i>
            Locations
          </button>
          <button
            :class="['tab-btn', { active: activeTab === 'export' }]"
            @click="activeTab = 'export'"
          >
            <i class="bi bi-download"></i>
            Export
          </button>
        </div>

        <div class="settings-content">
          <!-- General Settings -->
          <div v-if="activeTab === 'general'" class="settings-section">
            <div class="setting-group">
              <h4>Theme</h4>
              <div class="theme-selector">
                <button
                  :class="['theme-btn', { active: localSettings.theme === 'light' }]"
                  @click="localSettings.theme = 'light'"
                >
                  <i class="bi bi-sun"></i>
                  Light
                </button>
                <button
                  :class="['theme-btn', { active: localSettings.theme === 'dark' }]"
                  @click="localSettings.theme = 'dark'"
                >
                  <i class="bi bi-moon"></i>
                  Dark
                </button>
                <button
                  :class="['theme-btn', { active: localSettings.theme === 'system' }]"
                  @click="localSettings.theme = 'system'"
                >
                  <i class="bi bi-laptop"></i>
                  System
                </button>
              </div>
            </div>

            <div class="setting-group">
              <h4>Shadow Calculation</h4>
              <label class="setting-row">
                <span class="setting-label">
                  Object Height (meters)
                  <span class="setting-hint">Height of object for shadow length calculation</span>
                </span>
                <input
                  type="number"
                  v-model.number="localSettings.shadowHeight"
                  min="0.1"
                  max="100"
                  step="0.1"
                  class="solset-input setting-input-small"
                />
              </label>
            </div>

            <div class="setting-group">
              <h4>Solar Production</h4>
              <label class="setting-row">
                <span class="setting-label">
                  System Size (kW)
                  <span class="setting-hint">Size of solar panel system for production estimate</span>
                </span>
                <input
                  type="number"
                  v-model.number="localSettings.solarSystemSize"
                  min="0.1"
                  max="1000"
                  step="0.1"
                  class="solset-input setting-input-small"
                />
              </label>
            </div>

            <div class="setting-group">
              <h4>House Layout</h4>
              <label class="setting-row">
                <span class="setting-label">Show house layout on map</span>
                <div
                  class="solset-toggle"
                  :class="{ active: localSettings.showHouse }"
                  @click="localSettings.showHouse = !localSettings.showHouse"
                  role="switch"
                  :aria-checked="localSettings.showHouse"
                ></div>
              </label>
              <label class="setting-row">
                <span class="setting-label">Auto-orient house to optimal position</span>
                <div
                  class="solset-toggle"
                  :class="{ active: localSettings.autoOrientHouse }"
                  @click="localSettings.autoOrientHouse = !localSettings.autoOrientHouse"
                  role="switch"
                  :aria-checked="localSettings.autoOrientHouse"
                ></div>
              </label>
            </div>
          </div>

          <!-- Locations -->
          <div v-if="activeTab === 'locations'" class="settings-section">
            <div class="setting-group">
              <h4>Saved Locations</h4>
              <div v-if="savedLocations.length === 0" class="empty-state">
                <i class="bi bi-bookmark"></i>
                <p>No saved locations yet</p>
                <span class="text-muted">Save locations by clicking the bookmark icon in search results</span>
              </div>
              <div v-else class="locations-list">
                <div v-for="loc in savedLocations" :key="loc.id" class="location-item">
                  <div class="location-info">
                    <span class="location-name">{{ loc.name || 'Unnamed Location' }}</span>
                    <span class="location-coords">{{ loc.lat.toFixed(4) }}, {{ loc.lng.toFixed(4) }}</span>
                  </div>
                  <button class="solset-btn solset-btn-ghost solset-btn-icon" @click="handleRemoveLocation(loc.id)">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="setting-group">
              <h4>Recent Locations</h4>
              <div v-if="recentLocations.length === 0" class="empty-state">
                <i class="bi bi-clock-history"></i>
                <p>No recent locations</p>
              </div>
              <div v-else class="locations-list">
                <div v-for="(loc, idx) in recentLocations" :key="idx" class="location-item">
                  <div class="location-info">
                    <span class="location-name">{{ loc.name || 'Unnamed Location' }}</span>
                    <span class="location-coords">{{ loc.lat.toFixed(4) }}, {{ loc.lng.toFixed(4) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Export -->
          <div v-if="activeTab === 'export'" class="settings-section">
            <div class="setting-group">
              <h4>Share Current View</h4>
              <p class="text-muted">Copy the current URL to share this exact view with others.</p>
              <button class="solset-btn solset-btn-secondary" @click="copyShareLink">
                <i class="bi bi-link-45deg"></i>
                Copy Share Link
              </button>
            </div>

            <div class="setting-group">
              <h4>Export Data</h4>
              <p class="text-muted">Download your settings and saved locations as a JSON file.</p>
              <button class="solset-btn solset-btn-secondary" @click="exportData">
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

.settings-panel {
  width: 520px;
  max-height: 80vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  animation: fade-in 0.3s ease;
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
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
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
  padding: 12px 16px;
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.tab-btn.active {
  color: var(--sun-gold);
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

.setting-group h4 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
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
  width: 80px;
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
  color: var(--sun-gold);
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
  padding: 32px;
  text-align: center;
  color: var(--text-tertiary);
}

.empty-state i {
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
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.location-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.location-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.location-coords {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>

