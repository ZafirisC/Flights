// Fetches aircraft for the visible map area and keeps them fresh.
// Polls every POLL_MS, refetches after the map moves, pauses while the page is hidden.
/* global L */
import { fetchAircraft, fetchTrackedAircraft, MAX_RADIUS_NM } from './api.js';
import { showStatus, clearStatus } from './status.js';

const POLL_MS = 12000;
const MOVE_DEBOUNCE_MS = 400;
const NM_PER_M = 1 / 1852;

export function startTraffic(map, layer) {
  let timer = null;
  let moveTimer = null;
  let requestId = 0;
  let shown = ''; // status message this module set
  let lastOk = null; // time of the last successful fetch

  function setStatus(text) {
    if (text) showStatus(text);
    else if (shown) clearStatus(shown);
    shown = text;
  }

  // Circle from the map centre to its farthest corner, capped at the source limit.
  function viewport() {
    const c = map.getCenter();
    const b = map.getBounds();
    const r = Math.max(
      c.distanceTo(b.getNorthEast()), c.distanceTo(b.getSouthWest()),
      c.distanceTo(b.getNorthWest()), c.distanceTo(b.getSouthEast()),
    ) * NM_PER_M;
    return { lat: c.lat, lon: L.Util.wrapNum(c.lng, [-180, 180], true), radius: r };
  }

  async function refresh() {
    const id = ++requestId;
    const v = viewport();
    try {
      const aircraft = await fetchAircraft(v.lat, v.lon, v.radius);
      if (id !== requestId) return; // a newer request is under way
      layer.update(aircraft);
      lastOk = Date.now();
      setStatus(v.radius > MAX_RADIUS_NM ? `Zoomed out: showing aircraft within ${MAX_RADIUS_NM} nm of the map centre` : '');
      await trackSelected(id);
    } catch (err) {
      if (id !== requestId) return;
      setStatus(`Live data unavailable (${err.message || 'network error'}). Retrying…`);
    }
  }

  // The selected aircraft may be outside the fetched area: look it up directly so its panel keeps updating.
  async function trackSelected(id) {
    const ac = layer.selectedMissing();
    if (!ac) return;
    try {
      const found = await fetchTrackedAircraft(ac);
      if (found && id === requestId) layer.updateSelected(found);
    } catch { /* the panel shows "Signal lost" if this keeps failing */ }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => { await refresh(); if (!document.hidden) schedule(); }, POLL_MS);
  }

  function refreshNow() {
    refresh();
    schedule();
  }

  map.on('moveend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(refreshNow, MOVE_DEBOUNCE_MS);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      clearTimeout(moveTimer);
      requestId++; // ignore any response that lands while hidden
    } else {
      refreshNow();
    }
  });

  refreshNow();
  return { refreshNow, lastOk: () => lastOk };
}
