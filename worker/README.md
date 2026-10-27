# flights-proxy (Cloudflare Worker)

CORS proxy for the sources Phase 2 found blocked. Only these routes are forwarded:

| Route | Upstream | Edge cache |
|---|---|---|
| `/adsbfi/v3/lat/{lat}/lon/{lon}/dist/{nm}`, `/adsbfi/v2/callsign/{cs}`, `/adsbfi/v2/registration/{reg}`, `/adsbfi/v2/hex/{hex}` | `https://opendata.adsb.fi/api` | 5 s |
| `/adsblol/v2/point/{lat}/{lon}/{radius_nm}`, `/adsblol/v2/callsign/{cs}`, `/adsblol/v2/reg/{reg}` | `https://api.adsb.lol` | 5 s |
| `/airplaneslive/v2/point/{lat}/{lon}/{radius_nm}` | `https://api.airplanes.live` | 5 s |
| `/adsbtrace/data/traces/{xx}/trace_full_{hex}.json` (or `trace_recent_`) | `https://adsb.lol` | 30 s |
| `/awc/metar?ids=&format=` and `/awc/taf?ids=&format=` | `https://aviationweather.gov/api/data` | 5 min |
| `/flighttimes/{callsign}` | AeroDataBox (RapidAPI), needs secret `AERODATABOX_KEY`; answer trimmed | 15 min (1 h pause after 401/403/429) |
| `/health` | — | — |

Allowed origins: `https://zafirisc.github.io`, `http://localhost:8000` (edit `ALLOWED_ORIGINS` in `worker.js`).
Secret (v1.1 Phase 3): `AERODATABOX_KEY` = your RapidAPI key, subscribed to AeroDataBox **Basic (free)**.
Without it `/flighttimes` answers 503 and the app simply hides the times.

## Add the AeroDataBox key
1. rapidapi.com → sign up (free) → search **AeroDataBox** → **Pricing** → subscribe to **Basic** ($0).
2. Copy your key (any endpoint page, header `X-RapidAPI-Key`).
3. Cloudflare → Workers & Pages → `flights-proxy` → **Settings** → **Variables and Secrets** → **Add** →
   type **Secret**, name `AERODATABOX_KEY`, value = the key → **Deploy**.
4. Recommended (keeps the free quota safe): Cloudflare → **Storage & Databases** → **KV** → **Create** a namespace
   `flights-times`. Then `flights-proxy` → **Settings** → **Bindings** → **Add** → **KV namespace**,
   variable name `TIMES_CACHE`, namespace `flights-times` → **Deploy**.
   (The Cache API does not work on `*.workers.dev`, so without KV each Worker instance only remembers answers in memory.)

## Deploy (dashboard, no install)
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker** → name it `flights-proxy` → **Deploy**.
2. **Edit code** → replace everything with the contents of `worker.js` → **Deploy**.
3. Copy the URL, e.g. `https://flights-proxy.<your-subdomain>.workers.dev`. `/health` should show `{"ok":true}`.

## Deploy (CLI, alternative)
`cd worker && npx wrangler login && npx wrangler deploy`

## Test
Open `https://zafirisc.github.io/Flights/tools/api-check.html?worker=<Worker URL>` and run all checks.
When the proxied rows pass, set `WORKER_URL` in `js/api.js`.
