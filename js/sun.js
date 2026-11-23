// Sun position (elevation and azimuth, degrees) for a place and time. Low-precision almanac formula (~0.5°).
const rad = Math.PI / 180;

export function sunPosition(lat, lon, ms) {
  const d = ms / 86400000 - 10957.5; // days since J2000.0 (2000-01-01 12:00 UTC)
  const g = (357.529 + 0.98560028 * d) * rad; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * rad; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (280.46061837 + 360.98564736629 * d) * rad;
  const H = gmst + lon * rad - ra; // local hour angle
  const la = lat * rad;
  const elev = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(la) - Math.cos(dec) * Math.sin(la) * Math.cos(H));
  return { elev: elev / rad, az: ((az / rad) + 360) % 360 };
}
