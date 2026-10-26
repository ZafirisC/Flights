// Emergency chip under the search bar: squawk 7500 / 7600 / 7700, tap to show the aircraft.
import { emergencyOf } from './aircraft-layer.js';

export function renderAlerts(aircraft, onSelect) {
  const el = document.getElementById('alerts');
  const list = aircraft.filter(emergencyOf).sort((a, b) => a.squawk.localeCompare(b.squawk));
  el.replaceChildren(...list.map((ac) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `⚠ ${ac.squawk} ${emergencyOf(ac)} · ${ac.callsign || ac.hex.toUpperCase()}`;
    btn.addEventListener('click', () => onSelect(ac.hex));
    return btn;
  }));
  el.hidden = list.length === 0;
}
