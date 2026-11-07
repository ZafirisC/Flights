// Webcams: link only. Opens a web search for live webcams of the airport (no API, no key, no embedding).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const webcamsUrl = (apt) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${apt.name || apt.icao} ${apt.icao || ''} airport live webcam`.replace(/\s+/g, ' ').trim())}`;

export function webcamsLink(apt, label = 'Webcams') {
  if (!apt || !(apt.name || apt.icao)) return '';
  return `<a class="panel-btn" href="${esc(webcamsUrl(apt))}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
}
