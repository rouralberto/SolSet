<script setup>
import { ref, computed, watch } from 'vue';
import { dateToDayOfYear, dayOfYearToDate } from '../lib/sunCalc';

// Props
const props = defineProps({
  currentDate: {
    type: Date,
    default: () => new Date()
  }
});

// Emit events
const emit = defineEmits(['update-date']);

// Convert current date to day of year
const dayOfYear = ref(dateToDayOfYear(props.currentDate));

// Maximum day based on leap year
const maxDay = computed(() => {
  const year = props.currentDate.getFullYear();
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
});

// Watch for external date changes
watch(() => props.currentDate, (newDate) => {
  dayOfYear.value = dateToDayOfYear(newDate);
}, { deep: true });

// Format the date as month and day
function formatDate(day) {
  const date = dayOfYearToDate(day, props.currentDate.getFullYear());
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Handle slider change
function handleSliderChange(event) {
  const day = parseInt(event.target.value);
  const newDate = dayOfYearToDate(day, props.currentDate.getFullYear());
  dayOfYear.value = day;
  emit('update-date', newDate);
}

// Set date to today
function setToday() {
  const today = new Date();
  const day = dateToDayOfYear(today);
  dayOfYear.value = day;
  
  // Create new date object preserving the year of the current date
  const newDate = dayOfYearToDate(day, today.getFullYear());
  
  emit('update-date', newDate);
}

// Key dates for labels
const keyDates = [
  { day: 1, label: 'Jan 1' }, // New Year
  { day: 80, label: 'Mar 21' }, // Spring Equinox (approx)
  { day: 172, label: 'Jun 21' }, // Summer Solstice (approx)
  { day: 266, label: 'Sep 23' }, // Fall Equinox (approx)
  { day: 355, label: 'Dec 21' }  // Winter Solstice (approx)
];
</script>

<template>
  <div class="card mb-4">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h5 class="mb-0">Date</h5>
      <div class="d-flex align-items-center gap-2">
        <div class="text-muted small">{{ formatDate(dayOfYear) }}</div>
        <button 
          @click="setToday" 
          class="btn btn-primary btn-sm"
        >
          Today
        </button>
      </div>
    </div>
    
    <div class="card-body">
      <div class="position-relative">
        <input
          type="range"
          class="form-range"
          :min="1"
          :max="maxDay"
          v-model="dayOfYear"
          @input="handleSliderChange"
        />
        
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom styling for slider if needed */
</style> 
