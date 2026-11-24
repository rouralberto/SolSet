/**
 * Monthly climate normals for a location from NASA POWER (free, no key, CORS-enabled):
 * mean daily global horizontal irradiation, mean temperature and mean daily
 * temperature range. Used for PV yield and for orientation advice.
 * https://power.larc.nasa.gov/docs/services/api/temporal/climatology/
 */

const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const CACHE_KEY = 'solset_climate_cache';
const MAX_CACHED = 24;
const FILL_VALUE = -900;

const memoryCache = new Map();

/** The data grid is coarse (0.5°–1°), so nearby points share one request */
export function climateKey(lat, lng) {
  const round = (value) => (Math.round(value * 4) / 4).toFixed(2);
  return `${round(lat)},${round(lng)}`;
}

/**
 * @param {Object} json - NASA POWER climatology response
 * @returns {{ghi: number[], temp: number[], tempRange: number[], elevation: number|null, period: string|null, source: string}|null}
 */
export function parsePowerClimate(json) {
  const parameter = json?.properties?.parameter;
  if (!parameter?.ALLSKY_SFC_SW_DWN || !parameter?.T2M) return null;

  const series = (name) => MONTH_KEYS.map(month => Number(parameter[name]?.[month]));
  const ghi = series('ALLSKY_SFC_SW_DWN');
  const temp = series('T2M');
  const range = parameter.T2M_RANGE ? series('T2M_RANGE') : [];

  if (ghi.some(v => !Number.isFinite(v)) || temp.some(v => !Number.isFinite(v) || v < FILL_VALUE)) return null;
  // Missing irradiance for most of the year means there's no usable record here
  if (ghi.filter(v => v < FILL_VALUE).length > 6) return null;

  const period = /\(([^)]+)\)/.exec(json?.header?.range || '')?.[1] || null;
  const elevation = Number(json?.geometry?.coordinates?.[2]);

  return {
    ghi: ghi.map(v => Math.max(0, v)),
    temp,
    tempRange: MONTH_KEYS.map((_, i) => (Number.isFinite(range[i]) && range[i] > 0 ? range[i] : 8)),
    elevation: Number.isFinite(elevation) ? elevation : null,
    period,
    source: 'nasa-power'
  };
}

function readCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function writeCache(entries) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, MAX_CACHED)));
  } catch {
    // Storage full or unavailable
  }
}

function isValidClimate(climate) {
  return ['ghi', 'temp', 'tempRange'].every(key =>
    Array.isArray(climate?.[key]) && climate[key].length === 12 && climate[key].every(Number.isFinite));
}

export function getCachedClimate(lat, lng) {
  const key = climateKey(lat, lng);
  if (memoryCache.has(key)) return memoryCache.get(key);
  const entry = readCache().find(item => item.key === key);
  if (entry && isValidClimate(entry.climate)) {
    memoryCache.set(key, entry.climate);
    return entry.climate;
  }
  return null;
}

/**
 * Fetch (or reuse) the climate normals for a location.
 * @returns {Promise<Object>} Climate; rejects if the service is unreachable or has no data
 */
export async function fetchClimate(lat, lng, { signal } = {}) {
  const cached = getCachedClimate(lat, lng);
  if (cached) return cached;

  const key = climateKey(lat, lng);
  const [gridLat, gridLng] = key.split(',');
  const url = 'https://power.larc.nasa.gov/api/temporal/climatology/point'
    + `?parameters=ALLSKY_SFC_SW_DWN,T2M,T2M_RANGE&community=RE&longitude=${gridLng}&latitude=${gridLat}&format=JSON`;

  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Climate request failed: ${response.status}`);

  const climate = parsePowerClimate(await response.json());
  if (!climate) throw new Error('No climate data for this location');

  memoryCache.set(key, climate);
  writeCache([{ key, climate }, ...readCache().filter(item => item.key !== key)]);
  return climate;
}
