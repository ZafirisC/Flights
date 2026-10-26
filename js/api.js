// All network calls go through this module. No fetch anywhere else.
// Each source has a base URL. Sources that block CORS (Phase 2) go through the Cloudflare Worker
// (worker/worker.js) once WORKER_URL is set.
export const WORKER_URL = 'https://flights-proxy.zkriaris.workers.dev';

export function sourcesFor(worker) {
  return {
    adsbLol: worker ? `${worker}/adsblol` : 'https://api.adsb.lol',
    airplanesLive: worker ? `${worker}/airplaneslive` : 'https://api.airplanes.live',
    opensky: 'https://opensky-network.org/api',
    adsbdb: 'https://api.adsbdb.com/v0',
    planespotters: 'https://api.planespotters.net/pub',
    aviationWeather: worker ? `${worker}/awc` : 'https://aviationweather.gov/api/data',
    openMeteo: 'https://api.open-meteo.com/v1',
  };
}

export const SOURCES = sourcesFor(WORKER_URL);

export async function getJSON(url, { timeout = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Live aircraft around a point (adsb.lol v2), normalised to:
// { hex, callsign, lat, lon, alt (ft, null if unknown), onGround, gs (kt), track (deg), vrate (ft/min), squawk, seen (s) }
export const MAX_RADIUS_NM = 250; // adsb.lol limit

export async function fetchAircraft(lat, lon, radiusNm) {
  const r = Math.max(1, Math.min(MAX_RADIUS_NM, Math.ceil(radiusNm)));
  const data = await getJSON(`${SOURCES.adsbLol}/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/${r}`);
  return normaliseAdsbLol(data);
}

// Live aircraft with this callsign (null if not airborne / not seen).
export async function fetchFlightByCallsign(callsign) {
  const data = await getJSON(`${SOURCES.adsbLol}/v2/callsign/${encodeURIComponent(callsign)}`);
  return normaliseAdsbLol(data)[0] || null;
}

function normaliseAdsbLol(data) {
  return (data.ac || [])
    .filter((a) => a.hex && typeof a.lat === 'number' && typeof a.lon === 'number')
    .map((a) => ({
      hex: a.hex,
      callsign: (a.flight || '').trim() || null,
      lat: a.lat,
      lon: a.lon,
      alt: typeof a.alt_baro === 'number' ? a.alt_baro : null,
      onGround: a.alt_baro === 'ground',
      gs: a.gs ?? null,
      track: a.track ?? a.true_heading ?? null,
      vrate: a.baro_rate ?? a.geom_rate ?? null,
      squawk: a.squawk ?? null,
      seen: a.seen ?? null,
    }));
}

// Diagnostic request for tools/api-check.html: never throws, reports what the browser saw.
// If the normal request fails, a no-cors request tells "host reachable but CORS blocked"
// apart from "host unreachable".
export async function probe(url, { timeout = 10000 } = {}) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    return {
      cors: true,
      status: res.status,
      ms: Math.round(performance.now() - started),
      headers: Object.fromEntries(res.headers.entries()),
      body,
      text,
    };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    if (err.name === 'AbortError') return { cors: null, error: 'Timeout', ms };
    let reachable = false;
    try {
      await fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(timeout) });
      reachable = true;
    } catch { /* unreachable */ }
    return {
      cors: false,
      error: reachable ? 'Blocked by CORS (host reachable)' : `Network error: ${err.message}`,
      ms,
    };
  } finally {
    clearTimeout(timer);
  }
}
