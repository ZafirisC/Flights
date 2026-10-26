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
| 8 | Airport panel: METAR/TAF decode, derived departures/arrivals | Opus | 5 real METARs decoded correctly; sensible lists for LGTS | ◐ built, awaiting check on Pages |
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
  decode with aviationweather.gov's parsed fields.

## Known issues
- Phone: the bottom sheet covers the lower half of the map, so the selected airport/aircraft can sit behind it (Phase 9).
- Unknown aircraft/callsigns make adsbdb answer 404; the browser logs these as network errors in the console. Harmless.
- After a deploy, browsers may run cached JS for up to ~10 min (GitHub Pages cache). Hard refresh (Ctrl+F5) when testing.
  Phase 9 (service worker / versioned files) should handle this.
- airplanes.live answers 403 to the Worker, so there is no fallback if adsb.lol is down. Route kept in the Worker in case it changes.
