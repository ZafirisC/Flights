// Aircraft family from the ICAO type code (or ADS-B emitter category), and each family's top-view geometry.
// Pure data + lookup, no DOM. Geometry is in local units, nose toward -y, about 62 units across.

// Checked in order; the first match wins.
const TYPE_RULES = [
  ['H', /^(EC\d|H1[2-7]|H160|AS3|AS5|AS6|B06|B4\d\d|B47|R22|R44|R66|A1(09|19|29|39|49|69|89)|AW1|S76|S92|EH10|NH90|MI\d|UH\d|CH\d|AH\d|BK17|EXPL|G2CA|CABR)/],
  ['Q', /^(B74|A34|A38|IL96|A124|A225)/],
  ['W', /^(A30|A310|A33|A35|B76|B77|B78|MD11|DC10|L101|IL86)/],
  ['R', /^(CRJ|E13|E14|F70|F100|MD8|MD9|B712|DC9|GLF|GL5|GL6|GL7|GLEX|GALX|G280|C25|C5\d|C6\d|C7\d|CL3|CL6|LJ|E50P|E55P|F2TH|FA\d|F900|H25|PRM1|HDJT|BE40|ASTR|SF50|EA50)/],
  ['T', /^(AT4|AT7|DH8|SF34|SB20|D328|F50|F27|JS3|JS4|E120|B190|BE20|BE30|BE9|B350|DHC6|L410|AN2[46]|SW4|C212|CN35|C295|C130|Y12|MA60|P180)/],
  ['N', /^(A2\dN|A31|A32|A22|B73|B3\dM|B75|BCS|E1[79]|E2[79]|E75|C919|SU95|A148|T204)/],
  ['L', /^(C1\d\d|C2\d\d|C3\d\d|P2|P3|PA|SR2|DA\d|M20|BE[23]|C208|PC12|PC6|TBM|DR4|RV\d|AA5|G115|TB\d|EV97|CH60|P92|ULAC|GLID)/],
];
// ADS-B emitter category when the type is missing: A1 light, A2 small (business jets), A3 large, A4 757, A5 heavy, A7 rotorcraft.
const CATEGORY = { A1: 'L', A2: 'R', A3: 'N', A4: 'N', A5: 'W', A7: 'H' };

export function familyOf(type, category) {
  const t = String(type || '').toUpperCase().trim();
  if (t) for (const [key, re] of TYPE_RULES) if (re.test(t)) return key;
  return CATEGORY[String(category || '').toUpperCase()] || 'U';
}

// Fixed-wing spec: fus = fuselage, wing/stab = right-hand planform (root LE rx,ry; tip LE tx,ty; tip chord tc; root chord rc),
// fin = vertical tail (y range, height for its shadow), engines mirrored left/right.
const NARROW = {
  size: 27, windscreen: -23.4,
  fus: { y0: -28, y1: 27.5, w: 3.2, nl: 6, tl: 10, tw: 0.4 },
  wing: { rx: 2.8, ry: -6, tx: 27, ty: 8.5, tc: 2.2, rc: 10.5, le: true },
  stab: { rx: 2.2, ry: 15.5, tx: 11.5, ty: 21.5, tc: 1.9, rc: 6 },
  fin: { y0: 15.5, y1: 27, h: 7 },
  engines: [{ kind: 'jet', x: 12.5, y: 0, rx: 2.3, ry: 5 }],
};
const WIDE_TAIL = { stab: { rx: 2.8, ry: 17.5, tx: 13.5, ty: 24.5, tc: 2.2, rc: 7 }, fin: { y0: 17, y1: 29.5, h: 8 } };

export const FAMILIES = {
  N: NARROW,
  U: { ...NARROW, size: 26 },
  W: { ...WIDE_TAIL, size: 31, windscreen: -24.6,
    fus: { y0: -30, y1: 30, w: 4, nl: 7, tl: 11, tw: 0.5 },
    wing: { rx: 3.6, ry: -6.5, tx: 30.5, ty: 11.5, tc: 2, rc: 14, le: true },
    engines: [{ kind: 'jet', x: 12, y: -1.6, rx: 3.2, ry: 5.8 }] },
  Q: { ...WIDE_TAIL, size: 34, windscreen: -25.2, fin: { y0: 17, y1: 29.5, h: 10 },
    fus: { y0: -30, y1: 30, w: 4, nl: 7, tl: 11, tw: 0.5 },
    hump: { y0: -28.6, y1: -9, w: 2.6, nl: 4, tl: 6, tw: 1 },
    wing: { rx: 3.6, ry: -6, tx: 30.5, ty: 12, tc: 2.2, rc: 14.5, le: true },
    engines: [{ kind: 'jet', x: 10, y: -1.6, rx: 2.3, ry: 4.6 }, { kind: 'jet', x: 19.5, y: 4.6, rx: 2.1, ry: 4.3 }] },
  T: { size: 25, windscreen: -23.4,
    fus: { y0: -27, y1: 27, w: 3, nl: 4.5, tl: 12, tw: 0.6 },
    wing: { rx: 0, ry: -8, tx: 28, ty: -6.4, tc: 3, rc: 5.4, high: true },
    stab: { rx: 0, ry: 21.5, tx: 9.5, ty: 23.4, tc: 2.4, rc: 4, t: true },
    fin: { y0: 15, y1: 26.5, h: 8 },
    engines: [{ kind: 'prop', x: 8.5, y: -6, rx: 1.9, ry: 6, prop: 6.2 }] },
  R: { size: 24, windscreen: -23.6,
    fus: { y0: -28, y1: 27, w: 2.7, nl: 6, tl: 12, tw: 0.5 },
    wing: { rx: 2.4, ry: -3, tx: 21, ty: 8, tc: 2, rc: 9, le: true },
    stab: { rx: 0, ry: 21.5, tx: 10.5, ty: 25.8, tc: 2, rc: 4.2, t: true },
    fin: { y0: 14, y1: 26, h: 8 },
    engines: [{ kind: 'rear', x: 6.2, y: 13, rx: 2.1, ry: 4.6 }] },
  L: { size: 19, windscreen: -15.6, noseProp: 6.5,
    fus: { y0: -21, y1: 24, w: 2.9, nl: 3, tl: 26, tw: 0.6 },
    wing: { rx: 0, ry: -9, tx: 27, ty: -8.6, tc: 5.4, rc: 6, high: true },
    stab: { rx: 0, ry: 18.5, tx: 10, ty: 19.4, tc: 3.6, rc: 4.8 },
    fin: { y0: 15, y1: 24, h: 6 } },
  H: { size: 22, heli: true },
};
