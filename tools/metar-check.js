// Phase 8 check: decodes real METARs and shows aviationweather.gov's parsed fields next to ours.
import { fetchMetar } from '../js/api.js';
import { decodeMetar } from '../js/metar.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '–').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// AWC visib is statute miles ("10+" or a number); compare loosely.
function close(a, b, tol) {
  if (a === null || a === undefined || b === null || b === undefined) return true;
  return Math.abs(Number(a) - Number(b)) <= tol;
}

function line(label, ours, theirs, ok) {
  return `<tr><th>${label}</th><td>${esc(ours)}</td><td class="${ok ? '' : 'diff'}">${esc(theirs)}</td></tr>`;
}

async function run() {
  $('out').innerHTML = '';
  for (const id of $('ids').value.toUpperCase().split(/[\s,]+/).filter(Boolean)) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<b>${esc(id)}</b> Loading…`;
    $('out').append(card);
    let m = null;
    try { m = await fetchMetar(id); } catch (err) { card.innerHTML = `<b>${esc(id)}</b> Error: ${esc(err.message)}`; continue; }
    if (!m) { card.innerHTML = `<b>${esc(id)}</b> No METAR`; continue; }
    const d = decodeMetar(m.rawOb);
    const awcVis = typeof m.visib === 'string' ? parseFloat(m.visib) : m.visib;
    const awcClouds = (m.clouds || []).map((c) => `${c.cover}${c.base ?? ''}`).join(' ');
    const ourClouds = d.clouds.map((c) => `${c.cover}${c.baseFt ?? ''}`).join(' ');
    card.innerHTML = `<b>${esc(id)}</b><code>${esc(m.rawOb)}</code>
      <table><tr><th></th><th>Ours</th><th>aviationweather.gov</th></tr>
      ${line('Wind dir', d.wind?.dir, m.wdir, String(d.wind?.dir ?? '') === String(m.wdir ?? '') || (d.wind?.calm && !m.wspd))}
      ${line('Wind kt', d.wind?.speedKt, m.wspd, close(d.wind?.speedKt, m.wspd, 1))}
      ${line('Gust kt', d.wind?.gustKt, m.wgst, close(d.wind?.gustKt, m.wgst, 1))}
      ${line('Visibility', `${d.visibility?.text ?? '–'} (${d.visibility?.sm?.toFixed(1) ?? '–'} SM)`, m.visib, close(Math.min(d.visibility?.sm ?? 0, 10), Math.min(awcVis ?? 0, 10), 0.6))}
      ${line('Weather', d.weather.join(', '), m.wxString, true)}
      ${line('Clouds', ourClouds || (d.cavok ? 'CAVOK' : 'none'), awcClouds || 'none', ourClouds === awcClouds || (!ourClouds && /CAVOK|CLR|SKC|NSC|NCD|^$/.test(awcClouds)))}
      ${line('Temp / dew', `${d.tempC} / ${d.dewC}`, `${m.temp ?? '–'} / ${m.dewp ?? '–'}`, close(d.tempC, m.temp, 0.6) && close(d.dewC, m.dewp, 0.6))}
      ${line('QNH hPa', d.qnhHpa, m.altim, close(d.qnhHpa, m.altim, 1))}
      ${line('Category', d.category, m.fltCat, !m.fltCat || m.fltCat === d.category)}
      </table>`;
  }
}

$('run').addEventListener('click', run);
run();
