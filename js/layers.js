// Optional map layers (off by default to save mobile data): precipitation radar and day/night.
// Radar: RainViewer (free, no key). Day/night: the terminator is computed here, no library.
/* global L */
import { fetchRadarFrame } from './api.js';
import { flashStatus } from './status.js';

const RADAR_REFRESH_MS = 10 * 60000;
const NIGHT_REFRESH_MS = 60000;
const RAD = Math.PI / 180;

// Sun's declination and the longitude where it is overhead (degrees), good to about 0.1°.
export function sunPosition(date) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const L0 = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L0 + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  const gmst = 280.46061837 + 360.98564736629 * n;
  const lon = ((((ra - gmst) % 360) + 540) % 360) - 180;
  return { dec, lon };
}

// Night-side polygon: terminator latitude for each longitude, closed over the pole that is in darkness.
export function nightPolygon(date) {
  const { dec, lon } = sunPosition(date);
  const d = (Math.abs(dec) < 0.01 ? 0.01 : dec) * RAD;
  const pts = [];
  for (let l = -180; l <= 180; l += 3) pts.push([Math.atan(-Math.cos((l - lon) * RAD) / Math.tan(d)) / RAD, l]);
  const pole = dec > 0 ? -90 : 90;
  return [...pts, [pole, 180], [pole, -180]];
}

export function initLayers(map) {
  let radar = null;
  let radarTimer = null;
  let night = null;
  let nightTimer = null;

  async function loadRadar() {
    try {
      const frame = await fetchRadarFrame();
      if (!radar) return; // switched off meanwhile
      if (!frame) { flashStatus('Radar unavailable'); return; }
      radar.layer?.remove();
      radar.layer = L.tileLayer(frame.tiles, {
        opacity: 0.6, maxNativeZoom: 7, maxZoom: 18, zIndex: 300,
        attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
      }).addTo(map);
    } catch {
      if (radar) flashStatus('Radar unavailable');
    }
  }

  function setRadar(on) {
    clearInterval(radarTimer);
    if (!on) { radar?.layer?.remove(); radar = null; return; }
    radar = {};
    loadRadar();
    radarTimer = setInterval(() => { if (!document.hidden) loadRadar(); }, RADAR_REFRESH_MS);
  }

  function setNight(on) {
    clearInterval(nightTimer);
    if (!on) { night?.remove(); night = null; return; }
    const draw = () => {
      const poly = nightPolygon(new Date());
      if (night) night.setLatLngs(poly);
      else night = L.polygon(poly, { stroke: false, fillColor: '#0b1b3a', fillOpacity: 0.3, interactive: false, noClip: true }).addTo(map);
    };
    draw();
    nightTimer = setInterval(draw, NIGHT_REFRESH_MS);
  }

  const control = L.control({ position: 'bottomright' });
  control.onAdd = () => {
    const box = L.DomUtil.create('div', 'layers-ctl leaflet-bar');
    box.innerHTML = `
      <button type="button" class="layers-btn" aria-expanded="false" title="Map layers">Layers</button>
      <div class="layers-menu" hidden>
        <label><input type="checkbox" data-layer="radar" /> Weather radar</label>
        <label><input type="checkbox" data-layer="night" /> Day / night</label>
      </div>`;
    L.DomEvent.disableClickPropagation(box);
    const btn = box.querySelector('.layers-btn');
    const menu = box.querySelector('.layers-menu');
    btn.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    box.addEventListener('change', (e) => {
      const { layer } = e.target.dataset;
      if (layer === 'radar') setRadar(e.target.checked);
      if (layer === 'night') setNight(e.target.checked);
    });
    return box;
  };
  control.addTo(map);
}
