// Draws aircraft markers on the map and updates them in place by hex.
/* global L */
import { altitudeColor } from './altitude.js';

const PLANE_PATH = 'M12 2c.8 0 1.3.8 1.3 1.8V9l7.7 4.6v2l-7.7-2.3v4.9l2.2 1.7v1.6L12 20.6l-3.5.9v-1.6l2.2-1.7v-4.9L3 15.6v-2L10.7 9V3.8C10.7 2.8 11.2 2 12 2z';

function iconFor(ac) {
  const color = altitudeColor(ac.alt, ac.onGround);
  const rot = Math.round(ac.track ?? 0);
  return {
    key: `${color}|${rot}`,
    icon: L.divIcon({
      className: 'ac-icon',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: `<svg viewBox="0 0 24 24" width="26" height="26" style="transform: rotate(${rot}deg)">
        <path d="${PLANE_PATH}" fill="${color}" stroke="#1a1a1a" stroke-width="0.8"/></svg>`,
    }),
  };
}

export function createAircraftLayer(map) {
  const layer = L.layerGroup().addTo(map);
  const markers = new Map(); // hex → { marker, key }

  function update(aircraft) {
    const seen = new Set();
    for (const ac of aircraft) {
      seen.add(ac.hex);
      const { key, icon } = iconFor(ac);
      const entry = markers.get(ac.hex);
      if (entry) {
        entry.marker.setLatLng([ac.lat, ac.lon]);
        if (entry.key !== key) { entry.marker.setIcon(icon); entry.key = key; }
        entry.marker.aircraft = ac;
      } else {
        const marker = L.marker([ac.lat, ac.lon], { icon, keyboard: false, title: ac.callsign || ac.hex });
        marker.aircraft = ac;
        marker.addTo(layer);
        markers.set(ac.hex, { marker, key });
      }
    }
    for (const [hex, entry] of markers) {
      if (!seen.has(hex)) { layer.removeLayer(entry.marker); markers.delete(hex); }
    }
  }

  return { update, count: () => markers.size };
}
