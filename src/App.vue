<script setup>
import { ref, onMounted } from 'vue';
import SunMap from './components/SunMap.vue';
import LocationInput from './components/LocationInput.vue';
import DaySlider from './components/DaySlider.vue';
import TimeSlider from './components/TimeSlider.vue';
import SunInfo from './components/SunInfo.vue';

const coordinates = ref({ lat: 37.7749, lng: -122.4194 }); // San Francisco coordinates
const date = ref(new Date());
const time = ref(new Date());
const loading = ref(false);

// Set default date to today
onMounted(() => {
  // Default to current date and time
  const now = new Date();
  date.value = now;
  time.value = now;
});

// Update coordinates from location input
const updateCoordinates = (newCoords) => {
  coordinates.value = newCoords;
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
        <div class="p-3 d-flex flex-column gap-4">
          <DaySlider 
            :current-date="date" 
            @update-date="updateDate" 
          />
          <TimeSlider 
            :current-time="time" 
            :coordinates="coordinates"
            :date="date"
            @update-time="updateTime" 
          />
          
          <!-- Now button for both date and time -->
          <div class="bg-white rounded border shadow-sm p-3">
            <button 
              @click="setNow" 
              class="btn btn-primary w-100 d-flex align-items-center justify-content-center"
            >
              <i class="bi bi-clock me-2"></i>
              Set to Current Time
            </button>
          </div>
          
          <SunInfo 
            :coordinates="coordinates" 
            :date="date"
            :time="time"
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
          :coordinates="coordinates" 
          :date="date"
          :time="time"
        />
      </div>
    </div>
  </main>
</template>

<style>
/* Use Bootstrap classes for styling */
</style>
