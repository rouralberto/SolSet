/**
 * Length units. Everything is stored and calculated in metres; these helpers
 * only convert at the edges (inputs and display).
 */

const FEET_PER_METER = 3.280839895;

export function isImperial(units) {
  return units === 'imperial';
}

export function lengthUnit(units) {
  return isImperial(units) ? 'ft' : 'm';
}

export function toDisplayLength(meters, units) {
  return isImperial(units) ? meters * FEET_PER_METER : meters;
}

export function fromDisplayLength(value, units) {
  return isImperial(units) ? value / FEET_PER_METER : value;
}

/** Round a length for an input field (keeps round metric/imperial values stable) */
export function roundDisplayLength(meters, units, digits = 2) {
  const factor = Math.pow(10, digits);
  return Math.round(toDisplayLength(meters, units) * factor) / factor;
}

/**
 * Format a length, e.g. 2.35 -> "2.4 m" or "7.7 ft"; long distances switch to km / mi.
 */
export function formatLength(meters, units, digits = 1) {
  if (!Number.isFinite(meters)) return '—';
  // 12.0 -> "12", 5.50 -> "5.5"
  const trim = (value, places) => String(Number(value.toFixed(places)));
  if (isImperial(units)) {
    const feet = meters * FEET_PER_METER;
    return feet >= 5280 ? `${trim(feet / 5280, 1)} mi` : `${trim(feet, feet >= 100 ? 0 : digits)} ft`;
  }
  return meters >= 1000 ? `${trim(meters / 1000, 1)} km` : `${trim(meters, meters >= 100 ? 0 : digits)} m`;
}
