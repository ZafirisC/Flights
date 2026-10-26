// Open-Meteo weather codes (WMO) → short text.
const CODES = [
  [[0], 'Clear'], [[1], 'Mainly clear'], [[2], 'Partly cloudy'], [[3], 'Overcast'], [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'], [[61, 63, 65, 66, 67], 'Rain'], [[71, 73, 75, 77], 'Snow'],
  [[80, 81, 82], 'Showers'], [[85, 86], 'Snow showers'], [[95, 96, 99], 'Thunderstorm'],
];

export function weatherText(code) {
  if (code === null || code === undefined) return 'Not available';
  return CODES.find(([codes]) => codes.includes(code))?.[1] ?? 'Not available';
}
