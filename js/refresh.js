// Refresh button (tap = refetch and rebuild the map markers, long-press = reload the page)
// and the "Updated Xs ago" indicator, which turns red when data is stale.
const LONG_PRESS_MS = 700;
const STALE_MS = 36000; // three missed polls

export function initRefresh(map, layer, traffic) {
  const btn = document.getElementById('refresh');
  const label = document.getElementById('updated');
  const opened = Date.now();
  let pressTimer = null;
  let longPressed = false;

  function showAge() {
    const at = traffic.lastOk();
    const age = at ? Date.now() - at : null;
    if (age === null) label.textContent = Date.now() - opened > STALE_MS ? 'No data yet' : 'Loading…';
    else label.textContent = `Updated ${age < 60000 ? `${Math.round(age / 1000)}s` : `${Math.floor(age / 60000)} min`} ago`;
    label.classList.toggle('stale', age === null ? Date.now() - opened > STALE_MS : age > STALE_MS);
  }

  function refresh() {
    btn.classList.remove('spin');
    void btn.offsetWidth; // restart the animation
    btn.classList.add('spin');
    map.invalidateSize();
    layer.reset();
    traffic.refreshNow();
  }

  const cancel = () => clearTimeout(pressTimer);
  btn.addEventListener('pointerdown', () => {
    longPressed = false;
    pressTimer = setTimeout(() => { longPressed = true; location.reload(); }, LONG_PRESS_MS);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, cancel);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', () => { if (!longPressed) refresh(); });

  setInterval(showAge, 1000);
  showAge();
}
