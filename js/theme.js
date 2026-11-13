// Light (default) / dark mode. One button switches the whole app and the map; the choice is saved.
/* global L */
import { load, save } from './storage.js';

const BAR_COLORS = { light: '#fffaf3', dark: '#1d1916' };
const BUTTON = { light: '☾ Dark', dark: '☀ Light' }; // shows what a tap switches to

function apply(mode) {
  if (mode === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  // Browser / iOS status bar colour.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => { meta.content = BAR_COLORS[mode]; });
}

export function initTheme(map) {
  let mode = load('theme') === 'dark' ? 'dark' : 'light'; // older saved 'auto' / 'light' → light
  apply(mode);

  const control = L.control({ position: 'bottomright' });
  control.onAdd = () => {
    const btn = L.DomUtil.create('button', 'theme-toggle leaflet-bar');
    btn.type = 'button';
    const label = () => {
      btn.textContent = BUTTON[mode];
      btn.title = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      btn.setAttribute('aria-pressed', String(mode === 'dark'));
    };
    label();
    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener('click', () => {
      mode = mode === 'dark' ? 'light' : 'dark';
      apply(mode);
      save('theme', mode);
      label();
    });
    return btn;
  };
  control.addTo(map);
}
