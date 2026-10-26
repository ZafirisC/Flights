// Aircraft panel: flight, aircraft (with photo), live data, destination weather, and a trail on the map.
/* global L */
import { fetchRoute, fetchAircraftInfo, fetchPhoto, fetchMetar, fetchForecast } from './api.js';
import { emergencyOf } from './aircraft-layer.js';
import { weatherText } from './forecast.js';
import { claimPanel, releasePanel } from './panel.js';

const NA = 'Not available';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const val = (v) => (v === null || v === undefined || v === '' ? `<span class="na">${NA}</span>` : esc(v));
const row = (label, value) => `<div class="row"><span>${label}</span><span>${val(value)}</span></div>`;
const rowHtml = (label, html) => `<div class="row"><span>${label}</span><span>${html}</span></div>`;

const airportLabel = (p) => p && [p.iata || p.icao, p.city || p.name].filter(Boolean).join(' ');
const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];

function liveHtml(ac, ageSec) {
  const emg = emergencyOf(ac);
  const alt = ac.onGround ? 'On ground' : ac.alt !== null ? `${ac.alt.toLocaleString('en')} ft` : null;
  const vr = ac.vrate === null ? null : `${ac.vrate > 0 ? '▲' : ac.vrate < 0 ? '▼' : ''} ${Math.abs(Math.round(ac.vrate)).toLocaleString('en')} ft/min`;
  const age = ageSec === null ? null : `${Math.round(ageSec)} s ago`;
  return [
    row('Altitude', alt),
    row('Ground speed', ac.gs !== null ? `${Math.round(ac.gs)} kt` : null),
    row('Track', ac.track !== null ? `${Math.round(ac.track)}°` : null),
    row('Vertical rate', vr),
    rowHtml('Squawk', ac.squawk ? `${esc(ac.squawk)}${emg ? ` <b class="emg">${emg}</b>` : ''}` : val(null)),
    `<div class="row"><span>Last message</span><span data-age>${val(age)}</span></div>`,
  ].join('');
}

export function initAircraftPanel(map, { onClose } = {}) {
  const el = document.getElementById('panel');
  let hex = null;
  let token = 0; // ignores async results for a panel that was replaced
  let last = null; // { ac, at }
  let trail = null;
  let ticker = null;

  const sec = (name) => el.querySelector(`[data-sec="${name}"]`);
  const fill = (t, name, html) => { if (t === token && sec(name)) sec(name).innerHTML = html; };

  function render(ac) {
    const title = ac.callsign || ac.hex.toUpperCase();
    el.innerHTML = `
      <div class="panel-head">
        <div>
          <div class="panel-title">${esc(title)}</div>
          <div class="panel-sub" data-sec="airline">Loading…</div>
        </div>
        <button type="button" class="panel-close" aria-label="Close">×</button>
      </div>
      ${ac.callsign ? `<button type="button" class="panel-btn" data-share="${esc(ac.callsign)}">Share link</button>` : ''}
      <h3>Flight</h3><div data-sec="flight">Loading…</div>
      <h3>Aircraft</h3><div data-sec="aircraft">Loading…</div>
      <h3>Live</h3><div data-sec="live">${liveHtml(ac, ac.seen)}</div>
      <h3>Destination weather</h3><div data-sec="weather">Loading…</div>`;
    el.querySelector('.panel-close').addEventListener('click', close);
  }

  async function loadFlight(t, ac) {
    let route = null;
    try { route = ac.callsign ? await fetchRoute(ac.callsign) : null; } catch { /* shown as Not available */ }
    fill(t, 'airline', val(route?.airline?.name));
    fill(t, 'flight', [
      row('Callsign', ac.callsign),
      row('Airline', route?.airline && [route.airline.name, route.airline.iata || route.airline.icao].filter(Boolean).join(' · ')),
      row('From', airportLabel(route?.origin)),
      row('To', airportLabel(route?.destination)),
      route ? '<div class="note">Route from adsbdb by callsign; may differ from today\'s flight.</div>' : '',
    ].join(''));
    loadWeather(t, route?.destination);
  }

  async function loadAircraft(t, ac) {
    const [info, photo] = await Promise.all([
      fetchAircraftInfo(ac.hex).catch(() => null),
      fetchPhoto(ac.hex).catch(() => null),
    ]);
    const type = [info?.manufacturer, info?.type].filter(Boolean).join(' ') || null;
    const photoHtml = photo?.src
      ? `<a class="photo" href="${esc(photo.link)}" target="_blank" rel="noopener">
           <img src="${esc(photo.src)}" alt="Aircraft photo" loading="lazy" />
           <span>© ${esc(photo.photographer || 'Unknown')} / Planespotters.net</span></a>`
      : `<div class="note">Photo: ${NA}</div>`;
    fill(t, 'aircraft', photoHtml + [
      row('Registration', info?.registration || ac.reg),
      row('Type', type ? `${type}${info?.icaoType ? ` (${info.icaoType})` : ''}` : ac.type),
      row('Operator / owner', info?.owner),
      row('Country', info?.ownerCountry),
      row('Mode S', ac.hex.toUpperCase()),
    ].join(''));
  }

  async function loadWeather(t, dest) {
    if (!dest) { fill(t, 'weather', `<div class="note">${NA} (destination unknown)</div>`); return; }
    const [metar, forecast] = await Promise.all([
      dest.icao ? fetchMetar(dest.icao).catch(() => null) : null,
      dest.lat !== null ? fetchForecast(dest.lat, dest.lon).catch(() => null) : null,
    ]);
    const fc = forecast?.filter((_, i) => i % 2 === 0).slice(0, 4); // now, +2h, +4h, +6h
    fill(t, 'weather', `
      <div class="note">${esc(airportLabel(dest))}${dest.icao ? ` (${esc(dest.icao)})` : ''}</div>
      ${rowHtml('METAR', metar?.rawOb ? `<code>${esc(metar.rawOb)}</code>` : val(null))}
      ${fc?.length ? `<table class="fc"><tr><th>Local</th><th>Sky</th><th>Temp</th><th>Wind</th><th>Rain</th></tr>
        ${fc.map((h) => `<tr><td>${esc(h.time.slice(11, 16))}</td><td>${esc(weatherText(h.code))}</td>
          <td>${h.temp !== null ? `${Math.round(h.temp)}°C` : '–'}</td>
          <td>${h.windKt !== null ? `${compass(h.windDir)} ${Math.round(h.windKt)} kt` : '–'}</td>
          <td>${h.precipProb !== null ? `${h.precipProb}%` : '–'}</td></tr>`).join('')}</table>`
        : row('Forecast', null)}`);
  }

  const yieldPanel = () => close(); // another panel took #panel

  function open(ac) {
    close({ silent: true });
    claimPanel(yieldPanel);
    hex = ac.hex;
    const t = ++token;
    last = { ac, at: Date.now() };
    render(ac);
    el.hidden = false;
    document.body.classList.add('panel-open');
    trail = L.polyline([[ac.lat, ac.lon]], { color: '#1565c0', weight: 3, opacity: 0.8, interactive: false }).addTo(map);
    ticker = setInterval(tick, 1000);
    loadFlight(t, ac);
    loadAircraft(t, ac);
  }

  // New position for the open aircraft: refresh live data and extend the trail.
  function update(ac) {
    if (ac.hex !== hex) return;
    last = { ac, at: Date.now() };
    const s = sec('live');
    if (s) s.innerHTML = liveHtml(ac, ac.seen);
    const pts = trail.getLatLngs();
    const end = pts[pts.length - 1];
    if (!end || end.lat !== ac.lat || end.lng !== ac.lon) trail.addLatLng([ac.lat, ac.lon]);
  }

  function tick() {
    const cell = el.querySelector('[data-age]');
    if (!cell || !last) return;
    const age = (last.ac.seen ?? 0) + (Date.now() - last.at) / 1000;
    cell.innerHTML = age > 60 ? `<span class="na">${Math.round(age)} s ago (no recent data)</span>` : `${Math.round(age)} s ago`;
  }

  function close({ silent = false } = {}) {
    if (!hex) return;
    hex = null;
    token++;
    releasePanel(yieldPanel);
    clearInterval(ticker);
    trail?.remove();
    trail = null;
    el.hidden = true;
    el.innerHTML = '';
    document.body.classList.remove('panel-open');
    if (!silent) onClose?.();
  }

  map.on('click', () => close());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { open, update, close, isOpen: () => hex !== null };
}
