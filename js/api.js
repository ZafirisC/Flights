// All network calls go through this module. No fetch anywhere else.
// Each source has a base URL. Sources that block CORS (Phase 2) go through the Cloudflare Worker
// (worker/worker.js) once WORKER_URL is set.
export const WORKER_URL = 'https://flights-proxy.zkriaris.workers.dev';

export function sourcesFor(worker) {
  return {
    adsbFi: worker ? `${worker}/adsbfi` : 'https://opendata.adsb.fi/api',
    adsbLol: worker ? `${worker}/adsblol` : 'https://api.adsb.lol',
    airplanesLive: worker ? `${worker}/airplaneslive` : 'https://api.airplanes.live',
    adsbTrace: worker ? `${worker}/adsbtrace` : 'https://adsb.lol',
    rainviewer: 'https://api.rainviewer.com',
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
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Cached GET: one request per key per `ttl` ms (Infinity = whole session). 404 → null.
const cache = new Map(); // key → { at, promise }
function cachedJSON(url, ttl) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = getJSON(url).catch((err) => {
    if (err.status === 404) return null;
    cache.delete(url); // retry next time
    throw err;
  });
  cache.set(url, { at: Date.now(), promise });
  return promise;
}

const place = (p) => p && {
  icao: p.icao_code || null,
  iata: p.iata_code || null,
  name: p.name || null,
  city: p.municipality || null,
  country: p.country_name || null,
  lat: p.latitude ?? null,
  lon: p.longitude ?? null,
};

// Route for a callsign (adsbdb): { airline: { name, icao, iata }, origin, destination } or null.
export async function fetchRoute(callsign) {
  const data = await cachedJSON(`${SOURCES.adsbdb}/callsign/${encodeURIComponent(callsign)}`, Infinity);
  const r = data?.response?.flightroute;
  if (!r) return null;
  return {
    airline: r.airline ? { name: r.airline.name, icao: r.airline.icao, iata: r.airline.iata } : null,
    origin: place(r.origin),
    destination: place(r.destination),
  };
}

// Aircraft details for a Mode S hex (adsbdb): { registration, type, manufacturer, icaoType, owner, ownerCountry } or null.
export async function fetchAircraftInfo(hex) {
  const data = await cachedJSON(`${SOURCES.adsbdb}/aircraft/${encodeURIComponent(hex)}`, Infinity);
  const a = data?.response?.aircraft;
  if (!a) return null;
  return {
    registration: a.registration || null,
    type: a.type || null,
    manufacturer: a.manufacturer || null,
    icaoType: a.icao_type || null,
    owner: a.registered_owner || null,
    ownerCountry: a.registered_owner_country_name || null,
  };
}

// First Planespotters photo for a hex: { src, link, photographer } or null. Credit is required when shown.
export async function fetchPhoto(hex) {
  const data = await cachedJSON(`${SOURCES.planespotters}/photos/hex/${encodeURIComponent(hex)}`, Infinity);
  const p = data?.photos?.[0];
  if (!p) return null;
  return { src: (p.thumbnail_large || p.thumbnail)?.src, link: p.link, photographer: p.photographer || null };
}

// Latest METAR for an ICAO airport (aviationweather.gov via Worker), cached 5 min: raw AWC object or null.
export async function fetchMetar(icao) {
  const data = await cachedJSON(`${SOURCES.aviationWeather}/metar?ids=${encodeURIComponent(icao)}&format=json`, 5 * 60000);
  return Array.isArray(data) && data.length ? data[0] : null;
}

// Latest TAF for an ICAO airport (aviationweather.gov via Worker), cached 15 min: raw AWC object or null.
export async function fetchTaf(icao) {
  const data = await cachedJSON(`${SOURCES.aviationWeather}/taf?ids=${encodeURIComponent(icao)}&format=json`, 15 * 60000);
  return Array.isArray(data) && data.length ? data[0] : null;
}

// Next hours of forecast at a point (Open-Meteo), cached 15 min: [{ time, temp, windDir, windKt, precipProb, code }].
export async function fetchForecast(lat, lon, hours = 7) {
  const url = `${SOURCES.openMeteo}/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`
    + '&hourly=temperature_2m,wind_direction_10m,wind_speed_10m,precipitation_probability,weather_code'
    + `&wind_speed_unit=kn&timezone=auto&forecast_hours=${hours}`;
  const data = await cachedJSON(url, 15 * 60000);
  const h = data?.hourly;
  if (!h?.time) return null;
  return h.time.map((time, i) => ({
    time,
    temp: h.temperature_2m?.[i] ?? null,
    windDir: h.wind_direction_10m?.[i] ?? null,
    windKt: h.wind_speed_10m?.[i] ?? null,
    precipProb: h.precipitation_probability?.[i] ?? null,
    code: h.weather_code?.[i] ?? null,
  }));
}

// Live aircraft. Primary: adsb.fi (1 req/s, no daily cap). Fallback: adsb.lol (500 requests/day per IP, which a
// shared Worker IP exhausts quickly). A source that answers 429 is skipped for a while.
// Normalised to: { hex, callsign, lat, lon, alt (ft, null if unknown), onGround, gs (kt), track (deg), vrate (ft/min),
//   squawk, seen (s), reg, type }
export const MAX_RADIUS_NM = 250; // limit of both sources

const BACKOFF_MS = 5 * 60000;
const backoffUntil = {}; // source name → time

const LIVE = [
  { name: 'adsbFi', path: {
    point: (lat, lon, r) => `/v3/lat/${lat}/lon/${lon}/dist/${r}`,
    callsign: (cs) => `/v2/callsign/${encodeURIComponent(cs)}`,
    reg: (reg) => `/v2/registration/${encodeURIComponent(reg)}`,
    hex: (hex) => `/v2/hex/${encodeURIComponent(hex)}`,
  } },
  { name: 'adsbLol', path: {
    point: (lat, lon, r) => `/v2/point/${lat}/${lon}/${r}`,
    callsign: (cs) => `/v2/callsign/${encodeURIComponent(cs)}`,
    reg: (reg) => `/v2/reg/${encodeURIComponent(reg)}`,
    hex: (hex) => `/v2/hex/${encodeURIComponent(hex)}`,
  } },
];

// First source that answers; 404 counts as "not found" (empty list), not as a failure.
async function liveQuery(kind, ...args) {
  let lastErr = new Error('No live source available');
  for (const src of LIVE) {
    if (Date.now() < (backoffUntil[src.name] || 0)) continue;
    try {
      return normaliseAdsb(await getJSON(SOURCES[src.name] + src.path[kind](...args)));
    } catch (err) {
      if (err.status === 404) return [];
      if (err.status === 429) backoffUntil[src.name] = Date.now() + BACKOFF_MS;
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function fetchAircraft(lat, lon, radiusNm) {
  const r = Math.max(1, Math.min(MAX_RADIUS_NM, Math.ceil(radiusNm)));
  return liveQuery('point', lat.toFixed(2), lon.toFixed(2), r);
}

// Live aircraft with this callsign (null if not airborne / not seen).
export async function fetchFlightByCallsign(callsign) {
  return (await liveQuery('callsign', callsign))[0] || null;
}

// Live aircraft with this registration (null if not seen).
export async function fetchAircraftByReg(reg) {
  return (await liveQuery('reg', reg))[0] || null;
}

// The same aircraft by its Mode S hex: used when it is outside the fetched area.
export async function fetchTrackedAircraft(ac) {
  return (await liveQuery('hex', ac.hex)).find((a) => a.hex === ac.hex) || null;
}

// Scheduled / actual times for a callsign (AeroDataBox via the Worker, which holds the key and caches 15 min).
// { flights: [{ number, callsign, status, departure, arrival }] }; throws when the service is off or out of quota.
export async function fetchFlightTimes(callsign) {
  if (!WORKER_URL) throw new Error('No Worker');
  return cachedJSON(`${WORKER_URL}/flighttimes/${encodeURIComponent(callsign)}`, 15 * 60000);
}

// Airport list generated by scripts/build_airports.py (same origin, no proxy).
let airportsPromise = null;
export function fetchAirports() {
  airportsPromise ??= getJSON('data/airports.json', { timeout: 30000 })
    .then((data) => data.airports || [])
    .catch((err) => { airportsPromise = null; throw err; });
  return airportsPromise;
}

// Position history of an aircraft from adsb.lol's tar1090 traces (via the Worker): raw JSON
// { timestamp, trace: [[secondsAfterTimestamp, lat, lon, alt|"ground", gs, track, ...], ...] } or null.
// Today's full trace first, then the short recent one.
export async function fetchTrace(hex) {
  const h = hex.toLowerCase();
  for (const kind of ['full', 'recent']) {
    const data = await cachedJSON(`${SOURCES.adsbTrace}/data/traces/${h.slice(-2)}/trace_${kind}_${h}.json`, 30000);
    if (data?.trace?.length) return data;
  }
  return null;
}

// Newest RainViewer radar frame: { tiles: URL template with {z}/{x}/{y}, time (s) } or null.
export async function fetchRadarFrame() {
  const data = await getJSON(`${SOURCES.rainviewer}/public/weather-maps.json`);
  const frame = data?.radar?.past?.at(-1);
  if (!frame || !data.host) return null;
  return { tiles: `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, time: frame.time };
}

// adsb.fi and adsb.lol both use the readsb / ADSBExchange v2 format (list in `ac`, or `aircraft` in some versions).
function normaliseAdsb(data) {
  return (data?.ac || data?.aircraft || [])
    .filter((a) => a.hex && typeof a.lat === 'number' && typeof a.lon === 'number')
    .map((a) => ({
      hex: String(a.hex).toLowerCase(),
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
      reg: a.r || null,
      type: a.t || null,
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
