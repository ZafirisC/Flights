// Webcams: link only. Opens Windy's webcam layer centred on the airport (no API, no key, no embedding).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const webcamsUrl = (lat, lon, zoom = 11) =>
  `https://www.windy.com/-Webcams-webcams?webcams,${Number(lat).toFixed(4)},${Number(lon).toFixed(4)},${zoom}`;

export function webcamsLink(lat, lon, label = 'Webcams') {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `<a class="panel-btn" href="${esc(webcamsUrl(lat, lon))}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
}
