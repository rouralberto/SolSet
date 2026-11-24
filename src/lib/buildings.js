import { offsetBetween, squareBounds } from './geo.js';

/**
 * Nearby building footprints from OpenStreetMap via the Overpass API (free, CORS-enabled).
 * Heights are often missing in OSM; they are then assumed and flagged so the user can correct them.
 */

// The public Overpass servers are shared and can be slow at busy times, so each
// gets a generous wait before the next one is tried
const ENDPOINTS = [
  { url: 'https://overpass-api.de/api/interpreter', timeout: 60000 },
  { url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', timeout: 30000 }
];

const METERS_PER_LEVEL = 3;
export const ASSUMED_BUILDING_HEIGHT = 6;
const MAX_VERTICES = 40;

/**
 * Height of a building from its OSM tags
 * @returns {{height: number, assumed: boolean}}
 */
export function parseBuildingHeight(tags = {}) {
  const raw = String(tags.height ?? tags['building:height'] ?? '').trim().toLowerCase();
  const match = /^(\d+(?:[.,]\d+)?)\s*(m|metres?|meters?|ft|feet|')?/.exec(raw);
  if (match) {
    const value = parseFloat(match[1].replace(',', '.'));
    const meters = match[2] && /^(ft|feet|')$/.test(match[2]) ? value * 0.3048 : value;
    if (meters > 0.5 && meters < 1000) return { height: Math.round(meters * 10) / 10, assumed: false };
  }

  const levels = parseFloat(tags['building:levels']);
  if (levels > 0 && levels < 200) {
    const roofLevels = parseFloat(tags['roof:levels']);
    const total = levels + (roofLevels > 0 ? roofLevels * 0.5 : 0);
    return { height: Math.round(total * METERS_PER_LEVEL * 10) / 10, assumed: false };
  }

  return { height: ASSUMED_BUILDING_HEIGHT, assumed: true };
}

/** Overpass QL for the buildings in a square of ±radius metres (a bounding box is the cheapest query to run) */
export function overpassQuery(lat, lng, radius) {
  const [[south, west], [north, east]] = squareBounds({ lat, lng }, radius);
  const box = `(${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)})`;
  return `[out:json][timeout:25];(way["building"]${box};relation["building"]${box};);out tags geom;`;
}

function describeBuilding(tags = {}) {
  if (tags.name) return tags.name;
  const number = tags['addr:housenumber'];
  const street = tags['addr:street'];
  if (number && street) return `${street} ${number}`;
  const type = tags.building && tags.building !== 'yes' ? tags.building.replace(/_/g, ' ') : 'building';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Keep at most MAX_VERTICES points of a ring */
function decimate(points) {
  if (points.length <= MAX_VERTICES) return points;
  const step = points.length / MAX_VERTICES;
  return Array.from({ length: MAX_VERTICES }, (_, i) => points[Math.floor(i * step)]);
}

function ringToObstacle(id, ring, tags) {
  const coordinates = ring.filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  // Closed ways repeat the first node at the end
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (coordinates.length > 1 && first.lat === last.lat && first.lon === last.lon) coordinates.pop();
  if (coordinates.length < 3) return null;

  const lat = coordinates.reduce((sum, p) => sum + p.lat, 0) / coordinates.length;
  const lng = coordinates.reduce((sum, p) => sum + p.lon, 0) / coordinates.length;
  const { height, assumed } = parseBuildingHeight(tags);

  return {
    id,
    kind: 'imported',
    name: describeBuilding(tags),
    lat,
    lng,
    height,
    heightAssumed: assumed,
    polygon: decimate(coordinates).map(p => {
      const offset = offsetBetween({ lat, lng }, { lat: p.lat, lng: p.lon });
      return [Math.round(offset.x * 100) / 100, Math.round(offset.y * 100) / 100];
    })
  };
}

/**
 * @param {Object} json - Overpass response (out tags geom)
 * @returns {Array} Obstacles of kind 'imported'
 */
export function parseOverpassBuildings(json) {
  const obstacles = [];
  for (const element of json?.elements || []) {
    if (element.type === 'way' && Array.isArray(element.geometry)) {
      const obstacle = ringToObstacle(`osm-way-${element.id}`, element.geometry, element.tags);
      if (obstacle) obstacles.push(obstacle);
    } else if (element.type === 'relation' && Array.isArray(element.members)) {
      element.members
        .filter(member => member.role === 'outer' && Array.isArray(member.geometry))
        .forEach((member, index) => {
          const obstacle = ringToObstacle(`osm-relation-${element.id}-${index}`, member.geometry, element.tags);
          if (obstacle) obstacles.push(obstacle);
        });
    }
  }
  return obstacles;
}

/**
 * Fetch building footprints around a point. Call only on explicit user action.
 * @returns {Promise<Array>} Obstacles of kind 'imported'
 */
export async function fetchNearbyBuildings(lat, lng, radius = 150) {
  const body = new URLSearchParams({ data: overpassQuery(lat, lng, radius) });
  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), endpoint.timeout);
    try {
      const response = await fetch(endpoint.url, { method: 'POST', body, signal: controller.signal });
      if (!response.ok) throw new Error(`Overpass responded ${response.status}`);
      return parseOverpassBuildings(await response.json());
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('The OpenStreetMap building service is busy. Try again in a minute.', { cause: lastError });
}
