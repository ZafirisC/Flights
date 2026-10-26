// Cloudflare Worker: CORS proxy for the sources that block browser access (PROGRESS.md, Phase 2).
// Only the routes below are forwarded; anything else is 404, so this is not an open proxy.

const ALLOWED_ORIGINS = [
  'https://zafirisc.github.io',
  'http://localhost:8000',
];

const NUM = '-?\\d+(?:\\.\\d+)?';
const ROUTES = [
  // Live positions: /v2/point/{lat}/{lon}/{radius_nm}
  { prefix: '/adsblol', upstream: 'https://api.adsb.lol',
    path: new RegExp(`^/v2/point/${NUM}/${NUM}/\\d{1,3}$`), ttl: 5 },
  { prefix: '/airplaneslive', upstream: 'https://api.airplanes.live',
    path: new RegExp(`^/v2/point/${NUM}/${NUM}/\\d{1,3}$`), ttl: 5 },
  // METAR / TAF: /metar?ids=LGTS&format=json, /taf?ids=LGTS&format=json
  { prefix: '/awc', upstream: 'https://aviationweather.gov/api/data',
    path: /^\/(metar|taf)$/, query: ['ids', 'format', 'hours'], ttl: 300 },
];

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

    const route = ROUTES.find((r) => url.pathname.startsWith(r.prefix + '/'));
    const rest = route && url.pathname.slice(route.prefix.length);
    if (!route || !route.path.test(rest)) return reply(404, { error: 'Unknown route' }, origin);

    const target = new URL(route.upstream + rest);
    for (const key of route.query || []) {
      const v = url.searchParams.get(key);
      if (v !== null) target.searchParams.set(key, v);
    }

    // Edge cache shared by all users: keeps us inside upstream rate limits.
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
