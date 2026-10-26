// Share link to a flight: ?flight=<callsign> opens the app on that flight.
import { fetchFlightByCallsign } from './api.js';
import { showStatus, clearStatus } from './status.js';

const CALLSIGN_RE = /^[A-Z0-9]{2,8}$/;

function flash(text, ms = 6000) {
  showStatus(text);
  setTimeout(() => clearStatus(text), ms);
}

export function flightFromUrl() {
  const v = (new URLSearchParams(location.search).get('flight') || '').trim().toUpperCase();
  return CALLSIGN_RE.test(v) ? v : null;
}

export function flightLink(callsign) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('flight', callsign);
  return url.toString();
}

export async function shareFlight(callsign) {
  const url = flightLink(callsign);
  if (navigator.share) {
    try {
      await navigator.share({ title: `Flight ${callsign}`, url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    flash('Link copied');
  } catch {
    window.prompt('Copy this link', url);
  }
}

// Centre the map on the shared flight and open it once its marker is loaded.
export async function openSharedFlight(map, layer, callsign) {
  try {
    const ac = await fetchFlightByCallsign(callsign);
    if (!ac) {
      flash(`Flight ${callsign} is not live right now`);
      return;
    }
    map.setView([ac.lat, ac.lon], Math.max(map.getZoom(), 9));
    layer.select(ac.hex);
  } catch {
    flash(`Could not look up flight ${callsign}`);
  }
}
