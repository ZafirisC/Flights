// Flight track of the selected aircraft: history since take-off (solid) + dashed great circle to the destination.
// History comes from adsb.lol traces; without it the track starts when the panel was opened.
/* global L */
import { fetchTrace } from './api.js';

const GAP_S = 45 * 60; // a longer silence means a different flight
const COLOR = '#1565c0';

// tar1090 trace → points of the current flight only: [[lat, lon], ...] (null when empty).
export function currentFlight(trace) {
  const rows = trace?.trace || [];
  let start = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] - rows[i - 1][0] > GAP_S) start = i; // long silence: a different flight
    else if (rows[i - 1][3] === 'ground' && rows[i][3] !== 'ground') start = i - 1; // take-off
  }
  const pts = rows.slice(start).filter((r) => typeof r[1] === 'number' && typeof r[2] === 'number').map((r) => [r[1], r[2]]);
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

export function createTrack(map) {
  let line = null;
  let ahead = null;
  let points = [];
  let dest = null; // [lat, lon]
  let token = 0;

  function draw() {
    line?.setLatLngs(points);
    const here = points[points.length - 1];
    if (dest && here) {
      ahead ??= L.polyline([], { color: COLOR, weight: 2, opacity: 0.7, dashArray: '6 8', interactive: false }).addTo(map);
      ahead.setLatLngs(greatCircle(here, dest));
    } else if (ahead) { ahead.remove(); ahead = null; }
  }

  function clear() {
    token++;
    line?.remove(); ahead?.remove();
    line = ahead = null;
    points = [];
    dest = null;
  }

  async function start(ac) {
    clear();
    const t = token;
    points = [[ac.lat, ac.lon]];
    line = L.polyline(points, { color: COLOR, weight: 3, opacity: 0.8, interactive: false }).addTo(map);
    try {
      const history = currentFlight(await fetchTrace(ac.hex));
      if (t !== token || !history) return;
      points = [...history, ...points]; // history, then the positions received since the panel opened
      draw();
    } catch { /* no history: the track starts from now */ }
  }

  function extend(ac) {
    if (!line) return;
    const end = points[points.length - 1];
    if (!end || end[0] !== ac.lat || end[1] !== ac.lon) points.push([ac.lat, ac.lon]);
    draw();
  }

  function setDestination(latlon) {
    dest = latlon && Number.isFinite(latlon[0]) && Number.isFinite(latlon[1]) ? latlon : null;
    draw();
  }

  return { start, extend, setDestination, clear };
}
