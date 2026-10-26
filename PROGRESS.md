# PROGRESS

## Phases

| # | Phase | Model | Done when | Status |
|---|---|---|---|---|
| 0 | Accounts (GitHub, Cloudflare), empty repo, GitHub Pages on — **by Zaf** | — | Repo exists, Pages URL loads | ☐ |
| 1 | Skeleton: file structure, `index.html`, empty modules, manifest | Opus | Empty app loads on the Pages URL on PC and iPhone | ☑ |
| 2 | API check page (`tools/api-check.html`): CORS + response for every source in SPEC §2 | Sonnet | Results table below filled in from desktop Chrome and iPhone Safari | ☐ |
| 3 | Cloudflare Worker — **only if Phase 2 shows a blocked source** | Opus | Each needed route answers from the browser | ☐ |
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
| adsb.lol | | | |
| airplanes.live | | | |
| OpenSky | | | |
| adsbdb callsign | | | |
| adsbdb aircraft | | | |
| Planespotters | | | |
| aviationweather METAR | | | |
| aviationweather TAF | | | |
| Open-Meteo | | | |

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

## Known issues
- (none yet)
