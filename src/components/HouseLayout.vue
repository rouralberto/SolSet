<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import * as d3 from 'd3';

const props = defineProps({
  sunPosition: {
    type: Object,
    default: () => ({ azimuth: 0, altitude: 0 })
  },
  size: {
    type: Number,
    default: 200
  }
});

const houseContainer = ref(null);
let svg = null;

// Add margin to accommodate shadows extending beyond the house
const margin = computed(() => props.size / 2); // 50% of house size for shadows
const svgSize = computed(() => props.size + margin.value * 2);
const padding = 10;
const houseWidth = computed(() => props.size - padding * 2);
const houseHeight = computed(() => props.size - padding * 2);

// Position the house in the center of the expanded SVG
const houseX = computed(() => margin.value + padding);
const houseY = computed(() => margin.value + padding);

// Compute shadow direction from sun position
const shadowDirection = computed(() => {
  // In astronomical terms:
  // Sun azimuth is measured clockwise from north in radians
  // North = 0, East = π/2, South = π, West = 3π/2
  
  // Calculate the shadow direction (opposite to sun direction)
  // The positive sign is because shadows project in same direction as the light source
  // but from the opposite face of the object
  return {
    x: Math.sin(props.sunPosition.azimuth),
    y: Math.cos(props.sunPosition.azimuth)
  };
});

// Compute shadow length based on sun altitude
const shadowLength = computed(() => {
  // When sun is higher, shadow is shorter
  // When sun is lower (near horizon), shadow is longer
  // altitude is 0 at horizon, Math.PI/2 at zenith
  const baseLength = props.size / 1.5;
  // Calculate shadow factor (1 at horizon, 0 at zenith)
  const altitudeFactor = 1 - (props.sunPosition.altitude / (Math.PI / 2));
  // Clamp to reasonable values
  return baseLength * Math.min(4, Math.max(0.2, altitudeFactor * 3));
});

onMounted(() => {
  initHouseLayout();
});

watch([() => props.sunPosition, () => props.size], () => {
  if (svg) {
    svg.remove();
    initHouseLayout();
  }
});

function initHouseLayout() {
  if (!houseContainer.value) return;
  
  svg = d3.select(houseContainer.value)
    .append('svg')
    .attr('width', svgSize.value)
    .attr('height', svgSize.value)
    .attr('class', 'house-layout-svg')
    .attr('viewBox', `0 0 ${svgSize.value} ${svgSize.value}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');
  
  // Draw the house shadow first (so it appears behind the house)
  drawHouseShadow();
  
  // Draw the house layout on top
  drawHouseLayout();
}

function drawHouseShadow() {
  // Only draw shadow if the sun is above horizon
  if (!props.sunPosition || props.sunPosition.altitude <= 0) return;
  
  const width = houseWidth.value;
  const height = houseHeight.value;
  
  // Get shadow direction and length
  const shadowDir = shadowDirection.value;
  const length = shadowLength.value;
  
  // Calculate the actual sun position direction for face selection
  // We need this to determine which faces are NOT illuminated by the sun
  // as those are the ones that cast shadows
  const sunDir = {
    x: -shadowDir.x, // Opposite of shadow direction
    y: -shadowDir.y  // Opposite of shadow direction
  };
  
  // Create shadow polygon points
  // Start with the house corners
  const topLeft = { x: houseX.value, y: houseY.value };
  const topRight = { x: houseX.value + width, y: houseY.value };
  const bottomRight = { x: houseX.value + width, y: houseY.value + height };
  const bottomLeft = { x: houseX.value, y: houseY.value + height };
  
  // Shadow corners (house corners offset by shadow direction and length)
  const shadowTopLeft = {
    x: topLeft.x + shadowDir.x * length,
    y: topLeft.y + shadowDir.y * length
  };
  const shadowTopRight = {
    x: topRight.x + shadowDir.x * length,
    y: topRight.y + shadowDir.y * length
  };
  const shadowBottomRight = {
    x: bottomRight.x + shadowDir.x * length,
    y: bottomRight.y + shadowDir.y * length
  };
  const shadowBottomLeft = {
    x: bottomLeft.x + shadowDir.x * length,
    y: bottomLeft.y + shadowDir.y * length
  };
  
  // Shadows array to store all shadow polygons
  const shadows = [];
  
  // Determine which faces of the house cast shadows based on sun direction
  // Faces that are OPPOSITE to the sun direction are the ones that cast shadows
  
  // North face (top edge) casts shadow when sun is from south
  if (sunDir.y > 0) {
    shadows.push([
      topLeft, topRight, shadowTopRight, shadowTopLeft
    ]);
  }
  
  // South face (bottom edge) casts shadow when sun is from north
  if (sunDir.y < 0) {
    shadows.push([
      bottomLeft, bottomRight, shadowBottomRight, shadowBottomLeft
    ]);
  }
  
  // East face (right edge) casts shadow when sun is from west
  if (sunDir.x < 0) {
    shadows.push([
      topRight, bottomRight, shadowBottomRight, shadowTopRight
    ]);
  }
  
  // West face (left edge) casts shadow when sun is from east
  if (sunDir.x > 0) {
    shadows.push([
      topLeft, bottomLeft, shadowBottomLeft, shadowTopLeft
    ]);
  }
  
  // Draw each shadow polygon
  shadows.forEach((points, index) => {
    const pointsString = points
      .map(p => `${p.x},${p.y}`)
      .join(' ');
    
    // More transparent for secondary shadows
    const opacity = index === 0 ? 0.3 : 0.2;
    
    svg.append('polygon')
      .attr('points', pointsString)
      .attr('fill', `rgba(0, 0, 0, ${opacity})`)
      .attr('class', 'house-shadow');
  });
}

function drawHouseLayout() {
  const width = houseWidth.value;
  const height = houseHeight.value;
  
  // Main house container group
  const house = svg.append('g')
    .attr('transform', `translate(${houseX.value}, ${houseY.value})`);
  
  // House border
  house.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'none')
    .attr('stroke', '#333')
    .attr('stroke-width', 2)
    .attr('rx', 3)
    .attr('ry', 3);
  
  // Draw the day area (living spaces) - 50% of the house
  house.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height / 2)
    .attr('fill', '#B3D9FF')
    .attr('stroke', '#333')
    .attr('stroke-width', 1.5);
  
  // Draw the night area (sleeping spaces) - 50% of the house
  house.append('rect')
    .attr('x', 0)
    .attr('y', height / 2)
    .attr('width', width)
    .attr('height', height / 2)
    .attr('fill', '#99B3CC')
    .attr('stroke', '#333')
    .attr('stroke-width', 1.5);
  
  // Add day/night area labels
  house.append('text')
    .attr('x', width / 2)
    .attr('y', height * 0.25)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('fill', '#333')
    .text("DAY");
  
  house.append('text')
    .attr('x', width / 2)
    .attr('y', height * 0.75)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('fill', '#333')
    .text("NIGHT");
}
</script>

<template>
  <div class="house-layout-container">
    <div ref="houseContainer" class="house-container"></div>
  </div>
</template>

<style scoped>
.house-layout-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: visible;
  position: relative;
}

.house-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: visible;
}

:deep(.house-layout-svg) {
  max-width: 100%;
  max-height: 100%;
  overflow: visible;
}

:deep(.house-shadow) {
  transition: all 0.3s ease;
  stroke: none;
}
</style> 
