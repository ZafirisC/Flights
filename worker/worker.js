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
    path: new RegExp(`^/v2/point/${NUM}/${NUM}/\\d{1,3}$`), ttl: 5 },
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

// Live positions (OpenSky Network, free account). OAuth2 client credentials are Worker secrets OPENSKY_CLIENT_ID and
// OPENSKY_CLIENT_SECRET. Credits (4000/day): a bounding box up to 25 sq deg costs 1, up to 100 → 2, up to 400 → 3,
// larger or none → 4. So /states/all must carry a box of at most 400 sq deg; /callsign/{cs} is the one global query
// (4 credits), and its answer is shared from memory for 15 s.
const OSK_API = 'https://opensky-network.org/api';
const OSK_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const OSK_MAX_AREA = 400;
const BOX = { lamin: [-90, 90], lamax: [-90, 90], lomin: [-180, 180], lomax: [-180, 180] };
let oskToken = null; // { value, until }
let oskGlobal = null; // { until, promise } — last global states answer

async function openskyToken(env, fresh = false) {
  if (!fresh && oskToken && oskToken.until > Date.now()) return oskToken.value;
  const res = await fetch(OSK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: env.OPENSKY_CLIENT_ID, client_secret: env.OPENSKY_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw Object.assign(new Error(`OpenSky token HTTP ${res.status}`), { status: res.status });
  const t = await res.json();
  oskToken = { value: t.access_token, until: Date.now() + ((t.expires_in || 1800) - 60) * 1000 };
  return oskToken.value;
}

// GET on the OpenSky API with the bearer token; a 401 gets one retry with a fresh token.
async function openskyGet(env, target) {
  let res;
  for (const fresh of [false, true]) {
    res = await fetch(target, {
      headers: { Authorization: `Bearer ${await openskyToken(env, fresh)}`, 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status !== 401) break;
  }
  return res;
}

function openskyError(res, origin) {
  const r = reply(res.status === 429 ? 429 : 502, { error: `Upstream HTTP ${res.status}` }, origin);
  const wait = res.headers.get('X-Rate-Limit-Retry-After-Seconds');
  if (wait) r.headers.set('Retry-After', wait); // credits used up: seconds until they refill
  return r;
}

async function opensky(rest, url, env, origin) {
  if (!env.OPENSKY_CLIENT_ID || !env.OPENSKY_CLIENT_SECRET) return reply(503, { error: 'OpenSky not configured' }, origin);
  try {
    if (rest === '/states/all') {
      const target = new URL(`${OSK_API}/states/all`);
      for (const [k, [lo, hi]] of Object.entries(BOX)) {
        const v = Number(url.searchParams.get(k));
        if (!url.searchParams.has(k) || !(v >= lo && v <= hi)) return reply(400, { error: `Bad ${k}` }, origin);
        target.searchParams.set(k, v);
      }
      const p = Object.fromEntries([...target.searchParams].map(([k, v]) => [k, Number(v)]));
      if ((p.lamax - p.lamin) * (p.lomax - p.lomin) > OSK_MAX_AREA) return reply(400, { error: 'Area too large' }, origin);
      const icao = url.searchParams.get('icao24');
      if (icao !== null) {
        if (!/^[0-9a-f]{6}$/.test(icao)) return reply(400, { error: 'Bad icao24' }, origin);
        target.searchParams.set('icao24', icao);
      }
      const res = await openskyGet(env, target);
      if (!res.ok) return openskyError(res, origin);
      return json(await res.text(), origin);
    }
    const cs = rest.match(/^\/callsign\/([A-Za-z0-9]{1,8})$/);
    if (cs) {
      if (!oskGlobal || oskGlobal.until < Date.now()) {
        const promise = openskyGet(env, `${OSK_API}/states/all`)
          .then(async (res) => (res.ok ? { data: await res.json() } : { res }));
        oskGlobal = { until: Date.now() + 15000, promise };
        promise.then((g) => { if (g.res) oskGlobal = null; }, () => { oskGlobal = null; });
      }
      const g = await oskGlobal.promise;
      if (g.res) return openskyError(g.res, origin);
      const want = cs[1].toUpperCase();
      const states = (g.data.states || []).filter((st) => (st[1] || '').trim().toUpperCase() === want);
      return json(JSON.stringify({ time: g.data.time, states }), origin);
    }
  } catch (err) {
    return reply(502, { error: `Upstream unreachable: ${err.message}` }, origin);
  }
  return reply(404, { error: 'Unknown route' }, origin);
}

function json(text, origin) {
  return new Response(text, { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
}

const USER_AGENT = 'Flights PWA (https://github.com/ZafirisC/Flights)';

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Retry-After',
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
    if (url.pathname.startsWith('/opensky/')) return opensky(url.pathname.slice('/opensky'.length), url, env, origin);

    const route = ROUTES.find((r) => url.pathname.startsWith(r.prefix + '/'));
    const rest = route && url.pathname.slice(route.prefix.length);
    if (!route || !route.path.test(rest)) return reply(404, { error: 'Unknown route' }, origin);

    const target = new URL(route.upstream + rest);
    for (const key of route.query || []) {
      const v = url.searchParams.get(key);
      if (v !== null) target.searchParams.set(key, v);
    }

    // Edge cache shared by all users. Note: a no-op on *.workers.dev (works only on a custom domain).
    const cache = caches.default;
    const cacheKey = new Request(target.toString());
    let res = await cache.match(cacheKey);
    if (!res) {
      let upstream;
      try {
        upstream = await fetch(target, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
      } catch (err) {
        return reply(502, { error: `Upstream unreachable: ${err.message}` }, origin);
      }
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
