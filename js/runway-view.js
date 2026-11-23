// View side for take-off and landing: likely runway (from the wind, else the route) and which way the plane turns.
// In a turn the windows on the inside of the turn look down at the ground. Pure, no network.
import { bearingDeg } from './geo.js';

const MIN_WIND_KT = 5; // below this, airports choose runways for other reasons: fall back to the route
const STRAIGHT_DEG = 30; // smaller turns: no clear side

// Signed turn from heading a to heading b, in (-180, 180]: + = right, − = left.
export const turnDeg = (a, b) => { const d = ((b - a + 540) % 360) - 180; return d === -180 ? 180 : d; };

// '10/28' (hdg 104) → [{ name: '10', hdg: 104 }, { name: '28', hdg: 284 }]. Heading from the number if missing.
export function runwayEnds(rwy) {
  const out = [];
  for (const r of rwy || []) {
    const names = String(r.id || '').split('/').map((s) => s.trim()).filter((n) => /^\d/.test(n));
    if (!names.length) continue;
    const num = Number.parseInt(names[0], 10) * 10;
    let base = r.hdg ?? num; // true heading of the first end; the number (magnetic) when missing
    if (Math.abs(turnDeg(base, num)) > 90) base += 180; // data gives the other end's heading
    names.forEach((name, i) => out.push({ name, hdg: Math.round(base + i * 180) % 360 }));
  }
  return out;
}

// Most likely runway end: the most headwind when there is wind, else the one best aligned with `course`.
// → { name, hdg, basis: 'wind' | 'route' } or null.
export function pickRunway(ends, wind, course) {
  if (!ends.length) return null;
  const windy = wind && typeof wind.dir === 'number' && wind.speedKt >= MIN_WIND_KT;
  const score = windy
    ? (e) => Math.cos(((wind.dir - e.hdg) * Math.PI) / 180)
    : (e) => -Math.abs(turnDeg(e.hdg, course));
  const best = ends.reduce((a, b) => (score(b) > score(a) ? b : a));
  const parallel = ends.filter((e) => Math.abs(turnDeg(e.hdg, best.hdg)) <= 5).map((e) => e.name); // e.g. 03L and 03R
  return { name: [...new Set(parallel)].join(' or '), hdg: best.hdg, basis: windy ? 'wind' : 'route' };
}

// → { runway, turn: 'left' | 'right' | 'straight' } for the departure end and the arrival end (either may be null).
// Departure: from the runway heading to the course towards the destination.
// Arrival: from the course arriving at the destination to the landing runway heading.
export function runwayViews({ origin, dest, originWind, destWind }) {
  const out = { dep: null, arr: null };
  const side = (d) => (Math.abs(d) < STRAIGHT_DEG ? 'straight' : d > 0 ? 'right' : 'left');
  if (origin?.rwy?.length && dest) {
    const course = bearingDeg(origin.lat, origin.lon, dest.lat, dest.lon);
    const runway = pickRunway(runwayEnds(origin.rwy), originWind, course);
    if (runway) out.dep = { runway, turn: side(turnDeg(runway.hdg, course)) };
  }
  if (dest?.rwy?.length && origin) {
    const inbound = (bearingDeg(dest.lat, dest.lon, origin.lat, origin.lon) + 180) % 360;
    const runway = pickRunway(runwayEnds(dest.rwy), destWind, inbound);
    if (runway) out.arr = { runway, turn: side(turnDeg(inbound, runway.hdg)) };
  }
  return out;
}

// Plain-text lines for the panel. `layout` from layoutFor() or null; `names` = { origin, dest } for the text.
export function viewAdvice(views, layout, names = {}) {
  const seat = (s) => (layout ? ` (${s === 'left' ? layout.left : layout.right} seats)` : '');
  const why = (r) => (r.basis === 'wind' ? 'likely, from the wind' : 'a guess, light wind');
  const lines = [];
  const { dep, arr } = views;
  if (dep) {
    const where = names.origin ? ` the area around ${names.origin}` : '';
    lines.push(dep.turn === 'straight'
      ? `Take-off from runway ${dep.runway.name} (${why(dep.runway)}), then almost straight ahead: no clear view side.`
      : `Take-off from runway ${dep.runway.name} (${why(dep.runway)}), then a ${dep.turn} turn: the ${dep.turn.toUpperCase()} side${seat(dep.turn)} looks down on${where || ' the area around the airport'}.`);
  }
  if (arr) {
    const where = names.dest ? ` the area around ${names.dest}` : '';
    lines.push(arr.turn === 'straight'
      ? `Landing on runway ${arr.runway.name} (${why(arr.runway)}), almost straight in: no clear view side.`
      : `Landing on runway ${arr.runway.name} (${why(arr.runway)}), after a ${arr.turn} turn: the ${arr.turn.toUpperCase()} side${seat(arr.turn)} looks down on${where || ' the area around the airport'}.`);
  }
  return lines;
}
