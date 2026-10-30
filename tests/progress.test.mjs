// Run: node --test tests/   (Node 22+, no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFlightProgress, trackLengthNm, legTimes } from '../js/progress.js';
import { greatCircle } from '../js/track.js';
import { formatDuration, formatClock } from '../js/progress-bar.js';

const ATH = { lat: 37.9364, lon: 23.9445 };
const LHR = { lat: 51.47, lon: -0.4543 };
const NOW = Date.parse('2026-10-30T12:00:00Z');
const H = 3600000;

// A track from Athens to the fraction f of the great circle to London, and the live position at its end.
function flightAt(f, extra = {}) {
  const full = greatCircle([ATH.lat, ATH.lon], [LHR.lat, LHR.lon], 100);
  const track = full.slice(0, Math.max(2, Math.round(f * 100) + 1));
  const [lat, lon] = track.at(-1);
  return { track, live: { lat, lon, onGround: false, gs: 450, ...extra } };
}
const base = { origin: ATH, dest: LHR, now: NOW, times: {} };

test('before take-off: 0%, scheduled', () => {
  const r = computeFlightProgress({ ...base, status: 'Expected', live: { ...ATH, onGround: true }, track: [[ATH.lat, ATH.lon]],
    times: { depSched: NOW + H } });
  assert.equal(r.state, 'scheduled');
  assert.equal(r.pct, 0);
  assert.equal(r.depMs, NOW + H);
});

test('no live position and no departure yet: 0%', () => {
  const r = computeFlightProgress({ ...base, status: 'Expected', live: null, track: null });
  assert.deepEqual([r.state, r.pct], ['scheduled', 0]);
});

test('on the ground at the origin after pushback: taxi, 0%', () => {
  const r = computeFlightProgress({ ...base, status: 'Departed', live: { ...ATH, onGround: true }, track: null });
  assert.deepEqual([r.state, r.pct], ['taxi', 0]);
});

test('mid-flight: distance method, about half', () => {
  const { track, live } = flightAt(0.5);
  const r = computeFlightProgress({ ...base, status: 'EnRoute', live, track });
  assert.equal(r.state, 'airborne');
  assert.equal(r.method, 'distance');
  assert.ok(Math.abs(r.pct - 50) < 2, `pct ${r.pct}`);
});

test('near the destination: high but below 100 while airborne', () => {
  const { track, live } = flightAt(0.99);
  const r = computeFlightProgress({ ...base, status: 'Approaching', live, track });
  assert.ok(r.pct > 95 && r.pct <= 99, `pct ${r.pct}`);
  assert.equal(r.state, 'airborne');
});

test('landed: by status, and by an on-ground position at the destination', () => {
  assert.equal(computeFlightProgress({ ...base, status: 'Arrived', live: null, track: null }).pct, 100);
  const r = computeFlightProgress({ ...base, status: null, live: { ...LHR, onGround: true }, track: null });
  assert.deepEqual([r.state, r.pct, r.remainingMs], ['landed', 100, 0]);
});

test('landed with actual times: flown duration and arrival time', () => {
  const times = { depActual: NOW - 4 * H, arrActual: NOW - H };
  const r = computeFlightProgress({ ...base, status: 'Arrived', live: null, track: null, times });
  assert.equal(r.flownMs, 3 * H);
  assert.equal(r.etaMs, NOW - H);
});

test('missing track: falls back to time', () => {
  const { live } = flightAt(0.3);
  const times = { depActual: NOW - 2 * H, arrEst: NOW + 2 * H };
  const r = computeFlightProgress({ ...base, status: 'EnRoute', live, track: [[live.lat, live.lon]], times });
  assert.equal(r.method, 'time');
  assert.equal(r.pct, 50);
  assert.equal(r.flownMs, 2 * H);
  assert.equal(r.remainingMs, 2 * H);
});

test('track that does not start at the origin (no history) is not trusted: time method', () => {
  const { live } = flightAt(0.6);
  const midTrack = [[live.lat, live.lon], [live.lat + 0.01, live.lon]];
  const times = { depActual: NOW - H, arrSched: NOW + 3 * H };
  assert.equal(computeFlightProgress({ ...base, status: 'EnRoute', live, track: midTrack, times }).method, 'time');
});

test('no track and no times: straight-line estimate', () => {
  const { live } = flightAt(0.5);
  const r = computeFlightProgress({ ...base, status: null, live, track: null });
  assert.equal(r.method, 'direct');
  assert.ok(Math.abs(r.pct - 50) < 2);
  assert.ok(r.etaMs > NOW, 'ETA from ground speed');
});

test('nothing to go on: unknown percentage, not a crash', () => {
  const r = computeFlightProgress({ origin: null, dest: null, status: 'EnRoute', live: null, track: null, times: {}, now: NOW });
  assert.equal(r.state, 'airborne');
  assert.equal(r.pct, null);
});

test('diverted: frozen at the highest value, no new percentage', () => {
  const { track, live } = flightAt(0.7);
  const r = computeFlightProgress({ ...base, status: 'Diverted', live, track, prevMax: 61 });
  assert.deepEqual([r.state, r.pct], ['diverted', 61]);
});

test('cancelled: no percentage', () => {
  const r = computeFlightProgress({ ...base, status: 'Canceled', live: null, track: null });
  assert.deepEqual([r.state, r.pct], ['cancelled', null]);
});

test('position noise never moves the plane backwards', () => {
  const { track, live } = flightAt(0.5);
  const noisy = { ...live, lat: live.lat - 0.4 }; // jumps back ~24 nm
  const first = computeFlightProgress({ ...base, status: 'EnRoute', live, track });
  const second = computeFlightProgress({ ...base, status: 'EnRoute', live: noisy, track: [...track.slice(0, -1), [noisy.lat, noisy.lon]], prevMax: first.pct });
  assert.equal(second.pct, first.pct);
});

test('a live position in the air beats a stale "Expected" status', () => {
  const { track, live } = flightAt(0.4);
  assert.equal(computeFlightProgress({ ...base, status: 'Expected', live, track }).state, 'airborne');
});

test('helpers', () => {
  assert.ok(Math.abs(trackLengthNm([[0, 0], [0, 1]]) - 60.04) < 0.1);
  assert.equal(trackLengthNm(null), 0);
  const t = legTimes({ dep: { kind: 'Actual', time: { utc: '2026-10-30 10:05Z' }, scheduled: { utc: '2026-10-30 10:00Z' } },
    arr: { kind: 'Estimated', time: { utc: '2026-10-30 14:00Z' }, scheduled: { utc: '2026-10-30 13:50Z' } } });
  assert.equal(t.depActual, Date.parse('2026-10-30T10:05:00Z'));
  assert.equal(t.arrEst, Date.parse('2026-10-30T14:00:00Z'));
  assert.equal(t.depEst, null);
  assert.equal(formatDuration(130 * 60000), '2h 10m');
  assert.equal(formatDuration(65 * 60000), '1h 05m');
  assert.equal(formatDuration(40 * 60000), '40m');
  assert.equal(formatClock(Date.parse('2026-10-30T12:35:00Z'), 'Europe/Athens'), '14:35 local');
  assert.equal(formatClock(Date.parse('2026-10-30T12:35:00Z'), null), '12:35 UTC');
  assert.equal(formatClock(Date.parse('2026-10-30T23:05:00Z'), 'Europe/London'), '23:05 local');
});
