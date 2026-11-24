#!/usr/bin/env node
// Build data/shapes.json (country and US-state outlines for the airport panel header) and copy the
// country flags to icons/flags/. Run by hand when the source data changes; the app itself has no build step.
//
// Sources: Natural Earth 1:50m via world-atlas and us-atlas (public domain), flag-icons (MIT).
// Usage (from the repo root; node_modules/ is git-ignored):
//   npm i --no-save --no-package-lock world-atlas@2.0.2 us-atlas@3.0.1 topojson-client@3.1.0 \
//     d3-geo@3.1.1 i18n-iso-countries@7.14.0 flag-icons@7.6.0
//   node scripts/build_shapes.mjs
//
// Output: each shape is an SVG path in a 100×100 box plus the projection that drew it, so the app can
// place the airport dot: x = tx + s·c·λ, y = ty − s·φ, with λ = longitude − lon0 (wrapped, radians), φ = latitude
// (radians), c = cos(lat0). US airports get the lower-48 outline with their state filled in ("nation" + state);
// Alaska, Hawaii and the territories are drawn on their own.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import countries from 'i18n-iso-countries';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOX = 100;
const PAD = 3;
const TOL = 0.35; // px: simplification tolerance in the 100 px box
const MIN_AREA = 0.2; // px²: smaller islands are dropped

const worldS = require('world-atlas/countries-50m.json');
const usaS = require('us-atlas/states-10m.json');

// Douglas–Peucker on one ring of projected points.
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (pts) => Math.abs(pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0)) / 2;

// SVG path of a feature: rings collected from d3, simplified, tiny ones dropped, relative 1-decimal coords.
function pathOf(proj, feature) {
  const rings = [];
  let ring = null;
  d3.geoPath(proj, {
    moveTo(x, y) { ring = [[x, y]]; rings.push(ring); },
    lineTo(x, y) { ring.push([x, y]); },
    closePath() {}, arc() {}, beginPath() {},
  })(feature);
  const f = (v) => String(Math.round(v * 10) / 10);
  return rings.map((r) => rdp(r, TOL)).filter((r) => r.length >= 3 && area(r) >= MIN_AREA).map((r) => {
    let [px, py] = [Math.round(r[0][0] * 10) / 10, Math.round(r[0][1] * 10) / 10];
    let d = `M${f(px)} ${f(py)}l`;
    for (const [x, y] of r.slice(1)) {
      const [qx, qy] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      if (qx === px && qy === py) continue;
      d += `${f(qx - px)} ${f(qy - py)} `.replace(/ -/g, '-');
      [px, py] = [qx, qy];
    }
    return d.trim().replace(/ -/g, '-').replace(/l$/, '') + 'z';
  }).join('');
}

// Plate carrée centred on the shape, x shrunk by cos(lat0): simple to redo in the browser for the dot.
function draw(feature, extra = []) {
  const [lon0, lat0] = d3.geoCentroid(feature);
  const c = Math.cos((lat0 * Math.PI) / 180);
  const raw = (l, p) => [l * c, p];
  const proj = d3.geoProjection(raw).rotate([-lon0, 0]).fitExtent([[PAD, PAD], [BOX - PAD, BOX - PAD]], feature);
  const [tx, ty] = proj.translate();
  const r = (v, n = 3) => +v.toFixed(n);
  return {
    p: { lon0: r(lon0), c: r(c, 4), s: r(proj.scale(), 2), tx: r(tx, 2), ty: r(ty, 2) },
    d: pathOf(proj, feature),
    ...Object.fromEntries(extra.map(([k, f]) => [k, pathOf(proj, f)])),
  };
}

// Countries, keyed by ISO 3166-1 alpha-2 (as in data/airports.json "country").
const out = { source: 'Natural Earth 1:50m (public domain) via world-atlas / us-atlas', countries: {}, us: {} };
const NAMES = { Kosovo: 'XK', 'N. Cyprus': null, Somaliland: null };
for (const f of topojson.feature(worldS, worldS.objects.countries).features) {
  const name = f.properties.name;
  const cc = name in NAMES ? NAMES[name] : countries.numericToAlpha2(f.id);
  if (!cc || !f.geometry) continue;
  out.countries[cc] = draw(f);
}

// US states: lower 48 (+ DC) inside the national outline; the rest on their own.
const FIPS_TO_USPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};
const geoms = usaS.objects.states.geometries;
const lower = geoms.filter((g) => FIPS_TO_USPS[g.id] && !['AK', 'HI'].includes(FIPS_TO_USPS[g.id]));
const nation = topojson.merge(usaS, lower);
const lowerSet = new Set(lower.map((g) => g.id));
const states = topojson.feature(usaS, usaS.objects.states).features;
const base = draw(nation, states.filter((f) => lowerSet.has(f.id)).map((f) => [FIPS_TO_USPS[f.id], f]));
out.us = { p: base.p, d: base.d, states: {} };
for (const f of states) {
  const st = FIPS_TO_USPS[f.id];
  if (!st) continue;
  out.us.states[st] = lowerSet.has(f.id) ? base[st] : draw(f);
}

const file = path.join(ROOT, 'data', 'shapes.json');
fs.writeFileSync(file, JSON.stringify(out));
console.error(`Wrote ${file} (${Object.keys(out.countries).length} countries, ${Object.keys(out.us.states).length} states, ${(fs.statSync(file).size / 1e3).toFixed(0)} kB)`);

// Flags (4:3), lower-case ISO alpha-2 file names.
const src = path.join(path.dirname(require.resolve('flag-icons/package.json')), 'flags', '4x3');
const dst = path.join(ROOT, 'icons', 'flags');
fs.mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(src)) {
  if (!/^[a-z]{2}\.svg$/.test(f)) continue;
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
  n++;
}
fs.copyFileSync(path.join(path.dirname(src), '..', 'LICENSE'), path.join(dst, 'LICENSE'));
console.error(`Copied ${n} flags to ${dst}`);
