// Airport panel: header (codes, elevation, runways), tabs Departures / Arrivals / Weather.
/* global L */
import { fetchMetar, fetchTaf, fetchTransportStops, fetchTransitDepartures } from './api.js';
import { overpassQuery, parseStops, departureView, distanceText, MODES } from './transport.js';
import { decodeMetar, formatTaf } from './metar.js';
import { airportTraffic } from './airport-traffic.js';
import { localTime } from './localtime.js';
import { liveAtcLink } from './atc.js';
import { createCameras } from './webcams.js';
import { claimPanel, releasePanel, showPanel, hidePanel, revealOnMap } from './panel.js';

const NA = 'Not available';
const REFRESH_MS = 60000;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const val = (v) => (v === null || v === undefined || v === '' ? `<span class="na">${NA}</span>` : esc(v));
const row = (label, value) => `<div class="row"><span>${label}</span><span>${val(value)}</span></div>`;
const rowHtml = (label, html) => `<div class="row"><span>${label}</span><span>${html}</span></div>`;
const placeLabel = (p) => p && [p.iata || p.icao, p.city || p.name].filter(Boolean).join(' ');

function runwaysHtml(rwy) {
  if (!rwy?.length) return val(null);
  return rwy.map((r) => esc([r.id, r.len && `${r.len.toLocaleString('en')} ft`, r.surf].filter(Boolean).join(' · '))).join('<br>');
}

function windText(w) {
  if (!w) return null;
  if (w.calm) return 'Calm';
  const dir = w.dir === 'VRB' ? 'Variable' : `${String(w.dir).padStart(3, '0')}°`;
  const vari = w.varFrom !== undefined ? ` (varying ${w.varFrom}°–${w.varTo}°)` : '';
  return `${dir} ${w.speedKt} kt${w.gustKt ? `, gusts ${w.gustKt} kt` : ''}${vari}`;
}

function weatherHtml(metar, taf) {
  const raw = metar?.rawOb;
  const d = decodeMetar(raw);
  const clouds = d.cavok ? 'No significant cloud (CAVOK)'
    : d.clouds.length ? d.clouds.map((c) => `${c.text}${c.baseFt !== null ? ` ${c.baseFt.toLocaleString('en')} ft` : ''}${c.type ? ` (${c.type})` : ''}`).join(', ')
    : raw ? 'No cloud reported' : null;
  return `
    <div class="wx-head">METAR ${d.category ? `<span class="cat cat-${d.category}">${d.category}</span>` : ''}</div>
    ${raw ? `<code class="raw">${esc(raw)}</code>` : `<div class="na">${NA}</div>`}
    ${raw ? [
      row('Wind', windText(d.wind)),
      row('Visibility', d.visibility?.text),
      row('Weather', d.weather.join(', ') || (d.cavok ? 'None significant' : null)),
      row('Clouds', clouds),
      row('Ceiling', d.ceilingFt !== null ? `${d.ceilingFt.toLocaleString('en')} ft` : 'None'),
      row('Temp / dew point', d.tempC !== null ? `${d.tempC}°C / ${d.dewC ?? '–'}°C` : null),
      row('QNH', d.qnhHpa !== null ? `${d.qnhHpa} hPa` : null),
    ].join('') : ''}
    <div class="wx-head">TAF</div>
    ${taf?.rawTAF ? `<pre class="raw">${esc(formatTaf(taf.rawTAF))}</pre>` : `<div class="na">${NA}</div>`}`;
}

function transportHtml(tp, tz) {
  if (!tp) return 'Looking up local transport…';
  const now = Date.now();
  const deps = (tp.departures || []).map((d) => ({ d, v: departureView(d, now, tz) })).filter((x) => x.v).slice(0, 10);
  const next = tp.departures === null
    ? '<div class="note">Live departure times are not available for this airport right now.</div>'
    : deps.length ? `<ul class="flights">${deps.map(({ d, v }) => `
      <li><div><b>${MODES[d.mode]?.icon || '🚏'} ${val(d.line)}</b><span class="sub">${esc([d.headsign && `to ${d.headsign}`, d.stop].filter(Boolean).join(' · '))}</span></div>
      <div class="right"><b class="${d.live ? 'live' : ''}">${esc(v.text)}</b><span class="sub">${v.clock}${d.live ? ' · live' : ' · scheduled'}</span></div></li>`).join('')}</ul>`
      : '<div class="note">No departures in the next 2 hours near the airport.</div>';
  const stops = tp.stops === null ? `<div class="na">Stop list ${NA}</div>`
    : tp.stops.length ? `<ul class="flights">${tp.stops.map((s) => `
      <li style="cursor:default"><div><b>${MODES[s.mode].icon} ${esc(s.name)}</b><span class="sub">${MODES[s.mode].label}${s.operator ? ` · ${esc(s.operator)}` : ''}</span></div>
      <div class="right">${distanceText(s.distM)}</div></li>`).join('')}</ul>`
      : '<div class="note">No stations or stops found within 2.5 km in OpenStreetMap.</div>';
  return `<h3>Next departures</h3>${next}<h3>Stations and stops nearby</h3>${stops}
    <div class="note">Stops © OpenStreetMap contributors. Times from Transitland (GTFS); where an operator shares no real-time data, scheduled times are shown.</div>`;
}

function listHtml(items, emptyText, otherLabel) {
  if (!items.length) return `<div class="note">${emptyText}</div>`;
  return `<ul class="flights">${items.map((it) => `
    <li data-hex="${esc(it.ac.hex)}">
      <div><b>${esc(it.ac.callsign || it.ac.hex.toUpperCase())}</b>
        ${otherLabel ? `<span class="sub">${otherLabel} ${val(placeLabel(it.other))}</span>` : ''}</div>
      <div class="right">${esc(it.status)}<span class="sub">${esc([it.ac.type, it.ac.reg].filter(Boolean).join(' · '))}</span></div>
    </li>`).join('')}</ul>`;
}

export function initAirportPanel(map, layer) {
  const el = document.getElementById('panel-content');
  let apt = null;
  let token = 0;
  let tab = 'departures';
  let traffic = null; // last airportTraffic() result
  let timer = null;
  let marker = null;
  let clock = null;
  let transport = null; // { stops, departures } for the open airport
  let cameras = null;

  const yieldPanel = () => close();
  const body = () => el.querySelector('[data-body]');

  function renderBody() {
    const b = body();
    if (!b) return;
    el.querySelectorAll('.tabs button').forEach((btn) => btn.classList.toggle('on', btn.dataset.tab === tab));
    if (tab === 'cameras') { cameras.render(b); return; }
    if (tab === 'weather') { b.innerHTML = 'Loading…'; loadWeather(token); return; }
    if (tab === 'transport') { b.innerHTML = transportHtml(transport, apt.tz); loadTransport(token); return; }
    if (!traffic) { b.innerHTML = 'Looking up live traffic and routes…'; return; }
    if (traffic.error) { b.innerHTML = `<div class="na">Live traffic ${NA}</div>`; return; }
    const note = `<div class="note">Derived from live positions and adsbdb routes, not schedules.${
      traffic.skipped ? ` ${traffic.skipped} more aircraft not checked.` : ''}</div>`;
    b.innerHTML = tab === 'departures'
      ? listHtml(traffic.departures, 'No departures seen right now.', 'To')
        + (traffic.unknown.length ? `<h3>On the ground, route unknown</h3>${listHtml(traffic.unknown, '', '')}` : '')
        + note
      : listHtml(traffic.arrivals, 'No arrivals seen within 250 nm.', 'From') + note;
  }

  async function loadWeather(t) {
    if (!apt.icao) { if (t === token) body().innerHTML = `<div class="na">${NA} (no ICAO code)</div>`; return; }
    const [metar, taf] = await Promise.all([
      fetchMetar(apt.icao).catch(() => null),
      fetchTaf(apt.icao).catch(() => null),
    ]);
    if (t === token && tab === 'weather') body().innerHTML = weatherHtml(metar, taf);
  }

  // Stops once per airport (OpenStreetMap); departures again every time the tab renders (api.js caches 60 s).
  async function loadTransport(t) {
    const stopsP = transport?.stops !== undefined ? Promise.resolve(transport.stops)
      : fetchTransportStops(overpassQuery(apt.lat, apt.lon)).then((d) => parseStops(d, apt)).catch(() => null);
    const [stops, departures] = await Promise.all([
      stopsP,
      fetchTransitDepartures(apt.lat, apt.lon).then((r) => r?.departures || []).catch(() => null),
    ]);
    if (t !== token) return;
    transport = { stops, departures };
    if (tab === 'transport') body().innerHTML = transportHtml(transport, apt.tz);
  }

  async function loadTraffic(t) {
    try {
      const result = await airportTraffic(apt);
      if (t === token) traffic = result;
    } catch {
      if (t === token) traffic = { error: true };
    }
    if (t === token && (tab === 'departures' || tab === 'arrivals')) renderBody();
  }

  function schedule(t) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (t !== token) return;
      if (!document.hidden) await loadTraffic(t);
      schedule(t);
    }, REFRESH_MS);
  }

  function open(a) {
    close();
    claimPanel(yieldPanel);
    apt = a;
    const t = ++token;
    traffic = null;
    transport = null;
    tab = 'departures';
    cameras = createCameras(a);
    const codes = [a.icao, a.iata].filter(Boolean).join(' / ');
    el.innerHTML = `
      <div class="panel-head">
        <div>
          <div class="panel-title">${esc(a.name)}</div>
          <div class="panel-sub">${esc([codes, a.city, a.country].filter(Boolean).join(' · '))}</div>
        </div>
        <button type="button" class="panel-close" aria-label="Close">×</button>
      </div>
      ${rowHtml('Local time', '<span data-clock></span>')}
      ${row('Elevation', a.elev !== undefined ? `${a.elev.toLocaleString('en')} ft` : null)}
      ${rowHtml('Runways', runwaysHtml(a.rwy))}
      ${a.icao ? `<div class="btn-row">${liveAtcLink(a.icao)}</div>` : ''}
      <div class="tabs">
        <button type="button" data-tab="departures">Departures</button>
        <button type="button" data-tab="arrivals">Arrivals</button>
        <button type="button" data-tab="weather">Weather</button>
        <button type="button" data-tab="transport">Transport</button>
        <button type="button" data-tab="cameras">Cameras</button>
      </div>
      <div data-body></div>`;
    el.querySelector('.panel-close').addEventListener('click', () => close());
    el.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      renderBody();
    }));
    body().addEventListener('click', (e) => {
      const li = e.target.closest('li[data-hex]');
      const item = li && traffic && [...traffic.departures, ...traffic.arrivals, ...traffic.unknown]
        .find((x) => x.ac.hex === li.dataset.hex);
      if (item) layer.focus(item.ac); // opens the aircraft panel, which closes this one
    });
    showPanel();
    revealOnMap(map, [a.lat, a.lon]);
    marker = L.circleMarker([a.lat, a.lon], { radius: 9, color: '#1565c0', weight: 3, fillOpacity: 0.25, interactive: false }).addTo(map);
    const tick = () => {
      const cell = el.querySelector('[data-clock]');
      const lt = localTime(a.tz);
      if (cell) cell.innerHTML = lt ? esc(lt.text) : `<span class="na">${NA}</span>`;
    };
    tick();
    clock = setInterval(() => {
      tick();
      if (tab === 'transport' && !document.hidden && transport) loadTransport(t); // "in N min" and live data
    }, 30000);
    renderBody();
    loadTraffic(t);
    schedule(t);
  }

  function close() {
    if (!apt) return;
    apt = null;
    token++;
    clearTimeout(timer);
    clearInterval(clock);
    releasePanel(yieldPanel);
    marker?.remove();
    marker = null;
    cameras?.dispose();
    cameras = null;
    el.innerHTML = '';
    hidePanel();
  }

  map.on('click', () => close());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { open, close };
}
