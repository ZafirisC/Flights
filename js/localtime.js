// Local time at an airport from its IANA time zone (data/airports.json "tz"), via the browser Intl API.
export function localTime(tz, now = new Date()) {
  if (!tz) return null;
  try {
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value || '';
    const offset = part.replace('GMT', 'UTC') || 'UTC';
    return { time, offset: offset === 'UTC' ? 'UTC+0' : offset, text: `Local ${time} (${offset === 'UTC' ? 'UTC+0' : offset})` };
  } catch {
    return null; // unknown time zone
  }
}
