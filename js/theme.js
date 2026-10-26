// Dark map: follows the system by default; the toggle cycles Auto → Dark → Light.
/* global L */
import { load, save } from './storage.js';

const MODES = ['auto', 'dark', 'light'];
const LABELS = { auto: 'Auto', dark: 'Dark', light: 'Light' };

function apply(mode) {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}

export function initTheme(map) {
  let mode = MODES.includes(load('theme')) ? load('theme') : 'auto';
  apply(mode);

  const control = L.control({ position: 'bottomright' });
  control.onAdd = () => {
    const btn = L.DomUtil.create('button', 'theme-toggle leaflet-bar');
    btn.type = 'button';
    btn.title = 'Map theme';
    btn.textContent = LABELS[mode];
    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener('click', () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      apply(mode);
      save('theme', mode);
      btn.textContent = LABELS[mode];
    });
    return btn;
  };
  control.addTo(map);
}
