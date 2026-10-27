# flights-proxy (Cloudflare Worker)

CORS proxy for the sources Phase 2 found blocked. Only these routes are forwarded:

| Route | Upstream | Edge cache |
|---|---|---|
| `/adsbfi/v3/lat/{lat}/lon/{lon}/dist/{nm}`, `/adsbfi/v2/callsign/{cs}`, `/adsbfi/v2/registration/{reg}`, `/adsbfi/v2/hex/{hex}` | `https://opendata.adsb.fi/api` | 5 s |
| `/adsblol/v2/point/{lat}/{lon}/{radius_nm}`, `/adsblol/v2/callsign/{cs}`, `/adsblol/v2/reg/{reg}` | `https://api.adsb.lol` | 5 s |
| `/airplaneslive/v2/point/{lat}/{lon}/{radius_nm}` | `https://api.airplanes.live` | 5 s |
| `/adsbtrace/data/traces/{xx}/trace_full_{hex}.json` (or `trace_recent_`) | `https://adsb.lol` | 30 s |
| `/awc/metar?ids=&format=` and `/awc/taf?ids=&format=` | `https://aviationweather.gov/api/data` | 5 min |
| `/health` | — | — |

Allowed origins: `https://zafirisc.github.io`, `http://localhost:8000` (edit `ALLOWED_ORIGINS` in `worker.js`).
No secrets needed.

## Deploy (dashboard, no install)
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker** → name it `flights-proxy` → **Deploy**.
2. **Edit code** → replace everything with the contents of `worker.js` → **Deploy**.
3. Copy the URL, e.g. `https://flights-proxy.<your-subdomain>.workers.dev`. `/health` should show `{"ok":true}`.

## Deploy (CLI, alternative)
`cd worker && npx wrangler login && npx wrangler deploy`

## Test
Open `https://zafirisc.github.io/Flights/tools/api-check.html?worker=<Worker URL>` and run all checks.
When the proxied rows pass, set `WORKER_URL` in `js/api.js`.
