// Airport panel header art: the country's flag faded behind the name, and a watermark outline of the
// country (US: the lower 48 with the airport's state filled in) with a dot at the airport.
// Shapes come from data/shapes.json (scripts/build_shapes.mjs); flags from icons/flags/ (flag-icons, MIT).

const RAD = Math.PI / 180;
const ISO2 = /^[A-Z]{2}$/;

// Same projection the build script drew the path with (plate carrée centred on lon0, x scaled by c).
export function project(p, lat, lon) {
  const l = ((((lon - p.lon0) % 360) + 540) % 360) - 180;
  return [p.tx + p.s * p.c * l * RAD, p.ty - p.s * lat * RAD];
}

// { d, hl?, x, y } for an airport, or null when there is no outline for its country / state.
export function regionShape(shapes, a) {
  if (!shapes || !a || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return null;
  const st = a.country === 'US' && shapes.us?.states?.[a.region];
  let s;
  if (typeof st === 'string') s = { p: shapes.us.p, d: shapes.us.d, hl: st };
  else if (st) s = { p: st.p, d: st.d };
  else s = shapes.countries?.[a.country];
  if (!s?.d) return null;
  const [x, y] = project(s.p, a.lat, a.lon);
  if (!(x > -5 && x < 105 && y > -5 && y < 105)) return { d: s.d, hl: s.hl }; // misplaced coordinates: no dot
  return { d: s.d, hl: s.hl, x: +x.toFixed(1), y: +y.toFixed(1) };
}

export function shapeSvg(shape) {
  if (!shape) return '';
  const dot = shape.x === undefined ? ''
    : `<circle class="ring" cx="${shape.x}" cy="${shape.y}" r="${shape.hl ? 4.5 : 6}"/><circle class="dot" cx="${shape.x}" cy="${shape.y}" r="${shape.hl ? 2.2 : 3}"/>`;
  return `<svg class="head-shape${shape.hl ? ' has-hl' : ''}" viewBox="0 0 100 100" aria-hidden="true">
    <path d="${shape.d}"/>${shape.hl ? `<path class="hl" d="${shape.hl}"/>` : ''}${dot}</svg>`;
}

export function flagImg(country) {
  if (!ISO2.test(country || '')) return '';
  return `<img class="head-flag" src="icons/flags/${country.toLowerCase()}.svg" alt="" aria-hidden="true" onerror="this.remove()">`;
}
