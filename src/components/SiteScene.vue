<script setup>
import { computed } from 'vue';
import { houseGeometry, houseShadow, prismShadow } from '../lib/solar';
import { formatLength } from '../lib/units';

/**
 * The plot drawn in real metres: the house, the things around it and their
 * shadows. Renders an SVG <g> whose user units are metres, x east and y south
 * (north is up), with the house at the origin. Used on the map and in the report.
 */
const props = defineProps({
  // { width, depth, wallHeight, roofPitch } in metres / degrees
  house: { type: Object, required: true },
  // Bearing the day side faces
  facing: { type: Number, required: true },
  // { azimuth, altitude } in degrees (bearing from north), or null at night
  sun: { type: Object, default: null },
  // From localObstacles(): [{ obstacle, center, footprint, height }]
  obstacles: { type: Array, default: () => [] },
  showHouse: { type: Boolean, default: true },
  // > 1 draws the house larger than life (schematic) when zoomed far out
  houseScale: { type: Number, default: 1 },
  maxShadow: { type: Number, default: 300 },
  selectedId: { type: String, default: null },
  interactive: { type: Boolean, default: false },
  showLabels: { type: Boolean, default: true },
  units: { type: String, default: 'metric' }
});

const emit = defineEmits(['obstacle-pointerdown']);

const toPoints = (polygon) => polygon.map(p => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' ');

const scaledHouse = computed(() => ({
  width: props.house.width * props.houseScale,
  depth: props.house.depth * props.houseScale,
  wallHeight: props.house.wallHeight * props.houseScale,
  roofPitch: props.house.roofPitch
}));

const sunIsUp = computed(() => !!props.sun && props.sun.altitude > 0);

const houseShadowPoints = computed(() => {
  if (!props.showHouse || !sunIsUp.value) return null;
  const shadow = houseShadow(houseGeometry(scaledHouse.value, props.facing), props.sun, props.maxShadow * props.houseScale);
  return shadow ? toPoints(shadow) : null;
});

const obstacleShapes = computed(() =>
  props.obstacles.map(item => {
    const shadow = sunIsUp.value ? prismShadow(item.footprint, item.height, props.sun, props.maxShadow) : null;
    return {
      id: item.obstacle.id,
      kind: item.obstacle.kind,
      assumed: !!item.obstacle.heightAssumed,
      points: toPoints(item.footprint),
      shadow: shadow ? toPoints(shadow) : null,
      x: item.center.x,
      y: -item.center.y,
      label: formatLength(item.height, props.units, 0),
      labelSize: Math.max(1.4, Math.min(3, Math.sqrt(item.footprint.length ? footprintArea(item.footprint) : 9) / 3))
    };
  })
);

function footprintArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

// Keep labels upright when the house is rotated upside down
const labelRotation = computed(() => {
  const o = ((props.facing % 360) + 360) % 360;
  return o > 90 && o < 270 ? 180 : 0;
});

const labelSize = computed(() => Math.min(scaledHouse.value.width / 5.5, scaledHouse.value.depth / 4.2));
</script>

<template>
  <g class="site-scene">
    <!-- One group so overlapping shadows don't add up to a darker patch -->
    <g class="shadows">
      <polygon v-for="shape in obstacleShapes.filter(s => s.shadow)" :key="`s-${shape.id}`" :points="shape.shadow" />
      <polygon v-if="houseShadowPoints" :points="houseShadowPoints" />
    </g>

    <g
      v-for="shape in obstacleShapes"
      :key="shape.id"
      :class="['obstacle', shape.kind, { selected: shape.id === selectedId, assumed: shape.assumed, interactive }]"
      @pointerdown.stop="interactive && emit('obstacle-pointerdown', { id: shape.id, event: $event })"
      @mousedown.stop
      @touchstart.stop
      @click.stop
      @dblclick.stop
    >
      <polygon :points="shape.points" />
      <text
        v-if="showLabels"
        :x="shape.x"
        :y="shape.y"
        :font-size="shape.labelSize"
        text-anchor="middle"
        dominant-baseline="central"
      >{{ shape.label }}</text>
    </g>

    <g v-if="showHouse" class="house" :transform="`rotate(${facing})`">
      <rect
        class="day-half"
        :x="-scaledHouse.width / 2" :y="-scaledHouse.depth / 2"
        :width="scaledHouse.width" :height="scaledHouse.depth / 2"
      />
      <rect
        class="night-half"
        :x="-scaledHouse.width / 2" y="0"
        :width="scaledHouse.width" :height="scaledHouse.depth / 2"
      />
      <line
        v-if="house.roofPitch > 0"
        class="ridge"
        :x1="-scaledHouse.width / 2" y1="0" :x2="scaledHouse.width / 2" y2="0"
      />
      <rect
        class="outline"
        :x="-scaledHouse.width / 2" :y="-scaledHouse.depth / 2"
        :width="scaledHouse.width" :height="scaledHouse.depth"
      />
      <!-- Arrow out of the day side -->
      <path
        class="facing-arrow"
        :d="`M 0 ${-scaledHouse.depth / 2 - labelSize * 0.9} l ${labelSize * 0.45} ${labelSize * 0.6} h ${-labelSize * 0.9} z`"
      />

      <template v-if="showLabels">
        <text
          class="house-label day"
          :transform="`rotate(${labelRotation}, 0, ${-scaledHouse.depth / 4})`"
          x="0" :y="-scaledHouse.depth / 4"
          :font-size="labelSize"
          text-anchor="middle" dominant-baseline="central"
        >DAY</text>
        <text
          class="house-label night"
          :transform="`rotate(${labelRotation}, 0, ${scaledHouse.depth / 4})`"
          x="0" :y="scaledHouse.depth / 4"
          :font-size="labelSize"
          text-anchor="middle" dominant-baseline="central"
        >NIGHT</text>
      </template>
    </g>
  </g>
</template>

<style scoped>
.shadows {
  opacity: 0.34;
}

.shadows polygon {
  fill: #0f172a;
  stroke: none;
}

.obstacle polygon {
  fill: rgba(100, 116, 139, 0.75);
  stroke: #1e293b;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}

.obstacle.tree polygon {
  fill: rgba(22, 163, 74, 0.7);
  stroke: #14532d;
}

.obstacle.imported polygon {
  fill: rgba(100, 116, 139, 0.45);
}

.obstacle.assumed polygon {
  stroke-dasharray: 4 3;
}

.obstacle.selected polygon {
  stroke: #f59e0b;
  stroke-width: 3px;
}

.obstacle.interactive {
  pointer-events: auto;
  cursor: grab;
}

.obstacle text {
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  fill: #ffffff;
  paint-order: stroke;
  stroke: rgba(15, 23, 42, 0.75);
  stroke-width: 3px;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.day-half {
  fill: rgba(254, 243, 199, 0.92);
}

.night-half {
  fill: rgba(203, 213, 225, 0.9);
}

.outline {
  fill: none;
  stroke: rgba(15, 23, 42, 0.85);
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}

.ridge {
  stroke: rgba(15, 23, 42, 0.45);
  stroke-width: 1.5px;
  stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke;
}

.facing-arrow {
  fill: #f59e0b;
  stroke: #ffffff;
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}

.house-label {
  font-family: var(--font-display, sans-serif);
  font-weight: 700;
  pointer-events: none;
}

.house-label.day { fill: rgba(180, 83, 9, 0.95); }
.house-label.night { fill: rgba(51, 65, 85, 0.95); }
</style>
