// Altitude colour scale (ground → FL400) and its legend.
/* global L */
const MAX_FT = 40000;
export const GROUND_COLOR = '#8a8a8a';

export function altitudeColor(altFt, onGround) {
  if (onGround) return GROUND_COLOR;
  if (altFt === null || altFt === undefined) return '#bdbdbd';
  const t = Math.max(0, Math.min(1, altFt / MAX_FT));
  return `hsl(${Math.round(20 + t * 260)}, 85%, 48%)`; // orange → yellow → green → blue → purple
}

export function addAltitudeLegend(map) {
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const el = L.DomUtil.create('div', 'alt-legend');
    const stops = [0, 10000, 20000, 30000, 40000];
    const gradient = stops.map((ft) => altitudeColor(ft, false)).join(', ');
    el.innerHTML = `
      <div class="alt-legend-bar" style="background: linear-gradient(to right, ${GROUND_COLOR} 0 8%, ${gradient})"></div>
      <div class="alt-legend-labels"><span>GND</span><span>10k</span><span>20k</span><span>30k</span><span>40k ft</span></div>`;
    return el;
  };
  legend.addTo(map);
}
