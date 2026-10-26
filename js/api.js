// All network calls go through this module. No fetch anywhere else.
// Each source has a base URL. Sources that block CORS (Phase 2) go through the Cloudflare Worker
// (worker/worker.js) once WORKER_URL is set.
export const WORKER_URL = '';

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
