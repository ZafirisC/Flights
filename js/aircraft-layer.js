// Draws aircraft markers on the map and updates them in place by hex.
// Normal aircraft are clustered at low zoom; emergencies and the selected aircraft are never clustered.
/* global L */
import { altitudeColor } from './altitude.js';
import { aircraftIcon, SHADOW_PAD } from './aircraft-icon.js';
import { sunPosition } from './sun.js';
import { startGlide } from './glide.js';

const LOST_MS = 45000; // selected aircraft not received for this long → "Signal lost"
const EMERGENCY_COLOR = '#d32f2f';
const EMERGENCIES = { 7500: 'Hijack', 7600: 'Radio failure', 7700: 'Emergency' };

export const emergencyOf = (ac) => EMERGENCIES[ac.squawk] || null;

// Sun at the aircraft, rounded so icons are rebuilt only every few minutes as the sun moves.
function sunAt(ac) {
  const s = sunPosition(ac.lat, ac.lon, Date.now());
  return { az: Math.round(s.az / 5) * 5, el: Math.round(s.elev / 2) * 2 };
}

function iconKey(ac, selected, sun) {
  const color = emergencyOf(ac) ? EMERGENCY_COLOR : altitudeColor(ac.alt, ac.onGround);
  return `${color}|${Math.round(ac.track ?? 0)}|${selected}|${ac.type}|${ac.category}|${sun.az}|${sun.el}`;
}

function makeIcon(ac, selected, sun) {
  const emergency = !!emergencyOf(ac);
  const color = emergency ? EMERGENCY_COLOR : altitudeColor(ac.alt, ac.onGround);
  const { html, size } = aircraftIcon({
    type: ac.type, category: ac.category, color, track: ac.track, alt: ac.alt, onGround: ac.onGround, sun,
    scale: emergency ? 1.2 : 1,
  });
  return L.divIcon({
    className: `ac-icon${emergency ? ' ac-emergency' : ''}${selected ? ' ac-selected' : ''}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    // .ac-glide: js/glide.js. The SVG overflows the marker box by SHADOW_PAD for the shadow; only the box is clickable.
    html: `<div class="ac-glide" style="--ac-pad:${SHADOW_PAD}px">${html}</div>`,
  });
}

// Sets a new icon only when its look changed (building divIcons for every aircraft on every poll is wasted work).
function refreshIcon(entry, ac, selected) {
  const sun = sunAt(ac);
  const key = iconKey(ac, selected, sun);
  if (entry.key !== key) { entry.marker.setIcon(makeIcon(ac, selected, sun)); entry.key = key; }
}

const samePos = (marker, ac) => {
  const p = marker.getLatLng();
  return p.lat === ac.lat && p.lng === ac.lon;
};

// onSelect(ac | null) fires when the selection changes; onSelectedUpdate(ac, { lost }) on each fetch while selected.
// The selected aircraft stays on the map (and in the panel) even when a fetch no longer contains it.
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

  startGlide(map, () => markers.values());

  const wantsPin = (ac) => !!emergencyOf(ac) || ac.hex === selectedHex;

  function create(ac) {
    const selected = ac.hex === selectedHex;
    const sun = sunAt(ac);
    const marker = L.marker([ac.lat, ac.lon], {
      icon: makeIcon(ac, selected, sun), keyboard: false, title: ac.callsign || ac.hex, zIndexOffset: wantsPin(ac) ? 1000 : 0,
    });
    marker.aircraft = ac;
    marker.on('click', () => select(ac.hex));
    return { marker, key: iconKey(ac, selected, sun), pinned: wantsPin(ac), seenAt: Date.now(), missing: false };
  }

  // Applies icon, z-order and layer (cluster or pinned) for one aircraft.
  // Cluster moves are collected so markercluster can do them in bulk (remove → move → add).
  function place(entry, ac, batch) {
    const { marker } = entry;
    marker.aircraft = ac;
    refreshIcon(entry, ac, ac.hex === selectedHex);
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
      if (entry) { entry.seenAt = Date.now(); entry.missing = false; }
      if (!entry) {
        entry = create(ac);
        markers.set(ac.hex, entry);
        (entry.pinned ? batch.pin : batch.in).push(entry.marker);
      } else if (entry.pinned && wantsPin(ac)) {
        entry.marker.aircraft = ac;
        refreshIcon(entry, ac, ac.hex === selectedHex);
        entry.marker.setLatLng([ac.lat, ac.lon]);
      } else if (!entry.pinned && !wantsPin(ac) && samePos(entry.marker, ac)) {
        // Stays in the cluster and has not moved: no need to take it out and put it back.
        entry.marker.aircraft = ac;
        refreshIcon(entry, ac, false);
      } else {
        place(entry, ac, batch);
      }
    }
    for (const [hex, entry] of markers) {
      if (seen.has(hex)) continue;
      if (hex === selectedHex) { entry.missing = true; continue; } // keep the selection alive
      if (entry.pinned) pinned.removeLayer(entry.marker);
      else batch.out.push(entry.marker);
      markers.delete(hex);
    }
    apply(batch);

    if (pendingHex && markers.has(pendingHex)) select(pendingHex);
    reportSelected();
    onUpdate?.(aircraft);
  }

  function reportSelected() {
    const entry = selectedHex && markers.get(selectedHex);
    if (entry) onSelectedUpdate?.(entry.marker.aircraft, { lost: Date.now() - entry.seenAt > LOST_MS });
  }

  // Selected aircraft that the last area fetch did not contain (moved out of view): the caller can look it up directly.
  const selectedMissing = () => {
    const entry = selectedHex && markers.get(selectedHex);
    return entry?.missing ? entry.marker.aircraft : null;
  };

  // A position for the selected aircraft that came from a direct lookup.
  function updateSelected(ac) {
    const entry = ac.hex === selectedHex && markers.get(ac.hex);
    if (!entry) return;
    entry.seenAt = Date.now();
    entry.marker.aircraft = ac;
    refreshIcon(entry, ac, true);
    entry.marker.setLatLng([ac.lat, ac.lon]);
    reportSelected();
  }

  // Drop every marker and rebuild from the next fetch; the selected aircraft is kept.
  function reset() {
    const keep = selectedHex && markers.get(selectedHex)?.marker.aircraft;
    cluster.clearLayers();
    pinned.clearLayers();
    markers.clear();
    if (keep) {
      const entry = create(keep);
      entry.missing = true;
      markers.set(keep.hex, entry);
      pinned.addLayer(entry.marker);
    }
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
    if (previous) {
      const old = markers.get(previous);
      if (old?.missing) { pinned.removeLayer(old.marker); markers.delete(previous); } // it had left the data
      else restyle(previous);
    }
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

  return { update, select, focus, list, selectedHex: () => selectedHex, selectedMissing, updateSelected, reset, count: () => markers.size };
}
