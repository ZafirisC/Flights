# PROGRESS

## Phases

| # | Phase | Model | Done when | Status |
|---|---|---|---|---|
| 0 | Accounts (GitHub, Cloudflare), empty repo, GitHub Pages on — **by Zaf** | — | Repo exists, Pages URL loads | ☐ |
| 1 | Skeleton: file structure, `index.html`, empty modules, manifest | Opus | Empty app loads on the Pages URL on PC and iPhone | ☑ |
| 2 | API check page (`tools/api-check.html`): CORS + response for every source in SPEC §2 | Sonnet | Results table below filled in from desktop Chrome and iPhone Safari | ☑ |
| 3 | Cloudflare Worker — **only if Phase 2 shows a blocked source** | Opus | Each needed route answers from the browser | ☑ |
| 4 | `scripts/build_airports.py` → `data/airports.json` | Sonnet | File is a few MB at most; ICAO/IATA/name/city/elevation/runways | ☑ |
| 5a | Map: viewport fetching, altitude colours, pause when hidden | Sonnet | Aircraft appear wherever the map is moved; no console errors | ☑ |
| 5b | Clustering, emergency highlight, dark map, share link | Sonnet | All four work on iPhone | ☑ |
| 6 | Search: flights and airports | Sonnet | `SKG`, `LGTS`, `Thessaloniki` and a live callsign are found | ☑ |
| 7 | Aircraft panel + destination weather | Sonnet | All fields shown or "Not available" | ☑ |
| 8 | Airport panel: METAR/TAF decode, derived departures/arrivals | Opus | 5 real METARs decoded correctly; sensible lists for LGTS | ☑ |
| 9 | Responsive polish + PWA (icon, Add to Home Screen) | Sonnet | Works from iPhone home screen and on desktop | ☑ |
| 10 | Test round and fixes | Haiku/Sonnet | No open bugs below | ◐ code review + fixes done, awaiting user test round |

## v1.1 phases (see SPEC §8, PLAN_v1.1.md)

One phase per session; `/clear` between phases. Test on PC and iPhone, commit, update this file at the end of each.

### v1.1 Phase 1 — Quick fixes (Sonnet; Haiku for the refresh button) — code done, awaiting PC + iPhone test
- [x] Persistent aircraft selection ("Signal lost" instead of closing)
- [x] Refresh button (tap = refetch + reset map, long-press = reload) + "Updated Xs ago"
- [x] Decoded METAR in aircraft panel, raw collapsible
- [x] Flight number (IATA/ICAO) display + search

### v1.1 Phase 2 — Map and airports (Sonnet; Haiku for airport data script and Live ATC) — code done, awaiting Worker redeploy + PC/iPhone test
- [x] Airports on the map, selectable
- [x] Airport local time (time zone in airports.json)
- [x] Full flight track + dashed line to destination
- [x] Weather and day/night layers
- [x] Live ATC links

### v1.1 Phase 3 — Scheduled vs actual times (Opus for source comparison/Worker design, Sonnet to implement) — code done, awaiting key + Worker redeploy + test
- [x] Pick free-tier source
- [x] Worker route with key + 15 min cache
- [x] Panel: scheduled/actual, delay colour, graceful failure

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

- Phase 3 check (desktop + iPhone Safari, 2026-10-26, same results on both; via Worker `https://flights-proxy.zkriaris.workers.dev`): adsb.lol ✅
  (29 aircraft), METAR ✅, TAF ✅. airplanes.live → HTTP 403 from upstream (it refuses requests from the Worker).
  `WORKER_URL` set in `js/api.js`. v1 uses adsb.lol only; no live-position fallback for now.

- Phase 4: `scripts/build_airports.py` (stdlib only) downloads OurAirports CSVs from the GitHub mirror
  (`raw.githubusercontent.com/davidmegginson/ourairports-data`), or takes `--airports/--runways` local files.
  Keeps large + medium airports, plus small ones with scheduled service and an ICAO/IATA code; open runways only.
  Result 2026-10-26: 6096 airports, 1.41 MB (~0.3 MB gzipped). Fields: icao, iata, name, city, country, lat, lon,
  elev (ft), type, rwy[id, len, wid, surf, hdg]. `icao` falls back to gps_code/ident when it is 4 letters.
  Regenerate: `python3 scripts/build_airports.py`.

- Phase 5a: `js/traffic.js` (viewport circle = centre → farthest corner, capped at 250 nm; poll 12 s; refetch
  400 ms after move; stops while hidden, refetches on return; stale responses dropped), `js/aircraft-layer.js`
  (markers updated in place by hex), `js/altitude.js` (hsl scale orange → purple, 0–40 000 ft; ground grey; legend),
  `fetchAircraft()` in `js/api.js` normalises adsb.lol. Status messages moved under the search bar.
  Tested in the sandbox with mocked data, then verified live on Pages (PC + iPhone).

- Phase 5b: Leaflet.markercluster 1.5.3 (unpkg, SRI). Clustering below zoom 8; emergencies (7500/7600/7700) in
  a separate unclustered layer with red pulsing icon and red chips under the search bar (tap → popup).
  Dark map = CSS filter on OSM tiles (no extra tile source); `js/theme.js` toggle Auto/Dark/Light, saved in
  localStorage. Share: `?flight=<callsign>` looks up `/v2/callsign/` (new Worker route), centres the map and opens
  the aircraft. Tap an aircraft → small Leaflet popup with Share link (Web Share, else clipboard); the popup is a
  stand-in until the aircraft panel (Phase 7). `clearStatus()` lets modules clear only their own messages.
  Worker redeployed with the callsign route; verified on iPhone (emergency view only tested with mocked data).

- Phase 6: `js/search.js` + `js/airlines.js` (IATA→ICAO table, e.g. A3→AEE, for "A3 123" → AEE123).
  Suggestions: live aircraft already loaded (callsign prefix, flight number, registration with/without dash),
  then airports (exact ICAO/IATA, prefix, name/city word, accent-insensitive; large first). "Find live flight"
  row asks adsb.lol `/v2/callsign/` then `/v2/reg/` (new Worker route) for aircraft outside the view.
  Airport pick: zoom 11 + small popup until the airport panel (Phase 8). `airports.json` loads on first focus.
  adsb.lol fields `r`/`t` now normalised as `reg`/`type`. `flashStatus()` moved to `js/status.js`.
  Verified on iPhone Safari and desktop Firefox (desktop first needed a hard refresh: old cached JS).

- Phase 7: `js/aircraft-panel.js` replaces the marker popup. Tap aircraft → panel (bottom sheet on phone, right
  panel on desktop); selected aircraft gets a blue ring and is never clustered. Sections: Flight (adsbdb route),
  Aircraft (adsbdb + Planespotters photo with credit; falls back to adsb.lol reg/type), Live (ticks "last message"
  every second), Destination weather (METAR via Worker + Open-Meteo now/+2/+4/+6 h, airport local time).
  Trail = positions received while the panel is open. Close: ×, Esc, or tap on the map. `js/api.js` caches routes,
  aircraft and photos per session, METAR 5 min, forecast 15 min; adsbdb 404 → "Not available".
  Bottom sheet is not draggable yet (Phase 9). Verified on Pages (PC + iPhone).

- Phase 8: `js/airport-panel.js` (opened from search; header with elevation + runways; tabs Departures /
  Arrivals / Weather; tap a flight → aircraft panel). `js/airport-traffic.js` implements SPEC §5: one adsb.lol
  fetch of 250 nm around the airport, route lookups only for candidates (on ground ≤ 3 nm, climbing ≤ 50 nm,
  or airborne with track within 60° of the airport / ≤ 30 nm), max 60 lookups per refresh, 4 at a time,
  cached per session. Refresh every 60 s while open and visible. `js/metar.js` decodes METAR (wind incl.
  gust/variable/MPS, visibility m/SM incl. fractions, CAVOK, weather, clouds, temp/dew, Q/A QNH) and gives the
  FAA flight category; TAF shown raw, one change group per line. `js/panel.js` lets the aircraft and airport
  panels share `#panel`. `js/geo.js`: distance/bearing. Check page: `tools/metar-check.html` compares our
  decode with aviationweather.gov's parsed fields. Verified on Pages (real METARs + LGTS lists).

- Phase 9: icons in `icons/` (SVG source + PNG 192/512, maskable 512, apple-touch 180; PNGs rendered from the
  SVG). Manifest with icons; theme-color per light/dark. `sw.js`: same-origin files network-first with
  revalidation (fixes stale JS after deploys), offline fallback from cache; unpkg libraries cache-first; APIs,
  tiles and the Worker untouched. Phone bottom sheet: handle to drag between 45% and 88% height, tap toggles,
  drag down closes. `revealOnMap()` pans so the selected aircraft/airport is not behind the panel.
  Verified on Pages: iPhone home screen app and desktop.

- Phase 10 (review + automated browser tests with mocked sources, phone and desktop sizes):
  fixed — last map view was never remembered (SPEC §3), now saved in localStorage; service worker stored one
  cache entry per `?flight=` link, now one per page; status-bar colour now follows the theme toggle;
  Open-Meteo attribution added (CC BY 4.0); Escape in the search box no longer closes the open panel.
  Checked OK — source failures (502, network error) keep the last aircraft and show a retrying message, then
  clear on recovery; adsbdb/Planespotters failures show "Not available"; airport list failure shows a message.

- v1.1 Phase 1: selected aircraft is kept by the layer even when a fetch no longer contains it (flagged `missing`;
  removed on deselect). `traffic.js` then looks it up directly by callsign/registration (`fetchTrackedAircraft`) so the
  panel keeps updating after the user pans away. No data for 45 s → red "Signal lost" banner in the panel (last known
  position stays); it clears if the aircraft returns. Panel still closes with ×, Esc or a tap on the map (unchanged).
  Refresh button + "Updated Xs ago" in `js/refresh.js` (red after 36 s = 3 missed polls): tap = `layer.reset()` +
  `invalidateSize()` + refetch, 700 ms long-press = `location.reload()`. Aircraft panel METAR uses the existing, already
  verified `decodeMetar()` plus new `metarSummary()` (same source as v1: aviationweather.gov JSON `rawOb` via the Worker),
  raw METAR in a `<details>`. Flight numbers: `flightNumbers()` in `js/airlines.js` (reverse of the existing IATA→ICAO
  table, kept as a JS module rather than JSON because all fetches must go through `api.js`); panel title shows
  "OA98 / OAL98"; search matches IATA or ICAO, any case, spaces ignored. Tested with Playwright and mocked sources
  (selection survives data loss, banner, search, METAR text); not yet on a real iPhone.

- v1.1 Phase 2: `scripts/build_airports.py` now adds `tz` (IANA) to every airport using the offline `timezonefinder`
  package (`pip install timezonefinder`); `data/airports.json` regenerated (6096 airports, 1.54 MB). `js/airport-layer.js`:
  canvas dots for large airports (all zooms) and medium ones (zoom ≥ 8) that have an IATA code; tap opens the airport panel.
  `js/localtime.js` → "Local 14:32 (UTC+2)" in the airport panel, refreshed every 30 s. `js/layers.js`: "Layers" menu
  (bottom right), off by default: RainViewer radar (newest frame, refreshed every 10 min, native zoom 7) and a day/night
  overlay computed locally (`sunPosition`, `nightPolygon`; no library). `js/atc.js`: LiveATC.net links only
  (`https://www.liveatc.net/search/?icao=LGTS`) in the airport panel and as ATC buttons for origin and destination in the
  aircraft panel. `js/track.js` replaces the old trail: history since take-off (solid) + dashed great circle to the destination.
- **Track source — NOT verified from the build sandbox** (it can only reach GitHub/PyPI): history is read from adsb.lol's
  tar1090 traces, `data/traces/{xx}/trace_full_{hex}.json`, then `trace_recent_`, through a new Worker route `/adsbtrace`
  (**the Worker must be redeployed with the new `worker/worker.js`**). The current flight is cut at the last take-off or
  45-min gap. If the route 404s or the format differs, the track simply starts from when the panel was opened (as in v1).
  Check with `tools/api-check.html?worker=<url>` (new rows "adsb.lol trace" and "RainViewer"); a 404 for the trace on a
  random aircraft can also just mean no trace yet. OpenSky `/tracks` not used (CORS blocked / timeout in Phase 2, needs an
  account). RainViewer availability and limits are also unverified here.

- Live source switched to **adsb.fi** (2026-10-27): adsb.lol now answers 429 because of a per-IP quota
  (`x-ratelimit-limit: 4, 4;w=1, 60;w=60, 500;w=86400`, i.e. 500 requests/day), which the shared Cloudflare Worker IP
  exhausts; one phone polling every 12 s alone would use it up in under 2 hours. adsb.fi open data: no key, 1 req/s,
  no daily cap, same readsb/ADSBx v2 format; terms: personal non-commercial, cite adsb.fi with a link (footer).
  New Worker route `/adsbfi` (`/v3/lat/../lon/../dist/..`, `/v2/callsign/`, `/v2/registration/`, `/v2/hex/`).
  `js/api.js` `liveQuery()`: adsb.fi first, adsb.lol as fallback; a source that answers 429 is skipped for 5 min.
  The selected aircraft outside the view is now looked up by hex. `tools/api-check.html` has rows for adsb.fi via the
  Worker and direct (if direct passes CORS, it could later skip the Worker and use the phone's own IP).
  Risk: the Worker's IP is shared with other Cloudflare users, so adsb.fi's 1 req/s limit could still be hit by others.

- **Live positions — OPEN, parked by Zaf (2026-10-27):** check page from the Worker: adsb.fi 403 and airplanes.live 403
  (both block Cloudflare's shared Worker IPs), adsb.lol 429 (500/day per IP quota used up on the shared IP); all three are
  CORS-blocked directly. So the live map currently shows no aircraft. Options when resumed: (A) OpenSky with a free account,
  OAuth client secret in the Worker (4000 credits/day ≈ 13 h of use at 1 credit/poll; also has tracks); (B) a proxy on a
  non-Cloudflare host. Also found: the Cache API is a no-op on `*.workers.dev`, so the Worker's edge caches never worked.
- v1.1 Phase 3 source comparison (2026-10-27, free + no card only): **AeroDataBox Basic** (RapidAPI) chosen — free,
  ~400–600 units/month (sources differ), flight status = Tier 2 = 2 units → roughly 200–300 lookups/month, 1 req/s,
  scheduled + revised (estimated/actual gate) + runway times; non-commercial, attribution required (shown in the panel).
  Rejected: aviationstack free (100 req/month, HTTP only, 1/min), AirLabs free (1000/month but reduced fields and the key
  may expire), FlightAware AeroAPI personal ($5 credit but card on file).
- v1.1 Phase 3 build: Worker route `/flighttimes/{callsign}` → AeroDataBox `/flights/callsign/{cs}` (callsign, so the ADS-B
  callsign matches directly), key in secret `AERODATABOX_KEY`, answer trimmed to number/status/departure/arrival times,
  cached 15 min per callsign (also empty answers) in Workers KV `TIMES_CACHE` if bound, else in instance memory; after
  401/403/429 upstream is not called for 1 h. No key → 503. `js/flight-times.js` picks the leg in the air (else the one
  closest to now); "Actual" = revisedTime once departed/arrived (gate time, falls back to runway), else "Estimated"
  (revised or predicted). Delay colours: green ≤ 15 min or early, orange 16–45, red > 45. Called only when an aircraft
  panel opens (client also caches 15 min); any failure leaves the section empty. Tested with mocked Worker/AeroDataBox.
  Not testable live until the live-position problem above is solved (no aircraft to open).

## v1.2 — Flight progress bar (Sonnet) — code done, awaiting PC + iPhone test with a real flight
- Panel only (user decision 2026-10-30): trips/PNR do not exist in the app, so per-leg bars are a later phase. UI in English.
- `js/progress.js` pure `computeFlightProgress()` + `legTimes()`; `js/progress-bar.js` component built once and updated
  in place (CSS transition); panel wiring in `js/aircraft-panel.js` (route, times leg, each position, track history).
- Method order: distance (needs a track that starts within 6 nm of the origin) → time → direct line origin→here.
  Airports: AeroDataBox leg ICAO via `data/airports.json` first, else the adsbdb route. Airborne is capped at 99%.
- Tests: `node --test tests/progress.test.mjs` (16, incl. a mutation check of the "never backwards" rule).
- Visual check: real app in headless Chromium with mocked network (PC 1280×800, iPhone 13, light + dark; airborne,
  not departed, landed, diverted, cancelled). Map tiles were blocked in the sandbox, so the map itself was not checked.
- Open: not tried with real data (live positions are still unsolved, see above); diversion airport unavailable.

- **More live-position sources (2026-10-31):** chain is now adsb.fi → adsb.lol → airplanes.live → **OpenSky** (new).
  airplanes.live is in the chain again (callsign/reg/hex routes added to the Worker) in case it stops blocking the Worker.
  OpenSky: new Worker route `/opensky/states/all` (bbox or `icao24`), OAuth2 client-credentials token from Worker secrets
  `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` (anonymous without them); viewport circle → bounding box rounded to 0.1°;
  units converted (m → ft, m/s → kt, m/s → ft/min); no reg/type (adsbdb fills these in the panel). OpenSky cannot search by
  callsign/registration, so search and share links still need one of the readsb sources. Each failing source is now skipped
  for a while (403: 10 min, 429: 5 min, other errors: 1 min) and the status message names each source's error.
  Tests: `tests/live-sources.test.mjs`. **Not verified live** (sandbox cannot reach any source): needs Worker redeploy +
  OpenSky secrets, then `tools/api-check.html?worker=<url>` row "OpenSky (via Worker)". Risk: OpenSky may block
  Cloudflare IPs too; if so, option (B) — a proxy on a non-Cloudflare host — is what is left.
  **OpenSky switched off (user, 2026-10-31: service not running).** `OPENSKY_ENABLED = false` in `js/api.js`; code,
  Worker route and tests kept, so turning it back on is that one flag + the footer credit.
  **OpenSky back on (user, 2026-10-31: service running, account made).** Live chain: adsb.fi → adsb.lol → airplanes.live
  → OpenSky. Worker secrets set and Worker redeployed.
  Check page (2026-10-31): "OpenSky (via Worker)" = timeout (10 s). Added `/opensky-check` to the Worker (reports
  secrets / login / data separately, 15 s limits) and shorter Worker timeouts (login 4 s, data 5 s).
  `/opensky-check` result: secrets set, **login timeout and data timeout (15 s each)**. Neither OpenSky host (auth, API)
  answers the Worker, so OpenSky very likely drops Cloudflare traffic, like adsb.fi and airplanes.live.
  From home OpenSky answers at once; "OpenSky (direct)" check row = blocked by CORS. So a relay on a non-Cloudflare host
  is needed. Prepared (not deployed): `RELAY_URL` in `js/api.js` (empty = off) sends live positions, OpenSky and traces
  through the relay, the rest stays on the Worker; check page takes `?relay=<url>`; `worker.js` skips the Cloudflare
  edge cache when `caches.default` is missing, so it can run elsewhere. Host under discussion: Papaki (Greek web
  hosting, PHP relay) or Deno Deploy (JS, same worker.js).

## Known issues
- Unknown aircraft/callsigns make adsbdb answer 404; the browser logs these as network errors in the console. Harmless.
- After a deploy, the first visit may still run cached JS (until the Phase 9 service worker is installed). After that, files are revalidated on every load.
- airplanes.live answers 403 to the Worker, so there is no fallback if adsb.lol is down. Route kept in the Worker in case it changes.
