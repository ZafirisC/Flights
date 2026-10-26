// Draws aircraft markers on the map and updates them in place by hex.
// Normal aircraft are clustered at low zoom; emergencies are never clustered and drawn on top.
/* global L */
import { altitudeColor } from './altitude.js';

const PLANE_PATH = 'M12 2c.8 0 1.3.8 1.3 1.8V9l7.7 4.6v2l-7.7-2.3v4.9l2.2 1.7v1.6L12 20.6l-3.5.9v-1.6l2.2-1.7v-4.9L3 15.6v-2L10.7 9V3.8C10.7 2.8 11.2 2 12 2z';
const EMERGENCY_COLOR = '#d32f2f';
const EMERGENCIES = { 7500: 'Hijack', 7600: 'Radio failure', 7700: 'Emergency' };

export const emergencyOf = (ac) => EMERGENCIES[ac.squawk] || null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function iconFor(ac) {
  const emergency = !!emergencyOf(ac);
  const color = emergency ? EMERGENCY_COLOR : altitudeColor(ac.alt, ac.onGround);
  const rot = Math.round(ac.track ?? 0);
  const size = emergency ? 32 : 26;
  return {
    key: `${color}|${rot}`,
    icon: L.divIcon({
      className: emergency ? 'ac-icon ac-emergency' : 'ac-icon',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform: rotate(${rot}deg)">
        <path d="${PLANE_PATH}" fill="${color}" stroke="#1a1a1a" stroke-width="0.8"/></svg>`,
    }),
  };
}

function popupHtml(ac) {
  const emg = emergencyOf(ac);
  const alt = ac.onGround ? 'Ground' : ac.alt !== null ? `${ac.alt.toLocaleString('en')} ft` : 'Not available';
  const gs = ac.gs !== null ? `${Math.round(ac.gs)} kt` : 'Not available';
  return `<div class="ac-popup">
    <b>${esc(ac.callsign || ac.hex.toUpperCase())}</b>
    ${emg ? `<div class="emg">${esc(ac.squawk)} · ${emg}</div>` : ''}
    <div>Altitude: ${alt}</div>
    <div>Speed: ${gs}</div>
    <div>Squawk: ${ac.squawk ? esc(ac.squawk) : 'Not available'}</div>
    ${ac.callsign ? `<button type="button" data-share="${esc(ac.callsign)}">Share link</button>` : ''}
  </div>`;
}

export function createAircraftLayer(map, { onUpdate } = {}) {
  const cluster = L.markerClusterGroup({
    disableClusteringAtZoom: 8,
    maxClusterRadius: 50,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: false,
  });
  const pinned = L.layerGroup(); // emergencies: never clustered
  map.addLayer(cluster);
  map.addLayer(pinned);

  const markers = new Map(); // hex → { marker, key, pinned }
  let openHex = null; // aircraft whose popup is open
  let pendingHex = null; // select() called before the aircraft was loaded

  function create(ac) {
    const { key, icon } = iconFor(ac);
    const marker = L.marker([ac.lat, ac.lon], {
      icon, keyboard: false, title: ac.callsign || ac.hex, zIndexOffset: emergencyOf(ac) ? 1000 : 0,
    });
    marker.aircraft = ac;
    marker.bindPopup(() => popupHtml(marker.aircraft), { autoPan: true });
    marker.on('popupopen', () => { openHex = ac.hex; });
    marker.on('popupclose', () => {
      if (openHex === ac.hex) openHex = null;
      // Its cluster position was frozen while the popup was open; re-insert to refresh it.
      // Deferred: the close may come from markercluster itself while it is redrawing.
      setTimeout(() => {
        const entry = markers.get(ac.hex);
        if (entry?.marker === marker && !entry.pinned && openHex !== ac.hex && cluster.hasLayer(marker)) {
          cluster.removeLayer(marker);
          cluster.addLayer(marker);
        }
      }, 0);
    });
    return { marker, key, pinned: !!emergencyOf(ac) };
  }

  function update(aircraft) {
    const seen = new Set();
    const clusterOut = [];
    const clusterIn = [];
    const moves = [];

    for (const ac of aircraft) {
      seen.add(ac.hex);
      const wantPinned = !!emergencyOf(ac);
      let entry = markers.get(ac.hex);
      if (!entry) {
        entry = create(ac);
        markers.set(ac.hex, entry);
        (entry.pinned ? pinned.addLayer(entry.marker) : clusterIn.push(entry.marker));
        continue;
      }
      const { marker } = entry;
      marker.aircraft = ac;
      const { key, icon } = iconFor(ac);
      if (entry.key !== key) { marker.setIcon(icon); entry.key = key; }
      marker.setZIndexOffset(wantPinned ? 1000 : 0);

      if (entry.pinned !== wantPinned) {
        (entry.pinned ? pinned.removeLayer(marker) : clusterOut.push(marker));
        moves.push([marker, ac]);
        (wantPinned ? pinned.addLayer(marker) : clusterIn.push(marker));
        entry.pinned = wantPinned;
      } else if (entry.pinned || ac.hex === openHex) {
        marker.setLatLng([ac.lat, ac.lon]); // not clustered, or keep its popup open
      } else {
        clusterOut.push(marker); // markercluster needs remove → move → add
        moves.push([marker, ac]);
        clusterIn.push(marker);
      }
      if (ac.hex === openHex) marker.setPopupContent(popupHtml(ac));
    }

    for (const [hex, entry] of markers) {
      if (seen.has(hex)) continue;
      (entry.pinned ? pinned.removeLayer(entry.marker) : clusterOut.push(entry.marker));
      markers.delete(hex);
    }

    cluster.removeLayers(clusterOut);
    for (const [marker, ac] of moves) marker.setLatLng([ac.lat, ac.lon]);
    cluster.addLayers(clusterIn);

    if (pendingHex && markers.has(pendingHex)) select(pendingHex);
    onUpdate?.(aircraft);
  }

  // Open an aircraft's popup, zooming out of its cluster if needed.
  function select(hex) {
    const entry = markers.get(hex);
    if (!entry) { pendingHex = hex; return; }
    pendingHex = null;
    const latlng = entry.marker.getLatLng();
    if (entry.pinned) { entry.marker.openPopup(); return; }
    // Bring it into view first; markercluster drops off-screen markers (and their popups) while panning.
    if (!map.getBounds().contains(latlng)) map.panTo(latlng, { animate: false });
    cluster.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
  }

  // Centre the map on an aircraft and open it (now, or once the next fetch loads it).
  function focus(ac) {
    map.setView([ac.lat, ac.lon], Math.max(map.getZoom(), 9));
    select(ac.hex);
  }

  const list = () => [...markers.values()].map((e) => e.marker.aircraft);

  return { update, select, focus, list, count: () => markers.size };
}
