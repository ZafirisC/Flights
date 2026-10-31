// Cloudflare Worker: CORS proxy for the sources that block browser access (PROGRESS.md, Phase 2).
// Only the routes below are forwarded; anything else is 404, so this is not an open proxy.

const ALLOWED_ORIGINS = [
  'https://zafirisc.github.io',
  'http://localhost:8000',
];

const NUM = '-?\\d+(?:\\.\\d+)?';
const ROUTES = [
  // Live positions: /v2/point/{lat}/{lon}/{radius_nm}; search/share: /v2/callsign/{callsign}, /v2/reg/{registration}
  { prefix: '/adsblol', upstream: 'https://api.adsb.lol',
    path: new RegExp(`^/v2/(point/${NUM}/${NUM}/\\d{1,3}|callsign/[A-Za-z0-9]{1,8}|reg/[A-Za-z0-9-]{2,10}|hex/[0-9a-fA-F]{6})$`), ttl: 5 },
  // Primary live source: /v3/lat/{lat}/lon/{lon}/dist/{nm}; /v2/callsign/{cs}, /v2/registration/{reg}, /v2/hex/{hex}
  { prefix: '/adsbfi', upstream: 'https://opendata.adsb.fi/api',
    path: new RegExp(`^/(v3/lat/${NUM}/lon/${NUM}/dist/\\d{1,3}|v2/(callsign/[A-Za-z0-9]{1,8}|registration/[A-Za-z0-9-]{2,10}|hex/[0-9a-fA-F]{6}))$`), ttl: 5 },
  { prefix: '/airplaneslive', upstream: 'https://api.airplanes.live',
    path: new RegExp(`^/v2/(point/${NUM}/${NUM}/\\d{1,3}|callsign/[A-Za-z0-9]{1,8}|reg/[A-Za-z0-9-]{2,10}|hex/[0-9a-fA-F]{6})$`), ttl: 5 },
  // OpenSky state vectors: /states/all?lamin=&lomin=&lamax=&lomax= or ?icao24={hex}. Uses the OAuth client secret
  // (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET) when set, else anonymous (much smaller daily quota).
  { prefix: '/opensky', upstream: 'https://opensky-network.org/api', path: /^\/states\/all$/,
    query: ['lamin', 'lomin', 'lamax', 'lomax', 'icao24'], valid: /^(-?\d{1,3}(\.\d{1,4})?|[0-9a-f]{6})$/, ttl: 5,
    auth: openSkyToken },
  // Position history (tar1090 traces): /data/traces/{last 2 hex chars}/trace_full_{hex}.json or trace_recent_{hex}.json
  { prefix: '/adsbtrace', upstream: 'https://adsb.lol',
    path: /^\/data\/traces\/[0-9a-f]{2}\/trace_(full|recent)_[0-9a-f]{6}\.json$/, ttl: 30 },
  // METAR / TAF: /metar?ids=LGTS&format=json, /taf?ids=LGTS&format=json
  { prefix: '/awc', upstream: 'https://aviationweather.gov/api/data',
    path: /^\/(metar|taf)$/, query: ['ids', 'format', 'hours'], ttl: 300 },
];

// Scheduled vs actual times (v1.1 Phase 3): AeroDataBox via RapidAPI, free Basic plan. The key is a Worker secret
// (AERODATABOX_KEY), never in the page. One answer per callsign is cached for 15 min (also "not found"), so the
// free monthly quota (flight status = 2 units per call) lasts. After a quota/auth error, upstream is not called for 1 h.
const TIMES_TTL = 15 * 60;
const TIMES_BLOCK_TTL = 60 * 60;
const ADB_HOST = 'aerodatabox.p.rapidapi.com';
const CALLSIGN_RE = /^[A-Z0-9]{3,8}$/;

const pickTime = (t) => (t ? { utc: t.utc || null, local: t.local || null } : null);
const pickEnd = (e) => e && {
  icao: e.airport?.icao || null,
  iata: e.airport?.iata || null,
  scheduled: pickTime(e.scheduledTime),
  revised: pickTime(e.revisedTime), // latest known: estimated, or actual once it happened
  runway: pickTime(e.runwayTime), // actual take-off / landing
  predicted: pickTime(e.predictedTime),
};

// Only what the panel needs, so the cached answer stays small.
function trimFlights(list) {
  return {
    flights: (Array.isArray(list) ? list : []).map((f) => ({
      number: f.number || null,
      callsign: f.callSign || null,
      status: f.status || null,
      departure: pickEnd(f.departure),
      arrival: pickEnd(f.arrival),
    })),
  };
}

// Cache for /flighttimes. The Cache API does nothing on *.workers.dev, so this uses Workers KV (binding TIMES_CACHE)
// when it is bound, else a per-instance memory map (best effort only).
const memory = new Map(); // key → { until, value }
async function cacheGet(env, key) {
  if (env.TIMES_CACHE) return env.TIMES_CACHE.get(key);
  const hit = memory.get(key);
  return hit && hit.until > Date.now() ? hit.value : null;
}
async function cachePut(env, key, value, ttl) {
  if (env.TIMES_CACHE) return env.TIMES_CACHE.put(key, value, { expirationTtl: ttl });
  memory.set(key, { until: Date.now() + ttl * 1000, value });
}

async function flightTimes(callsign, env, ctx, origin) {
  if (!CALLSIGN_RE.test(callsign)) return reply(404, { error: 'Unknown route' }, origin);
  if (!env.AERODATABOX_KEY) return reply(503, { error: 'Times not configured' }, origin);
  const cached = await cacheGet(env, `t:${callsign}`);
  if (cached) return json(cached, origin);
  if (await cacheGet(env, 'blocked')) return reply(503, { error: 'Times quota exhausted, retry later' }, origin);

  let upstream;
  try {
    upstream = await fetch(`https://${ADB_HOST}/flights/callsign/${callsign}?withAircraftImage=false&withLocation=false`, {
      headers: { 'X-RapidAPI-Key': env.AERODATABOX_KEY, 'X-RapidAPI-Host': ADB_HOST, 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    return reply(502, { error: `Upstream unreachable: ${err.message}` }, origin);
  }
  let body;
  if (upstream.status === 204 || upstream.status === 404) body = { flights: [] };
  else if (upstream.ok) body = trimFlights(await upstream.json().catch(() => []));
  else {
    if ([401, 403, 429].includes(upstream.status)) ctx.waitUntil(cachePut(env, 'blocked', '1', TIMES_BLOCK_TTL));
    return reply(502, { error: `Upstream HTTP ${upstream.status}` }, origin);
  }
  const text = JSON.stringify(body);
  ctx.waitUntil(cachePut(env, `t:${callsign}`, text, TIMES_TTL));
  return json(text, origin);
}

function json(text, origin) {
  return new Response(text, { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
}

// OpenSky OAuth2 client-credentials token, kept in instance memory until shortly before it expires (30 min).
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
let openSky = { token: null, until: 0 };
async function openSkyToken(env) {
  if (!env.OPENSKY_CLIENT_ID || !env.OPENSKY_CLIENT_SECRET) return null;
  if (openSky.token && Date.now() < openSky.until) return openSky.token;
  try {
    const res = await fetch(OPENSKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials', client_id: env.OPENSKY_CLIENT_ID, client_secret: env.OPENSKY_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    openSky = { token: data.access_token, until: Date.now() + ((data.expires_in || 1800) - 60) * 1000 };
    return openSky.token;
  } catch {
    return null; // fall back to an anonymous request
  }
}

const USER_AGENT = 'Flights PWA (https://github.com/ZafirisC/Flights)';

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function reply(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'GET') return reply(405, { error: 'Method not allowed' }, origin);

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') return reply(200, { ok: true }, origin);

    const times = url.pathname.match(/^\/flighttimes\/([^/]+)$/);
    if (times) return flightTimes(times[1].toUpperCase(), env, ctx, origin);

    const route = ROUTES.find((r) => url.pathname.startsWith(r.prefix + '/'));
    const rest = route && url.pathname.slice(route.prefix.length);
    if (!route || !route.path.test(rest)) return reply(404, { error: 'Unknown route' }, origin);

    const target = new URL(route.upstream + rest);
    for (const key of route.query || []) {
      const v = url.searchParams.get(key);
      if (v === null) continue;
      if (route.valid && !route.valid.test(v)) return reply(400, { error: `Bad ${key}` }, origin);
      target.searchParams.set(key, v);
    }

    // Edge cache shared by all users. Note: a no-op on *.workers.dev (works only on a custom domain).
    const cache = caches.default;
    const cacheKey = new Request(target.toString());
    let res = await cache.match(cacheKey);
    if (!res) {
      let upstream;
      try {
        const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
        const token = route.auth && await route.auth(env);
        if (token) headers.Authorization = `Bearer ${token}`;
        upstream = await fetch(target, {
          headers,
          signal: AbortSignal.timeout(10000),
        });
      } catch (err) {
        return reply(502, { error: `Upstream unreachable: ${err.message}` }, origin);
      }
      if (upstream.status === 401 && route.auth) openSky = { token: null, until: 0 }; // token revoked: get a new one
      res = new Response(upstream.body, upstream);
      res.headers.delete('Set-Cookie');
      if (upstream.ok) {
        res.headers.set('Cache-Control', `public, max-age=${route.ttl}`);
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
      }
    }

    res = new Response(res.body, res);
    for (const k of [...res.headers.keys()]) if (k.startsWith('access-control-')) res.headers.delete(k);
    for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
    return res;
  },
};
