<script setup>
import { ref, onMounted } from 'vue';
import { geocodeAddress } from '../lib/mapUtils';

// Emit events for parent component
const emit = defineEmits(['update-coordinates', 'loading']);

// Input value and error state
const addressInput = ref('');
const error = ref('');
const isSearching = ref(false);
const toastContainer = ref(null);

// Toast-related refs and functions
const showToast = ref(false);
const toastMessage = ref('');

// Initialize toast elements
onMounted(() => {
  // Create bootstrap toast instance if needed
});

// Function to display toast notification
function displayToast(message) {
  toastMessage.value = message;
  showToast.value = true;
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    showToast.value = false;
  }, 5000);
}

// Handle search by address
async function handleSearch() {
  if (!addressInput.value) {
    displayToast('Please enter an address or coordinates');
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
    displayToast(err.message || 'Error finding location. Please try again.');
  } finally {
    isSearching.value = false;
    emit('loading', false);
  }
}

// Handle browser geolocation
function handleGeolocate() {
  error.value = '';
  
  if (!navigator.geolocation) {
    displayToast('Geolocation is not supported by your browser');
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
      let errorMessage = 'An unknown error occurred while getting location.';
      
      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMessage = 'Location access denied. Please enable location services.';
          break;
        case err.POSITION_UNAVAILABLE:
          errorMessage = 'Location information is unavailable.';
          break;
        case err.TIMEOUT:
          errorMessage = 'Location request timed out.';
          break;
      }
      
      displayToast(errorMessage);
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
    
    <!-- Toast Container -->
    <div class="toast-container position-fixed bottom-0 end-0 p-3">
      <div 
        class="toast align-items-center text-bg-danger border-0" 
        role="alert" 
        aria-live="assertive" 
        aria-atomic="true"
        :class="{ 'show': showToast }"
      >
        <div class="d-flex">
          <div class="toast-body">
            {{ toastMessage }}
          </div>
          <button 
            type="button" 
            class="btn-close btn-close-white me-2 m-auto" 
            @click="showToast = false"
            aria-label="Close"
          ></button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-container {
  z-index: 1090;
}
</style> 
