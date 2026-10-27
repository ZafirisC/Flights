// Scheduled vs actual / estimated departure and arrival (AeroDataBox data from the Worker).
const IN_AIR = ['Departed', 'EnRoute', 'Approaching', 'Arrived', 'Diverted'];
const ms = (t) => (t?.utc ? Date.parse(t.utc.replace(' ', 'T')) : NaN);

// The leg that matches "now": one in the air, else the one scheduled closest to now.
export function pickFlight(flights, now = Date.now()) {
  const list = (flights || []).filter((f) => f.departure?.scheduled || f.arrival?.scheduled);
  const live = list.find((f) => ['Departed', 'EnRoute', 'Approaching'].includes(f.status));
  if (live) return live;
  const when = (f) => ms(f.departure?.scheduled) || ms(f.arrival?.scheduled);
  return list.sort((a, b) => Math.abs(when(a) - now) - Math.abs(when(b) - now))[0] || null;
}

// Delay colour: green ≤ 15 min (or early), orange ≤ 45, red above.
export const delayClass = (min) => (min <= 15 ? 'ok' : min <= 45 ? 'warn' : 'bad');

// One end (departure / arrival) → { scheduled, time, kind: 'Actual' | 'Estimated', delayMin } or null.
export function endTimes(end, happened) {
  if (!end?.scheduled) return null;
  // Once it happened, revisedTime is the actual gate time (compare like with like); runway time only as fallback.
  const actual = happened || end.runway ? end.revised || end.runway : null;
  const est = actual ? null : end.revised || end.predicted;
  const t = actual || est;
  const delay = t ? Math.round((ms(t) - ms(end.scheduled)) / 60000) : null;
  return { scheduled: end.scheduled, time: t || null, kind: actual ? 'Actual' : t ? 'Estimated' : null,
    delayMin: Number.isFinite(delay) ? delay : null };
}

export function flightTimes(f) {
  if (!f) return null;
  const dep = endTimes(f.departure, IN_AIR.includes(f.status));
  const arr = endTimes(f.arrival, f.status === 'Arrived');
  return dep || arr ? { dep, arr, number: f.number, status: f.status } : null;
}

// "12:05" in the airport's local time (AeroDataBox "local": "2026-10-27 12:05+02:00").
export const hhmm = (t) => (t?.local ? t.local.slice(11, 16) : t?.utc ? `${t.utc.slice(11, 16)}Z` : null);

export function delayText(min) {
  if (min === null) return '';
  if (min < 0) return `${-min} min early`;
  return min === 0 ? 'On time' : `+${min} min`;
}
