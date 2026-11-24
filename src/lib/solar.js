/**
 * Solar engineering helpers for siting a house: irradiance on roofs and façades,
 * PV yield, overhang shading, shadows and obstruction horizons.
 *
 * Conventions used throughout this module:
 *  - bearings/azimuths are degrees clockwise from TRUE north (0 = N, 90 = E, 180 = S, 270 = W)
 *  - altitudes, tilts and latitudes are degrees
 *  - ground coordinates are metres as { x: east, y: north }
 *  - the energy model works in solar time (hour angle), so it is independent of time zones
 *
 * The irradiance model is the classic monthly-average method from Duffie & Beckman,
 * "Solar Engineering of Thermal Processes": monthly mean daily global irradiation is
 * split into diffuse/beam (Erbs), distributed over the day (Collares-Pereira & Rabl,
 * Liu & Jordan) and transposed to the tilted plane (Hay & Davies).
 */

const DEG = Math.PI / 180;

export const SOLAR_CONSTANT = 1361; // W/m²

// Klein's recommended "average day" of each month (day of year)
export const MONTH_AVERAGE_DAYS = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
export const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/* ------------------------------------------------------------------------- */
/* Angles                                                                    */
/* ------------------------------------------------------------------------- */

export function normalizeBearing(bearing) {
  return ((bearing % 360) + 360) % 360;
}

/** Signed smallest difference a − b, in (−180, 180] */
export function bearingDifference(a, b) {
  const d = normalizeBearing(a - b);
  return d > 180 ? d - 360 : d;
}

const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** 16-point compass label for a bearing, e.g. 170 -> "S", 200 -> "SSW" */
export function compassPoint(bearing) {
  return COMPASS_16[Math.round(normalizeBearing(bearing) / 22.5) % 16];
}

/* ------------------------------------------------------------------------- */
/* Analytic solar geometry (solar time)                                      */
/* ------------------------------------------------------------------------- */

/** Solar declination in degrees for a day of year (Spencer, 1971) */
export function declination(dayOfYear) {
  const b = (2 * Math.PI * (dayOfYear - 1)) / 365;
  return (
    0.006918 - 0.399912 * Math.cos(b) + 0.070257 * Math.sin(b)
    - 0.006758 * Math.cos(2 * b) + 0.000907 * Math.sin(2 * b)
    - 0.002697 * Math.cos(3 * b) + 0.00148 * Math.sin(3 * b)
  ) / DEG;
}

/** Earth–sun distance correction factor for extraterrestrial irradiance (Spencer) */
export function eccentricity(dayOfYear) {
  const b = (2 * Math.PI * (dayOfYear - 1)) / 365;
  return 1.00011 + 0.034221 * Math.cos(b) + 0.00128 * Math.sin(b)
    + 0.000719 * Math.cos(2 * b) + 0.000077 * Math.sin(2 * b);
}

/** Sunset hour angle in degrees: 0 during polar night, 180 during polar day */
export function sunsetHourAngle(lat, decl) {
  const x = -Math.tan(lat * DEG) * Math.tan(decl * DEG);
  return Math.acos(clamp(x, -1, 1)) / DEG;
}

/**
 * Sun position from latitude, declination and hour angle (all degrees;
 * hour angle is negative in the morning, 15° per hour from solar noon).
 * @returns {{azimuth: number, altitude: number, cosZenith: number}}
 */
export function solarPosition(lat, decl, hourAngle) {
  const phi = lat * DEG;
  const d = decl * DEG;
  const w = hourAngle * DEG;
  const east = -Math.cos(d) * Math.sin(w);
  const north = Math.cos(phi) * Math.sin(d) - Math.sin(phi) * Math.cos(d) * Math.cos(w);
  const up = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(w);
  return {
    azimuth: normalizeBearing(Math.atan2(east, north) / DEG),
    altitude: Math.asin(clamp(up, -1, 1)) / DEG,
    cosZenith: up
  };
}

/**
 * Cosine of the angle between the sun and the normal of a surface.
 * @param {{azimuth: number, altitude: number}} sun
 * @param {number} tilt - Surface tilt from horizontal (0 = flat roof, 90 = wall)
 * @param {number} surfaceAzimuth - Bearing the surface faces
 * @returns {number} ≤ 0 when the sun is behind the surface
 */
export function incidenceCosine(sun, tilt, surfaceAzimuth) {
  const alt = sun.altitude * DEG;
  const beta = tilt * DEG;
  return Math.sin(alt) * Math.cos(beta)
    + Math.cos(alt) * Math.sin(beta) * Math.cos((sun.azimuth - surfaceAzimuth) * DEG);
}

/** Daily extraterrestrial irradiation on a horizontal plane, kWh/m² */
export function dailyExtraterrestrial(lat, dayOfYear) {
  const decl = declination(dayOfYear);
  const ws = sunsetHourAngle(lat, decl) * DEG;
  const phi = lat * DEG;
  const d = decl * DEG;
  const h0 = (24 / Math.PI) * SOLAR_CONSTANT * eccentricity(dayOfYear)
    * (Math.cos(phi) * Math.cos(d) * Math.sin(ws) + ws * Math.sin(phi) * Math.sin(d));
  return Math.max(0, h0) / 1000;
}

/** Relative optical air mass (Kasten & Young, 1989) */
export function airMass(altitude) {
  const alt = Math.max(altitude, -0.5);
  return 1 / (Math.sin(alt * DEG) + 0.50572 * Math.pow(alt + 6.07995, -1.6364));
}

/** Clear-sky direct normal irradiance in W/m² (Meinel & Meinel) */
export function clearSkyDni(altitude, e0 = 1) {
  if (!(altitude > 0)) return 0;
  return SOLAR_CONSTANT * e0 * Math.pow(0.7, Math.pow(airMass(altitude), 0.678));
}

/* ------------------------------------------------------------------------- */
/* Monthly climate -> intra-day irradiance profile                           */
/* ------------------------------------------------------------------------- */

/** Monthly-average diffuse fraction Hd/H from the clearness index (Erbs et al., 1982) */
export function diffuseFraction(kt, sunsetAngle) {
  const k = clamp(kt, 0.3, 0.8);
  const fraction = sunsetAngle <= 81.4
    ? 1.391 - 3.56 * k + 4.189 * k * k - 2.137 * k * k * k
    : 1.311 - 3.022 * k + 3.427 * k * k - 1.821 * k * k * k;
  return clamp(fraction, 0.05, 1);
}

/** Step-centre hour angles covering the daylight hours, symmetric about solar noon */
function daylightHourAngles(sunsetAngle, stepAngle) {
  const half = Math.ceil(sunsetAngle / stepAngle);
  const angles = [];
  for (let i = -half; i < half; i++) {
    const hourAngle = (i + 0.5) * stepAngle;
    if (Math.abs(hourAngle) < sunsetAngle) angles.push(hourAngle);
  }
  return angles;
}

/**
 * Irradiance through a month's average day.
 * @param {Object} options
 * @param {number} options.lat - Latitude
 * @param {number} options.dayOfYear - Day of year
 * @param {number} options.dailyGhi - Mean daily global horizontal irradiation, kWh/m²
 * @param {number} [options.meanTemp] - Mean air temperature, °C
 * @param {number} [options.tempRange] - Mean daily temperature range, °C
 * @param {number} [options.stepMinutes]
 * @returns {{steps: Array, stepHours: number, clearness: number, dailyGhi: number, dayOfYear: number}}
 *   Each step: { hourAngle, azimuth, altitude, cosZenith, ghi, dhi, bhi, extra, temp } with irradiances in W/m²
 */
export function buildDayProfile({ lat, dayOfYear, dailyGhi, meanTemp = 15, tempRange = 8, stepMinutes = 10 }) {
  const decl = declination(dayOfYear);
  const e0 = eccentricity(dayOfYear);
  const sunsetAngle = sunsetHourAngle(lat, decl);
  const stepHours = stepMinutes / 60;
  const h0 = dailyExtraterrestrial(lat, dayOfYear);
  const profile = { steps: [], stepHours, clearness: 0, dailyGhi: 0, dayOfYear, meanTemp, tempRange };

  if (!(sunsetAngle > 0) || !(h0 > 0) || !(dailyGhi > 0)) return profile;

  const ghiDaily = Math.min(dailyGhi, 0.85 * h0);
  const kt = ghiDaily / h0;
  const fd = diffuseFraction(kt, sunsetAngle);

  const ws = sunsetAngle * DEG;
  const a = 0.409 + 0.5016 * Math.sin(ws - 60 * DEG);
  const b = 0.6609 - 0.4767 * Math.sin(ws - 60 * DEG);
  const stepAngle = stepMinutes / 4; // degrees of hour angle per step (15° per hour)

  const steps = [];
  let sumTotal = 0;
  let sumDiffuse = 0;

  for (const hourAngle of daylightHourAngles(sunsetAngle, stepAngle)) {
    const position = solarPosition(lat, decl, hourAngle);
    if (!(position.cosZenith > 0)) continue;

    const w = hourAngle * DEG;
    const rd = Math.max(0, Math.cos(w) - Math.cos(ws));
    const rt = Math.max(0, (a + b * Math.cos(w)) * rd);
    sumTotal += rt;
    sumDiffuse += rd;

    steps.push({
      hourAngle,
      azimuth: position.azimuth,
      altitude: position.altitude,
      cosZenith: position.cosZenith,
      rt,
      rd,
      extra: SOLAR_CONSTANT * e0 * position.cosZenith,
      // Warmest around 15:00 solar time, coolest around 03:00
      temp: meanTemp + (tempRange / 2) * Math.cos((hourAngle - 45) * DEG)
    });
  }

  if (!(sumTotal > 0) || !(sumDiffuse > 0)) return profile;

  // Normalise so the steps integrate exactly to the daily totals
  const totalScale = (ghiDaily * 1000) / (sumTotal * stepHours);
  const diffuseScale = (ghiDaily * fd * 1000) / (sumDiffuse * stepHours);

  for (const step of steps) {
    step.ghi = Math.min(step.rt * totalScale, 0.95 * step.extra);
    step.dhi = Math.min(step.rd * diffuseScale, step.ghi);
    step.bhi = step.ghi - step.dhi;
    delete step.rt;
    delete step.rd;
  }

  profile.steps = steps;
  profile.clearness = kt;
  profile.dailyGhi = ghiDaily;
  return profile;
}

/**
 * Twelve average-day profiles for a location's climate.
 * @param {number} lat - Latitude
 * @param {{ghi: number[], temp: number[], tempRange: number[]}} climate - Monthly means (Jan..Dec)
 * @param {number} [stepMinutes]
 * @returns {Array} Day profiles, each with an extra `days` (days in the month) and `month` (0-11)
 */
export function buildClimateYear(lat, climate, stepMinutes = 10) {
  return MONTH_AVERAGE_DAYS.map((dayOfYear, month) => ({
    ...buildDayProfile({
      lat,
      dayOfYear,
      dailyGhi: climate.ghi[month],
      meanTemp: climate.temp[month],
      tempRange: climate.tempRange[month],
      stepMinutes
    }),
    month,
    days: DAYS_IN_MONTH[month]
  }));
}

/**
 * A plausible climate from latitude alone, used when no measured climatology is
 * available (offline, API down). Deliberately coarse: mid-range cloudiness and a
 * temperature curve typical for the latitude.
 */
export function estimateClimate(lat) {
  const absLat = Math.abs(lat);
  const annualMean = 27 - 0.0085 * absLat * absLat;
  const amplitude = Math.min(16, absLat * 0.25);
  const ghi = [];
  const temp = [];
  const tempRange = [];

  for (let month = 0; month < 12; month++) {
    // Subtropical belts are clearer, the equatorial and high latitudes cloudier
    const clearness = 0.5 + 0.08 * Math.exp(-Math.pow((absLat - 27) / 12, 2)) - 0.08 * Math.exp(-Math.pow(absLat / 8, 2));
    ghi.push(dailyExtraterrestrial(lat, MONTH_AVERAGE_DAYS[month]) * clearness);
    // Warmest about a month after the summer solstice
    const phase = ((month - 6.5) / 12) * 2 * Math.PI;
    temp.push(annualMean + amplitude * Math.cos(phase) * (lat >= 0 ? 1 : -1));
    tempRange.push(9);
  }

  return { ghi, temp, tempRange, source: 'estimate' };
}

/* ------------------------------------------------------------------------- */
/* Obstruction horizon                                                       */
/* ------------------------------------------------------------------------- */

/** A horizon mask: obstruction elevation angle (degrees) for each whole bearing 0..359 */
export function createHorizon() {
  return new Float32Array(360);
}

export function horizonAt(horizon, bearing) {
  if (!horizon) return 0;
  const b = normalizeBearing(bearing);
  const lower = Math.floor(b) % 360;
  const upper = (lower + 1) % 360;
  const t = b - Math.floor(b);
  return horizon[lower] * (1 - t) + horizon[upper] * t;
}

export function isSunBlocked(horizon, sun) {
  return !!horizon && sun.altitude < horizonAt(horizon, sun.azimuth);
}

export function mergeHorizons(...horizons) {
  const merged = createHorizon();
  for (const horizon of horizons) {
    if (!horizon) continue;
    for (let i = 0; i < 360; i++) merged[i] = Math.max(merged[i], horizon[i]);
  }
  return merged;
}

export function hasObstructions(horizon) {
  return !!horizon && horizon.some(elevation => elevation > 0.05);
}

export function isInsideFootprint(point, polygon) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Raise a horizon mask by an obstruction with a flat top (building, hedge, tree crown).
 * @param {Float32Array} horizon - Mask to update in place
 * @param {Array<{x: number, y: number}>} footprint - Outline in metres (east, north)
 * @param {number} height - Top of the obstruction above ground, metres
 * @param {{x: number, y: number, z: number}} observer - Viewpoint; z is its height above ground
 */
export function addObstructionToHorizon(horizon, footprint, height, observer) {
  const rise = height - observer.z;
  if (!(rise > 0) || footprint.length < 2) return horizon;

  // Standing inside the footprint (e.g. an existing building on the plot): it can't be
  // treated as something on the horizon, so it is left out
  if (isInsideFootprint(observer, footprint)) return horizon;

  const raise = (bearing, elevation) => {
    const index = ((Math.round(bearing) % 360) + 360) % 360;
    if (elevation > horizon[index]) horizon[index] = elevation;
  };

  const view = (point) => {
    const dx = point.x - observer.x;
    const dy = point.y - observer.y;
    const distance = Math.hypot(dx, dy);
    return {
      bearing: Math.atan2(dx, dy) / DEG,
      elevation: Math.atan2(rise, Math.max(distance, 0.01)) / DEG
    };
  };

  for (let i = 0; i < footprint.length; i++) {
    const start = footprint[i];
    const end = footprint[(i + 1) % footprint.length];
    const samples = Math.max(2, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 0.5));
    let previous = view(start);

    for (let s = 1; s <= samples; s++) {
      const t = s / samples;
      const current = view({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
      // Fill every whole bearing between consecutive samples
      const span = bearingDifference(current.bearing, previous.bearing);
      const bins = Math.max(1, Math.ceil(Math.abs(span)));
      for (let k = 0; k <= bins; k++) {
        const f = k / bins;
        raise(previous.bearing + span * f, previous.elevation + (current.elevation - previous.elevation) * f);
      }
      previous = current;
    }
  }

  return horizon;
}

/* ------------------------------------------------------------------------- */
/* Irradiance on a tilted plane, PV yield                                    */
/* ------------------------------------------------------------------------- */

/**
 * Irradiance on a tilted plane for one step of a day profile (Hay–Davies sky model).
 * @returns {{beam: number, circumsolar: number, diffuse: number, reflected: number, total: number}} W/m²
 *   (`diffuse` includes the circumsolar part, which comes from the sun's direction)
 */
export function planeIrradiance(step, tilt, azimuth, { albedo = 0.2, horizon = null } = {}) {
  const cosIncidence = Math.max(0, incidenceCosine(step, tilt, azimuth));
  const cosTilt = Math.cos(tilt * DEG);
  const blocked = isSunBlocked(horizon, step);

  // Beam normal irradiance, limited to what a clear sky could deliver at this sun height
  const dni = Math.min(step.bhi / Math.max(step.cosZenith, 0.02), 1.15 * clearSkyDni(step.altitude, step.extra / (SOLAR_CONSTANT * step.cosZenith)));
  const anisotropy = step.extra > 0 ? clamp(step.bhi / step.extra, 0, 1) : 0;
  const rb = Math.min(cosIncidence / Math.max(step.cosZenith, 0.02), 10);

  const beam = blocked ? 0 : dni * cosIncidence;
  const circumsolar = blocked ? 0 : step.dhi * anisotropy * rb;
  const sky = step.dhi * (1 - anisotropy) * (1 + cosTilt) / 2;
  const reflected = step.ghi * albedo * (1 - cosTilt) / 2;

  return { beam, circumsolar, diffuse: circumsolar + sky, reflected, total: beam + circumsolar + sky + reflected };
}

/**
 * Mean daily irradiation on a plane for each month, kWh/m²/day
 * @returns {{total: number[], beam: number[]}}
 */
export function monthlyPlaneIrradiation(year, tilt, azimuth, options = {}) {
  const total = [];
  const beam = [];
  for (const day of year) {
    let sumTotal = 0;
    let sumBeam = 0;
    for (const step of day.steps) {
      const irradiance = planeIrradiance(step, tilt, azimuth, options);
      sumTotal += irradiance.total;
      sumBeam += irradiance.beam;
    }
    total.push((sumTotal * day.stepHours) / 1000);
    beam.push((sumBeam * day.stepHours) / 1000);
  }
  return { total, beam };
}

export const PV_DEFAULTS = {
  // Cables, inverter, soiling, mismatch... (the same 14% default PVGIS uses)
  systemLoss: 0.14,
  // Reflection at oblique incidence
  incidenceLoss: 0.03,
  // Power change per °C of cell temperature above 25 °C
  tempCoefficient: -0.0035,
  // Cell temperature rise per W/m², roof-mounted with an air gap
  heatingPerIrradiance: 0.03
};

/**
 * Simulate a PV array through the climate year.
 * @param {Object} options
 * @param {Array} options.year - From buildClimateYear
 * @param {number} options.tilt - Panel tilt from horizontal
 * @param {number} options.azimuth - Bearing the panels face
 * @param {number} [options.kwp] - Installed peak power
 * @param {Float32Array} [options.horizon] - Obstruction horizon at the array
 * @returns {{monthly: number[], annual: number, specificYield: number, planeIrradiation: number, shadingLoss: number}}
 *   monthly/annual in kWh; specificYield in kWh/kWp/year; planeIrradiation in kWh/m²/year
 */
export function simulatePv({ year, tilt, azimuth, kwp = 1, horizon = null, albedo = 0.2, compareUnshaded = true, ...overrides }) {
  const params = { ...PV_DEFAULTS, ...overrides };
  const derate = (1 - params.systemLoss) * (1 - params.incidenceLoss);
  const useHorizon = hasObstructions(horizon) ? horizon : null;

  const monthly = [];
  let planeIrradiation = 0;
  let unshadedEnergy = 0;

  for (const day of year) {
    let energy = 0;
    let unshaded = 0;
    let irradiation = 0;

    for (const step of day.steps) {
      const g = planeIrradiance(step, tilt, azimuth, { albedo, horizon: useHorizon }).total;
      const power = (irradiance) =>
        irradiance * Math.max(0, 1 + params.tempCoefficient * (step.temp + params.heatingPerIrradiance * irradiance - 25));

      energy += power(g);
      irradiation += g;
      unshaded += useHorizon && compareUnshaded ? power(planeIrradiance(step, tilt, azimuth, { albedo }).total) : power(g);
    }

    const scale = (day.stepHours / 1000) * day.days;
    monthly.push(energy * scale * derate * kwp);
    planeIrradiation += irradiation * scale;
    unshadedEnergy += unshaded * scale * derate * kwp;
  }

  const annual = monthly.reduce((sum, value) => sum + value, 0);
  return {
    monthly,
    annual,
    specificYield: kwp > 0 ? annual / kwp : 0,
    planeIrradiation,
    shadingLoss: unshadedEnergy > 0 ? 1 - annual / unshadedEnergy : 0
  };
}

/**
 * Best fixed tilt and azimuth for annual yield (coarse grid, then refined).
 * @returns {{tilt: number, azimuth: number, specificYield: number}}
 */
export function findOptimalPlane(year, lat, { horizon = null } = {}) {
  const evaluate = (tilt, azimuth) => simulatePv({ year, tilt, azimuth, horizon, compareUnshaded: false }).specificYield;
  const equatorFacing = lat >= 0 ? 180 : 0;

  let best = { tilt: 0, azimuth: equatorFacing, specificYield: evaluate(0, equatorFacing) };
  const search = (tilts, azimuths) => {
    for (const tilt of tilts) {
      for (const azimuth of azimuths) {
        const specificYield = evaluate(tilt, azimuth);
        if (specificYield > best.specificYield + 1e-9) best = { tilt, azimuth: normalizeBearing(azimuth), specificYield };
      }
    }
  };
  const around = (center, reach, step, min = -Infinity, max = Infinity) => {
    const values = [];
    for (let value = center - reach; value <= center + reach; value += step) {
      if (value >= min && value <= max) values.push(value);
    }
    return values;
  };

  // The yield surface is smooth with a single broad peak: coarse grid, then two refinements
  search(around(45, 35, 10), around(180, 165, 30));
  search(around(best.tilt, 8, 2, 0, 90), around(best.azimuth, 24, 6));
  search(around(best.tilt, 1, 1, 0, 90), around(best.azimuth, 5, 1));

  // A flat panel has no meaningful azimuth
  if (best.tilt === 0) best.azimuth = equatorFacing;
  return best;
}

/* ------------------------------------------------------------------------- */
/* House orientation                                                         */
/* ------------------------------------------------------------------------- */

// Outdoor temperatures below which solar gain through the glazing is welcome,
// and above which it adds to overheating
export const HEATING_BASE_TEMP = 15;
export const COOLING_BASE_TEMP = 22;

// Share of the glazing on each side of a typical passive-solar plan
export const GLAZING_SHARES = { day: 0.5, night: 0.2, side: 0.15 };

// A typical eave over the windows, assumed on every façade when comparing orientations
export const REFERENCE_OVERHANG = { depth: 0.8, gap: 0.3, windowHeight: 1.5 };

/**
 * Compare every orientation of the house's day side, in 5° steps.
 *
 * For each façade bearing the sun reaching the glazing is summed over the climate
 * year (under a typical eave, so high summer sun is already shaded), split into:
 * - useful gain: received in months whose mean temperature calls for heating,
 *   weighted by how cold the month is (gains are assumed to be stored through the day)
 * - unwanted gain: received while the outdoor air is already warm, weighted by how
 *   warm it is at that time of day (so hot afternoon sun counts more than morning sun)
 *
 * A house orientation is then scored with most of the glazing on the day side:
 * `useful`, `unwanted` and `score` (= useful − unwanted) are for the whole house with
 * its day side facing each bearing; `facadeUseful` / `facadeUnwanted` are per single façade.
 *
 * @returns {{bearings: number[], useful: number[], unwanted: number[], score: number[],
 *   facadeUseful: number[], facadeUnwanted: number[], best: number,
 *   heatingMonths: number[], coolingMonths: number[]}}
 */
export function scoreOrientations(year, { horizon = null, step = 5, overhang = REFERENCE_OVERHANG } = {}) {
  const bearings = [];
  for (let bearing = 0; bearing < 360; bearing += step) bearings.push(bearing);

  const facadeUseful = bearings.map(() => 0);
  const facadeUnwanted = bearings.map(() => 0);
  const heatingMonths = [];
  const coolingMonths = [];
  const useHorizon = hasObstructions(horizon) ? horizon : null;

  for (const day of year) {
    const heatingNeed = Math.max(0, HEATING_BASE_TEMP - day.meanTemp);
    const peakTemp = day.meanTemp + day.tempRange / 2;
    if (!day.steps.length) continue;
    if (heatingNeed > 0) heatingMonths.push(day.month);
    if (peakTemp > COOLING_BASE_TEMP) coolingMonths.push(day.month);
    if (!(heatingNeed > 0) && !(peakTemp > COOLING_BASE_TEMP)) continue;

    const scale = (day.stepHours / 1000) * day.days;

    for (const dayStep of day.steps) {
      const coolingNeed = Math.max(0, dayStep.temp - COOLING_BASE_TEMP);
      if (!(heatingNeed > 0) && !(coolingNeed > 0)) continue;

      for (let i = 0; i < bearings.length; i++) {
        const irradiance = planeIrradiance(dayStep, 90, bearings[i], { horizon: useHorizon });
        const direct = irradiance.beam + irradiance.circumsolar;
        const sunlit = direct > 0 ? 1 - overhangShadeFraction(overhang, profileAngle(dayStep, bearings[i])) : 0;
        const gain = (direct * sunlit + irradiance.total - direct) * scale;
        facadeUseful[i] += gain * heatingNeed;
        facadeUnwanted[i] += gain * coolingNeed;
      }
    }
  }

  // Whole house: day side at bearing i, night side opposite, the two ends at ±90°
  const n = bearings.length;
  const quarter = Math.round(90 / step);
  const wholeHouse = (facade) => bearings.map((_, i) =>
    GLAZING_SHARES.day * facade[i]
    + GLAZING_SHARES.night * facade[(i + 2 * quarter) % n]
    + GLAZING_SHARES.side * (facade[(i + quarter) % n] + facade[(i + 3 * quarter) % n])
  );

  const useful = wholeHouse(facadeUseful);
  const unwanted = wholeHouse(facadeUnwanted);
  const score = bearings.map((_, i) => useful[i] - unwanted[i]);

  return {
    bearings, useful, unwanted, score, facadeUseful, facadeUnwanted, heatingMonths, coolingMonths,
    best: refineBestBearing(bearings, score)
  };
}

/** Peak of a circular score curve, refined between samples with a parabola */
function refineBestBearing(bearings, score) {
  let index = 0;
  for (let i = 1; i < score.length; i++) if (score[i] > score[index]) index = i;

  const n = score.length;
  const step = bearings[1] - bearings[0];
  const left = score[(index - 1 + n) % n];
  const right = score[(index + 1) % n];
  const curvature = left - 2 * score[index] + right;
  const offset = curvature < 0 ? clamp((0.5 * (left - right)) / curvature, -0.5, 0.5) : 0;
  return normalizeBearing(bearings[index] + offset * step);
}

/** Linear interpolation of a per-bearing series (as returned by scoreOrientations) */
export function sampleByBearing(bearings, values, bearing) {
  const step = bearings[1] - bearings[0];
  const position = normalizeBearing(bearing) / step;
  const lower = Math.floor(position) % values.length;
  const upper = (lower + 1) % values.length;
  const t = position - Math.floor(position);
  return values[lower] * (1 - t) + values[upper] * t;
}

/* ------------------------------------------------------------------------- */
/* Overhangs                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Profile (vertical shadow) angle of the sun on a façade: the sun's altitude as
 * seen in a section cut perpendicular to the wall.
 * @returns {number|null} Degrees, or null when the sun isn't shining on the façade
 */
export function profileAngle(sun, facadeAzimuth) {
  if (!(sun.altitude > 0)) return null;
  const cosDelta = Math.cos((sun.azimuth - facadeAzimuth) * DEG);
  if (!(cosDelta > 1e-6)) return null;
  return Math.atan2(Math.tan(sun.altitude * DEG), cosDelta) / DEG;
}

/**
 * Fraction of a window in the shadow of a horizontal overhang.
 * @param {Object} overhang - { depth, gap, windowHeight } in metres; gap is from window head up to the overhang
 * @param {number|null} profile - Profile angle from profileAngle()
 * @returns {number} 0 (full sun) to 1 (fully shaded)
 */
export function overhangShadeFraction({ depth, gap, windowHeight }, profile) {
  if (profile === null || !(windowHeight > 0)) return 0;
  const shadowDrop = depth * Math.tan(profile * DEG);
  return clamp((shadowDrop - gap) / windowHeight, 0, 1);
}

/** Overhang depth whose shadow just reaches the window sill at a given profile angle */
export function overhangDepthForFullShade({ gap, windowHeight }, profile) {
  if (profile === null || !(profile > 0)) return null;
  return (gap + windowHeight) / Math.tan(profile * DEG);
}

/** Deepest overhang whose shadow stays above the window head at a given profile angle */
export function overhangDepthForNoShade({ gap }, profile) {
  if (profile === null || !(profile > 0)) return null;
  return gap / Math.tan(profile * DEG);
}

/**
 * Share of the direct (beam) sun on a window that an overhang blocks, for each
 * month's average clear day.
 * @returns {Array<{month: number, blocked: number|null, sunHours: number}>}
 *   blocked is null in months when the façade gets no direct sun at all
 */
export function overhangMonthlyShading(lat, facadeAzimuth, overhang, stepMinutes = 10) {
  return MONTH_AVERAGE_DAYS.map((dayOfYear, month) => {
    const decl = declination(dayOfYear);
    const sunsetAngle = sunsetHourAngle(lat, decl);
    const stepAngle = stepMinutes / 4;
    let received = 0;
    let admitted = 0;
    let sunMinutes = 0;

    for (const hourAngle of daylightHourAngles(sunsetAngle, stepAngle)) {
      const sun = solarPosition(lat, decl, hourAngle);
      const cosIncidence = incidenceCosine(sun, 90, facadeAzimuth);
      if (!(sun.altitude > 0) || !(cosIncidence > 0)) continue;
      const beam = clearSkyDni(sun.altitude) * cosIncidence;
      received += beam;
      admitted += beam * (1 - overhangShadeFraction(overhang, profileAngle(sun, facadeAzimuth)));
      sunMinutes += stepMinutes;
    }

    return {
      month,
      blocked: received > 0 ? 1 - admitted / received : null,
      sunHours: sunMinutes / 60
    };
  });
}

/* ------------------------------------------------------------------------- */
/* Shadows on the ground                                                     */
/* ------------------------------------------------------------------------- */

/** Length of the shadow of a vertical object, as a multiple of its height */
export function shadowLengthFactor(altitude) {
  return altitude > 0 ? 1 / Math.tan(altitude * DEG) : Infinity;
}

/**
 * Ground displacement of the shadow of a point `height` metres above ground
 * @returns {{x: number, y: number}|null} Metres (east, north); null when the sun is down
 */
export function shadowOffset(sun, height, maxLength = Infinity) {
  if (!(sun.altitude > 0)) return null;
  const length = Math.min(height * shadowLengthFactor(sun.altitude), maxLength);
  const direction = (sun.azimuth + 180) * DEG;
  return { x: length * Math.sin(direction), y: length * Math.cos(direction) };
}

/** Convex hull (monotone chain) of points {x, y} */
export function convexHull(points) {
  if (points.length < 3) return [...points];
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

/**
 * Corners of a rectangle on the ground.
 * @param {number} width - Size along the front (the façade facing `facing`)
 * @param {number} depth - Size front to back
 * @param {number} facing - Bearing the front faces
 * @param {{x: number, y: number}} [center]
 * @returns {Array<{x: number, y: number}>} front-left, front-right, back-right, back-left (seen from above)
 */
export function rectangleFootprint(width, depth, facing, center = { x: 0, y: 0 }) {
  const f = { x: Math.sin(facing * DEG), y: Math.cos(facing * DEG) };
  const r = { x: Math.cos(facing * DEG), y: -Math.sin(facing * DEG) };
  const corner = (side, front) => ({
    x: center.x + (side * width / 2) * r.x + (front * depth / 2) * f.x,
    y: center.y + (side * width / 2) * r.y + (front * depth / 2) * f.y
  });
  return [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
}

export function circleFootprint(radius, center = { x: 0, y: 0 }, segments = 24) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    points.push({ x: center.x + radius * Math.sin(angle), y: center.y + radius * Math.cos(angle) });
  }
  return points;
}

/**
 * Shadow of a flat-topped prism (building, wall, tree approximated as a cylinder).
 * @returns {Array<{x: number, y: number}>|null} Polygon including the footprint; null when the sun is down
 */
export function prismShadow(footprint, height, sun, maxLength = Infinity) {
  const offset = shadowOffset(sun, height, maxLength);
  if (!offset) return null;
  return convexHull([...footprint, ...footprint.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }))]);
}

/**
 * Geometry of a rectangular house with an optional gable roof whose ridge runs
 * parallel to the front (day-side) façade.
 * @param {Object} house - { width, depth, wallHeight, roofPitch } in metres/degrees
 * @param {number} facing - Bearing the front (day side) faces
 */
export function houseGeometry({ width, depth, wallHeight, roofPitch }, facing, center = { x: 0, y: 0 }) {
  const footprint = rectangleFootprint(width, depth, facing, center);
  const ridgeHeight = wallHeight + (depth / 2) * Math.tan(clamp(roofPitch, 0, 75) * DEG);
  const r = { x: Math.cos(facing * DEG), y: -Math.sin(facing * DEG) };
  const ridge = [
    { x: center.x - (width / 2) * r.x, y: center.y - (width / 2) * r.y },
    { x: center.x + (width / 2) * r.x, y: center.y + (width / 2) * r.y }
  ];
  return { footprint, ridge, ridgeHeight, wallHeight };
}

/** Shadow of a house from houseGeometry(): eaves outline plus the ridge line */
export function houseShadow(geometry, sun, maxLength = Infinity) {
  const eaves = shadowOffset(sun, geometry.wallHeight, maxLength);
  const ridge = shadowOffset(sun, geometry.ridgeHeight, maxLength);
  if (!eaves || !ridge) return null;
  return convexHull([
    ...geometry.footprint,
    ...geometry.footprint.map(p => ({ x: p.x + eaves.x, y: p.y + eaves.y })),
    ...geometry.ridge.map(p => ({ x: p.x + ridge.x, y: p.y + ridge.y }))
  ]);
}
