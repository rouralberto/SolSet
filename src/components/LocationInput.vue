<script setup>
import { ref, computed } from 'vue';
import { geocodeAddress } from '../lib/mapUtils';
import { getRecentLocations, formatCoordinates } from '../lib/utils';
import { showToast } from '../lib/toast';

const props = defineProps({
  savedLocations: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['select-location', 'loading']);

const addressInput = ref('');
const isSearching = ref(false);
const isLocating = ref(false);
const showDropdown = ref(false);
const recentLocations = ref([]);

const COORDINATE_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

const dropdownSections = computed(() => [
  { title: 'Saved', icon: 'bi-bookmark-fill', items: props.savedLocations.slice(0, 5) },
  { title: 'Recent', icon: 'bi-clock-history', items: recentLocations.value.slice(0, 5) }
].filter(section => section.items.length > 0));

function handleFocus() {
  recentLocations.value = getRecentLocations();
  showDropdown.value = !addressInput.value;
}

function handleBlur() {
  showDropdown.value = false;
}

function handleInput() {
  // Searching only happens on explicit submit (Nominatim's policy forbids autocomplete)
  showDropdown.value = !addressInput.value;
}

function selectLocation(location) {
  emit('select-location', { lat: location.lat, lng: location.lng, name: location.name || null });
  addressInput.value = '';
  showDropdown.value = false;
}

async function handleSearch() {
  const query = addressInput.value.trim();
  if (!query) {
    showToast('Enter a place name, address or coordinates (lat, lng)');
    return;
  }

  showDropdown.value = false;

  // Coordinates, e.g. "43.3183, -1.9812"
  const match = COORDINATE_PATTERN.exec(query);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      selectLocation({ lat, lng, name: null });
      return;
    }
    showToast('Coordinates out of range. Latitude must be within ±90 and longitude within ±180.');
    return;
  }

  isSearching.value = true;
  emit('loading', true);

  try {
    const result = await geocodeAddress(query);
    selectLocation({ lat: result.lat, lng: result.lng, name: result.name || query });
  } catch (err) {
    showToast(err.message || 'Location not found. Please try a different search.');
  } finally {
    isSearching.value = false;
    emit('loading', false);
  }
}

function handleGeolocate() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser');
    return;
  }

  isLocating.value = true;
  emit('loading', true);

  navigator.geolocation.getCurrentPosition(
    (position) => {
      selectLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        name: 'My location'
      });
      isLocating.value = false;
      emit('loading', false);
    },
    (err) => {
      const messages = {
        [err.PERMISSION_DENIED]: 'Location access denied. Allow location access in your browser settings.',
        [err.POSITION_UNAVAILABLE]: 'Location information is unavailable.',
        [err.TIMEOUT]: 'Location request timed out. Please try again.'
      };
      showToast(messages[err.code] || 'Unable to get your location.');
      isLocating.value = false;
      emit('loading', false);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}
</script>

<template>
  <form class="location-input-container" role="search" @submit.prevent="handleSearch">
    <div class="search-wrapper">
      <div class="search-input-group">
        <i class="bi bi-search search-icon"></i>
        <input
          v-model="addressInput"
          type="search"
          placeholder="Search a place or enter lat, lng"
          class="solset-input search-input"
          @input="handleInput"
          @focus="handleFocus"
          @blur="handleBlur"
          @keydown.esc="showDropdown = false"
          aria-label="Search location"
          autocomplete="off"
          enterkeyhint="search"
        />
        <div v-if="isSearching" class="search-spinner">
          <i class="bi bi-arrow-repeat animate-spin"></i>
        </div>
      </div>

      <!-- Saved & Recent Locations Dropdown -->
      <div v-if="showDropdown && dropdownSections.length > 0" class="search-dropdown">
        <template v-for="section in dropdownSections" :key="section.title">
          <div class="dropdown-header">
            <i :class="['bi', section.icon]"></i>
            {{ section.title }}
          </div>
          <button
            v-for="(loc, idx) in section.items"
            :key="`${section.title}-${idx}`"
            type="button"
            class="dropdown-item"
            @mousedown.prevent
            @click="selectLocation(loc)"
          >
            <i class="bi bi-geo-alt"></i>
            <div class="dropdown-item-content">
              <span class="dropdown-item-name">{{ loc.name || formatCoordinates(loc.lat, loc.lng) }}</span>
              <span v-if="loc.name" class="dropdown-item-coords">{{ formatCoordinates(loc.lat, loc.lng) }}</span>
            </div>
          </button>
        </template>
      </div>
    </div>

    <div class="search-actions">
      <button
        type="submit"
        class="solset-btn solset-btn-primary"
        :disabled="isSearching"
        aria-label="Search"
      >
        <i class="bi bi-search"></i>
        <span class="btn-text">Search</span>
      </button>

      <button
        type="button"
        @click="handleGeolocate"
        class="solset-btn solset-btn-secondary"
        :disabled="isLocating"
        aria-label="Use my location"
        title="Use my location"
      >
        <i :class="isLocating ? 'bi bi-arrow-repeat animate-spin' : 'bi bi-crosshair'"></i>
        <span class="btn-text">My Location</span>
      </button>
    </div>
  </form>
</template>

<style scoped>
.location-input-container {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.search-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
}

.search-input-group {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: var(--text-tertiary);
  font-size: 14px;
  pointer-events: none;
}

.search-input {
  padding-left: 40px;
  padding-right: 40px;
}

.search-input::-webkit-search-cancel-button {
  cursor: pointer;
}

.search-spinner {
  position: absolute;
  right: 14px;
  color: var(--sun-gold);
  font-size: 16px;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 1100;
  overflow: hidden;
  animation: fade-in 0.2s ease;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;
  font-family: var(--font-display);
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover,
.dropdown-item:focus-visible {
  background: var(--bg-tertiary);
}

.dropdown-item i {
  color: var(--text-tertiary);
  font-size: 16px;
}

.dropdown-item-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dropdown-item-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-item-coords {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
}

.search-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 1100px) {
  .btn-text {
    display: none;
  }

  .search-actions .solset-btn {
    padding: 10px 12px;
  }
}
</style>
