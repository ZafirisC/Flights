// Departures / arrivals derived from live positions + adsbdb routes (SPEC §5). No schedules.
import { fetchAircraft, fetchRoute } from './api.js';
import { distanceNm, bearingDeg, angleDiff } from './geo.js';

const AREA_NM = 250; // arrivals search radius
const DEP_AIRBORNE_NM = 50; // airborne departures: within this and climbing
const ON_AIRPORT_NM = 3; // "on the ground at it"
const HEADING_TOLERANCE = 60; // arrivals: track within this of the bearing to the airport
const MAX_LOOKUPS = 60; // route lookups per refresh (each callsign is cached for the session)
const CONCURRENCY = 4;

const sameAirport = (p, apt) => !!p && ((apt.icao && p.icao === apt.icao) || (apt.iata && p.iata === apt.iata));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Which aircraft are worth a route lookup, and their distance/bearing from the airport.
function candidates(aircraft, apt) {
  const list = [];
  for (const ac of aircraft) {
    const dist = distanceNm(apt.lat, apt.lon, ac.lat, ac.lon);
    const toApt = bearingDeg(ac.lat, ac.lon, apt.lat, apt.lon);
    const onAirport = ac.onGround && dist <= ON_AIRPORT_NM;
    const climbingOut = !ac.onGround && dist <= DEP_AIRBORNE_NM && (ac.vrate ?? 0) > 0;
    const inbound = !ac.onGround && dist <= AREA_NM
      && (dist <= 30 || (ac.track !== null && angleDiff(ac.track, toApt) <= HEADING_TOLERANCE));
    if (onAirport || climbingOut || inbound) list.push({ ac, dist, onAirport, climbingOut, inbound });
  }
  return list.sort((a, b) => a.dist - b.dist);
}

// Returns { departures, arrivals, unknown, lookups, skipped }. Each item: { ac, dist, route, other, etaMin?, status }.
export async function airportTraffic(apt) {
  const aircraft = await fetchAircraft(apt.lat, apt.lon, AREA_NM);
  const cands = candidates(aircraft, apt);
  const withCallsign = cands.filter((c) => c.ac.callsign);
  const toLookup = withCallsign.slice(0, MAX_LOOKUPS);
  const routes = await mapLimit(toLookup, CONCURRENCY, (c) => fetchRoute(c.ac.callsign).catch(() => null));
  toLookup.forEach((c, i) => { c.route = routes[i]; });

  const departures = [];
  const arrivals = [];
  const unknown = [];
  for (const c of cands) {
    const { ac, route } = c;
    if (route && sameAirport(route.origin, apt) && (c.onAirport || c.climbingOut)) {
      departures.push({ ...c, other: route.destination,
        status: c.onAirport ? 'On ground' : `Climbing · ${Math.round(c.dist)} nm` });
    } else if (route && sameAirport(route.destination, apt) && !ac.onGround) {
      const etaMin = ac.gs > 50 ? Math.round((c.dist / ac.gs) * 60) : null;
      arrivals.push({ ...c, other: route.origin, etaMin,
        status: `${Math.round(c.dist)} nm${etaMin !== null ? ` · ETA ${etaMin} min` : ''}` });
    } else if (!route && c.onAirport) {
      unknown.push({ ...c, other: null, status: 'On ground' });
    }
  }
  departures.sort((a, b) => (b.onAirport - a.onAirport) || a.dist - b.dist);
  arrivals.sort((a, b) => (a.etaMin ?? Infinity) - (b.etaMin ?? Infinity));
  return {
    departures, arrivals, unknown,
    lookups: toLookup.length,
    skipped: withCallsign.length - toLookup.length,
  };
}
