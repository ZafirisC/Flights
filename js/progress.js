// Flight progress: the calculation behind the progress bar. Pure functions, no DOM, no network.
import { distanceNm } from './geo.js';

const HOUR_MS = 3600000;
const NEAR_AIRPORT_NM = 6; // on the ground this close to an airport = at that airport
const MIN_GS_KT = 60; // slower than this: no ETA from speed
const AIRBORNE_CAP = 99; // 100% is for landed flights only
const STATUS_AIR = ['Departed', 'EnRoute', 'Approaching'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const hasPos = (p) => p && finite(p.lat) && finite(p.lon);
const nm = (a, b) => distanceNm(a.lat, a.lon, b.lat, b.lon);

// Length (nm) of a track [[lat, lon], ...].
export function trackLengthNm(points) {
  let sum = 0;
  for (let i = 1; i < (points?.length || 0); i++) sum += distanceNm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  return sum;
}

// flightTimes() output (js/flight-times.js) → epoch ms, null when unknown. Actual times only exist once it happened.
export function legTimes(ft) {
  const ms = (t) => {
    const v = t?.utc ? Date.parse(t.utc.replace(' ', 'T')) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  const split = (e) => ({
    actual: e?.kind === 'Actual' ? ms(e.time) : null,
    est: e?.kind === 'Estimated' ? ms(e.time) : null,
    sched: ms(e?.scheduled),
  });
  const d = split(ft?.dep);
  const a = split(ft?.arr);
  return { depActual: d.actual, depEst: d.est, depSched: d.sched, arrActual: a.actual, arrEst: a.est, arrSched: a.sched };
}

function stateOf({ status, live, origin, dest, times, now }) {
  if (/^cancel/i.test(status || '')) return 'cancelled';
  if (status === 'Diverted') return 'diverted';
  if (hasPos(live) && !live.onGround) return 'airborne'; // the live position beats a status that may be 15 min old
  if (status === 'Arrived') return 'landed';
  if (hasPos(live) && live.onGround) {
    const departed = STATUS_AIR.includes(status) || (times.depActual !== null && times.depActual <= now);
    if (hasPos(origin) && nm(live, origin) <= NEAR_AIRPORT_NM) return departed ? 'taxi' : 'scheduled';
    if (hasPos(dest) && nm(live, dest) <= NEAR_AIRPORT_NM) return 'landed';
  }
  if (STATUS_AIR.includes(status)) return 'airborne';
  if (times.arrActual !== null && times.arrActual <= now) return 'landed';
  if (times.depActual !== null && times.depActual <= now) return 'airborne';
  return 'scheduled';
}

// Percentage while airborne: { pct, method } or null. Order: distance (track since take-off), time, direct.
function airbornePct({ origin, dest, live, track, times, now }) {
  const known = hasPos(live) && hasPos(dest);
  const remaining = known ? nm(live, dest) : null;

  // Distance: flown (track since take-off) / (flown + remaining). Needs the track to start at the origin.
  if (known && hasPos(origin) && track?.length >= 2 && distanceNm(track[0][0], track[0][1], origin.lat, origin.lon) <= NEAR_AIRPORT_NM) {
    const flown = trackLengthNm(track);
    if (flown + remaining > 0) return { pct: (flown / (flown + remaining)) * 100, method: 'distance' };
  }
  // Time: (now − actual departure) / (estimated arrival − actual departure).
  const arr = times.arrEst ?? times.arrSched;
  if (times.depActual !== null && arr !== null && arr > times.depActual) {
    return { pct: ((now - times.depActual) / (arr - times.depActual)) * 100, method: 'time' };
  }
  // Last resort: straight line from the origin to here, so the bar still moves when there are no times and no track.
  if (known && hasPos(origin)) {
    const flown = nm(origin, live);
    if (flown + remaining > 0) return { pct: (flown / (flown + remaining)) * 100, method: 'direct' };
  }
  return null;
}

// Everything the bar shows. `origin` / `dest`: { lat, lon } or null. `status`: AeroDataBox status or null.
// `live`: { lat, lon, onGround, gs } or null. `track`: [[lat, lon], ...] since take-off, ending at the live position.
// `times`: legTimes(). `prevMax`: highest % reached so far, so position noise never moves the plane backwards.
// → { state, pct (0–100, null if unknown), method, flownMs, remainingMs, etaMs, depMs }
export function computeFlightProgress({ origin, dest, status, live, track, times, now, prevMax = 0 }) {
  const t = { depActual: null, depEst: null, depSched: null, arrActual: null, arrEst: null, arrSched: null, ...times };
  const state = stateOf({ status, live, origin, dest, times: t, now });
  const out = { state, pct: 0, method: null, flownMs: null, remainingMs: null, etaMs: null, depMs: t.depActual ?? t.depEst ?? t.depSched };

  if (state === 'cancelled') return { ...out, pct: null };
  if (state === 'diverted') return { ...out, pct: prevMax }; // the new airport is not in the data: freeze
  if (state === 'landed') {
    const flown = t.depActual !== null && t.arrActual !== null ? t.arrActual - t.depActual : null;
    return { ...out, pct: 100, flownMs: flown, remainingMs: 0, etaMs: t.arrActual };
  }
  if (state !== 'airborne') return { ...out, etaMs: t.arrEst ?? t.arrSched }; // scheduled / taxi: 0%

  const found = airbornePct({ origin, dest, live, track, times: t, now });
  const remNm = hasPos(live) && hasPos(dest) ? nm(live, dest) : null;
  const bySpeed = remNm !== null && finite(live.gs) && live.gs >= MIN_GS_KT ? now + (remNm / live.gs) * HOUR_MS : null;
  const etaMs = t.arrEst ?? bySpeed ?? t.arrSched;
  return {
    ...out,
    pct: found ? Math.max(prevMax, clamp(found.pct, 0, AIRBORNE_CAP)) : prevMax || null,
    method: found?.method ?? null,
    flownMs: t.depActual !== null ? Math.max(0, now - t.depActual) : null,
    remainingMs: etaMs !== null ? Math.max(0, etaMs - now) : null,
    etaMs,
  };
}
