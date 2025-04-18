<script setup>
import { ref, onMounted } from 'vue';
import SunMap from './components/SunMap.vue';
import LocationInput from './components/LocationInput.vue';
import DateTimeSlider from './components/DateTimeSlider.vue';
import SunInfo from './components/SunInfo.vue';

const coordinates = ref({ lat: 43.3183, lng: -1.9812 }); // Donostia - San Sebastián coordinates
const date = ref(new Date());
const time = ref(new Date());
const loading = ref(false);
const showHouse = ref(true); // Add state for house visibility
const showSeasonalPaths = ref(false); // Add state for seasonal sun paths
const houseOrientation = ref({ angle: 0, label: '0° (N)' }); // Store house orientation

// Set default date to today and attempt to get user location
onMounted(() => {
  // Default to current date and time
  const now = new Date();
  date.value = now;
  time.value = now;
  
  // Get user's location if geolocation is available
  if (navigator.geolocation) {
    loading.value = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Update coordinates with user's location
        coordinates.value = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        loading.value = false;
        console.log('User location detected:', coordinates.value);
      },
      (error) => {
        console.error('Geolocation error:', error);
        loading.value = false;
        // Keep default coordinates if geolocation fails
      }
    );
  }
});

// Update coordinates from location input
const updateCoordinates = (newCoords) => {
  // Create a new coordinates object to ensure Vue reactivity
  coordinates.value = { ...newCoords };
  console.log('Updated coordinates:', coordinates.value);
};

// Update date from day slider
const updateDate = (newDate) => {
  date.value = newDate;
};

// Update time from time slider
const updateTime = (newTime) => {
  time.value = newTime;
};

// Set both date and time to current moment
const setNow = () => {
  const now = new Date();
  date.value = now;
  time.value = now;
};

// Toggle loading state
const setLoading = (isLoading) => {
  loading.value = isLoading;
};

// Toggle house visibility
const toggleHouse = () => {
  showHouse.value = !showHouse.value;
};

// Toggle seasonal paths visibility
const toggleSeasonalPaths = () => {
  showSeasonalPaths.value = !showSeasonalPaths.value;
};

// Update house orientation from SunMap
const updateHouseOrientation = (orientation) => {
  houseOrientation.value = orientation;
};
</script>

<template>
  <main class="vh-100 d-flex flex-column bg-light">
    <!-- Header with location input -->
    <header class="p-3 bg-white shadow">
      <LocationInput 
        @update-coordinates="updateCoordinates" 
        @loading="setLoading" 
      />
    </header>

    <!-- Main content area with fixed sidebar and map -->
    <div class="flex-grow-1 d-flex overflow-hidden">
      <!-- Fixed sidebar with controls -->
      <aside class="sidebar bg-white shadow border-end" style="width: 320px; overflow-y: auto; z-index: 5;">
        <div class="p-3 pt-0 d-flex flex-column gap-4">
          <DateTimeSlider 
            :current-date="date"
            :current-time="time"
            :coordinates="coordinates"
            @update-date="updateDate"
            @update-time="updateTime"
          />
          
          <!-- House Layout Toggle -->
          <div class="bg-white rounded border shadow-sm p-3">
            <button 
              @click="toggleHouse" 
              class="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-center"
            >
              <i class="bi bi-house me-2"></i>
              {{ showHouse ? 'Hide House Layout' : 'Show House Layout' }}
            </button>
            
            <!-- House orientation info - only show when house is visible -->
            <div v-if="showHouse" class="mt-2 text-center text-muted small">
              <i class="bi bi-compass me-1"></i>
              Optimal orientation: {{ houseOrientation.label }}
            </div>
          </div>
          
          <!-- Seasonal Paths Toggle -->
          <div class="bg-white rounded border shadow-sm p-3">
            <button 
              @click="toggleSeasonalPaths" 
              class="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-center"
            >
              <i class="bi bi-calendar-week me-2"></i>
              {{ showSeasonalPaths ? 'Hide Seasonal Paths' : 'Show Seasonal Paths' }}
            </button>
            <div v-if="showSeasonalPaths" class="mt-2 text-center text-muted small">
              <i class="bi bi-info-circle me-1"></i>
              Showing solstices & equinoxes
            </div>
          </div>
          
          <SunInfo 
            :coordinates="coordinates" 
            :date="date"
            :time="time"
            :house-orientation="houseOrientation"
          />
        </div>
      </aside>

      <!-- Main map area -->
      <div class="flex-grow-1 position-relative">
        <div v-if="loading" class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-white bg-opacity-75" style="z-index: 20;">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
        
        <SunMap 
          v-model:coordinates="coordinates" 
          :date="date"
          :time="time"
          v-model:showHouse="showHouse"
          :show-seasonal-paths="showSeasonalPaths"
          @update-house-orientation="updateHouseOrientation"
        />
      </div>
    </div>
  </main>
</template>

<style>
/* Use Bootstrap classes for styling */
</style>
