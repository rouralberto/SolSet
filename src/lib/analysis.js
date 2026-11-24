import { getPosition, getTimes } from 'suncalc';
import { incidenceCosine, isSunBlocked } from './solar.js';

/**
 * Sunlight on a specific calendar day (real ephemeris, real clock times):
 * how long a façade or a point is in direct sun, and when.
 */

const HOUR_MS = 3600000;

// A façade counts as sunlit once the sun is more than ~1° off grazing it
const MIN_INCIDENCE = 0.02;

/**
 * Sample the sun through the solar day around a reference instant.
 * @param {Date} reference - An instant on the day of interest (ideally local noon)
 * @returns {{times: Object, solarNoon: number, stepMinutes: number, samples: Array<{time: number, azimuth: number, altitude: number}>}}
 */
export function sampleSolarDay(reference, lat, lng, stepMinutes = 2) {
  const times = getTimes(reference, lat, lng);
  const solarNoon = times.solarNoon.getTime();
  const stepMs = stepMinutes * 60000;
  const samples = [];

  for (let time = solarNoon - 12 * HOUR_MS + stepMs / 2; time < solarNoon + 12 * HOUR_MS; time += stepMs) {
    const position = getPosition(new Date(time), lat, lng);
    if (position.altitude > 0) samples.push({ time, azimuth: position.azimuth, altitude: position.altitude });
  }

  return { times, solarNoon, stepMinutes, samples };
}

/** The core of the day used for solar-access rules: `hours` either side of solar noon */
export function solarAccessWindow(day, hours = 3) {
  return [day.solarNoon - hours * HOUR_MS, day.solarNoon + hours * HOUR_MS];
}

/**
 * Direct sunlight during a sampled day.
 * @param {Object} day - From sampleSolarDay
 * @param {Object} [options]
 * @param {number|null} [options.facadeAzimuth] - Only count sun shining on a wall facing this bearing
 * @param {Float32Array|null} [options.horizon] - Obstruction horizon at the point
 * @param {[number, number]|null} [options.window] - Only count between these timestamps
 * @returns {{possibleMinutes: number, sunMinutes: number, blockedMinutes: number,
 *   first: number|null, last: number|null, periods: Array<[number, number]>}}
 *   possibleMinutes ignores obstructions; periods are the unbroken spells of sun (timestamps),
 *   first/last the start of the first and the end of the last
 */
export function summarizeSunlight(day, { facadeAzimuth = null, horizon = null, window = null } = {}) {
  let possibleMinutes = 0;
  let sunMinutes = 0;
  const periods = [];
  const stepMs = day.stepMinutes * 60000;
  const half = stepMs / 2;

  for (const sample of day.samples) {
    if (window && (sample.time < window[0] || sample.time >= window[1])) continue;
    if (facadeAzimuth !== null && !(incidenceCosine(sample, 90, facadeAzimuth) > MIN_INCIDENCE)) continue;

    possibleMinutes += day.stepMinutes;
    if (isSunBlocked(horizon, sample)) continue;

    sunMinutes += day.stepMinutes;
    const current = periods[periods.length - 1];
    // Extend the running spell unless a sample was skipped since it
    if (current && sample.time - half - current[1] < stepMs * 0.5) {
      current[1] = sample.time + half;
    } else {
      periods.push([sample.time - half, sample.time + half]);
    }
  }

  return {
    possibleMinutes,
    sunMinutes,
    blockedMinutes: possibleMinutes - sunMinutes,
    first: periods.length ? periods[0][0] : null,
    last: periods.length ? periods[periods.length - 1][1] : null,
    periods
  };
}

/**
 * Spells of sun as clock times, e.g. "09:10–11:40, 13:20–16:05". Brief gaps
 * (a tree trunk, a chimney) are bridged so the list stays readable.
 * @param {Array<[number, number]>} periods - From summarizeSunlight
 * @param {Function} formatTime - Formats a Date as a clock time
 */
export function formatSunPeriods(periods, formatTime, { bridgeMinutes = 20, max = 3 } = {}) {
  if (!periods.length) return 'no direct sun';
  const merged = [];
  for (const [start, end] of periods) {
    const previous = merged[merged.length - 1];
    if (previous && start - previous[1] <= bridgeMinutes * 60000) previous[1] = end;
    else merged.push([start, end]);
  }
  // Keep the longest spells if there are many, in time order
  const shown = merged.length > max
    ? [...merged].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, max).sort((a, b) => a[0] - b[0])
    : merged;
  return shown.map(([start, end]) => `${formatTime(new Date(start))}–${formatTime(new Date(end))}`).join(', ');
}

/** "5h 20m" */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const total = Math.round(minutes);
  if (total <= 0) return '0h';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${hours}h`;
}
