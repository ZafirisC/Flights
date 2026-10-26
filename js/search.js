// Search box: live flights (callsign, flight number, registration) and airports (ICAO, IATA, name, city).
/* global L */
import { fetchAirports, fetchFlightByCallsign, fetchAircraftByReg } from './api.js';
import { IATA_TO_ICAO } from './airlines.js';
import { flashStatus, clearStatus } from './status.js';

const MAX_FLIGHTS = 5;
const MAX_AIRPORTS = 6;
const TYPE_RANK = { large: 0, medium: 1, small: 2 };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let airports = null; // [{ ...airport, _name, _city }]
let airportsLoading = null;

function loadAirports() {
  airportsLoading ??= fetchAirports()
    .then((list) => { airports = list.map((a) => ({ ...a, _name: fold(a.name), _city: fold(a.city) })); })
    .catch(() => { airportsLoading = null; flashStatus('Airport list unavailable'); });
  return airportsLoading;
}

// "A3 123" / "a3123" → "AEE123"; plain callsigns pass through.
function callsignCandidates(q) {
  const compact = q.toUpperCase().replace(/\s+/g, '');
  const out = [];
  const m = compact.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]{0,2})$/);
  if (m && IATA_TO_ICAO[m[1]]) out.push(IATA_TO_ICAO[m[1]] + m[2]);
  if (/^[A-Z0-9]{2,8}$/.test(compact)) out.push(compact);
  return [...new Set(out)];
}

function matchAirports(q) {
  if (!airports || q.length < 2) return [];
  const up = q.toUpperCase();
  const f = fold(q);
  const scored = [];
  for (const a of airports) {
    let score;
    if (a.icao === up || a.iata === up) score = 0;
    else if (a.icao?.startsWith(up) || a.iata?.startsWith(up)) score = 1;
    else if (a._city.startsWith(f) || a._name.startsWith(f)) score = 2;
    else if (f.length >= 3 && (a._city.includes(` ${f}`) || a._name.includes(` ${f}`))) score = 3;
    else if (f.length >= 4 && (a._city.includes(f) || a._name.includes(f))) score = 4;
    else continue;
    scored.push([score * 10 + (TYPE_RANK[a.type] ?? 3), a]);
  }
  return scored.sort((x, y) => x[0] - y[0]).slice(0, MAX_AIRPORTS).map(([, a]) => a);
}

function matchFlights(q, aircraft) {
  const cands = callsignCandidates(q);
  const reg = q.toUpperCase().replace(/\s+/g, '');
  if (!cands.length && reg.length < 2) return [];
  return aircraft
    .filter((ac) => (ac.callsign && cands.some((c) => ac.callsign.startsWith(c)))
      || (ac.reg && ac.reg.replace('-', '').startsWith(reg.replace('-', ''))))
    .sort((a, b) => (a.callsign || '').localeCompare(b.callsign || ''))
    .slice(0, MAX_FLIGHTS);
}

export function initSearch(input, map, layer) {
  const list = document.getElementById('suggestions');
  let items = []; // [{ html, run }]
  let active = -1;
  let timer = null;
  let airportMarker = null;

  function close() {
    list.hidden = true;
    list.replaceChildren();
    items = [];
    active = -1;
  }

  function render() {
    list.replaceChildren(...items.map((it, i) => {
      const li = document.createElement('li');
      li.innerHTML = it.html;
      li.className = i === active ? 'active' : '';
      li.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus until click
      li.addEventListener('click', () => choose(i));
      return li;
    }));
    list.hidden = items.length === 0;
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    close();
    input.blur();
    it.run();
  }

  function showAirport(a) {
    input.value = a.iata || a.icao || a.name;
    map.setView([a.lat, a.lon], 11);
    airportMarker?.remove();
    const codes = [a.icao, a.iata].filter(Boolean).join(' / ');
    airportMarker = L.circleMarker([a.lat, a.lon], { radius: 8, color: '#1565c0', weight: 3, fillOpacity: 0.3 })
      .bindPopup(`<div class="ac-popup"><b>${esc(a.name)}</b><div>${esc(codes)}</div>
        <div>${esc([a.city, a.country].filter(Boolean).join(', '))}</div></div>`)
      .addTo(map)
      .openPopup();
  }

  // Not in the loaded aircraft: ask the source by callsign, then by registration.
  async function searchLive(q) {
    const searching = `Searching ${q}…`;
    flashStatus(searching, 15000);
    try {
      for (const cs of callsignCandidates(q)) {
        const ac = await fetchFlightByCallsign(cs);
        if (ac) { clearStatus(searching); layer.focus(ac); return; }
      }
      const reg = q.toUpperCase().replace(/\s+/g, '');
      if (/^[A-Z0-9-]{2,10}$/.test(reg)) {
        const ac = await fetchAircraftByReg(reg);
        if (ac) { clearStatus(searching); layer.focus(ac); return; }
      }
      flashStatus(`${q} is not live right now`);
    } catch {
      flashStatus(`Search failed for ${q}`);
    }
  }

  function update() {
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }

    const flights = matchFlights(q, layer.list());
    const ports = matchAirports(q);
    items = [
      ...flights.map((ac) => ({
        html: `<span class="sg-icon">✈</span><b>${esc(ac.callsign || ac.hex.toUpperCase())}</b>
          <span class="sg-sub">${esc([ac.reg, ac.type].filter(Boolean).join(' · ') || 'Live')}</span>`,
        run: () => { input.value = ac.callsign || ac.reg || ''; layer.focus(ac); },
      })),
      ...ports.map((a) => ({
        html: `<span class="sg-icon">⌂</span><b>${esc([a.iata, a.icao].filter(Boolean).join(' · '))}</b>
          <span class="sg-sub">${esc(a.name)}${a.city ? `, ${esc(a.city)}` : ''}</span>`,
        run: () => showAirport(a),
      })),
    ];
    const looksLikeFlight = /\d|-/.test(q) || !ports.length; // "LGTS", "Athens": airports only
    if (!flights.length && looksLikeFlight
      && (callsignCandidates(q).length || /^[A-Z0-9-]{2,10}$/i.test(q.replace(/\s+/g, '')))) {
      items.push({
        html: `<span class="sg-icon">⌕</span><b>Find live flight “${esc(q)}”</b>
          <span class="sg-sub">Callsign, flight number or registration</span>`,
        run: () => searchLive(q),
      });
    }
    active = items.length ? 0 : -1;
    render();
  }

  input.addEventListener('focus', loadAirports);
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { await loadAirports(); update(); }, 150);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      const typed = active <= 0; // arrow keys not used: pick the best match for the current text
      loadAirports().then(() => { if (typed) update(); choose(Math.max(active, 0)); });
    } else if (e.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}
