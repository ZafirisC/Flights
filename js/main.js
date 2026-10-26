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
import { initAircraftPanel } from './aircraft-panel.js';
import { initAirportPanel } from './airport-panel.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* app works without it */ });
}

if (typeof L === 'undefined' || !L.markerClusterGroup) {
  showStatus('Map library failed to load. Check your connection and reload.');
} else {
  start();
}

async function start() {
  const map = initMap('map');
  initTheme(map);
  addAltitudeLegend(map);
  const panel = initAircraftPanel(map, { onClose: () => layer.select(null) });
  const layer = createAircraftLayer(map, {
    onUpdate: (aircraft) => renderAlerts(aircraft, (hex) => layer.select(hex)),
    onSelect: (ac) => (ac ? panel.open(ac) : panel.close({ silent: true })),
    onSelectedUpdate: (ac) => panel.update(ac),
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-share]');
    if (btn) shareFlight(btn.dataset.share);
  });

  const shared = flightFromUrl();
  if (shared) await openSharedFlight(layer, shared); // before polling, so the first fetch is at the flight
  startTraffic(map, layer);
  const airportPanel = initAirportPanel(map, layer);
  initSearch(document.getElementById('search'), map, layer, { onAirport: (a) => airportPanel.open(a) });
}
