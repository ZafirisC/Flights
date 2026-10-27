# Flights – v1.1 plan (instructions for Claude Code)

Source: "Flights – Πλάνο v1.1" (Claude Doc, 2026-10-27). Written in English to save tokens.

## How to work
1. Before Phase 1: update SPEC.md with the v1.1 features below (Live ATC moves from "out of scope" to Phase 2) and add the three phases to PROGRESS.md as checklists.
2. One phase per session; `/clear` between phases.
3. At the start of each phase, remind the user which model to switch to with `/model` (table below). Switching is manual.
4. End of each phase: test on PC and iPhone, commit, update PROGRESS.md.
5. Architecture rules from v1 still apply: everything runs on the device, no own backend; GitHub Pages hosting; Cloudflare Worker only for CORS or to hide an API key. App UI stays in English.

| Phase | Content | Size | Model |
| --- | --- | --- | --- |
| 1 – Quick fixes | Persistent selection, refresh button, decoded METAR, flight number + search | Small | Sonnet (Haiku for the refresh button) |
| 2 – Map & airports | Airports on map, local time, full flight track, weather & day/night layers, Live ATC links | Medium | Sonnet; Haiku for the airport data script and Live ATC |
| 3 – Flight times | Scheduled vs actual departure/arrival | Medium–large | Opus for source comparison and Worker design, Sonnet for implementation |

## Phase 1 – Quick fixes (front-end only, existing data)
1. **Persistent aircraft selection.** Likely cause: markers are rebuilt on every position poll and the highlight is lost. Keep the selected ICAO24 in state, re-apply the highlight on every poll, deselect only when the info panel is closed. If the aircraft disappears from the data, the panel shows "Signal lost" instead of closing.
2. **Refresh button.** Needed on iPhone (home-screen web app has no reload). Tap = refetch data and reset the map; long-press = full page reload. Next to it, an "Updated Xs ago" indicator that turns red when data is stale.
3. **Decoded METAR in the aircraft panel.** aviationweather.gov returns METAR as JSON with separate fields (wind, visibility, clouds, temperature, QNH). Show readable text, e.g. "Wind 320° 12 kt, Visibility 10+ km, Few clouds 2,500 ft, 18 °C, QNH 1015". Raw METAR as a collapsible line. First confirm which METAR source v1 uses.
4. **Flight number + search.** ADS-B callsigns are ICAO (OAL98); the user types IATA (OA98). Add a static ICAO↔IATA airline mapping JSON. Panel shows both (OA98 / OAL98); search accepts either, ignoring spaces and case. Search covers only aircraft currently airborne.

## Phase 2 – Map & airports (no API keys)
1. **Airports on the map, selectable.** One-off script builds a small JSON from OurAirports open data: large/medium airports with an IATA code; fields ICAO, IATA, name, lat/lon, time zone. Large visible at all zooms, medium when zoomed in. Tap opens the existing airport panel (departures/arrivals from live data + METAR).
2. **Airport local time.** From the JSON time zone via the browser Intl API, e.g. "Local 14:32 (UTC+2)", updated every minute. OurAirports has no time zone, so the script derives it from coordinates (e.g. tz-lookup).
3. **Full flight track of the selected aircraft (decided: takeoff to destination).** On selection, load the current flight's position history once, then extend it with each poll. From the current position to the destination draw a dashed great-circle line. History must come from a free source: first the v1 ADS-B source, otherwise an alternative such as OpenSky's tracks endpoint (free account). Check first which source gives a full track and whether it works from the browser or needs the Worker. If no history exists for a flight, the track starts from when the app was opened.
4. **Weather and day/night layers.** Toggles in the layer menu, off by default (mobile data). Day/night: computed locally (e.g. Leaflet.Terminator if the map is Leaflet). Weather: precipitation radar from a free, keyless provider (e.g. RainViewer); confirm availability and limits.
5. **Live ATC (link only).** LiveATC.net has no public API and its terms do not allow re-streaming without permission. Add a "Live ATC" button in the airport panel that opens the LiveATC page for that ICAO (e.g. LGTS); in the flight panel, one button for departure and one for destination airport. Coverage varies; LiveATC's page shows when there is no feed.

## Phase 3 – Scheduled vs actual times
- Decided: **free tier only, no credit card.** Candidates e.g. AeroDataBox, aviationstack. Compare current free limits and pick the one that holds up for personal use.
- API key never in page code (public on GitHub Pages); route through the Cloudflare Worker.
- Call only when a flight panel is opened, never for every aircraft on the map; cache ~15 min per flight in the Worker to stay within the free quota.
- Display Scheduled / Actual (or Estimated) for departure and arrival, delay in minutes, colour: green ≤15 min, orange, red.
- If the service fails or the quota is exhausted, the panel simply hides times; nothing else is affected.

## Backlog (not in v1.1)
- In-app ATC playback (only with LiveATC permission).
- AI boarding-time prediction (declined for now).
