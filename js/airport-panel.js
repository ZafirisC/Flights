// Airport panel: header (codes, elevation, runways), tabs Departures / Arrivals / Weather.
/* global L */
import { fetchShapes, fetchMetar, fetchTaf, fetchModelForecast, fetchTransportStops, fetchTransitDepartures } from './api.js';
import { overpassQuery, parseStops, departureView, distanceText, filterByMode, modesPresent, MODES } from './transport.js';
import { decodeMetar, formatTaf } from './metar.js';
import { parseTaf, tafTimeline, resolveTime } from './taf.js';
import { metarSentences, trendSentence, groupSentence, periodKind, periodWhen, dayTime, localParts } from './wx-text.js';
import { tafMeteogram, modelMeteogram } from './meteogram.js';
import { airportTraffic } from './airport-traffic.js';
import { localTime } from './localtime.js';
import { liveAtcLink } from './atc.js';
import { createCameras } from './webcams.js';
import { regionShape, shapeSvg, flagImg } from './region-shape.js';
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

// Weather tab: plain-English METAR, then the forecast as a meteogram plus one line per period.
// The forecast comes from the TAF; airports without one (or with an expired one) get the Open-Meteo model.
function weatherHtml({ metar, taf, timeline, model, tz, now }) {
  const raw = metar?.rawOb;
  const d = decodeMetar(raw);
  const out = [];
  const tzLabel = localTime(tz)?.offset;
  const clock = (ms) => (tz ? `${localParts(ms, tz).hm} local · ` : '') + `${new Date(ms).toISOString().slice(11, 16)}Z`;

  const obs = d.time && resolveTime(+d.time.slice(0, 2), +d.time.slice(2, 4), +d.time.slice(4, 6), now);
  out.push(`<div class="wx-head">Now ${d.category ? `<span class="cat cat-${d.category}">${d.category}</span>` : ''}
    ${obs ? `<small class="wx-time">${esc(clock(obs))}</small>` : ''}</div>`);
  if (raw) {
    const trend = trendSentence(d.trend);
    out.push(`<p class="wx-say">${esc(metarSentences(d).join(' ') || 'Report could not be decoded.')}</p>`,
      trend ? `<p class="wx-say">${esc(trend)}</p>` : '',
      `<details class="raw-metar"><summary>Raw METAR</summary><code>${esc(raw)}</code></details>`);
  } else {
    out.push(`<div class="na">No current report (METAR) for this airport</div>`);
  }

  if (timeline) {
    out.push(`<div class="wx-head">Forecast <small class="wx-time">until ${esc(dayTime(timeline.to, tz, now))}</small></div>`,
      tafMeteogram(timeline, tz),
      `<div class="note">Solid = expected, dashed = possible. Times are airport local${tzLabel ? ` (${esc(tzLabel)})` : ' (UTC)'}.</div>`,
      ...timeline.periods.map((p) => {
        const kind = periodKind(p);
        const cat = p.state.category;
        return `<div class="wx-period">
          <div class="wx-when">${esc(periodWhen(p.from, p.to, tz, now))}${kind ? ` <span class="wx-kind">${esc(kind)}</span>` : ''}${cat ? ` <span class="cat cat-${cat}">${cat}</span>` : ''}</div>
          <div>${esc(groupSentence(p.kind === 'BASE' || p.kind === 'FM' ? p.state : p.el))}</div></div>`;
      }),
      `<details class="raw-metar"><summary>Raw TAF</summary><pre class="raw">${esc(formatTaf(taf.rawTAF))}</pre></details>`);
  } else if (model?.length) {
    out.push('<div class="wx-head">Model forecast</div>',
      modelMeteogram(model, tz),
      `<div class="note">No TAF for this airport, so this is the Open-Meteo model forecast. It is less reliable than a TAF
        for low cloud and fog, and has no flight categories. Times are airport local${tzLabel ? ` (${esc(tzLabel)})` : ' (UTC)'}.</div>`);
  } else {
    out.push('<div class="wx-head">Forecast</div>', `<div class="na">${NA}</div>`);
  }
  return out.join('');
}

function transportHtml(tp, tz, filter = 'all') {
  if (!tp) return 'Looking up local transport…';
  const now = Date.now();
  const present = modesPresent(tp.departures, tp.stops);
  if (filter !== 'all' && !present.includes(filter)) filter = 'all';
  const label = filter === 'all' ? '' : ` (${MODES[filter].label.toLowerCase()})`;
  const chips = present.length > 1 ? `<div class="chips" role="group" aria-label="Filter by transport type">${
    ['all', ...present].map((m) => `<button type="button" data-mode="${m}" class="${m === filter ? 'on' : ''}">${
      m === 'all' ? 'All' : `${MODES[m].icon} ${MODES[m].label}`}</button>`).join('')}</div>` : '';
  const deps = filterByMode(tp.departures || [], filter).map((d) => ({ d, v: departureView(d, now, tz) })).filter((x) => x.v).slice(0, 10);
  const next = tp.departures === null
    ? '<div class="note">Live departure times are not available for this airport right now.</div>'
    : deps.length ? `<ul class="flights">${deps.map(({ d, v }) => `
      <li><div><b>${MODES[d.mode]?.icon || '🚏'} ${val(d.line)}</b><span class="sub">${esc([d.headsign && `to ${d.headsign}`, d.stop].filter(Boolean).join(' · '))}</span></div>
      <div class="right"><b class="${d.live ? 'live' : ''}">${esc(v.text)}</b><span class="sub">${v.clock}${d.live ? ' · live' : ' · scheduled'}</span></div></li>`).join('')}</ul>`
      : '<div class="note">No departures in the next 2 hours near the airport.</div>';
  const shown = tp.stops && filterByMode(tp.stops, filter);
  const stops = tp.stops === null ? `<div class="na">Stop list ${NA}</div>`
    : shown.length ? `<ul class="flights">${shown.map((s) => `
      <li style="cursor:default"><div><b>${MODES[s.mode].icon} ${esc(s.name)}</b><span class="sub">${MODES[s.mode].label}${s.operator ? ` · ${esc(s.operator)}` : ''}</span></div>
      <div class="right">${distanceText(s.distM)}</div></li>`).join('')}</ul>`
      : '<div class="note">No stations or stops found within 2.5 km in OpenStreetMap.</div>';
  return `${chips}<h3>Next departures${label}</h3>${next}<h3>Stations and stops nearby${label}</h3>${stops}
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
  let modeFilter = 'all'; // transport tab filter, reset per airport
  let cameras = null;

  const yieldPanel = () => close();
  const body = () => el.querySelector('[data-body]');

  function renderBody() {
    const b = body();
    if (!b) return;
    el.querySelectorAll('.tabs button').forEach((btn) => btn.classList.toggle('on', btn.dataset.tab === tab));
    if (tab === 'cameras') { cameras.render(b); return; }
    if (tab === 'weather') { b.innerHTML = 'Loading…'; loadWeather(token); return; }
    if (tab === 'transport') { b.innerHTML = transportHtml(transport, apt.tz, modeFilter); loadTransport(token); return; }
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
    const [metar, taf] = apt.icao ? await Promise.all([
      fetchMetar(apt.icao).catch(() => null),
      fetchTaf(apt.icao).catch(() => null),
    ]) : [null, null];
    const now = Date.now();
    let timeline = null;
    try { timeline = tafTimeline(parseTaf(taf?.rawTAF, now), now); } catch { timeline = null; } // unreadable TAF → model
    const model = timeline ? null : await fetchModelForecast(apt.lat, apt.lon).catch(() => null);
    if (t === token && tab === 'weather') body().innerHTML = weatherHtml({ metar, taf, timeline, model, tz: apt.tz, now });
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
    if (tab === 'transport') body().innerHTML = transportHtml(transport, apt.tz, modeFilter);
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
    modeFilter = 'all';
    tab = 'departures';
    cameras = createCameras(a);
    const codes = [a.icao, a.iata].filter(Boolean).join(' / ');
    el.innerHTML = `
      <div class="panel-head">
        ${flagImg(a.country)}
        <div class="panel-head-text">
          <div class="panel-title">${esc(a.name)}</div>
          <div class="panel-sub">${esc([codes, a.city, a.region ? `${a.region}, ${a.country}` : a.country].filter(Boolean).join(' · '))}</div>
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
    fetchShapes().then((shapes) => {
      const head = t === token && el.querySelector('.panel-head');
      if (head) head.insertAdjacentHTML('afterbegin', shapeSvg(regionShape(shapes, a)));
    }).catch(() => {}); // header art is decoration only
    el.querySelector('.panel-close').addEventListener('click', () => close());
    el.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      renderBody();
    }));
    body().addEventListener('click', (e) => {
      const chip = e.target.closest('button[data-mode]');
      if (chip && tab === 'transport') {
        modeFilter = chip.dataset.mode;
        body().innerHTML = transportHtml(transport, apt.tz, modeFilter);
        return;
      }
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
