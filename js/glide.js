// Smooth aircraft movement between polls: each visible aircraft is moved forward from its last fix using its own
// ground speed and track, so planes glide instead of jumping every 12 s.
// The marker's LatLng stays the real fix (moving it would make markercluster re-cluster on every frame); only the
// icon's inner wrapper (.ac-glide) is shifted by a few pixels.
const MIN_ZOOM = 7; // zoomed further out, movement is too small to see: no work at all
const FRAME_MS = 33; // ~30 fps is smooth at these speeds and half the work of 60
const MAX_AHEAD_S = 60; // do not extrapolate an old fix further than this
const RAD = Math.PI / 180;

// Where the aircraft is `ageS` seconds after its fix (dead reckoning, flat-earth over these short distances).
// [lat, lon], or null when it is not moving or has no track.
export function predict(ac, ageS) {
  if (!(ac.gs > 0) || typeof ac.track !== 'number' || !(ageS > 0)) return null;
  const nm = (ac.gs * Math.min(ageS, MAX_AHEAD_S)) / 3600;
  const dLat = (nm * Math.cos(ac.track * RAD)) / 60;
  const dLon = (nm * Math.sin(ac.track * RAD)) / (60 * Math.max(0.01, Math.cos(ac.lat * RAD)));
  return [ac.lat + dLat, ac.lon + dLon];
}

// entries() → iterable of { marker, seenAt } (seenAt = when the fix was received, ms). marker.aircraft holds the fix.
export function startGlide(map, entries) {
  let last = 0;
  let zooming = false;
  let active = map.getZoom() >= MIN_ZOOM;
  const shifted = new WeakMap(); // wrapper element → transform last written

  function shift(el, value) {
    if (shifted.get(el) === value) return;
    el.style.transform = value;
    shifted.set(el, value);
  }

  function resetAll() {
    for (const { marker } of entries()) {
      const el = marker.getElement()?.firstElementChild;
      if (el) shift(el, '');
    }
  }

  map.on('zoomstart', () => { zooming = true; });
  map.on('zoomend', () => {
    zooming = false;
    active = map.getZoom() >= MIN_ZOOM;
    if (!active) resetAll();
  });

  function frame(now) {
    requestAnimationFrame(frame); // the browser pauses this while the page is hidden
    if (!active || zooming || now - last < FRAME_MS) return;
    last = now;
    const wall = Date.now();
    for (const { marker, seenAt } of entries()) {
      const el = marker.getElement()?.firstElementChild; // null while the aircraft is inside a cluster
      if (!el) continue;
      const ac = marker.aircraft;
      const to = predict(ac, (wall - seenAt) / 1000 + (ac.seen ?? 0));
      if (!to) { shift(el, ''); continue; }
      const a = map.latLngToLayerPoint(marker.getLatLng());
      const b = map.latLngToLayerPoint(to);
      shift(el, `translate(${(b.x - a.x).toFixed(1)}px, ${(b.y - a.y).toFixed(1)}px)`);
    }
  }
  requestAnimationFrame(frame);
}
