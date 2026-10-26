# PROGRESS

## Phases

| # | Phase | Model | Done when | Status |
|---|---|---|---|---|
| 0 | Accounts (GitHub, Cloudflare), empty repo, GitHub Pages on — **by Zaf** | — | Repo exists, Pages URL loads | ☐ |
| 1 | Skeleton: file structure, `index.html`, empty modules, manifest | Opus | Empty app loads on the Pages URL on PC and iPhone | ☑ |
| 2 | API check page (`tools/api-check.html`): CORS + response for every source in SPEC §2 | Sonnet | Results table below filled in from desktop Chrome and iPhone Safari | ☑ |
| 3 | Cloudflare Worker — **only if Phase 2 shows a blocked source** | Opus | Each needed route answers from the browser | ◐ code ready (`worker/`), awaiting deploy + check |
| 4 | `scripts/build_airports.py` → `data/airports.json` | Sonnet | File is a few MB at most; ICAO/IATA/name/city/elevation/runways | ☐ |
| 5a | Map: viewport fetching, altitude colours, pause when hidden | Sonnet | Aircraft appear wherever the map is moved; no console errors | ☐ |
| 5b | Clustering, emergency highlight, dark map, share link | Sonnet | All four work on iPhone | ☐ |
| 6 | Search: flights and airports | Sonnet | `SKG`, `LGTS`, `Thessaloniki` and a live callsign are found | ☐ |
| 7 | Aircraft panel + destination weather | Sonnet | All fields shown or "Not available" | ☐ |
| 8 | Airport panel: METAR/TAF decode, derived departures/arrivals | Opus | 5 real METARs decoded correctly; sensible lists for LGTS | ☐ |
| 9 | Responsive polish + PWA (icon, Add to Home Screen) | Sonnet | Works from iPhone home screen and on desktop | ☐ |
| 10 | Test round and fixes | Haiku/Sonnet | No open bugs below | ☐ |

## API check results (Phase 2)

| Source | Desktop Chrome | iPhone Safari | Notes |
|---|---|---|---|
| adsb.lol | ❌ CORS blocked | ❌ CORS blocked (host reachable) |  |
| airplanes.live | ❌ CORS blocked | ❌ CORS blocked (host reachable) |  |
| OpenSky | ❌ Timeout (10 s) | ❌ CORS blocked (host reachable) |  |
| adsbdb callsign | ✅ 200, ~385 ms | ✅ 200, ~450 ms | `{response: object}`; tested with fallback AEE123 |
| adsbdb aircraft | ✅ CORS ok (404 for fallback hex) | ✅ CORS ok (404 for fallback hex) | 404 = unknown hex 4690de, not a failure; `{response: string}` on 404 |
| Planespotters | ✅ 200, ~360 ms | ✅ 200, ~460 ms | `{photos: []}` for fallback hex |
| aviationweather METAR | ❌ CORS blocked | ❌ CORS blocked (host reachable) |  |
| aviationweather TAF | ❌ CORS blocked | ❌ CORS blocked (host reachable) |  |
| Open-Meteo | ✅ 200, ~350 ms | ✅ 200, ~350 ms | `{latitude, longitude, hourly_units, hourly, …}` |

## Decisions log
- UI in English.
- Departures/arrivals derived from live data (no schedules) for v1.
- App runs fully on the device; Cloudflare Worker only for sources that block browser access.
- v1 = core features + Group A (see SPEC §3).
- Phase 1: Leaflet 1.9.4 from unpkg with SRI (verified loading on Pages, PC + iPhone). Leaflet.markercluster added in Phase 5b.
- Phase 1 file layout: `index.html`, `css/style.css`, `manifest.json`, `.nojekyll`, `js/` = `main.js` (entry),
  `api.js` (all fetches, base URL per source), `map.js`, `search.js`, `aircraft-panel.js`, `airport-panel.js`,
  `storage.js` (localStorage in try/catch), `status.js` (status messages).
- Manifest has no icons yet (Phase 9). No service worker yet (Phase 9).
- Phase 2: `tools/api-check.html` + `tools/api-check.js`; requests go through new `probe()` in `js/api.js`.
  On failure a `no-cors` retry separates "CORS blocked" from "unreachable". Lookups (adsbdb, Planespotters)
  use a real callsign/hex from the first live result, else fallback AEE123 / 4690de. Area: Thessaloniki, 100 nm.
  Only CORS-exposed headers are readable, so rate limits may show "none visible"; check provider docs.
- Phase 2 (iPhone, 2026-10-26): no rate-limit headers visible on any source. "CORS blocked (host reachable)" can also
  be an error response without CORS headers (e.g. 429); either way the browser cannot read it.

- Phase 2 result: **Worker needed** for live positions (adsb.lol, airplanes.live, OpenSky) and METAR/TAF
  (aviationweather). Direct from browser: adsbdb, Planespotters, Open-Meteo. Primary live source: adsb.lol
  via Worker, airplanes.live as fallback; OpenSky dropped (CORS blocked on iPhone, timeout on desktop).
- Phase 2 desktop run was detected as "Other browser" (not Chrome). CORS is the same in all browsers, so accepted.

- Phase 3: Worker in `worker/` (deploy steps in `worker/README.md`). Routes `/adsblol`, `/airplaneslive`, `/awc`
  only, with path/query allowlist (not an open proxy). CORS only for zafirisc.github.io and localhost:8000.
  Edge cache 5 s for positions, 5 min for METAR/TAF. `js/api.js` switches these sources with `WORKER_URL`;
  `tools/api-check.html?worker=<url>` tests a Worker before that.

## Known issues
- (none yet)
