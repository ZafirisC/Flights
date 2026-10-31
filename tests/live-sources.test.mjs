// Live-source fallback chain and OpenSky parsing in js/api.js (fetch is mocked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAircraft, fetchFlightByCallsign, normaliseOpenSky, openSkyBox, OPENSKY_ENABLED } from '../js/api.js';

const adsb = { ac: [{ hex: 'ABC123', flight: 'AEE123 ', lat: 40.5, lon: 22.9, alt_baro: 35000, gs: 450 }] };
const sky = { time: 1000, states: [['4690de', 'OAL98   ', 'Greece', 995, 998, 22.9, 40.5, 1000, false, 100, 90, 5, null, 1010, '7700']] };

function mockFetch(answers) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const [, ans] = Object.entries(answers).find(([k]) => url.includes(k)) || [, 500];
    if (typeof ans === 'number') return { ok: false, status: ans };
    return { ok: true, status: 200, json: async () => ans };
  };
  return calls;
}

test('OpenSky state vectors are converted to feet, knots and ft/min', () => {
  const [a] = normaliseOpenSky(sky);
  assert.equal(a.hex, '4690de');
  assert.equal(a.callsign, 'OAL98');
  assert.equal(a.alt, 3281);
  assert.equal(a.gs, 194);
  assert.equal(a.vrate, 984);
  assert.equal(a.seen, 2);
  assert.equal(a.squawk, '7700');
  assert.equal(a.onGround, false);
});

test('OpenSky box covers the circle and stays inside the world', () => {
  assert.equal(openSkyBox(40, 22, 60), 'lamin=39.0&lomin=20.7&lamax=41.0&lomax=23.3');
  assert.match(openSkyBox(89, 179, 250), /lamax=90\.0.*/);
  assert.match(openSkyBox(89, 179, 250), /lomax=180\.0/);
});

test('falls through blocked sources to the next one, then skips them while backed off', async () => {
  const calls = mockFetch({ '/adsbfi/': 403, '/adsblol/': 429, '/airplaneslive/': adsb });
  const list = await fetchAircraft(40.5, 22.9, 50);
  assert.equal(list[0].hex, 'abc123');
  assert.equal(calls.length, 3);
  calls.length = 0;
  await fetchAircraft(40.5, 22.9, 50);
  assert.equal(calls.length, 1); // adsb.fi and adsb.lol are in backoff
  assert.match(calls[0], /airplaneslive/);
});

test('OpenSky is used for positions but never for callsign search', async () => {
  assert.equal(OPENSKY_ENABLED, true);
  const calls = mockFetch({ '/airplaneslive/': 502, '/opensky/': sky });
  await assert.rejects(fetchFlightByCallsign('OAL98'), /all sources failed/);
  assert.ok(!calls.some((u) => u.includes('/opensky/')));
  const list = await fetchAircraft(40.5, 22.9, 50);
  assert.equal(list[0].callsign, 'OAL98');
});
