// Entry point: wires the modules together.
import { initMap } from './map.js';
import { initSearch } from './search.js';
import { showStatus } from './status.js';
import { addAltitudeLegend } from './altitude.js';
import { createAircraftLayer } from './aircraft-layer.js';
import { startTraffic } from './traffic.js';

if (typeof L === 'undefined') {
  showStatus('Map library failed to load. Check your connection and reload.');
} else {
  const map = initMap('map');
  addAltitudeLegend(map);
  startTraffic(map, createAircraftLayer(map));
  initSearch(document.getElementById('search'), map);
}
