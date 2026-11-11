# How Flights works

A static PWA on GitHub Pages. Everything runs in the browser; the only server-side piece is a small
Cloudflare Worker that proxies sources blocked by CORS and holds API keys. All network calls go through `js/api.js`.

## 1. Big picture

```mermaid
flowchart LR
  subgraph Device["Browser / iPhone (PWA)"]
    UI["index.html + css/style.css<br/>Leaflet map, search, panels"]
    APP["js/* modules"]
    API["js/api.js<br/>(only place with fetch,<br/>caches, source fallback)"]
    SW["sw.js<br/>offline cache of app files"]
    LS[("localStorage<br/>last view, theme, prefs")]
    AJ[("data/airports.json<br/>6 096 airports")]
    UI --> APP --> API
    APP <--> LS
    API --> AJ
  end

  subgraph Worker["Cloudflare Worker (worker/worker.js)<br/>CORS allowlist + secrets"]
    W1["/adsbfi /adsblol /airplaneslive /opensky<br/>live positions"]
    W2["/adsbtrace<br/>flight history"]
    W3["/awc<br/>METAR / TAF"]
    W4["/flighttimes<br/>AeroDataBox (key)"]
    W5["/transit<br/>Transitland (key)"]
    W6["/webcams<br/>Windy (key)"]
  end

  subgraph Direct["Called directly (CORS open)"]
    D1["adsbdb<br/>route + aircraft"]
    D2["Planespotters<br/>photo"]
    D3["Open-Meteo<br/>forecast"]
    D4["RainViewer<br/>radar"]
    D5["Overpass (OSM)<br/>transport stops"]
    D6["OSM tiles"]
  end

  API --> Worker
  API --> Direct
  UI -. tiles .-> D6

  subgraph Build["Offline build (developer)"]
    PY["scripts/build_airports.py<br/>OurAirports CSV + timezonefinder"]
  end
  PY --> AJ
```

## 2. Module map

```mermaid
flowchart TD
  MAIN["main.js<br/>entry, wires everything"]

  MAIN --> MAP["map.js<br/>Leaflet map, last view"]
  MAIN --> THEME["theme.js<br/>Auto / Dark / Light"]
  MAIN --> LEG["altitude.js<br/>colour scale + legend"]
  MAIN --> TRAFFIC["traffic.js<br/>poll 12 s, viewport circle,<br/>pause when hidden"]
  MAIN --> LAYER["aircraft-layer.js<br/>markers by hex, clusters,<br/>emergencies, selection"]
  MAIN --> ALERTS["alerts.js<br/>7500/7600/7700 chips"]
  MAIN --> SHARE["share.js<br/>?flight= links"]
  MAIN --> REFRESH["refresh.js<br/>refresh button, 'Updated Xs ago'"]
  MAIN --> LAYERS["layers.js<br/>radar, day/night"]
  MAIN --> SEARCH["search.js<br/>flights + airports"]
  MAIN --> APL["airport-layer.js<br/>airport dots"]
  MAIN --> ACP["aircraft-panel.js"]
  MAIN --> ARP["airport-panel.js"]

  LAYER --> GLIDE["glide.js<br/>smooth movement"]
  LAYER --> ICON["plane-icon.js"]
  SEARCH --> AIRL["airlines.js<br/>IATA ↔ ICAO"]

  ACP --> TRACK["track.js<br/>history + dashed great circle"]
  ACP --> PB["progress-bar.js → progress.js<br/>flown / remaining / ETA"]
  ACP --> FT["flight-times.js<br/>scheduled vs actual"]
  ACP --> METAR["metar.js<br/>decode + flight category"]
  ACP --> FC["forecast.js"]
  ACP --> ATC["atc.js<br/>LiveATC links"]

  ARP --> ATR["airport-traffic.js<br/>derived departures / arrivals"]
  ARP --> METAR
  ARP --> TR["transport.js<br/>stops + departures"]
  ARP --> CAM["webcams.js"]
  ARP --> LT["localtime.js"]
  ARP --> ATC

  ACP & ARP --> PANEL["panel.js<br/>shared side panel / bottom sheet"]
  TRAFFIC & SEARCH & REFRESH --> STATUS["status.js<br/>messages under search bar"]

  TRAFFIC & SEARCH & ACP & ARP & TRACK & LAYERS & CAM & ATR --> API["api.js"]
```

## 3. Live-position loop

```mermaid
sequenceDiagram
  participant M as Map (map.js)
  participant T as traffic.js
  participant A as api.js
  participant W as Worker
  participant L as aircraft-layer.js
  participant P as aircraft-panel.js

  loop every 12 s (stops while page hidden)
    M->>T: map moved (400 ms debounce) / timer
    T->>A: fetchAircraft(centre, radius ≤ 250 nm)
    A->>W: adsb.fi → adsb.lol → airplanes.live → OpenSky<br/>(failing source skipped 1–10 min)
    W-->>A: positions
    A-->>T: normalised aircraft list
    T->>L: update(aircraft)
    L->>L: move markers, altitude colours,<br/>cluster below zoom 8, emergencies red
    L-->>P: onSelectedUpdate (selected aircraft)
  end
  Note over T,A: selected aircraft outside view → fetchTrackedAircraft(hex)<br/>no data 45 s → "Signal lost"
```

## 4. Opening an aircraft

```mermaid
flowchart LR
  TAP["Tap aircraft / search result /<br/>?flight= link / airport list row"] --> SEL["layer.select(hex)"]
  SEL --> OPEN["aircraft-panel.open(ac)"]
  OPEN --> R["adsbdb: route<br/>origin → destination"]
  OPEN --> I["adsbdb: aircraft<br/>+ Planespotters photo"]
  OPEN --> TT["Worker /flighttimes<br/>scheduled vs actual"]
  OPEN --> TRC["Worker /adsbtrace<br/>track since take-off"]
  R --> WX["Worker /awc METAR +<br/>Open-Meteo forecast<br/>at destination"]
  R & TT & TRC --> PROG["progress bar<br/>(updated each poll)"]
```

## 5. Opening an airport

```mermaid
flowchart LR
  PICK["Search result or<br/>airport dot"] --> AP["airport-panel.open(airport)"]
  AP --> H["Header: name, codes, elevation,<br/>runways, local time, LiveATC"]
  AP --> DEP["Departures / Arrivals<br/>250 nm fetch + adsbdb routes<br/>(max 60, 4 at a time), every 60 s"]
  AP --> WTH["Weather<br/>METAR decoded + TAF"]
  AP --> TRN["Transport<br/>Overpass stops + Worker /transit"]
  AP --> CAMS["Cameras<br/>Worker /webcams (Windy)"]
  DEP -- tap flight --> ACP["aircraft panel"]
```

## Caching summary

| What | Where | How long |
|---|---|---|
| App files | `sw.js` | network-first, cache as offline fallback |
| Route, aircraft, photo | `api.js` | session |
| METAR / TAF | `api.js` | 5 min |
| Forecast, flight times | `api.js` (+ Worker KV for times) | 15 min |
| Transit departures | `api.js` / Worker | 60 s / 2 min |
| Webcams | `api.js` | 10 min |
| Last map view, theme | `localStorage` | permanent |
