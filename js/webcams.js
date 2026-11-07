// Webcams: an embedded live camera in the airport panel when js/webcam-list.js has one for the airport,
// otherwise a link to a web search. The player is created only when the user taps the button.
import { WEBCAMS } from './webcam-list.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const isHttps = (u) => /^https:\/\//i.test(u || '');

export const webcamFor = (apt) => WEBCAMS[apt?.icao] || null;

export const webcamsUrl = (apt) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${apt.name || apt.icao} ${apt.icao || ''} airport live webcam`.replace(/\s+/g, ' ').trim())}`;

// Button HTML for the airport panel's button row.
export function webcamsButton(apt) {
  if (!apt || !(apt.name || apt.icao)) return '';
  if (webcamFor(apt)) return '<button type="button" class="panel-btn" data-webcam-toggle>Live webcam</button>';
  return `<a class="panel-btn" href="${esc(webcamsUrl(apt))}" target="_blank" rel="noopener">Webcams ↗</a>`;
}

function playerHtml(cam) {
  if (cam.type === 'youtube' && /^[\w-]{6,20}$/.test(cam.id || '')) {
    return `<iframe src="https://www.youtube.com/embed/${cam.id}?autoplay=1&mute=1&playsinline=1" title="Live webcam" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
  if (cam.type === 'iframe' && isHttps(cam.url)) {
    return `<iframe src="${esc(cam.url)}" title="Live webcam" allowfullscreen referrerpolicy="no-referrer"></iframe>`;
  }
  if (cam.type === 'image' && isHttps(cam.url)) {
    return `<img src="${esc(cam.url)}" alt="Live webcam" data-refresh="${Number(cam.refresh) || 30}">`;
  }
  return '';
}

// Wires the toggle button inside `root` (the panel element). `box` is where the player is shown.
export function bindWebcam(root, apt, box) {
  const btn = root.querySelector('[data-webcam-toggle]');
  const cam = webcamFor(apt);
  if (!btn || !cam || !box) return;
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  btn.addEventListener('click', () => {
    if (box.firstChild) { stop(); box.innerHTML = ''; btn.textContent = 'Live webcam'; return; }
    const html = playerHtml(cam);
    if (!html) { box.innerHTML = '<div class="na">Webcam not available</div>'; return; }
    const credit = cam.credit
      ? `<div class="webcam-credit">${isHttps(cam.page) ? `<a href="${esc(cam.page)}" target="_blank" rel="noopener">${esc(cam.credit)} ↗</a>` : esc(cam.credit)}</div>`
      : '';
    box.innerHTML = `<div class="webcam-frame">${html}</div>${credit}`;
    btn.textContent = 'Hide webcam';
    const img = box.querySelector('img[data-refresh]');
    if (img) {
      const base = img.getAttribute('src');
      const every = Math.max(10, Number(img.dataset.refresh)) * 1000;
      timer = setInterval(() => {
        if (!img.isConnected) return stop(); // panel was closed
        if (!document.hidden) img.src = `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`;
      }, every);
    }
  });
}
