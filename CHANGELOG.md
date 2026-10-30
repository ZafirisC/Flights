# Changelog

## v1.2 — Flight progress bar
- Aircraft panel: progress bar from departure to destination (IATA codes, plane at the current position,
  filled part for the distance flown), with "Flown · Remaining · %" and the ETA below it.
- Percentage while airborne = flown / (flown + remaining). Flown = track since take-off, remaining = great circle
  to the destination. Without a track from take-off it uses time (actual departure → estimated arrival), and as
  a last resort the straight line from the origin. The bar never moves backwards; it reads 100% only when landed.
- States: not departed (0%, departure time), taxiing, airborne, landed (100%), diverted ("Diverted", frozen),
  cancelled (grey, struck through).
- Updates with every position refresh; the plane glides with a CSS transition (off with reduced motion).
  Works in light and dark theme and at iPhone width.
- Airports come from the AeroDataBox leg when its ICAO is in `data/airports.json`, else from the adsbdb route.
- New: `js/progress.js` (calculation), `js/progress-bar.js` (component), `js/plane-icon.js` (shared icon),
  `tests/progress.test.mjs`. `js/track.js` exposes `points()`. Service worker cache renamed `flights-v1.2`.
- No change to data sources, the Worker or the v1.1 times.
- Not in v1.2: progress per leg of a trip/PNR (the app has no trips yet), diversion airport (not in the data).

## v1.1
Persistent selection, refresh button, decoded METAR, flight number search, airports and flight track on the map,
radar and day/night layers, Live ATC links, scheduled vs actual times. See `PROGRESS.md`.
