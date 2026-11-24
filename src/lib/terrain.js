import { createHorizon } from './solar.js';
import { offsetCoordinate } from './geo.js';

/**
 * Terrain horizon: how high hills and mountains rise above the horizontal in
 * every direction, ray-marched in the browser from open elevation tiles
 * (Mapzen/Tilezen "Terrarium" tiles on AWS Open Data — no key, CORS-enabled).
 * The data is ground level only: it knows nothing about buildings or trees.
 */

const TILE_SIZE = 256;
const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const MAX_LATITUDE = 84;

const NEAR_ZOOM = 13;
const NEAR_RADIUS = 2000;
const FAR_RADIUS = 40000;
// Closer than this the ~30 m elevation data can't tell the plot from its surroundings
const MIN_DISTANCE = 90;
const DISTANCE_GROWTH = 1.07;

// Drop of the line of sight due to earth curvature, less typical atmospheric refraction
const CURVATURE = 0.87 / (2 * 6371008.8);

export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

/** Fractional slippy-map tile coordinates of a point */
export function tileCoordinate(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const phi = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n
  };
}

/** Coarser tiles at high latitudes keep the number of far tiles bounded */
export function farZoomFor(lat) {
  return Math.abs(lat) > 62 ? 8 : Math.abs(lat) > 45 ? 9 : 10;
}

function tileKey(zoom, x, y) {
  return `${zoom}/${x}/${y}`;
}

/** Tiles covering a square of ±radius metres around a point */
export function tilesAround(site, radius, zoom) {
  const n = Math.pow(2, zoom);
  const corners = [
    tileCoordinate(offsetCoordinate(site, { x: -radius, y: radius }).lat, offsetCoordinate(site, { x: -radius, y: radius }).lng, zoom),
    tileCoordinate(offsetCoordinate(site, { x: radius, y: -radius }).lat, offsetCoordinate(site, { x: radius, y: -radius }).lng, zoom)
  ];
  let minX = Math.floor(corners[0].x);
  let maxX = Math.floor(corners[1].x);
  // Crossing the antimeridian
  if (maxX < minX) maxX += n;
  const minY = Math.max(0, Math.floor(corners[0].y));
  const maxY = Math.min(n - 1, Math.floor(corners[1].y));

  const tiles = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) tiles.push({ zoom, x: ((x % n) + n) % n, y });
  }
  return tiles;
}

const tileCache = new Map();
const MAX_CACHED_TILES = 80;

/** Download one elevation tile and decode it to metres */
async function loadTerrariumTile(zoom, x, y, signal) {
  const key = tileKey(zoom, x, y);
  if (tileCache.has(key)) return tileCache.get(key);

  const response = await fetch(`${TILE_URL}/${key}.png`, { signal });
  if (!response.ok) throw new Error(`Elevation tile ${key} failed: ${response.status}`);

  // Colour management must stay off: the pixel values are the data
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none'
  });
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
  const pixels = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;

  const elevations = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let i = 0; i < elevations.length; i++) {
    elevations[i] = decodeTerrarium(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
  }

  if (tileCache.size >= MAX_CACHED_TILES) tileCache.delete(tileCache.keys().next().value);
  tileCache.set(key, elevations);
  return elevations;
}

/**
 * Elevation lookup over a set of loaded tiles (bilinear within a tile).
 * @param {Map<string, Float32Array>} tiles - Keyed "zoom/x/y"
 */
export function createElevationSampler(tiles) {
  return (lat, lng, zoom) => {
    const n = Math.pow(2, zoom);
    const t = tileCoordinate(lat, lng, zoom);
    const tileX = ((Math.floor(t.x) % n) + n) % n;
    const tileY = Math.min(n - 1, Math.max(0, Math.floor(t.y)));
    const data = tiles.get(tileKey(zoom, tileX, tileY));
    if (!data) return null;

    const px = Math.min(TILE_SIZE - 1.001, Math.max(0, (t.x - Math.floor(t.x)) * TILE_SIZE - 0.5));
    const py = Math.min(TILE_SIZE - 1.001, Math.max(0, (t.y - Math.floor(t.y)) * TILE_SIZE - 0.5));
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const fx = px - x0;
    const fy = py - y0;
    const at = (x, y) => data[y * TILE_SIZE + x];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy)
      + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
}

/**
 * Ray-march the terrain around a site.
 * @param {{lat: number, lng: number}} site
 * @param {Function} sample - (lat, lng, zoom) => elevation in metres, or null where unknown
 * @param {Object} [options]
 * @returns {{horizon: Float32Array, elevation: number, maxAngle: number, maxBearing: number}|null}
 */
export function marchTerrainHorizon(site, sample, { observerHeight = 2, nearZoom = NEAR_ZOOM, farZoom = farZoomFor(site.lat) } = {}) {
  const ground = sample(site.lat, site.lng, nearZoom) ?? sample(site.lat, site.lng, farZoom);
  if (ground === null || ground === undefined) return null;

  const eye = ground + observerHeight;
  const horizon = createHorizon();
  let maxAngle = 0;
  let maxBearing = 0;

  for (let bearing = 0; bearing < 360; bearing++) {
    const sin = Math.sin((bearing * Math.PI) / 180);
    const cos = Math.cos((bearing * Math.PI) / 180);
    let highest = 0;

    for (let distance = MIN_DISTANCE; distance <= FAR_RADIUS; distance *= DISTANCE_GROWTH) {
      const point = offsetCoordinate(site, { x: distance * sin, y: distance * cos });
      const height = distance <= NEAR_RADIUS
        ? sample(point.lat, point.lng, nearZoom) ?? sample(point.lat, point.lng, farZoom)
        : sample(point.lat, point.lng, farZoom);
      if (height === null || height === undefined) continue;

      const angle = (Math.atan2(height - eye - distance * distance * CURVATURE, distance) * 180) / Math.PI;
      if (angle > highest) highest = angle;
    }

    horizon[bearing] = highest;
    if (highest > maxAngle) {
      maxAngle = highest;
      maxBearing = bearing;
    }
  }

  return { horizon, elevation: ground, maxAngle, maxBearing };
}

/**
 * Download the elevation tiles around a site and compute its terrain horizon.
 * @returns {Promise<{horizon: Float32Array, elevation: number, maxAngle: number, maxBearing: number}>}
 */
export async function fetchTerrainHorizon(site, { signal, observerHeight = 2 } = {}) {
  if (Math.abs(site.lat) > MAX_LATITUDE) throw new Error('Terrain data is not available this close to the poles');

  const farZoom = farZoomFor(site.lat);
  const needed = [...tilesAround(site, NEAR_RADIUS, NEAR_ZOOM), ...tilesAround(site, FAR_RADIUS, farZoom)];
  const tiles = new Map();

  await Promise.all(needed.map(async ({ zoom, x, y }) => {
    try {
      tiles.set(tileKey(zoom, x, y), await loadTerrariumTile(zoom, x, y, signal));
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // A missing tile just leaves a gap; the march skips unknown ground
    }
  }));

  const result = marchTerrainHorizon(site, createElevationSampler(tiles), { observerHeight, farZoom });
  if (!result) throw new Error('Could not load terrain data for this location');
  return result;
}
