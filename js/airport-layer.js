// Airports on the map: large airports at every zoom, medium ones when zoomed in. Tap opens the airport panel.
/* global L */
import { fetchAirports } from './api.js';

const MEDIUM_FROM_ZOOM = 8;
const PANE = 'airports'; // below the aircraft markers

export function initAirportLayer(map, { onSelect } = {}) {
  map.createPane(PANE).style.zIndex = 450;
  const renderer = L.canvas({ pane: PANE, padding: 0.3 });
  const group = L.layerGroup().addTo(map);
  let list = null; // large / medium airports with an IATA code
  const dots = new Map(); // key → circleMarker

  const keyOf = (a) => a.icao || a.iata;

  function dot(a) {
    const large = a.type === 'large';
    const m = L.circleMarker([a.lat, a.lon], {
      renderer, pane: PANE, radius: large ? 6 : 5, weight: 2, color: '#37474f', fillColor: '#ffffff', fillOpacity: 0.95,
      bubblingMouseEvents: false, // a tap on an airport must not count as a map click (that closes panels)
    });
    m.bindTooltip(`${a.iata || a.icao} · ${a.name}`, { direction: 'top', offset: [0, -6] });
    m.on('click', () => onSelect?.(a));
    return m;
  }

  function refresh() {
    if (!list) return;
    const zoom = map.getZoom();
    const bounds = map.getBounds().pad(0.2);
    const wanted = new Set();
    for (const a of list) {
      if (a.type !== 'large' && zoom < MEDIUM_FROM_ZOOM) continue;
      if (!bounds.contains([a.lat, a.lon])) continue;
      const k = keyOf(a);
      wanted.add(k);
      if (!dots.has(k)) { const m = dot(a); dots.set(k, m); group.addLayer(m); }
    }
    for (const [k, m] of dots) {
      if (wanted.has(k)) continue;
      group.removeLayer(m);
      dots.delete(k);
    }
  }

  fetchAirports()
    .then((all) => {
      list = all.filter((a) => (a.type === 'large' || a.type === 'medium') && a.iata && keyOf(a));
      refresh();
    })
    .catch(() => { /* search shows its own message; the map works without airport dots */ });
  map.on('moveend zoomend', refresh);
}
