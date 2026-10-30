// Flight progress bar (departure — bar with plane — destination) for the aircraft panel.
// The element is built once and then only updated in place, so the CSS transition animates the plane between refreshes.
import { fetchAirports } from './api.js';
import { computeFlightProgress, legTimes } from './progress.js';
import { PLANE_PATH } from './plane-icon.js';

const PLANE_PX = 22; // keeps the plane inside the bar at 0% and 100%

// 7500000 → "2h 05m", 2400000 → "40m".
export function formatDuration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  return h ? `${h}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`;
}

// 24-hour clock in an airport's time zone ("14:35 local"); UTC when the zone is unknown.
export function formatClock(ms, tz) {
  const fmt = (timeZone) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(ms);
  try {
    if (tz) return `${fmt(tz)} local`;
  } catch { /* unknown zone name: fall through to UTC */ }
  return `${fmt('UTC')} UTC`;
}

// One end of the route. The AeroDataBox leg wins when its ICAO is in our airport list, else the adsbdb route.
function endOf(legEnd, routeEnd, index) {
  const a = legEnd?.icao ? index?.get(legEnd.icao) : null;
  if (a) return { iata: a.iata || legEnd.iata || a.icao, lat: a.lat, lon: a.lon, tz: a.tz || null };
  if (routeEnd) {
    const b = routeEnd.icao ? index?.get(routeEnd.icao) : null;
    return { iata: routeEnd.iata || routeEnd.icao || '–', lat: routeEnd.lat, lon: routeEnd.lon, tz: b?.tz || null };
  }
  const code = legEnd?.iata || legEnd?.icao;
  return code ? { iata: code, lat: null, lon: null, tz: null } : null;
}

// Texts for each state: { main, sub }.
function describe(r, origin, dest) {
  const pct = r.pct === null ? null : `${Math.round(r.pct)}%`;
  switch (r.state) {
    case 'cancelled': return { main: 'Cancelled', sub: '' };
    case 'diverted': return { main: 'Diverted', sub: 'The new airport is not available' };
    case 'landed': return { main: 'Landed · 100%', sub: r.etaMs ? `Arrived ${formatClock(r.etaMs, dest?.tz)}` : '' };
    case 'scheduled':
    case 'taxi': {
      const sub = r.depMs ? `${r.state === 'taxi' ? 'Departed' : 'Departs'} ${formatClock(r.depMs, origin?.tz)}` : '';
      return { main: `${r.state === 'taxi' ? 'Taxiing' : 'Not departed'} · 0%`, sub };
    }
    default: {
      const parts = [r.flownMs !== null && `Flown ${formatDuration(r.flownMs)}`,
        r.remainingMs !== null && `Remaining ${formatDuration(r.remainingMs)}`, pct].filter(Boolean);
      return { main: parts.join(' · ') || 'Progress not available', sub: r.etaMs ? `ETA ${formatClock(r.etaMs, dest?.tz)}` : '' };
    }
  }
}

const SKELETON = `
  <div class="fp-row">
    <span class="fp-code" data-from></span>
    <div class="fp-bar" role="progressbar" aria-label="Flight progress" aria-valuemin="0" aria-valuemax="100">
      <div class="fp-fill"></div>
      <svg class="fp-plane" viewBox="0 0 24 24" width="${PLANE_PX}" height="${PLANE_PX}" aria-hidden="true">
        <path d="${PLANE_PATH}" transform="rotate(90 12 12)"/></svg>
    </div>
    <span class="fp-code" data-to></span>
  </div>
  <div class="fp-main"></div>
  <div class="fp-sub"></div>`;

// `getTrack()` → [[lat, lon], ...] since take-off (js/track.js). Call update() with every new position.
export function createFlightProgress(el, { getTrack }) {
  let route = null;
  let leg = null; // raw AeroDataBox flight
  let ft = null; // flightTimes(leg)
  let live = null;
  let index = null; // ICAO → airport
  let max = 0; // highest % so far
  let built = false;

  fetchAirports()
    .then((list) => { index = new Map(list.filter((a) => a.icao).map((a) => [a.icao, a])); render(); })
    .catch(() => { /* the adsbdb route still has coordinates */ });

  function render() {
    if (!el.isConnected) return;
    const origin = endOf(leg?.departure, route?.origin, index);
    const dest = endOf(leg?.arrival, route?.destination, index);
    if (!origin && !dest) { el.innerHTML = ''; built = false; return; }
    if (!built) { el.innerHTML = `<div class="fp">${SKELETON}</div>`; built = true; }

    const r = computeFlightProgress({
      origin, dest, status: leg?.status ?? null, live, track: getTrack(), times: legTimes(ft), now: Date.now(), prevMax: max,
    });
    if (r.pct !== null) max = r.pct;
    const { main, sub } = describe(r, origin, dest);
    const pct = r.state === 'cancelled' ? 0 : r.pct ?? 0;
    const pos = `calc(${PLANE_PX / 2}px + ${Math.round(pct * 10) / 1000} * (100% - ${PLANE_PX}px))`;

    const root = el.firstElementChild;
    root.dataset.state = r.state;
    root.querySelector('[data-from]').textContent = origin?.iata ?? '–';
    root.querySelector('[data-to]').textContent = dest?.iata ?? '–';
    root.querySelector('.fp-fill').style.width = pos;
    root.querySelector('.fp-plane').style.left = pos;
    const bar = root.querySelector('.fp-bar');
    if (r.pct === null) bar.removeAttribute('aria-valuenow'); else bar.setAttribute('aria-valuenow', String(Math.round(r.pct)));
    root.querySelector('.fp-main').textContent = main;
    root.querySelector('.fp-sub').textContent = sub;
  }

  return {
    setRoute(r) { route = r; render(); },
    setLeg(l, f) { leg = l; ft = f; render(); },
    update(ac) { live = ac; render(); },
    refresh: render,
  };
}
