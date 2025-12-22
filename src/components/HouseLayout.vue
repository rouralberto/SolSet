<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { select } from 'd3';
import { calculateOptimalHouseOrientation } from '../lib/sunCalc';

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
  },
  manualOrientation: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['orientation-changed']);

// Refs
const houseContainer = ref(null);
let svg = null;

// Computed dimensions
const margin = computed(() => props.size / 2);
const svgSize = computed(() => props.size + margin.value * 2);
const padding = 10;
const houseWidth = computed(() => props.size - padding * 2);
const houseHeight = computed(() => props.size - padding * 2);
const houseX = computed(() => margin.value + padding);
const houseY = computed(() => margin.value + padding);

// Shadow direction
const shadowDirection = computed(() => ({
  x: Math.sin(props.sunPosition.azimuth),
  y: Math.cos(props.sunPosition.azimuth)
}));

// Shadow length
const shadowLength = computed(() => {
  const baseLength = props.size / 1.5;
  const altitudeFactor = 1 - (props.sunPosition.altitude / (Math.PI / 2));
  return baseLength * Math.min(4, Math.max(0.2, altitudeFactor * 3));
});

// Orientation (auto or manual)
const orientation = computed(() => {
  if (!props.autoOrient) {
    return props.manualOrientation;
  }

  if (!props.location.lat || !props.location.lng) {
    return 0;
  }

  return calculateOptimalHouseOrientation(props.location.lat, props.location.lng);
});

// Orientation label
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

  let closestDirection = directions[0];
  let closestDiff = 360;

  for (const dir of directions) {
    const diff = Math.abs(orientation.value - dir.angle);
    if (diff < closestDiff) {
      closestDirection = dir;
      closestDiff = diff;
    }
  }

  return `${Math.round(orientation.value)}° (${closestDirection.label})`;
});

// Watch for location changes
watch(orientation, (newOrientation) => {
  emit('orientation-changed', {
    angle: newOrientation,
    label: orientationLabel.value
  });
});

onMounted(() => {
  initHouseLayout();
});

watch([() => props.sunPosition, () => props.size, orientation], () => {
  if (svg) {
    svg.remove();
    initHouseLayout();
  }
});

function initHouseLayout() {
  if (!houseContainer.value) return;

  svg = select(houseContainer.value)
    .append('svg')
    .attr('width', svgSize.value)
    .attr('height', svgSize.value)
    .attr('class', 'house-layout-svg')
    .attr('viewBox', `0 0 ${svgSize.value} ${svgSize.value}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  drawHouseShadow();
  drawHouseLayout();
}

function drawHouseShadow() {
  if (!props.sunPosition || props.sunPosition.altitude <= 0) return;

  const width = houseWidth.value;
  const height = houseHeight.value;
  const shadowDir = shadowDirection.value;
  const length = shadowLength.value;

  const sunDir = {
    x: -shadowDir.x,
    y: -shadowDir.y
  };

  const orientationRad = (orientation.value * Math.PI) / 180;
  const centerX = houseX.value + width / 2;
  const centerY = houseY.value + height / 2;

  function rotatePoint(x, y, angle) {
    const translatedX = x - centerX;
    const translatedY = y - centerY;
    const rotatedX = translatedX * Math.cos(angle) - translatedY * Math.sin(angle);
    const rotatedY = translatedX * Math.sin(angle) + translatedY * Math.cos(angle);
    return {
      x: rotatedX + centerX,
      y: rotatedY + centerY
    };
  }

  const topLeft = rotatePoint(houseX.value, houseY.value, orientationRad);
  const topRight = rotatePoint(houseX.value + width, houseY.value, orientationRad);
  const bottomRight = rotatePoint(houseX.value + width, houseY.value + height, orientationRad);
  const bottomLeft = rotatePoint(houseX.value, houseY.value + height, orientationRad);

  const sides = [
    { start: topLeft, end: topRight, normal: { x: 0, y: -1 } },
    { start: topRight, end: bottomRight, normal: { x: 1, y: 0 } },
    { start: bottomRight, end: bottomLeft, normal: { x: 0, y: 1 }},
    { start: bottomLeft, end: topLeft, normal: { x: -1, y: 0 } }
  ];

  sides.forEach(side => {
    const rotatedNormal = {
      x: side.normal.x * Math.cos(orientationRad) - side.normal.y * Math.sin(orientationRad),
      y: side.normal.x * Math.sin(orientationRad) + side.normal.y * Math.cos(orientationRad)
    };
    side.normal = rotatedNormal;
  });

  const shadowTopLeft = { x: topLeft.x + shadowDir.x * length, y: topLeft.y + shadowDir.y * length };
  const shadowTopRight = { x: topRight.x + shadowDir.x * length, y: topRight.y + shadowDir.y * length };
  const shadowBottomRight = { x: bottomRight.x + shadowDir.x * length, y: bottomRight.y + shadowDir.y * length };
  const shadowBottomLeft = { x: bottomLeft.x + shadowDir.x * length, y: bottomLeft.y + shadowDir.y * length };

  const shadows = [];

  sides.forEach((side, index) => {
    const dotProduct = side.normal.x * sunDir.x + side.normal.y * sunDir.y;

    if (dotProduct < 0) {
      let shadowPolygon;
      switch (index) {
        case 0:
          shadowPolygon = [topLeft, topRight, shadowTopRight, shadowTopLeft];
          break;
        case 1:
          shadowPolygon = [topRight, bottomRight, shadowBottomRight, shadowTopRight];
          break;
        case 2:
          shadowPolygon = [bottomRight, bottomLeft, shadowBottomLeft, shadowBottomRight];
          break;
        case 3:
          shadowPolygon = [bottomLeft, topLeft, shadowTopLeft, shadowBottomLeft];
          break;
      }
      shadows.push(shadowPolygon);
    }
  });

  shadows.forEach((points, index) => {
    const pointsString = points.map(p => `${p.x},${p.y}`).join(' ');
    const opacity = index === 0 ? 0.25 : 0.15;

    svg.append('polygon')
      .attr('points', pointsString)
      .attr('fill', `rgba(15, 23, 42, ${opacity})`)
      .attr('class', 'house-shadow');
  });
}

function drawHouseLayout() {
  const width = houseWidth.value;
  const height = houseHeight.value;
  const centerX = width / 2;
  const centerY = height / 2;

  const house = svg.append('g')
    .attr('transform', `translate(${houseX.value}, ${houseY.value})`);

  const rotatedGroup = house.append('g')
    .attr('transform', `translate(${centerX}, ${centerY}) rotate(${orientation.value}) translate(${-centerX}, ${-centerY})`);

  // House border with shadow effect
  rotatedGroup.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(15, 23, 42, 0.8)')
    .attr('stroke-width', 2)
    .attr('rx', 4)
    .attr('ry', 4);

  // Day area (light, warm)
  rotatedGroup.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height / 2)
    .attr('fill', 'rgba(254, 243, 199, 0.95)')
    .attr('stroke', 'rgba(245, 158, 11, 0.5)')
    .attr('stroke-width', 1);

  // Night area (cool, darker)
  rotatedGroup.append('rect')
    .attr('x', 0)
    .attr('y', height / 2)
    .attr('width', width)
    .attr('height', height / 2)
    .attr('fill', 'rgba(203, 213, 225, 0.9)')
    .attr('stroke', 'rgba(100, 116, 139, 0.5)')
    .attr('stroke-width', 1);

  // Labels
  const needsFlip = orientation.value > 90 && orientation.value < 270;

  rotatedGroup.append('text')
    .attr('x', width / 2)
    .attr('y', height * 0.25)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '16px')
    .attr('font-weight', '700')
    .attr('font-family', 'var(--font-display)')
    .attr('fill', 'rgba(245, 158, 11, 0.9)')
    .attr('transform', needsFlip ? `rotate(180, ${width / 2}, ${height * 0.25})` : '')
    .text('DAY');

  rotatedGroup.append('text')
    .attr('x', width / 2)
    .attr('y', height * 0.75)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '16px')
    .attr('font-weight', '700')
    .attr('font-family', 'var(--font-display)')
    .attr('fill', 'rgba(71, 85, 105, 0.9)')
    .attr('transform', needsFlip ? `rotate(180, ${width / 2}, ${height * 0.75})` : '')
    .text('NIGHT');

  // Icons
  rotatedGroup.append('text')
    .attr('x', width / 2)
    .attr('y', height * 0.25 - 20)
    .attr('text-anchor', 'middle')
    .attr('font-size', '20px')
    .attr('transform', needsFlip ? `rotate(180, ${width / 2}, ${height * 0.25 - 20})` : '')
    .text('☀️');

  rotatedGroup.append('text')
    .attr('x', width / 2)
    .attr('y', height * 0.75 - 20)
    .attr('text-anchor', 'middle')
    .attr('font-size', '20px')
    .attr('transform', needsFlip ? `rotate(180, ${width / 2}, ${height * 0.75 - 20})` : '')
    .text('🌙');
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
