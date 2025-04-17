<script setup>
import { ref } from 'vue';
import { geocodeAddress } from '../lib/mapUtils';

// Emit events for parent component
const emit = defineEmits(['update-coordinates', 'loading']);

// Input value and error state
const addressInput = ref('');
const error = ref('');
const isSearching = ref(false);

// Handle search by address
async function handleSearch() {
  if (!addressInput.value) {
    error.value = 'Please enter an address or coordinates';
    return;
  }
  
  error.value = '';
  isSearching.value = true;
  emit('loading', true);
  
  try {
    // Try to parse as coordinates first (format: "lat, lng")
    if (addressInput.value.match(/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/)) {
      const [lat, lng] = addressInput.value.split(',').map(coord => parseFloat(coord.trim()));
      
      // Basic validation
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const coords = {
          lat,
          lng,
          forceUpdate: true // Force map update
        };
        emit('update-coordinates', coords);
        isSearching.value = false;
        emit('loading', false);
        return;
      }
    }
    
    // If not coordinates, try geocoding
    const response = await geocodeAddress(addressInput.value);
    const coords = {
      ...response,
      forceUpdate: true // Force map update
    };
    emit('update-coordinates', coords);
  } catch (err) {
    error.value = err.message || 'Error finding location. Please try again.';
  } finally {
    isSearching.value = false;
    emit('loading', false);
  }
}

// Handle browser geolocation
function handleGeolocate() {
  error.value = '';
  
  if (!navigator.geolocation) {
    error.value = 'Geolocation is not supported by your browser';
    return;
  }
  
  emit('loading', true);
  console.log('Requesting geolocation permission...');
  
  navigator.geolocation.getCurrentPosition(
    // Success
    (position) => {
      console.log('Geolocation succeeded:', position.coords);
      
      // Create a new coordinates object with forceUpdate flag
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        forceUpdate: true // Force map update
      };
      
      // Update the input field with the coordinates
      addressInput.value = `${coords.lat}, ${coords.lng}`;
      
      // Force a delay before emitting to ensure proper rendering order
      setTimeout(() => {
        // Emit the coordinates
        emit('update-coordinates', coords);
        emit('loading', false);
      }, 150);
    },
    // Error
    (err) => {
      console.error('Geolocation error:', err);
      switch (err.code) {
        case err.PERMISSION_DENIED:
          error.value = 'Location access denied. Please enable location services.';
          break;
        case err.POSITION_UNAVAILABLE:
          error.value = 'Location information is unavailable.';
          break;
        case err.TIMEOUT:
          error.value = 'Location request timed out.';
          break;
        default:
          error.value = 'An unknown error occurred while getting location.';
      }
      emit('loading', false);
    },
    // Options
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}
</script>

<template>
  <div>
    <div class="row g-2">
      <div class="col position-relative">
        <input
          v-model="addressInput"
          type="text"
          placeholder="Enter address or coordinates (lat, lng)"
          class="form-control"
          @keyup.enter="handleSearch"
        />
        <div v-if="isSearching" class="position-absolute top-50 end-0 translate-middle-y me-3">
          <div class="spinner-border spinner-border-sm text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
      
      <div class="col-auto d-flex gap-2">
        <button
          @click="handleSearch"
          class="btn btn-primary"
          :disabled="isSearching"
        >
          Search
        </button>
        
        <button
          @click="handleGeolocate"
          class="btn btn-success d-flex align-items-center"
          :disabled="isSearching"
        >
          <i class="bi bi-geo-alt me-1"></i>
          <span class="d-none d-md-inline">Locate Me</span>
        </button>
      </div>
    </div>
    
    <p v-if="error" class="mt-2 text-danger small">{{ error }}</p>
  </div>
</template> 
