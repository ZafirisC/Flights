// Aircraft family lookup and sun shadow geometry (js/aircraft-types.js, js/aircraft-icon.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyOf } from '../js/aircraft-types.js';
import { aircraftIcon, shadowOffset, awayFromSun, parseColor } from '../js/aircraft-icon.js';

test('type codes map to families', () => {
  const cases = { A20N: 'N', B738: 'N', BCS3: 'N', E195: 'N', B77W: 'W', A359: 'W', B789: 'W', A310: 'W', B744: 'Q', A388: 'Q',
    A346: 'Q', AT76: 'T', DH8D: 'T', BE20: 'T', CRJ9: 'R', E145: 'R', GLF6: 'R', C68A: 'R', C25A: 'R', C172: 'L', P28A: 'L',
    SR22: 'L', EC35: 'H', R44: 'H', A139: 'H', B06: 'H' };
  for (const [type, fam] of Object.entries(cases)) assert.equal(familyOf(type), fam, type);
});

test('category is the fallback, then the generic icon', () => {
  assert.equal(familyOf(null, 'A7'), 'H');
  assert.equal(familyOf('', 'A5'), 'W');
  assert.equal(familyOf('ZZZZ', 'A1'), 'L');
  assert.equal(familyOf(null, null), 'U');
});

test('shadow points away from the sun', () => {
  const [x, y] = awayFromSun(180); // sun in the south → shadow toward the north (up on screen)
  assert.ok(Math.abs(x) < 1e-9 && y < -0.99);
  const [x2] = awayFromSun(90); // sun in the east → shadow to the west
  assert.ok(x2 < -0.99);
});

test('shadow length: longer for low sun and high aircraft, capped, none at night', () => {
  assert.equal(shadowOffset({ alt: 30000, el: -5 }), null);
  assert.equal(shadowOffset({ alt: 0, onGround: true, el: 40 }), 1);
  assert.ok(shadowOffset({ alt: 30000, el: 20 }) > shadowOffset({ alt: 30000, el: 60 }));
  assert.ok(shadowOffset({ alt: 35000, el: 40 }) > shadowOffset({ alt: 3000, el: 40 }));
  assert.equal(shadowOffset({ alt: 40000, el: 2 }), 12);
});

test('icon has the family size, a shadow by day and none at night', () => {
  const base = { type: 'B744', color: 'hsl(200, 85%, 48%)', track: 90, alt: 35000, onGround: false };
  const day = aircraftIcon({ ...base, sun: { az: 180, el: 30 } });
  assert.equal(day.size, 34);
  assert.equal(day.family, 'Q');
  assert.match(day.html, /ac-shadow/);
  assert.match(day.html, /rotate\(90\)/);
  const night = aircraftIcon({ ...base, sun: { az: 0, el: -20 } });
  assert.doesNotMatch(night.html, /ac-shadow/);
  assert.match(night.html, /#3dff7a/); // navigation lights
});

test('parses the altitude and emergency colours', () => {
  assert.deepEqual(parseColor('#ff0000'), [1, 0, 0]);
  const [r, g, b] = parseColor('hsl(120, 100%, 50%)');
  assert.ok(r < 0.01 && g > 0.99 && b < 0.01);
});
