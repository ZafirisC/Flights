// Phase 2: checks every data source in SPEC §2 from this browser (CORS, status, shape, rate limits).
import { WORKER_URL, RELAY_URL, sourcesFor, probe } from '../js/api.js';

// ?worker=https://flights-proxy.<name>.workers.dev tests the Worker before WORKER_URL is set in api.js.
const worker = (new URLSearchParams(location.search).get('worker') || WORKER_URL).replace(/\/+$/, '');
// ?relay=<url> tests the non-Cloudflare relay (relay/README.md) for live positions, OpenSky and traces.
const relay = (new URLSearchParams(location.search).get('relay') || RELAY_URL).replace(/\/+$/, '');
const SOURCES = sourcesFor(worker, relay);
const via = relay ? 'via relay' : 'via Worker';

const LAT = 40.64, LON = 22.94, RADIUS_NM = 100; // Thessaloniki
const ICAO = 'LGTS';
const FALLBACK = { callsign: 'AEE123', hex: '4690de' };

const browser = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone Safari'
  : /Chrome\//.test(navigator.userAgent) ? 'Desktop Chrome' : 'Other browser';

// `sample` is filled from the first live-position result so lookups use a real aircraft.
const sample = { ...FALLBACK, fromLive: false };

const CHECKS = [
  { name: `adsb.fi (${via})`, live: true, url: () => `${SOURCES.adsbFi}/v3/lat/${LAT}/lon/${LON}/dist/${RADIUS_NM}` },
  { name: 'adsb.fi (direct)', live: true, url: () => `https://opendata.adsb.fi/api/v3/lat/${LAT}/lon/${LON}/dist/${RADIUS_NM}` },
  { name: `adsb.lol (${via})`, live: true, url: () => `${SOURCES.adsbLol}/v2/point/${LAT}/${LON}/${RADIUS_NM}` },
  { name: `airplanes.live (${via})`, live: true, url: () => `${SOURCES.airplanesLive}/v2/point/${LAT}/${LON}/${RADIUS_NM}` },
  { name: `OpenSky (${via})`, live: true,
    url: () => `${SOURCES.opensky}/states/all?lamin=${LAT - 1.5}&lomin=${LON - 2}&lamax=${LAT + 1.5}&lomax=${LON + 2}` },
  { name: 'OpenSky (direct)', live: true,
    url: () => `https://opensky-network.org/api/states/all?lamin=${LAT - 1.5}&lomin=${LON - 2}&lamax=${LAT + 1.5}&lomax=${LON + 2}` },
  // v1.1 Phase 2: position history for the flight track, and radar tiles index. Expect 404 for a hex with no trace today.
  { name: `adsb.lol trace (${via})`, url: () => `${SOURCES.adsbTrace}/data/traces/${sample.hex.slice(-2)}/trace_full_${sample.hex}.json` },
  { name: 'RainViewer', url: () => `${SOURCES.rainviewer}/public/weather-maps.json` },
  { name: 'adsbdb callsign', url: () => `${SOURCES.adsbdb}/callsign/${sample.callsign}` },
  { name: 'adsbdb aircraft', url: () => `${SOURCES.adsbdb}/aircraft/${sample.hex}` },
  { name: 'Planespotters', url: () => `${SOURCES.planespotters}/photos/hex/${sample.hex}` },
  { name: 'aviationweather METAR', url: () => `${SOURCES.aviationWeather}/metar?ids=${ICAO}&format=json` },
  { name: 'aviationweather TAF', url: () => `${SOURCES.aviationWeather}/taf?ids=${ICAO}&format=json` },
  { name: 'Open-Meteo',
    url: () => `${SOURCES.openMeteo}/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,wind_speed_10m,cloud_cover&forecast_days=1` },
];

const $ = (id) => document.getElementById(id);
$('env').textContent = `${browser} · Worker: ${worker || 'none'} · Relay: ${relay || 'none'} · ${navigator.userAgent}`;

// One-line description of the JSON structure: top-level keys, types and array lengths.
function shape(body) {
  if (body === null || body === undefined) return 'not JSON';
  if (Array.isArray(body)) {
    const first = body[0] && typeof body[0] === 'object' ? ` of {${Object.keys(body[0]).slice(0, 12).join(', ')}}` : '';
    return `array[${body.length}]${first}`;
  }
  return '{' + Object.entries(body).map(([k, v]) =>
    Array.isArray(v) ? `${k}: array[${v.length}]` : `${k}: ${v === null ? 'null' : typeof v}`).join(', ') + '}';
}

function count(name, body) {
  if (!body) return null;
  if (name.startsWith('OpenSky')) return body.states?.length ?? 0;
  return (body.ac || body.aircraft)?.length ?? null;
}

// Take a real callsign + hex from a live result (adsb.lol / airplanes.live: ac[], OpenSky: states[]).
function pickSample(name, body) {
  if (sample.fromLive || !body) return;
  let found = null;
  if (name.startsWith('OpenSky')) {
    const s = (body.states || []).find((st) => st[1]?.trim());
    if (s) found = { callsign: s[1].trim(), hex: s[0] };
  } else {
    const a = (body.ac || body.aircraft || []).find((x) => x.flight?.trim() && x.hex);
    if (a) found = { callsign: a.flight.trim(), hex: a.hex };
  }
  if (found) Object.assign(sample, found, { fromLive: true });
}

function rateHeaders(headers = {}) {
  const h = Object.entries(headers).filter(([k]) => /rate|limit|retry|remaining/i.test(k));
  return h.length ? h.map(([k, v]) => `${k}=${v}`).join('; ') : 'none visible';
}

function card(name) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<h2>${name}</h2><div class="wait">Running…</div>`;
  $('results').append(el);
  return el;
}

function verdict(name, r) {
  if (!r.cors && r.cors !== null) return { ok: false, short: `❌ ${r.error}` };
  if (r.error) return { ok: false, short: `❌ ${r.error}` };
  if (r.body?.relayError) return { ok: false, short: `⚠️ Relay: ${r.body.error}, ${r.ms} ms` };
  if (r.status >= 200 && r.status < 300) {
    const n = count(name, r.body);
    return { ok: true, short: `✅ ${r.status}${n !== null ? `, ${n} aircraft` : ''}, ${r.ms} ms` };
  }
  return { ok: false, short: `⚠️ HTTP ${r.status} (CORS ok)` };
}

async function runAll() {
  $('run').disabled = true;
  $('copy').disabled = true;
  $('results').innerHTML = '';
  Object.assign(sample, FALLBACK, { fromLive: false });
  const rows = [];

  for (const c of CHECKS) {
    const el = card(c.name);
    const url = c.url();
    const r = await probe(url);
    if (c.live) pickSample(c.name, r.body);
    const v = verdict(c.name, r);
    const notes = r.error ? '' : `shape ${shape(r.body)}; rate headers: ${rateHeaders(r.headers)}`;
    el.innerHTML = `
      <h2>${c.name}</h2>
      <div class="url">${url}</div>
      <div class="${v.ok ? 'ok' : 'bad'}">${v.short}</div>
      ${r.error ? '' : `<div>Shape: ${shape(r.body)}</div>
      <div>Rate-limit headers: ${rateHeaders(r.headers)}</div>
      <details><summary>Response (first 2000 chars)</summary><pre></pre></details>
      <details><summary>Readable headers</summary><pre></pre></details>`}`;
    if (!r.error) {
      const [body, hdrs] = el.querySelectorAll('pre');
      body.textContent = r.text.slice(0, 2000);
      hdrs.textContent = JSON.stringify(r.headers, null, 2);
    }
    rows.push(`| ${c.name} | ${v.short} | ${notes} |`);
  }

  const sampleNote = sample.fromLive
    ? `Lookups used live aircraft ${sample.callsign} / ${sample.hex}.`
    : `No live aircraft found; lookups used fallback ${sample.callsign} / ${sample.hex}.`;
  $('summary').value = [
    `${browser} — ${new Date().toISOString()} — Worker: ${worker || 'none'} · Relay: ${relay || 'none'}`,
    sampleNote,
    '| Source | Result | Notes |',
    '|---|---|---|',
    ...rows,
  ].join('\n');
  $('run').disabled = false;
  $('copy').disabled = false;
}

async function copy() {
  const text = $('summary').value;
  try {
    await navigator.clipboard.writeText(text);
    $('copy').textContent = 'Copied';
  } catch {
    $('summary').select(); // fallback: user copies manually
    $('copy').textContent = 'Select & copy manually';
  }
  setTimeout(() => { $('copy').textContent = 'Copy results'; }, 2000);
}

$('run').addEventListener('click', runAll);
$('copy').addEventListener('click', copy);
