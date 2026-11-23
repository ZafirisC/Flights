// Typical economy layout and seat tips per aircraft type (ICAO type code). Hand-written, general guidance only:
// each airline configures its own cabin, so row numbers are deliberately not given.

const NARROW = [
  'Over-wing rows (roughly the middle third of the cabin) have the smoothest ride, but the wing blocks the view down.',
  'Front rows are quieter and get off first; the engines are loudest just behind the wing.',
];
const PROP = [
  'The wing is above the cabin, so the view down is clear from most rows.',
  'Rows level with the propellers are the noisiest.',
];
const WIDE = [
  'Seats just ahead of the wing are quieter and smoother; the rear cabin is the loudest.',
  'Bulkhead rows have more legroom but fixed armrests and are often used for baby cots.',
];
const EXIT = 'Exit rows have extra legroom, but come with age and assistance rules, and the row in front of an exit often cannot recline.';

const FAMILIES = [
  { name: 'Airbus A320 family', codes: ['A318', 'A319', 'A320', 'A321', 'A19N', 'A20N', 'A21N'], cabin: '3-3', left: 'A', right: 'F', tips: NARROW },
  { name: 'Boeing 737', codes: ['B736', 'B737', 'B738', 'B739', 'B37M', 'B38M', 'B39M', 'B3XM'], cabin: '3-3', left: 'A', right: 'F', tips: NARROW },
  { name: 'Boeing 757', codes: ['B752', 'B753'], cabin: '3-3', left: 'A', right: 'F', tips: NARROW },
  { name: 'Airbus A220', codes: ['BCS1', 'BCS3'], cabin: '2-3', left: 'A', right: 'F',
    tips: ['The two-seat side (A, C) has no middle seat.', ...NARROW] },
  { name: 'Embraer E-Jet', codes: ['E170', 'E75S', 'E75L', 'E190', 'E195', 'E290', 'E295'], cabin: '2-2', left: 'A', right: 'D',
    tips: ['No middle seats. Some airlines letter the seats A C / D F.', ...NARROW] },
  { name: 'Bombardier CRJ', codes: ['CRJ2', 'CRJ7', 'CRJ9', 'CRJX'], cabin: '2-2', left: 'A', right: 'D',
    tips: ['No middle seats. The engines are at the tail, so the front is much quieter.'] },
  { name: 'ATR 42/72', codes: ['AT43', 'AT45', 'AT46', 'AT72', 'AT75', 'AT76'], cabin: '2-2', left: 'A', right: 'D',
    tips: [...PROP, 'Boarding is often by the rear door, so rear rows can get off first. Some airlines letter the seats A C / D F.'] },
  { name: 'Dash 8', codes: ['DH8A', 'DH8B', 'DH8C', 'DH8D'], cabin: '2-2', left: 'A', right: 'D', tips: PROP },
  { name: 'Airbus A330', codes: ['A332', 'A333', 'A338', 'A339'], cabin: '2-4-2', left: 'A', right: 'K',
    tips: ['Window pairs (A–C, H–K) suit two people travelling together.', ...WIDE] },
  { name: 'Airbus A340', codes: ['A342', 'A343', 'A345', 'A346'], cabin: '2-4-2', left: 'A', right: 'K',
    tips: ['Window pairs (A–C, H–K) suit two people travelling together.', ...WIDE] },
  { name: 'Airbus A350', codes: ['A359', 'A35K'], cabin: '3-3-3', left: 'A', right: 'K', tips: WIDE },
  { name: 'Boeing 787', codes: ['B788', 'B789', 'B78X'], cabin: '3-3-3', left: 'A', right: 'K',
    tips: ['Large windows with electronic dimming instead of shades.', ...WIDE] },
  { name: 'Boeing 777', codes: ['B772', 'B773', 'B77L', 'B77W', 'B778', 'B779'], cabin: '3-4-3', left: 'A', right: 'K', tips: WIDE },
  { name: 'Boeing 767', codes: ['B762', 'B763', 'B764'], cabin: '2-3-2', left: 'A', right: 'K',
    tips: ['Window pairs suit two people travelling together.', ...WIDE] },
  { name: 'Boeing 747', codes: ['B744', 'B748'], cabin: '3-4-3', left: 'A', right: 'K', tips: WIDE },
  { name: 'Airbus A380', codes: ['A388'], cabin: '3-4-3', left: 'A', right: 'K',
    tips: ['The upper deck is quieter and window seats there have side storage bins.', ...WIDE] },
];

const BY_CODE = new Map(FAMILIES.flatMap((f) => f.codes.map((c) => [c, f])));

// → { name, cabin, left, right, tips } or null for an unknown type.
export function layoutFor(icaoType) {
  const f = icaoType && BY_CODE.get(String(icaoType).toUpperCase().trim());
  return f ? { name: f.name, cabin: f.cabin, left: f.left, right: f.right, tips: [...f.tips, EXIT] } : null;
}
