// Live ATC: links to LiveATC.net's page for an airport (no API, no re-streaming; coverage varies).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const liveAtcUrl = (icao) => `https://www.liveatc.net/search/?icao=${encodeURIComponent(icao)}`;

export function liveAtcLink(icao, label = 'Live ATC') {
  if (!icao) return '';
  return `<a class="panel-btn" href="${esc(liveAtcUrl(icao))}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
}
