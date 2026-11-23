// Plain-English METAR/TAF text (airport Weather tab) and airport-local time labels. Pure code, no DOM.

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const ft = (n) => `${n.toLocaleString('en')} ft`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function windPhrase(w) {
  if (!w) return null;
  if (w.calm) return 'calm wind';
  const gust = w.gustKt ? `, gusting ${w.gustKt} kt` : '';
  if (w.dir === 'VRB') return `variable wind at ${w.speedKt} kt${gust}`;
  let vary = '';
  if (w.varFrom !== undefined) {
    const a = compass(w.varFrom);
    const b = compass(w.varTo);
    vary = a === b ? `, varying ${w.varFrom}°–${w.varTo}°` : `, varying between ${a} and ${b}`;
  }
  return `wind from the ${compass(w.dir)} (${String(w.dir).padStart(3, '0')}°) at ${w.speedKt} kt${gust}${vary}`;
}

export function visPhrase(v) {
  if (!v?.text) return null;
  return v.meters >= 9999 ? 'visibility 10 km or more' : `visibility ${v.text}`;
}

const COVER_WORDS = { FEW: 'a few clouds at', SCT: 'scattered cloud at', BKN: 'broken cloud at', OVC: 'overcast at' };

export function cloudPhrase(clouds) {
  if (clouds === undefined || clouds === null) return null;
  if (!clouds.length) return 'no significant cloud';
  return clouds.map((c) => {
    const type = c.type ? ` (${c.type})` : '';
    if (c.cover === 'VV') return `sky obscured, vertical visibility ${c.baseFt !== null ? ft(c.baseFt) : 'not reported'}`;
    return `${COVER_WORDS[c.cover]} ${c.baseFt !== null ? ft(c.baseFt) : 'unknown height'}${type}`;
  }).join(', ');
}

// Short cloud label for the meteogram: "broken 1,200".
export function cloudLabel(c) {
  const word = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast', VV: 'obscured' }[c.cover];
  return c.baseFt !== null ? `${word} ${c.baseFt.toLocaleString('en')}` : word;
}

// Elements of a forecast group as one sentence: "Rain, visibility 4 km, wind …, broken cloud at 1,200 ft."
export function groupSentence(el) {
  if (el.cavok && !el.wind) return 'Good visibility, no significant cloud or weather.';
  const parts = [
    !el.cavok && el.weather && (el.weather.length ? el.weather.map(lower).join(', ') : 'no significant weather'),
    windPhrase(el.wind),
    el.cavok ? 'good visibility, no significant cloud or weather' : visPhrase(el.visibility),
    el.cavok ? null : cloudPhrase(el.clouds),
  ].filter(Boolean);
  return parts.length ? `${cap(parts.join(', '))}.` : 'No details given.';
}

// Decoded METAR (decodeMetar) as sentences, then the 2-hour trend.
export function metarSentences(d) {
  const s = [];
  if (d.weather.length) s.push(`${d.weather.join(', ')}.`);
  if (d.wind) s.push(`${cap(windPhrase(d.wind))}.`);
  if (d.cavok) s.push('Visibility 10 km or more, no significant cloud.');
  else {
    if (visPhrase(d.visibility)) s.push(`${cap(visPhrase(d.visibility))}.`);
    if (d.clouds.length) s.push(`${cap(cloudPhrase(d.clouds))}.`);
  }
  if (d.tempC !== null) s.push(`${d.tempC} °C${d.dewC !== null ? `, dew point ${d.dewC} °C` : ''}.`);
  if (d.qnhHpa !== null) s.push(`Pressure (QNH) ${d.qnhHpa} hPa.`);
  return s;
}

export function trendSentence(trend) {
  if (!trend?.length) return null;
  if (trend.some((g) => g.kind === 'NOSIG')) return 'No significant change expected in the next 2 hours.';
  return trend.map((g) => `Next 2 hours, ${g.kind === 'TEMPO' ? 'at times' : 'becoming'}: ${lower(groupSentence(g))}`).join(' ');
}

// Badge text for a TAF period kind.
export function periodKind(p) {
  if (p.kind === 'TEMPO') return 'At times';
  if (p.kind === 'PROB') return `${p.prob}% chance${p.tempo ? ', at times' : ''}`;
  if (p.kind === 'BECMG') return 'Changing';
  return null;
}

// --- Airport-local time labels ------------------------------------------------------------------------------

const formatters = new Map();
function parts(ms, tz) {
  const key = tz || 'UTC';
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: key, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: 'numeric' });
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: 'numeric' });
    }
    formatters.set(key, f);
  }
  const o = {};
  for (const p of f.formatToParts(ms)) o[p.type] = p.value;
  return { weekday: o.weekday, day: +o.day, hour: +o.hour, minute: +o.minute, hm: `${o.hour}:${o.minute}`, date: `${o.year}-${o.month}-${o.day}` };
}
export { parts as localParts };

function dayWord(ms, tz, now) {
  const d = parts(ms, tz).date;
  if (d === parts(now, tz).date) return 'Today';
  if (d === parts(now + 86400000, tz).date) return 'Tomorrow';
  return parts(ms, tz).weekday;
}

// "Today 14:00", "Tomorrow 02:00", "Sat 14:00".
export const dayTime = (ms, tz, now) => `${dayWord(ms, tz, now)} ${parts(ms, tz).hm}`;

// "Today 14:00 – 20:00", "Tomorrow 02:00 – 06:00", "Until Sat 14:00", "Today 22:00 – Sat 14:00".
export function periodWhen(from, to, tz, now) {
  const end = `${parts(to, tz).hm}`;
  if (from <= now) return `Until ${dayWord(to, tz, now) === 'Today' ? '' : `${dayWord(to, tz, now)} `}${end}`;
  const d1 = dayWord(from, tz, now);
  const d2 = dayWord(to, tz, now);
  const sameDay = parts(from, tz).date === parts(to, tz).date || (parts(to, tz).hm === '00:00' && to - from <= 86400000);
  return `${d1} ${parts(from, tz).hm} – ${sameDay ? '' : `${d2} `}${end}`;
}
