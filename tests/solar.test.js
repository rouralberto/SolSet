import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBearing, bearingDifference, compassPoint, declination, sunsetHourAngle, solarPosition,
  incidenceCosine, dailyExtraterrestrial, clearSkyDni, buildDayProfile, buildClimateYear, estimateClimate,
  createHorizon, horizonAt, addObstructionToHorizon, isSunBlocked, planeIrradiance, monthlyPlaneIrradiation,
  simulatePv, findOptimalPlane, scoreOrientations, sampleByBearing, profileAngle, overhangShadeFraction,
  overhangDepthForFullShade, overhangMonthlyShading, shadowOffset, convexHull, rectangleFootprint,
  circleFootprint, prismShadow, houseGeometry, houseShadow
} from '../src/lib/solar.js';

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message || ''} expected ${expected} ± ${tolerance}, got ${actual}`);

const polygonArea = (points) =>
  Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;

test('bearing helpers', () => {
  assert.equal(normalizeBearing(-10), 350);
  assert.equal(normalizeBearing(725), 5);
  assert.equal(bearingDifference(350, 10), -20);
  assert.equal(bearingDifference(10, 350), 20);
  assert.equal(compassPoint(0), 'N');
  assert.equal(compassPoint(170), 'S');
  assert.equal(compassPoint(200), 'SSW');
  assert.equal(compassPoint(359), 'N');
});

test('declination at solstices and equinoxes', () => {
  near(declination(172), 23.44, 0.1, 'June solstice');
  near(declination(355), -23.44, 0.1, 'December solstice');
  near(declination(80), 0, 0.6, 'March equinox');
  near(declination(266), 0, 0.6, 'September equinox');
});

test('sunset hour angle', () => {
  near(sunsetHourAngle(0, 23.44), 90, 1e-9, 'equator always 12 h');
  near(sunsetHourAngle(40, 0), 90, 1e-9, 'equinox 12 h everywhere');
  assert.equal(sunsetHourAngle(80, 23.44), 180); // polar day
  assert.equal(sunsetHourAngle(80, -23.44), 0); // polar night
  assert.ok(sunsetHourAngle(50, 23.44) > 120); // > 16 h day
});

test('solar position', () => {
  // Noon altitude = 90 − |lat − declination|
  near(solarPosition(43, -23.44, 0).altitude, 90 - 43 - 23.44, 1e-6);
  near(solarPosition(43, -23.44, 0).azimuth, 180, 1e-6, 'northern noon is due south');
  near(solarPosition(-34, 23.44, 0).azimuth, 0, 1e-6, 'southern noon is due north');
  // Morning sun is in the east, afternoon in the west
  assert.ok(solarPosition(43, 0, -45).azimuth < 180);
  assert.ok(solarPosition(43, 0, 45).azimuth > 180);
  // Equinox sunrise is due east
  near(solarPosition(43, 0, -90).azimuth, 90, 1e-6);
  near(solarPosition(43, 0, -90).altitude, 0, 1e-6);
  // In the tropics the midsummer noon sun passes on the polar side
  near(solarPosition(10, 23.44, 0).azimuth, 0, 1e-6);
});

test('incidence cosine', () => {
  const sun = { azimuth: 180, altitude: 30 };
  near(incidenceCosine(sun, 0, 0), Math.sin(Math.PI / 6), 1e-9, 'horizontal = sin(altitude)');
  near(incidenceCosine(sun, 60, 180), 1, 1e-9, 'plane normal to the sun');
  near(incidenceCosine(sun, 90, 180), Math.cos(Math.PI / 6), 1e-9, 'south wall');
  assert.ok(incidenceCosine(sun, 90, 0) < 0, 'north wall is in shade');
  near(incidenceCosine(sun, 90, 90), 0, 1e-9, 'grazing the east wall');
});

test('extraterrestrial irradiation', () => {
  near(dailyExtraterrestrial(0, 80), 10.4, 0.25, 'equator at equinox, kWh/m²');
  assert.equal(dailyExtraterrestrial(80, 355), 0);
  assert.ok(dailyExtraterrestrial(60, 172) > dailyExtraterrestrial(0, 172), 'long polar summer days');
});

test('clear-sky DNI', () => {
  assert.equal(clearSkyDni(-1), 0);
  near(clearSkyDni(90), 1361 * 0.7, 15);
  assert.ok(clearSkyDni(10) < clearSkyDni(40));
});

test('day profile conserves the daily total', () => {
  const profile = buildDayProfile({ lat: 43.3, dayOfYear: 172, dailyGhi: 6 });
  const sum = (key) => profile.steps.reduce((total, step) => total + step[key], 0) * profile.stepHours / 1000;
  near(sum('ghi'), 6, 0.02, 'GHI');
  assert.ok(sum('dhi') > 1 && sum('dhi') < 4, 'diffuse share is plausible');
  assert.ok(profile.steps.every(step => step.bhi >= 0 && step.dhi >= 0));
  near(profile.clearness, 6 / dailyExtraterrestrial(43.3, 172), 1e-9);
  // Symmetric about solar noon
  const first = profile.steps[0];
  const last = profile.steps[profile.steps.length - 1];
  near(first.ghi, last.ghi, 1e-6);
  near(first.azimuth, 360 - last.azimuth, 1e-6);
  assert.ok(first.temp < last.temp, 'afternoons are warmer than mornings');
});

test('day profile handles polar night and polar day', () => {
  assert.equal(buildDayProfile({ lat: 78, dayOfYear: 355, dailyGhi: 0 }).steps.length, 0);
  assert.equal(buildDayProfile({ lat: 78, dayOfYear: 355, dailyGhi: 2 }).steps.length, 0);
  const midnightSun = buildDayProfile({ lat: 78, dayOfYear: 172, dailyGhi: 6 });
  assert.equal(midnightSun.steps.length, 144, 'sun is up for all 24 h');
  near(midnightSun.steps.reduce((t, s) => t + s.ghi, 0) * midnightSun.stepHours / 1000, 6, 0.05);
});

test('plane irradiance', () => {
  const profile = buildDayProfile({ lat: 43.3, dayOfYear: 80, dailyGhi: 4 });
  const noon = profile.steps[Math.floor(profile.steps.length / 2)];
  near(planeIrradiance(noon, 0, 180).total, noon.ghi, noon.ghi * 0.02, 'a flat plane receives GHI');
  assert.ok(planeIrradiance(noon, 40, 180).total > noon.ghi, 'tilting to the sun gains');
  assert.equal(planeIrradiance(noon, 90, 0).beam, 0, 'no beam on the polar wall at noon');
  assert.ok(planeIrradiance(noon, 90, 0).total > 0, 'but it still gets diffuse light');

  const horizon = createHorizon().fill(80);
  const shaded = planeIrradiance(noon, 40, 180, { horizon });
  assert.equal(shaded.beam, 0);
  assert.ok(shaded.total > 0 && shaded.total < planeIrradiance(noon, 40, 180).total);
});

test('monthly irradiation: equator-facing wall wins in winter, loses in summer', () => {
  const year = buildClimateYear(45, estimateClimate(45));
  const south = monthlyPlaneIrradiation(year, 90, 180).total;
  const east = monthlyPlaneIrradiation(year, 90, 90).total;
  const west = monthlyPlaneIrradiation(year, 90, 270).total;
  const north = monthlyPlaneIrradiation(year, 90, 0).total;
  assert.ok(south[11] > east[11] * 1.5, 'December');
  assert.ok(south[5] < east[5], 'June');
  near(east[5], west[5], east[5] * 0.01, 'east and west are symmetric');
  assert.ok(north[11] < east[11]);
});

test('PV yield is physically plausible', () => {
  const year = buildClimateYear(40, estimateClimate(40));
  const south = simulatePv({ year, tilt: 35, azimuth: 180 });
  const east = simulatePv({ year, tilt: 35, azimuth: 90 });
  const north = simulatePv({ year, tilt: 35, azimuth: 0 });
  assert.ok(south.specificYield > 1000 && south.specificYield < 2000, `specific yield ${south.specificYield}`);
  assert.ok(east.specificYield < south.specificYield && east.specificYield > 0.7 * south.specificYield);
  assert.ok(north.specificYield < east.specificYield);
  assert.equal(south.monthly.length, 12);
  near(south.monthly.reduce((a, b) => a + b, 0), south.annual, 1e-6);
  assert.ok(south.monthly[5] > south.monthly[11], 'more in June than December');
  near(simulatePv({ year, tilt: 35, azimuth: 180, kwp: 5 }).annual, 5 * south.annual, 1e-6);
  assert.equal(south.shadingLoss, 0);

  // Southern hemisphere mirrors
  const southernYear = buildClimateYear(-40, estimateClimate(-40));
  const northFacing = simulatePv({ year: southernYear, tilt: 35, azimuth: 0 });
  near(northFacing.specificYield, south.specificYield, south.specificYield * 0.03);
  assert.ok(northFacing.monthly[11] > northFacing.monthly[5], 'December is summer');
});

test('PV shading from a horizon', () => {
  const year = buildClimateYear(40, estimateClimate(40));
  const horizon = createHorizon();
  for (let bearing = 120; bearing <= 240; bearing++) horizon[bearing] = 25;
  const open = simulatePv({ year, tilt: 35, azimuth: 180 });
  const shaded = simulatePv({ year, tilt: 35, azimuth: 180, horizon });
  assert.ok(shaded.annual < open.annual);
  assert.ok(shaded.shadingLoss > 0.03 && shaded.shadingLoss < 0.6, `loss ${shaded.shadingLoss}`);
  assert.ok(open.monthly[11] - shaded.monthly[11] > open.monthly[5] - shaded.monthly[5], 'winter suffers most');
  near(open.monthly[5], shaded.monthly[5], open.monthly[5] * 0.02, 'high summer sun clears it');
});

test('optimal PV plane faces the equator at roughly latitude tilt', () => {
  const north = findOptimalPlane(buildClimateYear(45, estimateClimate(45)), 45);
  near(north.azimuth, 180, 4);
  assert.ok(north.tilt > 25 && north.tilt < 45, `tilt ${north.tilt}`);
  const south = findOptimalPlane(buildClimateYear(-35, estimateClimate(-35)), -35);
  near(bearingDifference(south.azimuth, 0), 0, 4);
  assert.ok(south.tilt > 20 && south.tilt < 40, `tilt ${south.tilt}`);
  const equator = findOptimalPlane(buildClimateYear(0, estimateClimate(0)), 0);
  assert.ok(equator.tilt <= 8, `equator tilt ${equator.tilt}`);
});

test('orientation scoring', () => {
  // Cool temperate: face the equator, with a broad optimum
  const cool = scoreOrientations(buildClimateYear(50, { ghi: estimateClimate(50).ghi, temp: [2, 3, 6, 9, 13, 16, 18, 18, 15, 11, 6, 3], tempRange: Array(12).fill(8) }));
  near(bearingDifference(cool.best, 180), 0, 12, 'cool climate');
  assert.ok(cool.heatingMonths.length >= 7);
  const at = (bearing) => sampleByBearing(cool.bearings, cool.useful, bearing);
  assert.ok(at(195) > 0.9 * at(180), '15° off costs under 10%');
  assert.ok(at(90) < 0.75 * at(180), 'due east costs a lot');
  near(at(182.5), (at(180) + at(185)) / 2, 1e-9, 'interpolates between samples');

  // Southern hemisphere faces north
  const southern = scoreOrientations(buildClimateYear(-42, { ghi: estimateClimate(-42).ghi, temp: [17, 17, 15, 13, 10, 8, 8, 9, 10, 12, 14, 16], tempRange: Array(12).fill(8) }));
  near(bearingDifference(southern.best, 0), 0, 12, 'southern hemisphere');

  // Hot afternoons push the optimum towards the morning (east) side
  const hot = scoreOrientations(buildClimateYear(35, { ghi: estimateClimate(35).ghi, temp: [9, 11, 15, 19, 24, 29, 32, 31, 27, 20, 14, 10], tempRange: Array(12).fill(14) }));
  const shift = bearingDifference(hot.best, 180);
  assert.ok(shift <= 0 && shift > -40, `hot-summer optimum should be at or east of south, got ${hot.best}`);

  // Always-hot tropics: no heating season, the day side should avoid the sun (N or S, never E/W)
  const tropics = scoreOrientations(buildClimateYear(3, { ghi: Array(12).fill(4.6), temp: Array(12).fill(27), tempRange: Array(12).fill(6) }));
  assert.equal(tropics.heatingMonths.length, 0);
  assert.equal(tropics.coolingMonths.length, 12);
  const offAxis = Math.min(Math.abs(bearingDifference(tropics.best, 0)), Math.abs(bearingDifference(tropics.best, 180)));
  assert.ok(offAxis < 25, `tropical optimum should face N or S, got ${tropics.best}`);
});

test('horizon mask from obstructions', () => {
  const horizon = createHorizon();
  // 10 m tall, 10 m wide wall 20 m due south, seen from 1.5 m
  const wall = rectangleFootprint(10, 1, 0, { x: 0, y: -20 });
  addObstructionToHorizon(horizon, wall, 10, { x: 0, y: 0, z: 1.5 });
  near(horizonAt(horizon, 180), Math.atan2(8.5, 19.5) * 180 / Math.PI, 0.5);
  assert.ok(horizonAt(horizon, 180 + 10) > 15, 'still behind the wall 10° off');
  assert.equal(horizonAt(horizon, 180 + 25), 0, 'clear beyond its edge');
  assert.equal(horizonAt(horizon, 0), 0);
  assert.ok(isSunBlocked(horizon, { azimuth: 180, altitude: 15 }));
  assert.ok(!isSunBlocked(horizon, { azimuth: 180, altitude: 35 }));
  assert.ok(!isSunBlocked(horizon, { azimuth: 90, altitude: 5 }));

  // Lower than the observer: no effect
  const low = addObstructionToHorizon(createHorizon(), wall, 1, { x: 0, y: 0, z: 1.5 });
  assert.ok(low.every(v => v === 0));

  // Straddling north (the 359°/0° seam)
  const seam = addObstructionToHorizon(createHorizon(), rectangleFootprint(10, 1, 180, { x: 0, y: 20 }), 10, { x: 0, y: 0, z: 0 });
  assert.ok(seam[0] > 20 && seam[355] > 20 && seam[5] > 20);
  assert.equal(seam[180], 0);

  // An obstruction the observer stands inside is left out
  const inside = addObstructionToHorizon(createHorizon(), circleFootprint(5), 10, { x: 0, y: 0, z: 1.5 });
  assert.ok(inside.every(v => v === 0));
});

test('overhang geometry', () => {
  // Facing the sun squarely, the profile angle is the altitude
  near(profileAngle({ azimuth: 180, altitude: 60 }, 180), 60, 1e-9);
  // Seen obliquely the sun looks higher in section
  assert.ok(profileAngle({ azimuth: 240, altitude: 30 }, 180) > 30);
  assert.equal(profileAngle({ azimuth: 0, altitude: 30 }, 180), null);
  assert.equal(profileAngle({ azimuth: 180, altitude: -5 }, 180), null);

  const overhang = { depth: 0.6, gap: 0.3, windowHeight: 1.5 };
  near(overhangShadeFraction(overhang, 45), (0.6 - 0.3) / 1.5, 1e-9);
  assert.equal(overhangShadeFraction(overhang, 10), 0);
  assert.equal(overhangShadeFraction(overhang, 85), 1);
  assert.equal(overhangShadeFraction(overhang, null), 0);

  // The JLC rule of thumb: depth ≈ 0.29 × (sill-to-overhang height) at 40° latitude
  const summerNoon = 90 - 40 + 23.44;
  near(overhangDepthForFullShade({ gap: 0.3, windowHeight: 1.5 }, summerNoon) / 1.8, 0.29, 0.01);
});

test('overhang shades summer and admits winter sun', () => {
  const months = overhangMonthlyShading(43, 180, { depth: 0.7, gap: 0.3, windowHeight: 1.5 });
  assert.equal(months.length, 12);
  assert.ok(months[5].blocked > 0.8, `June ${months[5].blocked}`);
  assert.ok(months[11].blocked < 0.1, `December ${months[11].blocked}`);
  // The polar façade gets no direct winter sun at all
  const north = overhangMonthlyShading(43, 0, { depth: 0.7, gap: 0.3, windowHeight: 1.5 });
  assert.equal(north[11].blocked, null);
  assert.equal(north[11].sunHours, 0);
  // Overhangs do little for a west window
  const west = overhangMonthlyShading(43, 270, { depth: 0.7, gap: 0.3, windowHeight: 1.5 });
  assert.ok(west[5].blocked < months[5].blocked - 0.2);
});

test('shadow geometry', () => {
  // Sun in the south at 45°: a 10 m pole casts a 10 m shadow due north
  const offset = shadowOffset({ azimuth: 180, altitude: 45 }, 10);
  near(offset.x, 0, 1e-9);
  near(offset.y, 10, 1e-9);
  // Morning sun in the east throws shadows west
  assert.ok(shadowOffset({ azimuth: 90, altitude: 20 }, 5).x < 0);
  assert.equal(shadowOffset({ azimuth: 90, altitude: -2 }, 5), null);
  near(Math.hypot(...Object.values(shadowOffset({ azimuth: 200, altitude: 1 }, 10, 50))), 50, 1e-9, 'capped');
});

test('footprints and hulls', () => {
  const rect = rectangleFootprint(12, 8, 180);
  near(polygonArea(rect), 96, 1e-9);
  // Front (day side) corners are to the south when facing 180°
  assert.ok(rect[0].y < 0 && rect[1].y < 0 && rect[2].y > 0 && rect[3].y > 0);
  near(Math.abs(rect[0].x), 6, 1e-9);
  // Rotating keeps the area
  near(polygonArea(rectangleFootprint(12, 8, 37)), 96, 1e-9);
  near(polygonArea(circleFootprint(5, { x: 3, y: 4 }, 180)), Math.PI * 25, 0.1);
  assert.equal(convexHull([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0.1 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 1 }]).length, 4);
});

test('prism and house shadows', () => {
  const sun = { azimuth: 180, altitude: 45 };
  const footprint = rectangleFootprint(10, 10, 180);
  const shadow = prismShadow(footprint, 5, sun);
  near(polygonArea(shadow), 100 + 10 * 5, 1e-6, 'footprint plus a 5 m strip to the north');
  assert.ok(Math.max(...shadow.map(p => p.y)) > 9.9 && Math.min(...shadow.map(p => p.y)) > -5.1);
  assert.equal(prismShadow(footprint, 5, { azimuth: 180, altitude: -1 }), null);

  const flat = houseGeometry({ width: 12, depth: 8, wallHeight: 5, roofPitch: 0 }, 180);
  near(flat.ridgeHeight, 5, 1e-9);
  const gable = houseGeometry({ width: 12, depth: 8, wallHeight: 5, roofPitch: 45 }, 180);
  near(gable.ridgeHeight, 9, 1e-9);
  // Ridge runs east–west for a south-facing house
  near(gable.ridge[0].y, 0, 1e-9);
  near(Math.abs(gable.ridge[0].x - gable.ridge[1].x), 12, 1e-9);
  assert.ok(polygonArea(houseShadow(gable, sun)) >= polygonArea(houseShadow(flat, sun)));
  // Sun along the ridge: a gable casts a pointed shadow longer than its eaves
  const low = { azimuth: 90, altitude: 30 };
  const reach = (geometry) => Math.min(...houseShadow(geometry, low).map(p => p.x));
  assert.ok(reach(gable) < reach(flat) - 5);
});
