// UI style ("skin"): Classic plus three alternative looks (css/skin-*.css). The toggle cycles through them.
// A skin only restyles the chrome (search, panel, controls); the map's light/dark stays with js/theme.js.
/* global L */
import { load, save } from './storage.js';

const SKINS = ['classic', 'glass', 'cockpit', 'ticket'];
const LABELS = { classic: 'Classic', glass: 'Glass', cockpit: 'Cockpit', ticket: 'Ticket' };

function apply(skin) {
  if (skin === 'classic') delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
}

export function initSkin(map) {
  let skin = SKINS.includes(load('skin')) ? load('skin') : 'classic';
  apply(skin);

  const control = L.control({ position: 'bottomright' });
  control.onAdd = () => {
    const btn = L.DomUtil.create('button', 'theme-toggle skin-toggle leaflet-bar');
    btn.type = 'button';
    btn.title = 'App style';
    btn.textContent = `Style: ${LABELS[skin]}`;
    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener('click', () => {
      skin = SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length];
      apply(skin);
      save('skin', skin);
      btn.textContent = `Style: ${LABELS[skin]}`;
    });
    return btn;
  };
  control.addTo(map);
}
