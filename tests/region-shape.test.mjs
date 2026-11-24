import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { project, regionShape, shapeSvg, flagImg } from '../js/region-shape.js';

const shapes = JSON.parse(readFileSync(new URL('../data/shapes.json', import.meta.url)));
const inBox = (s) => s.x > 0 && s.x < 100 && s.y > 0 && s.y < 100;

test('country outline with the airport dot inside the box', () => {
  const s = regionShape(shapes, { country: 'GR', lat: 37.9364, lon: 23.9445 });
  assert.ok(s.d.startsWith('M') && !s.hl && inBox(s));
});

test('US airport: lower-48 outline with its state highlighted', () => {
  const s = regionShape(shapes, { country: 'US', region: 'CO', lat: 39.86, lon: -104.6738 });
  assert.equal(s.d, shapes.us.d);
  assert.ok(s.hl && inBox(s));
});

test('Alaska and Hawaii are drawn on their own', () => {
  const s = regionShape(shapes, { country: 'US', region: 'AK', lat: 61.17, lon: -149.99 });
  assert.ok(!s.hl && s.d !== shapes.us.d && inBox(s));
});

test('Russia across the antimeridian keeps the dot in the box', () => {
  assert.ok(inBox(regionShape(shapes, { country: 'RU', lat: 64.73, lon: 177.74 }))); // Anadyr
  assert.ok(inBox(regionShape(shapes, { country: 'RU', lat: 55.97, lon: 37.41 }))); // Moscow
});

test('unknown country or missing coordinates give nothing; misplaced point gives no dot', () => {
  assert.equal(regionShape(shapes, { country: 'ZZ', lat: 1, lon: 1 }), null);
  assert.equal(regionShape(shapes, { country: 'GR' }), null);
  const s = regionShape(shapes, { country: 'GR', lat: -30, lon: 150 });
  assert.ok(s.d && s.x === undefined);
  assert.ok(!shapeSvg(s).includes('circle'));
});

test('project and markup', () => {
  const [x, y] = project({ lon0: 0, c: 1, s: 1, tx: 0, ty: 0 }, 0, 360);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9);
  assert.match(shapeSvg({ d: 'M0 0z', hl: 'M1 1z', x: 5, y: 6 }), /class="hl"/);
  assert.match(flagImg('GR'), /icons\/flags\/gr\.svg/);
  assert.equal(flagImg('<x>'), '');
});
