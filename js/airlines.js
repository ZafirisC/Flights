// IATA → ICAO airline codes, so a flight number like "A3 123" can be searched as callsign "AEE123".
// Common carriers around Greece and Europe; extend as needed.
export const IATA_TO_ICAO = {
  A3: 'AEE', OA: 'OAL', GQ: 'SEH', FR: 'RYR', RK: 'RUK', U2: 'EZY', EC: 'EJU', DS: 'EZS', W6: 'WZZ',
  W4: 'WMT', LH: 'DLH', EW: 'EWG', '4Y': 'OCN', DE: 'CFG', BA: 'BAW', AF: 'AFR', KL: 'KLM', HV: 'TRA',
  LX: 'SWR', OS: 'AUA', SN: 'BEL', TK: 'THY', PC: 'PGT', VY: 'VLG', IB: 'IBE', AZ: 'ITY', TP: 'TAP',
  SK: 'SAS', DY: 'NOZ', D8: 'NSZ', AY: 'FIN', LO: 'LOT', RO: 'ROT', FB: 'LZB', JU: 'ASL', OU: 'CTN',
  OK: 'CSA', BT: 'BTI', LG: 'LGL', EI: 'EIN', LS: 'EXS', BY: 'TOM', X3: 'TUI', OR: 'TFL', EN: 'DLA',
  CY: 'CYP', MS: 'MSR', ET: 'ETH', EK: 'UAE', QR: 'QTR', EY: 'ETD', FZ: 'FDB', G9: 'ABY', SV: 'SVA',
  RJ: 'RJA', ME: 'MEA', LY: 'ELY', IZ: 'AIZ', '6H': 'ISR', PS: 'AUI', H4: 'HLE', DL: 'DAL', UA: 'UAL',
  AA: 'AAL', AC: 'ACA', SQ: 'SIA', CX: 'CPA', QF: 'QFA',
};

export const ICAO_TO_IATA = Object.fromEntries(Object.entries(IATA_TO_ICAO).map(([iata, icao]) => [icao, iata]));

// "OAL98" → { iata: 'OA98', icao: 'OAL98' }; null when the airline is unknown or the callsign is not a flight number.
export function flightNumbers(callsign) {
  const m = (callsign || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{3})0*(\d{1,4}[A-Z]{0,2})$/);
  if (!m || !ICAO_TO_IATA[m[1]]) return null;
  return { iata: ICAO_TO_IATA[m[1]] + m[2], icao: m[1] + m[2] };
}
