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
