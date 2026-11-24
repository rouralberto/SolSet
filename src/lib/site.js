import { offsetBetween } from './geo.js';
import {
  rectangleFootprint, circleFootprint, createHorizon, addObstructionToHorizon, mergeHorizons,
  houseGeometry, isInsideFootprint, normalizeBearing
} from './solar.js';

/**
 * The building plot: the house at the map centre and the things around it that
 * cast shade (trees, neighbouring buildings). Obstacles are stored with real
 * coordinates; everything here converts them to metres relative to the house.
 */

// Obstacles further away than this are ignored (their shadows can't reach)
export const OBSTACLE_RANGE = 400;
export const MAX_OBSTACLES = 250;

// Eye/window height used when judging the sun reaching a façade
export const WINDOW_HEIGHT = 1.5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, min, max, fallback) => {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) ? clamp(n, min, max) : fallback;
};

export function createObstacle(kind, coords) {
  const base = { id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind, lat: coords.lat, lng: coords.lng };
  return kind === 'tree'
    ? { ...base, name: 'Tree', height: 8, radius: 3 }
    : { ...base, name: 'Building', height: 6, width: 10, depth: 8, rotation: 0 };
}

/** Validate a stored obstacle; returns null if it can't be used */
export function sanitizeObstacle(obstacle) {
  if (!obstacle || typeof obstacle !== 'object') return null;
  const lat = Number(obstacle.lat);
  const lng = Number(obstacle.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const common = {
    id: String(obstacle.id || `o-${Math.random().toString(36).slice(2)}`),
    name: typeof obstacle.name === 'string' ? obstacle.name.slice(0, 60) : '',
    lat,
    lng,
    height: finite(obstacle.height, 0.5, 500, 6)
  };

  if (obstacle.kind === 'tree') {
    return { ...common, kind: 'tree', radius: finite(obstacle.radius, 0.3, 50, 3) };
  }
  if (obstacle.kind === 'imported') {
    const polygon = Array.isArray(obstacle.polygon)
      ? obstacle.polygon.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [p[0], p[1]])
      : [];
    if (polygon.length < 3) return null;
    return { ...common, kind: 'imported', polygon, heightAssumed: !!obstacle.heightAssumed };
  }
  return {
    ...common,
    kind: 'building',
    width: finite(obstacle.width, 0.5, 300, 10),
    depth: finite(obstacle.depth, 0.2, 300, 8),
    rotation: normalizeBearing(finite(obstacle.rotation, -360, 720, 0))
  };
}

/** Outline of an obstacle in metres relative to the house centre */
export function obstacleFootprint(obstacle, site) {
  const center = offsetBetween(site, obstacle);
  if (obstacle.kind === 'tree') return circleFootprint(obstacle.radius, center);
  if (obstacle.kind === 'imported') return obstacle.polygon.map(([x, y]) => ({ x: center.x + x, y: center.y + y }));
  return rectangleFootprint(obstacle.width, obstacle.depth, obstacle.rotation, center);
}

/**
 * Obstacles near the site, placed in local metres.
 * @returns {Array<{obstacle: Object, center: {x: number, y: number}, footprint: Array, height: number, distance: number}>}
 */
export function localObstacles(obstacles, site) {
  const result = [];
  for (const obstacle of obstacles) {
    const center = offsetBetween(site, obstacle);
    const distance = Math.hypot(center.x, center.y);
    if (distance > OBSTACLE_RANGE) continue;
    result.push({ obstacle, center, distance, height: obstacle.height, footprint: obstacleFootprint(obstacle, site) });
  }
  return result;
}

/** Horizon mask of the local obstacles seen from a point */
export function obstacleHorizon(local, observer) {
  const horizon = createHorizon();
  for (const item of local) addObstructionToHorizon(horizon, item.footprint, item.height, observer);
  return horizon;
}

/** Obstacles whose outline overlaps the house centre (e.g. an existing building on the plot) */
export function obstaclesUnderHouse(local) {
  return local.filter(item => isInsideFootprint({ x: 0, y: 0 }, item.footprint)).map(item => item.obstacle);
}

/**
 * The four façades of the house and where to stand to judge their sun.
 * @param {Object} house - { width, depth, wallHeight, roofPitch }
 * @param {number} facing - Bearing the day side faces
 * @returns {Array<{key: string, bearing: number, length: number, point: {x, y, z}}>}
 */
export function houseFacades(house, facing) {
  const rad = (facing * Math.PI) / 180;
  const f = { x: Math.sin(rad), y: Math.cos(rad) };
  const r = { x: Math.cos(rad), y: -Math.sin(rad) };
  const at = (direction, reach) => ({ x: direction.x * reach, y: direction.y * reach, z: WINDOW_HEIGHT });
  const out = 0.1;

  return [
    { key: 'day', bearing: normalizeBearing(facing), length: house.width, point: at(f, house.depth / 2 + out) },
    { key: 'sideA', bearing: normalizeBearing(facing + 90), length: house.depth, point: at(r, house.width / 2 + out) },
    { key: 'night', bearing: normalizeBearing(facing + 180), length: house.width, point: at(f, -(house.depth / 2 + out)) },
    { key: 'sideB', bearing: normalizeBearing(facing + 270), length: house.depth, point: at(r, -(house.width / 2 + out)) }
  ];
}

/**
 * Where the solar array sits, for shading purposes.
 * @param {string} placement - 'roof-day', 'roof-night' or 'custom'
 */
export function arrayObserver(house, facing, placement) {
  const geometry = houseGeometry(house, facing);
  const rad = (facing * Math.PI) / 180;
  const midRoof = (geometry.wallHeight + geometry.ridgeHeight) / 2;
  const side = placement === 'roof-night' ? -1 : placement === 'roof-day' ? 1 : 0;
  return {
    x: side * Math.sin(rad) * house.depth / 4,
    y: side * Math.cos(rad) * house.depth / 4,
    z: side === 0 ? geometry.wallHeight : midRoof
  };
}

export { mergeHorizons };
