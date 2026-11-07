// Cameras tab of the airport panel: Windy webcams within a chosen radius, several players at once.
// Data comes from fetchWebcams() (Worker holds the Windy key). Players are Windy's own embeds (live when the
// camera offers it, else Windy's day time-lapse). Windy terms: show attribution and link back.
import { fetchWebcams } from './api.js';
import { distanceNm } from './geo.js';
import { load, save } from './storage.js';

const RADII = [5, 10, 25, 50, 100]; // km
const MAX_PLAYERS = 4;
const KM_PER_NM = 1.852;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const playerOk = (u) => /^https:\/\/webcams\.windy\.com\//.test(u || '');
const pageOk = (u) => /^https:\/\/(www\.)?windy\.com\//.test(u || '');

export function createCameras(apt) {
  const saved = Number(load('camRadius', 25));
  let radius = RADII.includes(saved) ? saved : 25;
  let cams = [];           // webcams within radius, nearest first
  const known = new Map(); // id → cam, so selected cameras survive a radius change
  const selected = new Set();
  let status = 'idle';     // idle | loading | ready | error
  let seq = 0;
  let root = null;

  const label = (c) => [c.title, c.city].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ');
  const src = (c) => (playerOk(c.live) ? c.live : playerOk(c.day) ? c.day : null);

  async function load_() {
    const t = ++seq;
    status = 'loading';
    paintList();
    try {
      const data = await fetchWebcams(apt.lat, apt.lon, radius);
      if (t !== seq) return;
      cams = (data?.webcams || []).filter((c) => src(c) && Number.isFinite(c.lat))
        .map((c) => ({ ...c, km: distanceNm(apt.lat, apt.lon, c.lat, c.lon) * KM_PER_NM }))
        .sort((a, b) => a.km - b.km);
      cams.forEach((c) => known.set(c.id, c));
      status = 'ready';
    } catch {
      if (t !== seq) return;
      status = 'error';
    }
    paintList();
  }

  function paintList() {
    const box = root?.querySelector('[data-camlist]');
    if (!box) return;
    if (status === 'loading') { box.innerHTML = '<div class="note">Looking for cameras…</div>'; return; }
    if (status === 'error') { box.innerHTML = '<div class="na">Cameras Not available (service off or unreachable)</div>'; return; }
    if (!cams.length) { box.innerHTML = `<div class="note">No cameras within ${radius} km. Try a larger radius.</div>`; return; }
    box.innerHTML = `<ul class="camlist">${cams.map((c) => `
      <li><label><input type="checkbox" data-cam="${esc(c.id)}"${selected.has(c.id) ? ' checked' : ''}>
        <span class="cam-title">${esc(label(c))}</span>
        <span class="sub">${c.km.toFixed(1)} km · ${playerOk(c.live) ? 'Live' : 'Time-lapse'}</span></label></li>`).join('')}</ul>
      <div class="note" data-camnote>${cams.length} camera${cams.length === 1 ? '' : 's'} within ${radius} km. Pick up to ${MAX_PLAYERS} to watch together.</div>`;
  }

  function tile(c) {
    const credit = pageOk(c.page) ? `<a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(label(c))} ↗</a>` : esc(label(c));
    return `<div class="cam-tile" data-tile="${esc(c.id)}">
      <div class="webcam-frame"><iframe src="${esc(src(c))}" title="${esc(c.title)}" loading="lazy" allow="fullscreen" allowfullscreen referrerpolicy="no-referrer"></iframe></div>
      <div class="webcam-credit">${credit} · ${playerOk(c.live) ? 'Live' : 'Time-lapse'}</div></div>`;
  }

  function syncGrid() {
    const grid = root?.querySelector('[data-camgrid]');
    if (!grid) return;
    let added = null;
    grid.querySelectorAll('[data-tile]').forEach((n) => { if (!selected.has(n.dataset.tile)) n.remove(); });
    for (const id of selected) {
      if (!grid.querySelector(`[data-tile="${CSS.escape(id)}"]`) && known.has(id)) {
        grid.insertAdjacentHTML('beforeend', tile(known.get(id)));
        added = grid.lastElementChild;
      }
    }
    // The grid is above the list: bring a newly added player into view so a tap visibly does something.
    added?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function render(el) {
    root = el;
    el.innerHTML = `
      <div class="cam-controls"><label>Radius
        <select data-radius>${RADII.map((r) => `<option value="${r}"${r === radius ? ' selected' : ''}>${r} km</option>`).join('')}</select></label></div>
      <div data-camgrid class="cam-grid"></div>
      <div data-camlist></div>
      <div class="webcam-credit">Webcams provided by <a href="https://www.windy.com/webcams" target="_blank" rel="noopener">windy.com</a></div>`;
    el.querySelector('[data-radius]').addEventListener('change', (e) => {
      radius = Number(e.target.value);
      save('camRadius', radius);
      load_();
    });
    el.querySelector('[data-camlist]').addEventListener('change', (e) => {
      const id = e.target.dataset?.cam;
      if (!id) return;
      if (e.target.checked && selected.size >= MAX_PLAYERS) {
        e.target.checked = false;
        el.querySelector('[data-camnote]')?.classList.add('warn');
        return;
      }
      if (e.target.checked) selected.add(id); else selected.delete(id);
      syncGrid();
    });
    syncGrid();
    if (status === 'idle' || status === 'error') load_(); else paintList();
  }

  return { render, dispose() { seq++; root = null; } };
}
