// Seat tips: which side of the cabin gets the sun on a route, and type-specific layout tips. Pure, no network.
import { greatCircle } from './track.js';
import { bearingDeg, distanceNm } from './geo.js';
import { sunPosition } from './sun.js';
import { layoutFor } from './seat-layouts.js';

const H = 3600000;
const CRUISE_KT = 440;

// Sample the great circle in time. Each daylight sample weighs how much the sun shines in from the side:
// strongest when abeam and low, zero when straight ahead/behind or overhead.
// → { side: 'left'|'right'|'both'|'ahead'|'none', leftShare, daylightShare, events: [{ type, afterMs, side }] }
export function sunSide({ origin, dest, depMs, arrMs }) {
  const minutes = (arrMs - depMs) / 60000;
  const steps = Math.min(60, Math.max(12, Math.round(minutes / 10)));
  const pts = greatCircle([origin.lat, origin.lon], [dest.lat, dest.lon], steps);
  let left = 0;
  let right = 0;
  let day = 0;
  let prevUp = null;
  const events = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const f = (i + 0.5) / (pts.length - 1);
    const at = depMs + f * (arrMs - depMs);
    const [lat, lon] = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    const heading = bearingDeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    const sun = sunPosition(lat, lon, at);
    const rel = (sun.az - heading + 360) % 360; // 0 = ahead, 90 = right, 270 = left
    const side = rel < 180 ? 'right' : 'left';
    const up = sun.elev > 0;
    if (prevUp !== null && up !== prevUp) events.push({ type: up ? 'sunrise' : 'sunset', afterMs: at - depMs, side });
    prevUp = up;
    if (!up) continue;
    day++;
    const w = Math.abs(Math.sin((rel * Math.PI) / 180)) * Math.cos((sun.elev * Math.PI) / 180);
    if (side === 'left') left += w; else right += w;
  }
  const n = pts.length - 1;
  const total = left + right;
  const leftShare = total ? left / total : null;
  let side = 'none';
  if (day) {
    if (total / day < 0.25) side = 'ahead'; // mostly high or in front/behind
    else if (leftShare >= 0.65) side = 'left';
    else if (leftShare <= 0.35) side = 'right';
    else side = 'both';
  }
  return { side, leftShare, daylightShare: day / n, events };
}

// Departure/arrival in ms: from flight times when known, else estimated from distance and the live position.
export function flightWindow({ origin, dest, times = {}, live, now = Date.now() }) {
  const total = distanceNm(origin.lat, origin.lon, dest.lat, dest.lon);
  const durMs = (total / CRUISE_KT) * H + 0.25 * H; // + taxi/climb allowance
  let dep = times.depActual ?? times.depEst ?? times.depSched ?? null;
  let arr = times.arrActual ?? times.arrEst ?? times.arrSched ?? null;
  const estimated = dep === null || arr === null;
  if (dep === null && arr !== null) dep = arr - durMs;
  if (dep === null) {
    const flown = live && !live.onGround && live.lat != null ? distanceNm(origin.lat, origin.lon, live.lat, live.lon) : 0;
    dep = now - (flown / CRUISE_KT) * H;
  }
  if (arr === null || arr <= dep) arr = dep + durMs;
  return { depMs: dep, arrMs: arr, estimated };
}

const SIDE = { left: 'LEFT', right: 'RIGHT' };
const other = (s) => (s === 'left' ? 'right' : 'left');

function afterText(ms) {
  const m = Math.max(0, Math.round(ms / 60000 / 5) * 5);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

// Plain-text tips for the panel. `layout` from layoutFor() or null.
export function seatAdvice(sun, layout) {
  const seat = (s) => (layout ? ` (${s === 'left' ? layout.left : layout.right} seats)` : '');
  const lines = [];
  if (sun.side === 'left' || sun.side === 'right') {
    lines.push(`Sun mostly on the ${SIDE[sun.side]} side${seat(sun.side)}.`);
    lines.push(`For shade sit on the ${other(sun.side)}${seat(other(sun.side))}; for sunlight and sunset colours sit on the ${sun.side}.`);
  } else if (sun.side === 'both') {
    lines.push('The sun switches sides or is equal on both: little difference between left and right.');
  } else if (sun.side === 'ahead') {
    lines.push('The sun is mostly high, ahead or behind: little difference between left and right.');
  } else {
    lines.push('Flight in the dark: no sun on either side.');
  }
  for (const e of sun.events) {
    lines.push(`${e.type === 'sunrise' ? 'Sunrise' : 'Sunset'} about ${afterText(e.afterMs)} after take-off, on the ${e.side}${seat(e.side)}.`);
  }
  return lines;
}

export { layoutFor };
