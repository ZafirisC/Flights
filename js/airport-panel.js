// Airport panel: header (codes, elevation, runways), tabs Departures / Arrivals / Weather.
/* global L */
import { fetchMetar, fetchTaf } from './api.js';
import { decodeMetar, formatTaf } from './metar.js';
import { airportTraffic } from './airport-traffic.js';
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

  const yieldPanel = () => close();
  const body = () => el.querySelector('[data-body]');

  function renderBody() {
    const b = body();
    if (!b) return;
    el.querySelectorAll('.tabs button').forEach((btn) => btn.classList.toggle('on', btn.dataset.tab === tab));
    if (tab === 'weather') { b.innerHTML = 'Loading…'; loadWeather(token); return; }
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

  async function loadTraffic(t) {
    try {
      const result = await airportTraffic(apt);
      if (t === token) traffic = result;
    } catch {
      if (t === token) traffic = { error: true };
    }
    if (t === token && tab !== 'weather') renderBody();
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
    tab = 'departures';
    const codes = [a.icao, a.iata].filter(Boolean).join(' / ');
    el.innerHTML = `
      <div class="panel-head">
        <div>
          <div class="panel-title">${esc(a.name)}</div>
          <div class="panel-sub">${esc([codes, a.city, a.country].filter(Boolean).join(' · '))}</div>
        </div>
        <button type="button" class="panel-close" aria-label="Close">×</button>
      </div>
      ${row('Elevation', a.elev !== undefined ? `${a.elev.toLocaleString('en')} ft` : null)}
      ${rowHtml('Runways', runwaysHtml(a.rwy))}
      <div class="tabs">
        <button type="button" data-tab="departures">Departures</button>
        <button type="button" data-tab="arrivals">Arrivals</button>
        <button type="button" data-tab="weather">Weather</button>
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
    renderBody();
    loadTraffic(t);
    schedule(t);
  }

  function close() {
    if (!apt) return;
    apt = null;
    token++;
    clearTimeout(timer);
    releasePanel(yieldPanel);
    marker?.remove();
    marker = null;
    el.innerHTML = '';
    hidePanel();
  }

  map.on('click', () => close());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { open, close };
}
