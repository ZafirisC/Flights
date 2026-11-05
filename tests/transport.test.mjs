import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStops, departureView, distanceText, modeFromRouteType, overpassQuery } from '../js/transport.js';
import { trimDepartures } from '../worker/worker.js';

const APT = { lat: 37.9364, lon: 23.9445 };

test('parseStops classifies, dedupes and sorts by mode then distance', () => {
  const data = { elements: [
    { tags: { highway: 'bus_stop', bus: 'yes', name: 'Bus X' }, lat: 37.94, lon: 23.95 },
    { tags: { railway: 'station', station: 'subway', name: 'Airport' }, lat: 37.937, lon: 23.945, },
    { tags: { railway: 'station', name: 'Airport' }, center: { lat: 37.938, lon: 23.946 } },
    { tags: { railway: 'station', name: 'Airport' }, lat: 37.939, lon: 23.947 },
    { tags: { amenity: 'taxi' }, lat: 37.936, lon: 23.944 },
    { tags: { railway: 'station' }, lat: 37.9, lon: 23.9 }, // no name: dropped
  ] };
  const s = parseStops(data, APT);
  assert.deepEqual(s.map((x) => x.mode), ['train', 'metro', 'bus', 'taxi']);
  assert.equal(s[3].name, 'Taxi rank');
});

test('overpassQuery mentions the point', () => assert.match(overpassQuery(37.9364, 23.9445), /around:2500,37.93640,23.94450/));

test('departureView: minutes, past, clock in airport zone', () => {
  const now = Date.parse('2026-11-05T10:00:00Z');
  assert.equal(departureView({ utc: '2026-11-05T10:07:00Z' }, now, 'Europe/Athens').text, 'in 7 min');
  assert.equal(departureView({ utc: '2026-11-05T10:07:00Z' }, now, 'Europe/Athens').clock, '12:07');
  assert.equal(departureView({ utc: '2026-11-05T10:00:30Z' }, now).text, 'Now');
  assert.equal(departureView({ utc: '2026-11-05T11:05:00Z' }, now).text, 'in 1 h 05 min');
  assert.equal(departureView({ utc: '2026-11-05T09:50:00Z' }, now), null);
  assert.equal(departureView({ utc: 'x' }, now), null);
});

test('distanceText and route types', () => {
  assert.equal(distanceText(420), '400 m');
  assert.equal(distanceText(1640), '1.6 km');
  assert.equal(modeFromRouteType(1), 'metro');
  assert.equal(modeFromRouteType(109), 'train');
  assert.equal(modeFromRouteType(99), null);
});

test('worker trimDepartures: prefers estimated, skips untimed, sorts, dedupes', () => {
  const stops = [{ stop_name: 'Stn', departures: [
    { departure: { scheduled_utc: '2026-11-05T10:20:00Z' }, trip: { trip_headsign: 'City', route: { route_short_name: 'M3', route_type: 1 } } },
    { departure: { scheduled_utc: '2026-11-05T10:10:00Z', estimated_utc: '2026-11-05T10:12:00Z' }, trip: { trip_headsign: 'Port', route: { route_short_name: 'X96', route_type: 3 } } },
    { departure: { scheduled: '10:30:00' }, trip: { route: {} } },
    { departure: { scheduled_utc: '2026-11-05T10:20:00Z' }, trip: { trip_headsign: 'City', route: { route_short_name: 'M3', route_type: 1 } } },
  ] }];
  const r = trimDepartures(stops);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].line, r[0].live, r[0].mode, r[1].mode], ['X96', true, 'bus', 'metro']);
});
