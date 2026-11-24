// Trip line of the selected aircraft: soft band for the planned great circle origin → destination, the flown track
// on top in altitude colours, and a dotted great circle from the aircraft on to the destination.
// History comes from adsb.lol traces; without it the track starts when the panel was opened.
/* global L */
import { fetchTrace } from './api.js';
import { altitudeColor } from './altitude.js';

const GAP_S = 45 * 60; // a longer silence means a different flight
const COLOR = '#1565c0';
const BAND_COLOR = '#90b4dd';
const ALT_STEP = 1000; // ft; neighbouring points in the same step share one polyline

// tar1090 trace → points of the current flight only: [[lat, lon, alt], ...] (null when empty).
// alt is feet, 'ground' or null.
export function currentFlight(trace) {
  const rows = trace?.trace || [];
  let start = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] - rows[i - 1][0] > GAP_S) start = i; // long silence: a different flight
    else if (rows[i - 1][3] === 'ground' && rows[i][3] !== 'ground') start = i - 1; // take-off
  }
  const pts = rows.slice(start).filter((r) => typeof r[1] === 'number' && typeof r[2] === 'number').map((r) => [r[1], r[2], r[3] ?? null]);
  return pts.length ? pts : null;
}

// Intermediate points of the great circle a → b, longitudes unwrapped so the line never jumps across the map.
export function greatCircle(a, b, steps = 48) {
  const rad = Math.PI / 180;
  const [la1, lo1, la2, lo2] = [a[0] * rad, a[1] * rad, b[0] * rad, b[1] * rad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (!d) return [a, b];
  const out = [];
  let prevLon = a[1];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    let lon = Math.atan2(y, x) / rad;
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    prevLon = lon;
    out.push([Math.atan2(z, Math.hypot(x, y)) / rad, lon]);
  }
  return out;
}

// Colour of one track point; also the key that decides when a new segment starts.
function pointColor(alt) {
  if (alt === 'ground') return altitudeColor(null, true);
  if (typeof alt !== 'number') return altitudeColor(null, false);
  return altitudeColor(Math.round(alt / ALT_STEP) * ALT_STEP, false);
}

const valid = (p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

export function createTrack(map) {
  const flown = L.layerGroup(); // one polyline per run of points with the same colour
  let band = null;
  let ahead = null;
  let points = []; // [[lat, lon, alt], ...]
  let seg = null; // last polyline in `flown`
  let segColor = null;
  let origin = null; // [lat, lon]
  let dest = null; // [lat, lon]
  let token = 0;

  function addPoint(p) {
    const color = pointColor(p[2]);
    const latlng = [p[0], p[1]];
    if (seg && color === segColor) { seg.addLatLng(latlng); return; }
    const prev = seg ? seg.getLatLngs().at(-1) : null;
    seg = L.polyline(prev ? [prev, latlng] : [latlng], { color, weight: 3, opacity: 0.9, interactive: false }).addTo(flown);
    segColor = color;
  }

  function redrawFlown() {
    flown.clearLayers();
    seg = segColor = null;
    points.forEach(addPoint);
  }

  function drawRoute() {
    if (origin && dest && points.length) {
      band ??= L.polyline([], { color: BAND_COLOR, weight: 12, opacity: 0.45, interactive: false }).addTo(map);
      band.setLatLngs(greatCircle(origin, dest, 64));
      band.bringToBack();
    } else if (band) { band.remove(); band = null; }
    const here = points[points.length - 1];
    if (dest && here) {
      ahead ??= L.polyline([], { color: COLOR, weight: 2, opacity: 0.9, dashArray: '2 6', interactive: false }).addTo(map);
      ahead.setLatLngs(greatCircle([here[0], here[1]], dest));
    } else if (ahead) { ahead.remove(); ahead = null; }
  }

  function clear() {
    token++;
    flown.clearLayers(); flown.remove();
    band?.remove(); ahead?.remove();
    band = ahead = seg = segColor = null;
    points = [];
    origin = dest = null;
  }

  async function start(ac) {
    clear();
    const t = token;
    flown.addTo(map);
    points = [[ac.lat, ac.lon, ac.onGround ? 'ground' : ac.alt]];
    redrawFlown();
    drawRoute();
    try {
      const history = currentFlight(await fetchTrace(ac.hex));
      if (t !== token || !history) return;
      points = [...history, ...points]; // history, then the positions received since the panel opened
      redrawFlown();
      drawRoute();
    } catch { /* no history: the track starts from now */ }
  }

  function extend(ac) {
    if (!map.hasLayer(flown)) return;
    const end = points[points.length - 1];
    if (!end || end[0] !== ac.lat || end[1] !== ac.lon) {
      const p = [ac.lat, ac.lon, ac.onGround ? 'ground' : ac.alt];
      points.push(p);
      addPoint(p);
    }
    drawRoute();
  }

  // Planned route; either end may be null (unknown).
  function setRoute(from, to) {
    origin = valid(from) ? from : null;
    dest = valid(to) ? to : null;
    drawRoute();
  }

  return { start, extend, setRoute, clear, points: () => points };
}
