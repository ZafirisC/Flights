// Short status messages (e.g. a source failed). Keeps the app running.
export function showStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.hidden = !text;
}
