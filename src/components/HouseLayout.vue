<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import * as d3 from 'd3';
import { getSunPosition, getSunTrajectory, calculateOptimalHouseOrientation } from '../lib/sunCalc';

const props = defineProps({
  sunPosition: {
    type: Object,
    default: () => ({ azimuth: 0, altitude: 0 })
  },
  size: {
    type: Number,
    default: 200
  },
  location: {
    type: Object,
    default: () => ({ lat: 0, lng: 0 })
  },
  autoOrient: {
    type: Boolean,
    default: true
  }
});

// Emit events for important changes
const emit = defineEmits(['orientation-changed']);

// House component refs
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

// Calculate optimal house orientation based on yearly sun path
const optimalOrientation = computed(() => {
  if (!props.autoOrient || !props.location.lat || !props.location.lng) {
    return 0; // Default orientation (north-facing)
  }
  
  // Use the advanced calculation from sunCalc.js
  return calculateOptimalHouseOrientation(props.location.lat, props.location.lng);
});

// Orientation label for display
const orientationLabel = computed(() => {
  const directions = [
    { angle: 0, label: 'N' },
    { angle: 45, label: 'NE' },
    { angle: 90, label: 'E' },
    { angle: 135, label: 'SE' },
    { angle: 180, label: 'S' },
    { angle: 225, label: 'SW' },
    { angle: 270, label: 'W' },
    { angle: 315, label: 'NW' },
    { angle: 360, label: 'N' }
  ];
  
  // Find the closest cardinal direction
  let closestDirection = directions[0];
  let closestDiff = 360;
  
  for (const dir of directions) {
    const diff = Math.abs(optimalOrientation.value - dir.angle);
    if (diff < closestDiff) {
      closestDirection = dir;
      closestDiff = diff;
    }
  }
  
  return `${Math.round(optimalOrientation.value)}° (${closestDirection.label})`;
});

// Watch for location changes to emit the orientation
watch(optimalOrientation, (newOrientation) => {
  emit('orientation-changed', {
    angle: newOrientation,
    label: orientationLabel.value
  });
});

onMounted(() => {
  initHouseLayout();
});

watch([() => props.sunPosition, () => props.size, optimalOrientation], () => {
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
  
  // Convert house orientation from degrees to radians
  const orientationRad = (optimalOrientation.value * Math.PI) / 180;
  
  // Create house corners in the rotated orientation
  // Calculate positions based on house center
  const centerX = houseX.value + width / 2;
  const centerY = houseY.value + height / 2;
  
  // Function to rotate point around center
  function rotatePoint(x, y, angle) {
    // Translate point to origin
    const translatedX = x - centerX;
    const translatedY = y - centerY;
    
    // Rotate point
    const rotatedX = translatedX * Math.cos(angle) - translatedY * Math.sin(angle);
    const rotatedY = translatedX * Math.sin(angle) + translatedY * Math.cos(angle);
    
    // Translate point back
    return {
      x: rotatedX + centerX,
      y: rotatedY + centerY
    };
  }
  
  // Calculate rotated house corners
  const topLeft = rotatePoint(houseX.value, houseY.value, orientationRad);
  const topRight = rotatePoint(houseX.value + width, houseY.value, orientationRad);
  const bottomRight = rotatePoint(houseX.value + width, houseY.value + height, orientationRad);
  const bottomLeft = rotatePoint(houseX.value, houseY.value + height, orientationRad);
  
  // Calculate the four sides of the house in the rotated orientation
  const sides = [
    { start: topLeft, end: topRight, normal: { x: 0, y: -1 } },    // Top side (north in unrotated)
    { start: topRight, end: bottomRight, normal: { x: 1, y: 0 } }, // Right side (east in unrotated)
    { start: bottomRight, end: bottomLeft, normal: { x: 0, y: 1 }}, // Bottom side (south in unrotated)
    { start: bottomLeft, end: topLeft, normal: { x: -1, y: 0 } }   // Left side (west in unrotated)
  ];
  
  // Rotate the normal vectors according to house orientation
  sides.forEach(side => {
    const rotatedNormal = {
      x: side.normal.x * Math.cos(orientationRad) - side.normal.y * Math.sin(orientationRad),
      y: side.normal.x * Math.sin(orientationRad) + side.normal.y * Math.cos(orientationRad)
    };
    side.normal = rotatedNormal;
  });
  
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
  // A face casts a shadow when the dot product of its normal and sunDir is negative
  // (meaning the sun is behind the face)
  
  sides.forEach((side, index) => {
    // Calculate dot product to determine if side is facing away from sun
    const dotProduct = side.normal.x * sunDir.x + side.normal.y * sunDir.y;
    
    // If dot product is negative, side is facing away from sun and casts shadow
    if (dotProduct < 0) {
      // Build shadow polygon based on side index
      let shadowPolygon;
      switch (index) {
        case 0: // Top side (north in unrotated)
          shadowPolygon = [topLeft, topRight, shadowTopRight, shadowTopLeft];
          break;
        case 1: // Right side (east in unrotated)
          shadowPolygon = [topRight, bottomRight, shadowBottomRight, shadowTopRight];
          break;
        case 2: // Bottom side (south in unrotated)
          shadowPolygon = [bottomRight, bottomLeft, shadowBottomLeft, shadowBottomRight];
          break;
        case 3: // Left side (west in unrotated)
          shadowPolygon = [bottomLeft, topLeft, shadowTopLeft, shadowBottomLeft];
          break;
      }
      shadows.push(shadowPolygon);
    }
  });
  
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
  
  // Calculate the center of the house for rotation
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Main house container group with rotation applied
  const house = svg.append('g')
    .attr('transform', `translate(${houseX.value}, ${houseY.value})`);
  
  // Create a nested group for rotation
  const rotatedGroup = house.append('g')
    .attr('transform', `translate(${centerX}, ${centerY}) rotate(${optimalOrientation.value}) translate(${-centerX}, ${-centerY})`);
  
  // House border
  rotatedGroup.append('rect')
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
  rotatedGroup.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height / 2)
    .attr('fill', '#B3D9FF')
    .attr('stroke', '#333')
    .attr('stroke-width', 1.5);
  
  // Draw the night area (sleeping spaces) - 50% of the house
  rotatedGroup.append('rect')
    .attr('x', 0)
    .attr('y', height / 2)
    .attr('width', width)
    .attr('height', height / 2)
    .attr('fill', '#99B3CC')
    .attr('stroke', '#333')
    .attr('stroke-width', 1.5);
  
  // Add day/night area labels (rotated to be readable)
  const dayLabel = rotatedGroup.append('text')
    .attr('x', width / 2)
    .attr('y', height * 0.25)
    .attr('text-anchor', 'middle')
    .attr('font-size', '18px')
    .attr('font-weight', 'bold')
    .attr('fill', '#333')
    .text("DAY");
  
  const nightLabel = rotatedGroup.append('text')
    .attr('x', width / 2)
    .attr('y', height * 0.75)
    .attr('text-anchor', 'middle')
    .attr('font-size', '18px')
    .attr('font-weight', 'bold')
    .attr('fill', '#333')
    .text("NIGHT");
  
  // Add orientation info
  if (props.autoOrient) {
    // Add orientation info text
    house.append('text')
      .attr('x', width - 10)
      .attr('y', height + 20)
      .attr('text-anchor', 'end')
      .attr('font-size', '16px')
      .attr('fill', '#333')
      .text(`Optimal orientation: ${orientationLabel.value}`);
  }
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
