// All network calls go through this module. No fetch anywhere else.
// Each source has a base URL; point it at the Cloudflare Worker to proxy a source.
export const SOURCES = {
  adsbLol: 'https://api.adsb.lol',
  airplanesLive: 'https://api.airplanes.live',
  opensky: 'https://opensky-network.org/api',
  adsbdb: 'https://api.adsbdb.com/v0',
  planespotters: 'https://api.planespotters.net/pub',
  aviationWeather: 'https://aviationweather.gov/api/data',
  openMeteo: 'https://api.open-meteo.com/v1',
};

export async function getJSON(url, { timeout = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
