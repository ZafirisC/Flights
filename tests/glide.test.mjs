// Dead reckoning used to move aircraft smoothly between polls (js/glide.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predict } from '../js/glide.js';
import { distanceNm, bearingDeg } from '../js/geo.js';

test('moves along the track at ground speed', () => {
  const ac = { lat: 40, lon: 22, gs: 360, track: 45 };
  const [lat, lon] = predict(ac, 60); // 360 kt for 1 min = 6 nm
  assert.ok(Math.abs(distanceNm(40, 22, lat, lon) - 6) < 0.05);
  assert.ok(Math.abs(bearingDeg(40, 22, lat, lon) - 45) < 0.5);
});

test('does not extrapolate past 60 s', () => {
  const ac = { lat: 40, lon: 22, gs: 360, track: 90 };
  assert.deepEqual(predict(ac, 600), predict(ac, 60));
});

test('no movement without speed, track or age', () => {
  assert.equal(predict({ lat: 40, lon: 22, gs: 0, track: 90 }, 10), null);
  assert.equal(predict({ lat: 40, lon: 22, gs: 300, track: null }, 10), null);
  assert.equal(predict({ lat: 40, lon: 22, gs: 300, track: 90 }, 0), null);
});
