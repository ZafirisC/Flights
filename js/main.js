// Entry point: wires the modules together.
import { initMap } from './map.js';
import { initSearch } from './search.js';
import { showStatus } from './status.js';
import { addAltitudeLegend } from './altitude.js';
import { createAircraftLayer } from './aircraft-layer.js';
import { renderAlerts } from './alerts.js';
import { startTraffic } from './traffic.js';
import { initTheme } from './theme.js';
import { flightFromUrl, openSharedFlight, shareFlight } from './share.js';

if (typeof L === 'undefined' || !L.markerClusterGroup) {
  showStatus('Map library failed to load. Check your connection and reload.');
} else {
  start();
}

async function start() {
  const map = initMap('map');
  initTheme(map);
  addAltitudeLegend(map);
  const layer = createAircraftLayer(map, { onUpdate: (aircraft) => renderAlerts(aircraft, (hex) => layer.select(hex)) });

  map.getContainer().addEventListener('click', (e) => {
    const btn = e.target.closest('[data-share]');
    if (btn) shareFlight(btn.dataset.share);
  });

  const shared = flightFromUrl();
  if (shared) await openSharedFlight(map, layer, shared); // before polling, so the first fetch is at the flight
  startTraffic(map, layer);
  initSearch(document.getElementById('search'), map);
}
