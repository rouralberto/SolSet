<script setup>
import { computed } from 'vue';

const props = defineProps({
  sunPosition: {
    type: Object,
    default: () => ({ azimuth: 0, altitude: 0 })
  },
  // Direction the "day" side faces, in degrees clockwise from north
  orientation: {
    type: Number,
    default: 0
  },
  size: {
    type: Number,
    default: 150
  }
});

// The SVG is twice the house size so the shadow has room around it
const viewSize = computed(() => props.size * 2);
const padding = 10;
const side = computed(() => props.size - padding * 2);
const center = computed(() => viewSize.value / 2);

// Nominal building height relative to its footprint, for the schematic shadow
const HEIGHT_RATIO = 0.4;
const MAX_SHADOW_RATIO = 2.5;

function rotate(x, y, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cx = center.value;
  const cy = center.value;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad)
  };
}

const corners = computed(() => {
  const half = side.value / 2;
  const c = center.value;
  return [
    [c - half, c - half],
    [c + half, c - half],
    [c + half, c + half],
    [c - half, c + half]
  ].map(([x, y]) => rotate(x, y, props.orientation));
});

// Convex hull (monotone chain) of a set of points
function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const build = (list) => {
    const hull = [];
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  return [...build(sorted), ...build([...sorted].reverse())];
}

// Shadow cast away from the sun. Screen coordinates have y pointing south;
// SunCalc azimuth is measured from south, positive towards west.
const shadowPoints = computed(() => {
  const { azimuth, altitude } = props.sunPosition;
  if (!(altitude > 0)) return null;

  const length = Math.min(
    side.value * MAX_SHADOW_RATIO,
    (side.value * HEIGHT_RATIO) / Math.tan(altitude)
  );
  const direction = { x: Math.sin(azimuth), y: -Math.cos(azimuth) };
  const projected = corners.value.map(p => ({
    x: p.x + direction.x * length,
    y: p.y + direction.y * length
  }));

  return convexHull([...corners.value, ...projected])
    .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
});

// Keep labels upright when the house is rotated upside down
const labelRotation = computed(() => {
  const o = ((props.orientation % 360) + 360) % 360;
  return o > 90 && o < 270 ? 180 : 0;
});

// House-local coordinates (before rotation): the "day" half points up, i.e. towards `orientation`
const house = computed(() => {
  const half = side.value / 2;
  return { x: center.value - half, y: center.value - half, w: side.value, h: side.value };
});
</script>

<template>
  <svg
    class="house-layout-svg"
    :viewBox="`0 0 ${viewSize} ${viewSize}`"
    width="100%"
    height="100%"
    role="img"
    :aria-label="`House layout: day side facing ${Math.round(orientation)} degrees`"
  >
    <polygon v-if="shadowPoints" :points="shadowPoints" class="house-shadow" />

    <g :transform="`rotate(${orientation}, ${center}, ${center})`">
      <rect
        :x="house.x" :y="house.y" :width="house.w" :height="house.h / 2"
        fill="rgba(254, 243, 199, 0.95)" stroke="rgba(245, 158, 11, 0.6)" stroke-width="1"
      />
      <rect
        :x="house.x" :y="house.y + house.h / 2" :width="house.w" :height="house.h / 2"
        fill="rgba(203, 213, 225, 0.92)" stroke="rgba(100, 116, 139, 0.6)" stroke-width="1"
      />
      <rect
        :x="house.x" :y="house.y" :width="house.w" :height="house.h"
        fill="none" stroke="rgba(15, 23, 42, 0.8)" stroke-width="2" rx="4" ry="4"
      />

      <g :transform="`rotate(${labelRotation}, ${center}, ${house.y + house.h * 0.25})`">
        <text :x="center" :y="house.y + house.h * 0.25 - 20" text-anchor="middle" font-size="20">☀️</text>
        <text
          :x="center" :y="house.y + house.h * 0.25 + 4"
          text-anchor="middle" dominant-baseline="middle"
          class="house-label" fill="rgba(217, 119, 6, 0.95)"
        >DAY</text>
      </g>
      <g :transform="`rotate(${labelRotation}, ${center}, ${house.y + house.h * 0.75})`">
        <text :x="center" :y="house.y + house.h * 0.75 - 20" text-anchor="middle" font-size="20">🌙</text>
        <text
          :x="center" :y="house.y + house.h * 0.75 + 4"
          text-anchor="middle" dominant-baseline="middle"
          class="house-label" fill="rgba(71, 85, 105, 0.95)"
        >NIGHT</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.house-layout-svg {
  display: block;
  overflow: visible;
}

.house-shadow {
  fill: rgba(15, 23, 42, 0.28);
  stroke: none;
}

.house-label {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
}
</style>
