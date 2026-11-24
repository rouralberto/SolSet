import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offsetBetween, offsetCoordinate, squareBounds, metersPerPixel, distanceBetween, magneticDeclination, trueToMagnetic } from '../src/lib/geo.js';
import { formatLength, toDisplayLength, fromDisplayLength, roundDisplayLength, lengthUnit } from '../src/lib/units.js';
import { parsePowerClimate, climateKey } from '../src/lib/climate.js';
import { decodeTerrarium, tileCoordinate, tilesAround, createElevationSampler, marchTerrainHorizon, farZoomFor } from '../src/lib/terrain.js';
import { parseBuildingHeight, parseOverpassBuildings, overpassQuery } from '../src/lib/buildings.js';
import { createObstacle, sanitizeObstacle, obstacleFootprint, localObstacles, obstacleHorizon, obstaclesUnderHouse, houseFacades, arrayObserver } from '../src/lib/site.js';
import { sampleSolarDay, summarizeSunlight, solarAccessWindow, formatDuration, formatSunPeriods } from '../src/lib/analysis.js';
import { horizonAt, createHorizon } from '../src/lib/solar.js';

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message || ''} expected ${expected} ± ${tolerance}, got ${actual}`);

const site = { lat: 43.3183, lng: -1.9812 };

test('geo: offsets round-trip and distances', () => {
  const moved = offsetCoordinate(site, { x: 120, y: -45 });
  const back = offsetBetween(site, moved);
  near(back.x, 120, 0.01);
  near(back.y, -45, 0.01);
  near(distanceBetween(site, moved), Math.hypot(120, 45), 0.01);
  // One degree of latitude is ~111.2 km
  near(offsetBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }).y, 111195, 100);
  // Across the antimeridian
  near(offsetBetween({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 }).x, 222.4, 1);
  const [[south, west], [north, east]] = squareBounds(site, 100);
  near(offsetBetween({ lat: south, lng: west }, { lat: north, lng: east }).x, 200, 0.5);
  near(offsetBetween({ lat: south, lng: west }, { lat: north, lng: east }).y, 200, 0.5);
  near(metersPerPixel(0, 0), 156543, 1);
  near(metersPerPixel(60, 19), 156543.03392 * 0.5 / 2 ** 19, 1e-6);
});

test('geo: magnetic declination matches published values', () => {
  const date = new Date('2026-06-01T00:00:00Z');
  near(magneticDeclination(47.6, -122.33, date), 15, 1.5, 'Seattle ~15°E');
  near(magneticDeclination(-36.85, 174.76, date), 20, 1.5, 'Auckland ~20°E');
  near(magneticDeclination(51.5, -0.12, date), 1, 1.5, 'London ~1°E');
  assert.ok(magneticDeclination(44.65, -63.58, date) < -14, 'Halifax is well west');
  // A wall facing 180° true reads 165° on a compass where declination is 15°E
  assert.equal(trueToMagnetic(180, 15), 165);
  assert.equal(trueToMagnetic(5, 15), 350);
});

test('units', () => {
  assert.equal(formatLength(2.345, 'metric'), '2.3 m');
  assert.equal(formatLength(1234, 'metric'), '1.2 km');
  assert.equal(formatLength(150, 'metric'), '150 m');
  assert.equal(formatLength(3.048, 'imperial'), '10 ft');
  assert.equal(formatLength(12, 'metric'), '12 m');
  assert.equal(formatLength(0.6, 'metric', 2), '0.6 m');
  assert.equal(formatLength(0.65, 'metric', 2), '0.65 m');
  assert.equal(formatLength(Infinity, 'metric'), '—');
  assert.equal(lengthUnit('imperial'), 'ft');
  near(fromDisplayLength(toDisplayLength(7.3, 'imperial'), 'imperial'), 7.3, 1e-9);
  assert.equal(roundDisplayLength(3.048, 'imperial', 1), 10);
  assert.equal(roundDisplayLength(3.048, 'metric', 1), 3);
});

test('climate: parses NASA POWER and rejects unusable data', () => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const series = (fn) => Object.fromEntries([...months.map((m, i) => [m, fn(i)]), ['ANN', 0]]);
  const response = {
    geometry: { coordinates: [-1.98, 43.32, 118.13] },
    header: { range: '25-year Meteorological and Solar Monthly & Annual Climatologies (January 2001 - December 2025)' },
    properties: { parameter: { ALLSKY_SFC_SW_DWN: series(i => 1 + i * 0.1), T2M: series(i => 5 + i), T2M_RANGE: series(() => 7.5) } }
  };
  const climate = parsePowerClimate(response);
  assert.equal(climate.source, 'nasa-power');
  assert.equal(climate.ghi.length, 12);
  near(climate.ghi[11], 2.1, 1e-9);
  assert.equal(climate.temp[0], 5);
  assert.equal(climate.tempRange[3], 7.5);
  assert.equal(climate.elevation, 118.13);
  assert.equal(climate.period, 'January 2001 - December 2025');

  assert.equal(parsePowerClimate({}), null);
  assert.equal(parsePowerClimate({ properties: { parameter: { ALLSKY_SFC_SW_DWN: series(() => -999), T2M: series(() => 5) } } }), null);
  // Polar night months report zero, a couple of fill values are tolerated
  const polar = parsePowerClimate({ properties: { parameter: { ALLSKY_SFC_SW_DWN: series(i => (i < 2 ? -999 : 2)), T2M: series(() => -5) } } });
  assert.equal(polar.ghi[0], 0);
  assert.equal(polar.tempRange[0], 8);

  assert.equal(climateKey(43.3183, -1.9812), '43.25,-2.00');
  assert.equal(climateKey(43.33, -1.9), climateKey(43.3183, -1.9812));
});

test('terrain: tile maths', () => {
  near(decodeTerrarium(128, 0, 0), 0, 1e-9);
  near(decodeTerrarium(134, 60, 128), 1596.5, 1e-9);
  const origin = tileCoordinate(0, 0, 1);
  near(origin.x, 1, 1e-9);
  near(origin.y, 1, 1e-9);
  // Known tile: zoom 13 over San Sebastián
  const t = tileCoordinate(43.3183, -1.9812, 13);
  assert.equal(Math.floor(t.x), 4050);
  assert.equal(Math.floor(t.y), 3000);
  assert.ok(tilesAround(site, 2000, 13).length <= 9);
  assert.ok(tilesAround(site, 40000, farZoomFor(site.lat)).length <= 16);
  assert.ok(tilesAround({ lat: 64, lng: 20 }, 40000, farZoomFor(64)).length <= 16);
  assert.ok(tilesAround({ lat: -17, lng: 179.99 }, 40000, 10).length >= 2, 'antimeridian');
});

test('terrain: ray-marched horizon over synthetic ground', () => {
  // Flat ground: nothing above the horizontal
  const flat = marchTerrainHorizon(site, () => 100);
  assert.ok(flat.horizon.every(v => v === 0));
  assert.equal(flat.elevation, 100);

  // A 500 m ridge everywhere more than 5 km north of the site
  const ridge = marchTerrainHorizon(site, (lat) => (lat > site.lat + 5000 / 111195 ? 600 : 100));
  near(ridge.horizon[0], Math.atan2(500 - 2, 5000) * 180 / Math.PI, 0.4);
  assert.equal(ridge.horizon[180], 0);
  assert.ok(ridge.horizon[60] > 0 && ridge.horizon[60] < ridge.horizon[0], 'lower when seen obliquely');
  near(ridge.maxBearing % 360 > 180 ? ridge.maxBearing - 360 : ridge.maxBearing, 0, 3);

  // Bilinear sampler over one tile sloping west to east
  const tile = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) tile[y * 256 + x] = x;
  const sample = createElevationSampler(new Map([['13/4050/3000', tile]]));
  const inside = sample(43.3183, -1.9812, 13);
  assert.ok(inside > 0 && inside < 255);
  assert.ok(sample(43.3183, -1.9800, 13) > inside, 'higher further east');
  assert.equal(sample(10, 10, 13), null, 'unknown ground');
  assert.equal(marchTerrainHorizon(site, () => null), null);
});

test('buildings: heights and Overpass parsing', () => {
  assert.deepEqual(parseBuildingHeight({ height: '12.5' }), { height: 12.5, assumed: false });
  assert.deepEqual(parseBuildingHeight({ height: '12 m' }), { height: 12, assumed: false });
  assert.deepEqual(parseBuildingHeight({ height: '40 ft' }), { height: 12.2, assumed: false });
  assert.deepEqual(parseBuildingHeight({ 'building:levels': '3' }), { height: 9, assumed: false });
  assert.deepEqual(parseBuildingHeight({ 'building:levels': '2', 'roof:levels': '1' }), { height: 7.5, assumed: false });
  assert.deepEqual(parseBuildingHeight({ building: 'yes' }), { height: 6, assumed: true });
  assert.deepEqual(parseBuildingHeight({ height: 'tall' }), { height: 6, assumed: true });
  const query = overpassQuery(43.3183, -1.9812, 150);
  const box = /way\["building"\]\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(query).slice(1).map(Number);
  assert.ok(box[0] < 43.3183 && box[2] > 43.3183 && box[1] < -1.9812 && box[3] > -1.9812, 'south,west,north,east around the site');
  near(offsetBetween({ lat: box[0], lng: box[1] }, { lat: box[2], lng: box[3] }).y, 300, 1);

  const corner = (x, y) => { const c = offsetCoordinate(site, { x, y }); return { lat: c.lat, lon: c.lng }; };
  const square = [corner(20, 20), corner(30, 20), corner(30, 30), corner(20, 30), corner(20, 20)];
  const parsed = parseOverpassBuildings({
    elements: [
      { type: 'way', id: 1, geometry: square, tags: { building: 'house', 'building:levels': '2', 'addr:street': 'Kale Nagusia', 'addr:housenumber': '4' } },
      { type: 'way', id: 2, geometry: square.slice(0, 2), tags: { building: 'yes' } },
      { type: 'relation', id: 3, members: [{ role: 'outer', geometry: square }, { role: 'inner', geometry: square }], tags: { building: 'apartments', height: '21' } },
      { type: 'node', id: 4 }
    ]
  });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 'osm-way-1');
  assert.equal(parsed[0].name, 'Kale Nagusia 4');
  assert.equal(parsed[0].height, 6);
  assert.equal(parsed[0].polygon.length, 4, 'closing node dropped');
  const offset = offsetBetween(site, parsed[0]);
  near(offset.x, 25, 0.05);
  near(offset.y, 25, 0.05);
  near(Math.abs(parsed[0].polygon[0][0]), 5, 0.05);
  assert.equal(parsed[1].height, 21);
  assert.equal(parsed[1].name, 'Apartments');
  assert.ok(sanitizeObstacle(parsed[0]), 'imported obstacles are valid obstacles');
});

test('site: obstacles, footprints and horizons', () => {
  const tree = { ...createObstacle('tree', offsetCoordinate(site, { x: 0, y: -15 })), height: 12, radius: 4 };
  assert.equal(tree.kind, 'tree');
  assert.deepEqual(sanitizeObstacle(tree), tree);
  assert.equal(sanitizeObstacle({ kind: 'tree', lat: 'x', lng: 1 }), null);
  assert.equal(sanitizeObstacle({ kind: 'imported', lat: 1, lng: 1, polygon: [[0, 0]] }), null);
  assert.equal(sanitizeObstacle({ kind: 'building', lat: 1, lng: 1, height: -4, width: 'a' }).height, 0.5);
  assert.equal(sanitizeObstacle({ kind: 'building', lat: 1, lng: 1, rotation: 370 }).rotation, 10);

  const footprint = obstacleFootprint(tree, site);
  near(footprint.reduce((s, p) => s + p.y, 0) / footprint.length, -15, 0.05);

  const far = createObstacle('tree', offsetCoordinate(site, { x: 2000, y: 0 }));
  const local = localObstacles([tree, far], site);
  assert.equal(local.length, 1);
  near(local[0].distance, 15, 0.05);

  const horizon = obstacleHorizon(local, { x: 0, y: 0, z: 1.5 });
  near(horizonAt(horizon, 180), Math.atan2(10.5, 11) * 180 / Math.PI, 1.5, 'near edge of the crown');
  assert.equal(horizonAt(horizon, 0), 0);
  assert.equal(horizonAt(horizon, 180 + 30), 0);

  const onPlot = { ...createObstacle('building', site), width: 10, depth: 10 };
  assert.equal(obstaclesUnderHouse(localObstacles([onPlot, tree], site)).length, 1);
  assert.ok(obstacleHorizon(localObstacles([onPlot], site), { x: 0, y: 0, z: 1.5 }).every(v => v === 0));
});

test('site: façades and array position', () => {
  const house = { width: 12, depth: 8, wallHeight: 5, roofPitch: 30 };
  const facades = houseFacades(house, 180);
  assert.deepEqual(facades.map(f => f.key), ['day', 'sideA', 'night', 'sideB']);
  assert.deepEqual(facades.map(f => f.bearing), [180, 270, 0, 90]);
  near(facades[0].point.y, -4.1, 1e-9, 'day side is to the south');
  near(facades[1].point.x, -6.1, 1e-9, 'sideA faces west');
  near(facades[3].point.x, 6.1, 1e-9, 'sideB faces east');
  assert.equal(facades[0].length, 12);
  assert.equal(facades[1].length, 8);

  const roof = arrayObserver(house, 180, 'roof-day');
  near(roof.y, -2, 1e-9);
  near(roof.z, 5 + 4 * Math.tan(Math.PI / 6) / 2, 1e-9);
  assert.ok(arrayObserver(house, 180, 'roof-night').y > 0);
  assert.equal(arrayObserver(house, 180, 'custom').z, 5);
});

test('analysis: sunlight on a real day', () => {
  const winter = sampleSolarDay(new Date('2026-12-21T11:00:00Z'), site.lat, site.lng);
  const open = summarizeSunlight(winter);
  // Day length at 43.3°N on the winter solstice is just under 9 h
  near(open.sunMinutes, 8 * 60 + 55, 8);
  assert.equal(open.blockedMinutes, 0);
  near(open.first, winter.times.sunrise.getTime(), 4 * 60000);
  near(open.last, winter.times.sunset.getTime(), 4 * 60000);

  // In winter the whole day's sun falls on the south façade, none on the north
  near(summarizeSunlight(winter, { facadeAzimuth: 180 }).sunMinutes, open.sunMinutes, 12);
  assert.equal(summarizeSunlight(winter, { facadeAzimuth: 0 }).sunMinutes, 0);
  const east = summarizeSunlight(winter, { facadeAzimuth: 90 });
  const west = summarizeSunlight(winter, { facadeAzimuth: 270 });
  near(east.sunMinutes, west.sunMinutes, 6);
  assert.ok(east.last <= winter.solarNoon + 5 * 60000, 'east façade loses the sun at solar noon');

  // The 6 h solar-access window is fully sunlit in the open
  near(summarizeSunlight(winter, { window: solarAccessWindow(winter) }).sunMinutes, 360, 2);

  // A 20° obstruction to the south-east removes the morning
  const horizon = createHorizon();
  for (let bearing = 110; bearing <= 170; bearing++) horizon[bearing] = 20;
  const shaded = summarizeSunlight(winter, { horizon });
  assert.ok(shaded.blockedMinutes > 150 && shaded.blockedMinutes < 300, `blocked ${shaded.blockedMinutes}`);
  assert.ok(shaded.first > winter.solarNoon - 2 * 3600000);

  // Midsummer: the north façade does get early and late sun
  const summer = sampleSolarDay(new Date('2026-06-21T11:00:00Z'), site.lat, site.lng);
  assert.ok(summarizeSunlight(summer, { facadeAzimuth: 0 }).sunMinutes > 180);
  near(summarizeSunlight(summer).sunMinutes, 15 * 60 + 25, 10);

  // Polar night
  assert.equal(summarizeSunlight(sampleSolarDay(new Date('2026-12-21T11:00:00Z'), 78, 15)).sunMinutes, 0);
  assert.equal(summarizeSunlight(sampleSolarDay(new Date('2026-06-21T11:00:00Z'), 78, 15)).sunMinutes, 1440);
});

test('analysis: spells of sun', () => {
  const clock = (date) => date.toISOString().slice(11, 16);
  const winter = sampleSolarDay(new Date('2026-12-21T11:00:00Z'), site.lat, site.lng);

  // Open sky: one unbroken spell from sunrise to sunset
  const open = summarizeSunlight(winter);
  assert.equal(open.periods.length, 1);
  assert.equal(open.periods[0][0], open.first);
  assert.equal(open.periods[0][1], open.last);

  // Something tall due south splits the day in two
  const horizon = createHorizon();
  for (let bearing = 170; bearing <= 190; bearing++) horizon[bearing] = 40;
  const split = summarizeSunlight(winter, { horizon });
  assert.equal(split.periods.length, 2);
  assert.ok(split.periods[0][1] < winter.solarNoon && split.periods[1][0] > winter.solarNoon);
  assert.match(formatSunPeriods(split.periods, clock), /^\d\d:\d\d–\d\d:\d\d, \d\d:\d\d–\d\d:\d\d$/);
  near(split.periods.reduce((sum, [a, b]) => sum + (b - a) / 60000, 0), split.sunMinutes, 1e-6);

  // Midnight sun: the north wall is lit late in the evening and again after midnight
  const arctic = sampleSolarDay(new Date('2026-06-21T11:00:00Z'), 69.65, 18.96);
  assert.equal(summarizeSunlight(arctic, { facadeAzimuth: 0 }).periods.length, 2);

  assert.equal(formatSunPeriods([], clock), 'no direct sun');
  const minute = 60000;
  // A 10-minute gap is bridged, a 2-hour one is not
  assert.equal(formatSunPeriods([[0, 60 * minute], [70 * minute, 120 * minute], [240 * minute, 300 * minute]], clock), '00:00–02:00, 04:00–05:00');
  // Only the longest spells are listed
  const many = [[0, 10], [100, 200], [300, 320], [400, 600], [700, 705]].map(([a, b]) => [a * minute, b * minute]);
  assert.equal(formatSunPeriods(many, clock, { max: 2 }), '01:40–03:20, 06:40–10:00');
});

test('analysis: duration formatting', () => {
  assert.equal(formatDuration(0), '0h');
  assert.equal(formatDuration(320), '5h 20m');
  assert.equal(formatDuration(360), '6h');
  assert.equal(formatDuration(65.4), '1h 05m');
  assert.equal(formatDuration(NaN), '—');
});
