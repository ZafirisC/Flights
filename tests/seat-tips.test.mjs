// Run: node --test tests/   (Node 22+, no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sunPosition } from '../js/sun.js';
import { sunSide, flightWindow, seatAdvice, layoutFor } from '../js/seat-tips.js';

const ATH = { lat: 37.9364, lon: 23.9445 };
const LHR = { lat: 51.47, lon: -0.4543 };
const H = 3600000;
const at = (iso, hours) => ({ depMs: Date.parse(iso), arrMs: Date.parse(iso) + hours * H });

test('sun position: June solstice noon at 0/0 is high in the north', () => {
  const s = sunPosition(0, 0, Date.parse('2026-06-21T12:00:00Z'));
  assert.ok(Math.abs(s.elev - 66.6) < 1, `elev ${s.elev}`);
  assert.ok(s.az < 10 || s.az > 350, `az ${s.az}`);
});

test('sun position: Athens, June afternoon is in the west, midnight below the horizon', () => {
  const pm = sunPosition(ATH.lat, ATH.lon, Date.parse('2026-06-21T14:00:00Z'));
  assert.ok(pm.elev > 30 && pm.az > 220 && pm.az < 280, JSON.stringify(pm));
  assert.ok(sunPosition(ATH.lat, ATH.lon, Date.parse('2026-06-21T22:00:00Z')).elev < 0);
});

test('afternoon flights: ATH→LHR sun on the left, LHR→ATH on the right', () => {
  assert.equal(sunSide({ origin: ATH, dest: LHR, ...at('2026-06-21T13:00:00Z', 3.75) }).side, 'left');
  assert.equal(sunSide({ origin: LHR, dest: ATH, ...at('2026-06-21T13:00:00Z', 3.5) }).side, 'right');
});

test('night flight: no sun', () => {
  const r = sunSide({ origin: ATH, dest: LHR, ...at('2026-12-15T22:00:00Z', 3.75) });
  assert.equal(r.side, 'none');
  assert.equal(r.events.length, 0);
});

test('December afternoon ATH→LHR: sunset during the flight, on the left', () => {
  const r = sunSide({ origin: ATH, dest: LHR, ...at('2026-12-15T13:30:00Z', 3.75) });
  const sunset = r.events.find((e) => e.type === 'sunset');
  assert.ok(sunset, JSON.stringify(r));
  assert.equal(sunset.side, 'left');
  assert.ok(sunset.afterMs > 0 && sunset.afterMs < 3.75 * H);
});

test('flight window: uses known times, otherwise estimates from distance and position', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const known = flightWindow({ origin: ATH, dest: LHR, times: { depSched: now, arrSched: now + 4 * H }, now });
  assert.deepEqual(known, { depMs: now, arrMs: now + 4 * H, estimated: false });
  const onGround = flightWindow({ origin: ATH, dest: LHR, live: { ...ATH, onGround: true }, now });
  assert.equal(onGround.depMs, now);
  assert.ok(onGround.estimated && onGround.arrMs - now > 3 * H && onGround.arrMs - now < 4.5 * H);
  const airborne = flightWindow({ origin: ATH, dest: LHR, live: { lat: 45, lon: 12, onGround: false }, now });
  assert.ok(airborne.depMs < now - H);
});

test('layouts: known type, case-insensitive; unknown → null', () => {
  assert.equal(layoutFor('a20n').name, 'Airbus A320 family');
  assert.equal(layoutFor('B789').right, 'K');
  assert.equal(layoutFor('AT76').cabin, '2-2');
  assert.equal(layoutFor('ZZZZ'), null);
  assert.equal(layoutFor(null), null);
});

test('advice text names the side and seat letters', () => {
  const lines = seatAdvice({ side: 'left', events: [{ type: 'sunset', afterMs: 95 * 60000, side: 'left' }] }, layoutFor('A320'));
  assert.match(lines[0], /LEFT side \(A seats\)/);
  assert.match(lines[1], /shade sit on the right \(F seats\)/);
  assert.match(lines[2], /Sunset about 1 h 35 min after take-off, on the left \(A seats\)/);
  assert.match(seatAdvice({ side: 'none', events: [] }, null)[0], /dark/);
});

// --- Take-off / landing view side ---
import { runwayEnds, pickRunway, runwayViews, viewAdvice, turnDeg } from '../js/runway-view.js';

const SKG = { icao: 'LGTS', lat: 40.5193, lon: 22.97, rwy: [{ id: '10/28', hdg: 104 }, { id: '16/34', hdg: 166 }] };
const LGAV = { icao: 'LGAV', lat: 37.9364, lon: 23.9445, rwy: [{ id: '03L/21R', hdg: 37 }, { id: '03R/21L', hdg: 37 }] };

test('turnDeg: signed shortest turn', () => {
  assert.equal(turnDeg(350, 10), 20);
  assert.equal(turnDeg(10, 350), -20);
  assert.equal(turnDeg(0, 180), 180);
});

test('runway ends: both directions, flipped data, missing heading', () => {
  assert.deepEqual(runwayEnds([{ id: '10/28', hdg: 104 }]), [{ name: '10', hdg: 104 }, { name: '28', hdg: 284 }]);
  assert.deepEqual(runwayEnds([{ id: '28/10', hdg: 104 }]), [{ name: '28', hdg: 284 }, { name: '10', hdg: 104 }]);
  assert.deepEqual(runwayEnds([{ id: '05L/23R' }]), [{ name: '05L', hdg: 50 }, { name: '23R', hdg: 230 }]);
  assert.deepEqual(runwayEnds([{ id: 'H1' }]), []);
});

test('pick runway: headwind when windy, route alignment when calm or variable', () => {
  const ends = runwayEnds(SKG.rwy);
  assert.equal(pickRunway(ends, { dir: 280, speedKt: 12 }, 165).name, '28');
  assert.equal(pickRunway(ends, { dir: 280, speedKt: 12 }, 165).basis, 'wind');
  assert.equal(pickRunway(ends, { dir: 0, speedKt: 0, calm: true }, 165).name, '16');
  assert.equal(pickRunway(ends, { dir: 'VRB', speedKt: 8 }, 165).basis, 'route');
  assert.equal(pickRunway([], null, 0), null);
});

test('views SKG→ATH: calm = straight out; west wind = runway 28 then a left turn; north wind at ATH = left turn to 03', () => {
  assert.equal(runwayViews({ origin: SKG, dest: LGAV }).dep.turn, 'straight');
  const v = runwayViews({ origin: SKG, dest: LGAV, originWind: { dir: 280, speedKt: 12 }, destWind: { dir: 20, speedKt: 15 } });
  assert.equal(v.dep.runway.name, '28');
  assert.equal(v.dep.turn, 'left');
  assert.equal(v.arr.runway.name, '03L or 03R');
  assert.equal(v.arr.turn, 'left');
});

test('views: no runway data → nothing', () => {
  assert.deepEqual(runwayViews({ origin: { lat: 1, lon: 1 }, dest: { lat: 2, lon: 2 } }), { dep: null, arr: null });
});

test('view advice text', () => {
  const lines = viewAdvice({ dep: { runway: { name: '28', basis: 'wind' }, turn: 'left' },
    arr: { runway: { name: '03L', basis: 'route' }, turn: 'straight' } }, layoutFor('A20N'), { origin: 'SKG', dest: 'ATH' });
  assert.equal(lines[0], 'Take-off from runway 28 (likely, from the wind), then a left turn: the LEFT side (A seats) looks down on the area around SKG.');
  assert.match(lines[1], /^Landing on runway 03L \(a guess, light wind\), almost straight in/);
});
