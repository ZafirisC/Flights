// Short status messages (e.g. a source failed). Keeps the app running.
export function showStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.hidden = !text;
}

// Clears the status only if it still shows this text (so one module does not clear another's message).
export function clearStatus(text) {
  if (document.getElementById('status').textContent === text) showStatus('');
}
