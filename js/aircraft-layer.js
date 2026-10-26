// Draws aircraft markers on the map and updates them in place by hex.
// Normal aircraft are clustered at low zoom; emergencies and the selected aircraft are never clustered.
/* global L */
import { altitudeColor } from './altitude.js';

const PLANE_PATH = 'M12 2c.8 0 1.3.8 1.3 1.8V9l7.7 4.6v2l-7.7-2.3v4.9l2.2 1.7v1.6L12 20.6l-3.5.9v-1.6l2.2-1.7v-4.9L3 15.6v-2L10.7 9V3.8C10.7 2.8 11.2 2 12 2z';
const EMERGENCY_COLOR = '#d32f2f';
const EMERGENCIES = { 7500: 'Hijack', 7600: 'Radio failure', 7700: 'Emergency' };

export const emergencyOf = (ac) => EMERGENCIES[ac.squawk] || null;

function iconFor(ac, selected) {
  const emergency = !!emergencyOf(ac);
  const color = emergency ? EMERGENCY_COLOR : altitudeColor(ac.alt, ac.onGround);
  const rot = Math.round(ac.track ?? 0);
  const size = emergency ? 32 : 26;
  return {
    key: `${color}|${rot}|${selected}`,
    icon: L.divIcon({
      className: `ac-icon${emergency ? ' ac-emergency' : ''}${selected ? ' ac-selected' : ''}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform: rotate(${rot}deg)">
        <path d="${PLANE_PATH}" fill="${color}" stroke="#1a1a1a" stroke-width="0.8"/></svg>`,
    }),
  };
}

// onSelect(ac | null) fires when the selection changes; onSelectedUpdate(ac) on each fetch while selected.
export function createAircraftLayer(map, { onUpdate, onSelect, onSelectedUpdate } = {}) {
  const cluster = L.markerClusterGroup({
    disableClusteringAtZoom: 8,
    maxClusterRadius: 50,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: false,
  });
  const pinned = L.layerGroup(); // never clustered
  map.addLayer(cluster);
  map.addLayer(pinned);

  const markers = new Map(); // hex → { marker, key, pinned }
  let selectedHex = null;
  let pendingHex = null; // select() called before the aircraft was loaded

  const wantsPin = (ac) => !!emergencyOf(ac) || ac.hex === selectedHex;

  function create(ac) {
    const { key, icon } = iconFor(ac, ac.hex === selectedHex);
    const marker = L.marker([ac.lat, ac.lon], {
      icon, keyboard: false, title: ac.callsign || ac.hex, zIndexOffset: wantsPin(ac) ? 1000 : 0,
    });
    marker.aircraft = ac;
    marker.on('click', () => select(ac.hex));
    return { marker, key, pinned: wantsPin(ac) };
  }

  // Applies icon, z-order and layer (cluster or pinned) for one aircraft.
  // Cluster moves are collected so markercluster can do them in bulk (remove → move → add).
  function place(entry, ac, batch) {
    const { marker } = entry;
    marker.aircraft = ac;
    const { key, icon } = iconFor(ac, ac.hex === selectedHex);
    if (entry.key !== key) { marker.setIcon(icon); entry.key = key; }
    const pin = wantsPin(ac);
    marker.setZIndexOffset(pin ? 1000 : 0);
    if (entry.pinned) pinned.removeLayer(marker);
    else batch.out.push(marker);
    batch.moves.push([marker, ac]);
    if (pin) batch.pin.push(marker);
    else batch.in.push(marker);
    entry.pinned = pin;
  }

  function apply(batch) {
    cluster.removeLayers(batch.out);
    for (const [marker, ac] of batch.moves) marker.setLatLng([ac.lat, ac.lon]);
    cluster.addLayers(batch.in);
    for (const m of batch.pin) pinned.addLayer(m);
  }

  const newBatch = () => ({ out: [], in: [], pin: [], moves: [] });

  function update(aircraft) {
    const seen = new Set();
    const batch = newBatch();
    for (const ac of aircraft) {
      seen.add(ac.hex);
      let entry = markers.get(ac.hex);
      if (!entry) {
        entry = create(ac);
        markers.set(ac.hex, entry);
        (entry.pinned ? batch.pin : batch.in).push(entry.marker);
      } else if (entry.pinned && wantsPin(ac)) {
        entry.marker.aircraft = ac;
        const { key, icon } = iconFor(ac, ac.hex === selectedHex);
        if (entry.key !== key) { entry.marker.setIcon(icon); entry.key = key; }
        entry.marker.setLatLng([ac.lat, ac.lon]);
      } else {
        place(entry, ac, batch);
      }
    }
    for (const [hex, entry] of markers) {
      if (seen.has(hex)) continue;
      if (entry.pinned) pinned.removeLayer(entry.marker);
      else batch.out.push(entry.marker);
      markers.delete(hex);
    }
    apply(batch);

    if (pendingHex && markers.has(pendingHex)) select(pendingHex);
    if (selectedHex && markers.has(selectedHex)) onSelectedUpdate?.(markers.get(selectedHex).marker.aircraft);
    onUpdate?.(aircraft);
  }

  function restyle(hex) {
    const entry = markers.get(hex);
    if (!entry) return;
    const batch = newBatch();
    place(entry, entry.marker.aircraft, batch);
    apply(batch);
  }

  // Select an aircraft (or null): highlights it, keeps it out of clusters and tells onSelect.
  function select(hex) {
    if (hex && !markers.has(hex)) { pendingHex = hex; return; }
    pendingHex = null;
    if (hex === selectedHex) return;
    const previous = selectedHex;
    selectedHex = hex;
    if (previous) restyle(previous);
    if (hex) {
      restyle(hex);
      const latlng = markers.get(hex).marker.getLatLng();
      if (!map.getBounds().contains(latlng)) map.panTo(latlng);
    }
    onSelect?.(hex ? markers.get(hex).marker.aircraft : null);
  }

  // Centre the map on an aircraft and select it (now, or once the next fetch loads it).
  function focus(ac) {
    map.setView([ac.lat, ac.lon], Math.max(map.getZoom(), 9));
    select(ac.hex);
  }

  const list = () => [...markers.values()].map((e) => e.marker.aircraft);

  return { update, select, focus, list, count: () => markers.size };
}
