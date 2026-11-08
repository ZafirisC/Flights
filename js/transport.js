// Local transport at an airport: pure helpers (no network). Stops come from OpenStreetMap (Overpass),
// next departures from the Worker's /transit route (Transitland). See api.js for the fetches.
import { distanceNm } from './geo.js';

const M_PER_NM = 1852;
export const SEARCH_RADIUS_M = 2500;

export const MODES = {
  metro: { label: 'Metro', icon: '🚇', order: 1 },
  train: { label: 'Train', icon: '🚆', order: 0 },
  tram: { label: 'Tram', icon: '🚊', order: 2 },
  bus: { label: 'Bus', icon: '🚌', order: 3 },
  ferry: { label: 'Ferry', icon: '⛴️', order: 4 },
  taxi: { label: 'Taxi', icon: '🚕', order: 5 },
};

// GTFS route_type → mode.
export function modeFromRouteType(t) {
  const n = Number(t);
  if (n === 0 || n === 5 || n === 7 || n === 12) return 'tram';
  if (n === 1) return 'metro';
  if (n === 2 || (n >= 100 && n < 200)) return 'train';
  if (n === 3 || n === 11 || (n >= 700 && n < 800)) return 'bus';
  if (n === 4) return 'ferry';
  return null;
}

// Overpass query: stations, bus stations, tram stops and taxi ranks around the airport reference point.
export function overpassQuery(lat, lon) {
  const a = `(around:${SEARCH_RADIUS_M},${lat.toFixed(5)},${lon.toFixed(5)})`;
  const t = `(around:1500,${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:15];(nwr${a}[railway~"^(station|halt|tram_stop)$"];nwr${a}[amenity=bus_station];`
    + `nwr${a}[public_transport=station];nwr${a}[amenity=ferry_terminal];nwr${t}[amenity=taxi];);out center tags 80;`;
}

function modeOfTags(t) {
  if (t.amenity === 'taxi') return 'taxi';
  if (t.amenity === 'ferry_terminal') return 'ferry';
  if (t.railway === 'tram_stop' || t.tram === 'yes') return 'tram';
  if (t.station === 'subway' || t.subway === 'yes' || t.station === 'light_rail' || t.light_rail === 'yes') return 'metro';
  if (t.railway === 'station' || t.railway === 'halt' || t.train === 'yes' || t.station === 'train') return 'train';
  if (t.amenity === 'bus_station' || t.bus === 'yes' || t.highway === 'bus_stop') return 'bus';
  return null;
}

// Overpass answer → [{ mode, name, operator, distM }], nearest first, one entry per mode + name.
export function parseStops(data, apt) {
  const seen = new Set();
  const out = [];
  for (const el of data?.elements || []) {
    const tags = el.tags || {};
    const mode = modeOfTags(tags);
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!mode || typeof lat !== 'number' || typeof lon !== 'number') continue;
    const name = tags['name:en'] || tags.name || (mode === 'taxi' ? 'Taxi rank' : null);
    if (!name) continue;
    const key = `${mode}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      mode,
      name,
      operator: tags.operator || tags.network || null,
      distM: Math.round(distanceNm(apt.lat, apt.lon, lat, lon) * M_PER_NM),
    });
  }
  return out.sort((a, b) => MODES[a.mode].order - MODES[b.mode].order || a.distM - b.distM);
}

export function distanceText(m) {
  return m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(1)} km`;
}

function clock(ms, tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
  }
}

// One departure from the Worker ({ utc, line, headsign, mode, live, stop }) → display fields, or null if already gone.
export function departureView(dep, now, tz) {
  const ms = Date.parse(dep?.utc);
  if (Number.isNaN(ms)) return null;
  const min = Math.floor((ms - now) / 60000);
  if (min < -1) return null;
  const text = min <= 0 ? 'Now' : min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  return { ms, text, clock: clock(ms, tz) };
}
