# Flights — Specification (v1)

A Flightradar24-style flight tracker that runs entirely in the browser on a computer and on an iPhone.
All UI text is in **English**.

## 1. Architecture

- **Static web app (PWA)** hosted on **GitHub Pages**. No build step, no framework.
- **Runs entirely on each device.** The page itself fetches data from public APIs and renders the map.
  There is no backend of our own.
- **Cloudflare Worker only as a fallback.** Use it only for a data source that blocks direct browser
  access (CORS) or needs a secret key. Phase 2 decides whether it is needed at all.
- **One place for all network calls:** `js/api.js`. Each source has a base URL that can point either
  directly at the API or at the Worker, so switching a source to the proxy is a one-line change.
- Must work from an `https://` URL. Local `file://` opening is not a target (iOS cannot run it).

## 2. Data sources (candidates — verify in Phase 2)

| Purpose | Source | Endpoint (to confirm) | Key |
|---|---|---|---|
| Live positions | adsb.lol | `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius_nm}` | none |
| Live positions (alt.) | airplanes.live | `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius_nm}` | none |
| Live positions (alt.) | OpenSky Network | `https://opensky-network.org/api/states/all?lamin=&lomin=&lamax=&lomax=` | optional |
| Flight route (callsign → origin/destination) | adsbdb | `https://api.adsbdb.com/v0/callsign/{callsign}` | none |
| Aircraft details (hex → registration, type, operator) | adsbdb | `https://api.adsbdb.com/v0/aircraft/{hex}` | none |
| Aircraft photo | Planespotters | `https://api.planespotters.net/pub/photos/hex/{hex}` | none, attribution required |
| METAR / TAF | aviationweather.gov | `https://aviationweather.gov/api/data/metar?ids={ICAO}&format=json` (and `/taf`) | none |
| Forecast | Open-Meteo | `https://api.open-meteo.com/v1/forecast?latitude=&longitude=&hourly=...` | none |
| Airports and runways | OurAirports (public domain) | `airports.csv`, `runways.csv` from ourairports-data | built into `data/airports.json` by script |

Phase 2 records for each source: works from browser (CORS) yes/no, on desktop Chrome and iPhone Safari,
response shape, rate limits. The live-position source with the best result becomes primary.

## 3. Features in v1

### Core
1. **Live map** (Leaflet + OpenStreetMap tiles). Aircraft icons rotated by track.
2. **Search box** (one field, suggestions while typing):
   - Flights: callsign or flight number (e.g. `AEE123`, `A3 123`), registration.
     If airborne → pan to it and open its panel.
   - Airports: ICAO, IATA, name or city (e.g. `LGTS`, `SKG`, `Thessaloniki`), from local `airports.json`.
3. **Aircraft panel** (tap an aircraft):
   - Flight: callsign, airline, origin → destination.
   - Aircraft: registration, type, operator/owner, photo (with credit).
   - Live: altitude, ground speed, track, vertical rate, squawk, time since last message.
   - Destination weather: METAR of destination airport + short forecast (Open-Meteo).
   - Trail of positions seen since the panel was opened (client-side history).
   - Any missing field shows "Not available", never a blank or an error.
4. **Airport panel** (select an airport):
   - Header: name, ICAO/IATA, elevation, runways.
   - Tabs: **Departures**, **Arrivals**, **Weather**.
   - Weather: raw METAR + decoded (wind, visibility, clouds, temperature/dew point, QNH) with
     flight category badge (VFR / MVFR / IFR / LIFR); TAF if available.
   - Departures/Arrivals are **derived from live data** (no schedules, no delays). See §5.

### Group A (also in v1)
5. **Viewport-based fetching.** Request aircraft for the visible map area, with a maximum area cap.
6. **Altitude colour scale** for aircraft icons (ground → FL400), with a small legend.
7. **Battery saver.** Stop polling when the page is hidden (`visibilitychange`), resume on return.
8. **Clustering** at low zoom (Leaflet.markercluster).
9. **Emergency highlight.** Squawk 7500 / 7600 / 7700 → red icon, listed first in an alert chip.
10. **Dark map** (auto from `prefers-color-scheme`, plus a toggle).
11. **Share link** to a flight: `?flight=<callsign>` opens the app on that flight.

### Settings
- Default view: Thessaloniki (40.64, 22.94). Remembered last view.
- Units: ft and kt (unit toggles are out of scope for v1).
- Stored in `localStorage` (wrapped in try/catch).

### Disclaimer
Small footer text: "Data from community ADS-B networks. Coverage has gaps. Not for operational use."

## 4. Layout

- Map fills the screen.
- **Phone (< 768 px):** search on top; panels open as a bottom sheet that can be dragged up.
  Tap targets ≥ 44 px. Respect iPhone safe areas (`viewport-fit=cover`, `env(safe-area-inset-*)`).
- **Desktop:** panels open as a right side panel.
- PWA: `manifest.json`, app icon, "Add to Home Screen" works on iPhone.

## 5. Departures / Arrivals (derived, v1)

Starting heuristic (refine in Phase 8):
- **Departures:** aircraft whose route origin (adsbdb) = this airport and that are on the ground at it,
  or airborne within ~50 nm and climbing. Sort: on ground first, then by distance.
- **Arrivals:** aircraft whose route destination = this airport, airborne, within ~250 nm.
  Show distance and a rough ETA (distance / ground speed). Sort by ETA.
- Aircraft with no known route but on the ground within ~3 nm of the airport go to a "Unknown route" group.
- Route lookups are cached per callsign for the session to respect rate limits.

## 6. Non-functional

- Polling every 10–15 s for positions; METAR cached 5 min; routes and aircraft details cached per session.
- Never crash on a failed source: show a short status message and keep the last data.
- Smooth on iPhone with a few hundred aircraft on screen.

## 7. Out of scope for v1 (later)

Group B: flight-category dots on airport markers, runway-in-use and wind components, ETA-based
destination weather, filters, favourites, "what's overhead", unit/language toggles.
Group C: notifications, playback, military filter, own RTL-SDR receiver as a source.
Real schedules: moved into v1.1 Phase 3 (see §8).
Backlog: in-app ATC playback (only with LiveATC permission); AI boarding-time prediction (declined).

## 8. v1.1 (three phases; source: PLAN_v1.1.md)

Architecture rules from v1 still apply: everything runs on the device, no own backend, GitHub Pages,
Cloudflare Worker only for CORS or to hide an API key. UI stays in English.

### Phase 1 — Quick fixes (front-end only, existing data)
1. **Persistent aircraft selection.** Selected ICAO24 kept in state; highlight re-applied on every poll;
   deselect only when the panel is closed. If the aircraft leaves the data, the panel shows "Signal lost".
2. **Refresh button.** Tap = refetch data and reset the map; long-press = full page reload. Next to it an
   "Updated Xs ago" indicator, red when stale.
3. **Decoded METAR in the aircraft panel.** Readable text (wind, visibility, clouds, temperature, QNH);
   raw METAR as a collapsible line.
4. **Flight number + search.** Static ICAO↔IATA airline mapping; panel shows both (OA98 / OAL98); search
   accepts either, ignoring spaces and case. Airborne aircraft only.

### Phase 2 — Map and airports (no API keys)
1. Airports on the map (large at all zooms, medium when zoomed in), tap opens the airport panel.
2. Airport local time from a time zone per airport (derived by the build script), via Intl.
3. Full flight track of the selected aircraft (takeoff → current position, dashed great circle to destination).
   History from a free source; check which one works from the browser or needs the Worker.
4. Layer toggles, off by default: day/night (computed locally) and precipitation radar (free keyless provider).
5. **Live ATC (link only)** to the LiveATC.net page for the airport ICAO; flight panel has departure and
   destination buttons. No re-streaming.

### Phase 3 — Scheduled vs actual times
Free tier only, no credit card. API key only in the Cloudflare Worker. Called only when a flight panel is
opened; cached ~15 min per flight in the Worker. Shows scheduled vs actual/estimated departure and arrival,
delay in minutes (green ≤ 15, orange, red). On failure or exhausted quota the panel simply hides the times.
