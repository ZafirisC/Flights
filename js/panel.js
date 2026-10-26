// The side panel / bottom sheet (#panel) is shared by the aircraft and airport panels.
// Opening one closes the other through its close function.
let owner = null;

export function claimPanel(close) {
  if (owner && owner !== close) {
    const previous = owner;
    owner = null;
    previous();
  }
  owner = close;
}

export function releasePanel(close) {
  if (owner === close) owner = null;
}

// Show / hide #panel. On phones it is a bottom sheet: drag (or tap) the handle to switch between
// half and full height; drag it down to close.
const PHONE = window.matchMedia('(max-width: 767px)');
const SNAP = { half: 0.45, full: 0.88 }; // fraction of the viewport height

const panelEl = () => document.getElementById('panel');
let size = 'half';

function setHeight(fraction) {
  panelEl().style.setProperty('--sheet-h', `${Math.round(fraction * window.innerHeight)}px`);
}

export function showPanel() {
  size = 'half';
  setHeight(SNAP.half);
  panelEl().hidden = false;
  panelEl().scrollTop = 0;
  document.getElementById('panel-content').scrollTop = 0;
  document.body.classList.add('panel-open');
}

export function hidePanel() {
  panelEl().hidden = true;
  document.body.classList.remove('panel-open');
}

// Pan the map so a point is not hidden behind the panel (or off-screen).
export function revealOnMap(map, latlng) {
  const r = panelEl().getBoundingClientRect();
  const m = map.getContainer().getBoundingClientRect();
  const p = map.latLngToContainerPoint(latlng);
  const top = 70; // search bar
  const area = PHONE.matches
    ? { left: 0, right: m.width, top, bottom: r.top - m.top }
    : { left: 0, right: r.left - m.left, top, bottom: m.height };
  const margin = 40;
  if (p.x > area.left + margin && p.x < area.right - margin && p.y > area.top + margin && p.y < area.bottom - margin) return;
  const target = { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
  map.panBy([p.x - target.x, p.y - target.y], { animate: false });
}

function initSheetDrag() {
  const handle = document.querySelector('#panel .sheet-handle');
  let startY = null;
  let startH = 0;
  let moved = false;

  handle.addEventListener('pointerdown', (e) => {
    if (!PHONE.matches) return;
    startY = e.clientY;
    startH = panelEl().getBoundingClientRect().height;
    moved = false;
    handle.setPointerCapture(e.pointerId);
    panelEl().classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 4) moved = true;
    const h = Math.min(window.innerHeight * SNAP.full, Math.max(80, startH + dy));
    panelEl().style.setProperty('--sheet-h', `${h}px`);
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    panelEl().classList.remove('dragging');
    const h = panelEl().getBoundingClientRect().height / window.innerHeight;
    if (!moved) size = size === 'half' ? 'full' : 'half'; // tap toggles
    else if (h < SNAP.half * 0.6) { owner?.(); return; } // dragged down: close
    else size = h > (SNAP.half + SNAP.full) / 2 ? 'full' : 'half';
    setHeight(SNAP[size]);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    size = size === 'half' ? 'full' : 'half';
    setHeight(SNAP[size]);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSheetDrag);
else initSheetDrag();
