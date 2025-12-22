<script setup>
import { ref, computed } from 'vue';
import { geocodeAddress } from '../lib/mapUtils';
import { debounce, getRecentLocations, formatCoordinates } from '../lib/utils';

// Props
const props = defineProps({
  coordinates: {
    type: Object,
    default: () => ({ lat: 0, lng: 0 })
  }
});

// Emit events
const emit = defineEmits(['update-coordinates', 'loading']);

// State
const addressInput = ref('');
const isSearching = ref(false);
const showDropdown = ref(false);
const recentLocations = ref([]);

// Toast state
const toast = ref({ show: false, message: '', type: 'error' });

// Formatted current coordinates
const currentCoords = computed(() => {
  return formatCoordinates(props.coordinates.lat, props.coordinates.lng);
});

// Show toast notification
function showToast(message, type = 'error') {
  toast.value = { show: true, message, type };
  setTimeout(() => {
    toast.value.show = false;
  }, 4000);
}

// Load recent locations when dropdown opens
function handleFocus() {
  recentLocations.value = getRecentLocations();
  if (recentLocations.value.length > 0 || addressInput.value === '') {
    showDropdown.value = true;
  }
}

// Close dropdown
function handleBlur() {
  // Delay to allow click on dropdown items
  setTimeout(() => {
    showDropdown.value = false;
  }, 200);
}

// Select a recent location
function selectRecentLocation(location) {
  const coords = {
    lat: location.lat,
    lng: location.lng,
    name: location.name,
    forceUpdate: true
  };
  emit('update-coordinates', coords);
  addressInput.value = location.name || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
  showDropdown.value = false;
}

// Debounced search
const debouncedSearch = debounce(async (query) => {
  if (!query || query.length < 3) return;
  await performSearch(query);
}, 400);

// Handle input change
function handleInput() {
  showDropdown.value = false;
  if (addressInput.value.length >= 3) {
    debouncedSearch(addressInput.value);
  }
}

// Handle search
async function handleSearch() {
  if (!addressInput.value) {
    showToast('Please enter an address or coordinates');
    return;
  }
  await performSearch(addressInput.value);
}

// Perform the actual search
async function performSearch(query) {
  isSearching.value = true;
  emit('loading', true);

  try {
    // Try to parse as coordinates first (format: "lat, lng")
    if (query.match(/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/)) {
      const [lat, lng] = query.split(',').map(coord => parseFloat(coord.trim()));

      // Basic validation
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const coords = {
          lat,
          lng,
          forceUpdate: true
        };
        emit('update-coordinates', coords);
        isSearching.value = false;
        emit('loading', false);
        return;
      }
    }

    // If not coordinates, try geocoding
    const response = await geocodeAddress(query);
    const coords = {
      ...response,
      name: query,
      forceUpdate: true
    };
    emit('update-coordinates', coords);
  } catch (err) {
    showToast(err.message || 'Location not found. Please try a different search.');
  } finally {
    isSearching.value = false;
    emit('loading', false);
  }
}

// Handle browser geolocation
function handleGeolocate() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser');
    return;
  }

  emit('loading', true);

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        name: 'Current Location',
        forceUpdate: true
      };

      addressInput.value = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;

      setTimeout(() => {
        emit('update-coordinates', coords);
        emit('loading', false);
      }, 100);
    },
    (err) => {
      let errorMessage = 'Unable to get your location.';

      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMessage = 'Location access denied. Please enable location services.';
          break;
        case err.POSITION_UNAVAILABLE:
          errorMessage = 'Location information is unavailable.';
          break;
        case err.TIMEOUT:
          errorMessage = 'Location request timed out. Please try again.';
          break;
      }

      showToast(errorMessage);
      emit('loading', false);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}
</script>

<template>
  <div class="location-input-container">
    <div class="search-wrapper">
      <div class="search-input-group">
        <i class="bi bi-search search-icon"></i>
        <input
          v-model="addressInput"
          type="text"
          :placeholder="`Search location or enter coordinates • ${currentCoords}`"
          class="solset-input search-input"
          @keyup.enter="handleSearch"
          @input="handleInput"
          @focus="handleFocus"
          @blur="handleBlur"
          aria-label="Search location"
        />
        <div v-if="isSearching" class="search-spinner">
          <i class="bi bi-arrow-repeat animate-spin"></i>
        </div>
      </div>

      <!-- Recent Locations Dropdown -->
      <div v-if="showDropdown && recentLocations.length > 0" class="search-dropdown">
        <div class="dropdown-header">
          <i class="bi bi-clock-history"></i>
          Recent Locations
        </div>
        <button
          v-for="(loc, idx) in recentLocations.slice(0, 5)"
          :key="idx"
          class="dropdown-item"
          @mousedown.prevent="selectRecentLocation(loc)"
        >
          <i class="bi bi-geo-alt"></i>
          <div class="dropdown-item-content">
            <span class="dropdown-item-name">{{ loc.name || 'Unnamed Location' }}</span>
            <span class="dropdown-item-coords">{{ loc.lat.toFixed(4) }}, {{ loc.lng.toFixed(4) }}</span>
          </div>
        </button>
      </div>
    </div>

    <div class="search-actions">
      <button
        @click="handleSearch"
        class="solset-btn solset-btn-primary"
        :disabled="isSearching"
        aria-label="Search"
      >
        <i class="bi bi-search"></i>
        <span>Search</span>
      </button>

      <button
        @click="handleGeolocate"
        class="solset-btn solset-btn-secondary"
        :disabled="isSearching"
        aria-label="Use my location"
      >
        <i class="bi bi-crosshair"></i>
        <span>My Location</span>
      </button>
    </div>

    <!-- Toast Notification -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast.show" :class="['solset-toast', toast.type]">
          <i :class="toast.type === 'error' ? 'bi bi-exclamation-circle' : 'bi bi-check-circle'"></i>
          <span>{{ toast.message }}</span>
          <button class="solset-btn solset-btn-ghost solset-btn-icon" @click="toast.show = false">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.location-input-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-wrapper {
  flex: 1;
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
  z-index: 100;
  overflow: hidden;
  animation: fade-in 0.2s ease;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
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
  padding: 12px 14px;
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

.dropdown-item:hover {
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
}

.dropdown-item-name {
  font-size: 14px;
  color: var(--text-primary);
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

/* Toast Transition */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
