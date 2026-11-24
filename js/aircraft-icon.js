// Map marker SVG for one aircraft: a top-view shape for its family (js/aircraft-types.js), shaded by the sun at its
// position, with a flat shadow that falls away from the sun. Pure string building, no DOM.
// The shadow is drawn in map orientation (north up) and only the aircraft body is rotated to its track.
// No CSS filters: they make panning slow with hundreds of markers on a phone.
import { familyOf, FAMILIES } from './aircraft-types.js';

const D = Math.PI / 180;
const UNITS = 62; // local units across a marker
export const SHADOW_PAD = 14; // px around the marker box that the shadow and rotor may use
const MAX_SHADOW_PX = 12;
const DIH = 0.17; // wing dihedral: the right wing's surface leans toward the fuselage
let gradId = 0;

const f = (n) => +n.toFixed(2);
const css = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')},${a})`;

// '#rrggbb' or 'hsl(h, s%, l%)' (js/altitude.js) → [r, g, b] in 0..1.
export function parseColor(str) {
  const hex = /^#([\da-f]{6})$/i.exec(str);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255);
  const m = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i.exec(str);
  if (!m) return [0.6, 0.6, 0.6];
  const h = +m[1], s = m[2] / 100, l = m[3] / 100; const a = s * Math.min(l, 1 - l);
  const g = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [g(0), g(8), g(4)];
}

// Shadow distance on the map in px: grows with altitude and as the sun gets lower, capped. null at night.
export function shadowOffset({ alt, onGround, el }) {
  if (el < -0.5) return null;
  if (onGround) return 1;
  const altT = Math.min(1, Math.max(0, alt ?? 0) / 40000);
  return Math.min(MAX_SHADOW_PX, (1.6 + 6 * altT) / Math.tan(Math.max(4, el) * D));
}

// Unit vector pointing away from the sun on screen (x east, y south).
export const awayFromSun = (az) => [-Math.sin(az * D), Math.cos(az * D)];

function painter(rgb, sunAz, el, track) {
  const night = el < -0.5;
  const r = (sunAz - track) * D, e = el * D;
  const L = { x: Math.sin(r) * Math.cos(e), y: Math.cos(r) * Math.cos(e), z: Math.sin(e) }; // x right wing, y nose, z up
  const tw = Math.min(1, Math.max(0, (el + 2) / 10)); // weaker direct light near the horizon
  const defs = [];
  const shade = (n, o = {}) => {
    const len = Math.hypot(...n);
    const d = night ? 0 : Math.max(0, (n[0] * L.x + n[1] * L.y + n[2] * L.z) / len);
    const k = night ? 0.5 : (o.amb ?? 0.48) + (o.dif ?? 0.72) * d * (0.4 + 0.6 * tw);
    let out = (o.rgb ?? rgb).map((v) => v * k);
    if (o.spec && !night) { const s = Math.pow(d, 14) * o.spec; out = out.map((v) => v + (1 - v) * s); }
    return css(out);
  };
  // Gradient across a cylinder lying along y (fuselage, engine).
  const cyl = (cx, w, o = {}) => {
    const id = `acg${++gradId}`; let s = '';
    for (let i = 0; i <= 6; i++) { const th = (-1 + i / 3) * 1.25;
      s += `<stop offset="${f(i / 6)}" stop-color="${shade([Math.sin(th), 0, Math.cos(th)], o)}"/>`; }
    defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(cx - w)}" y1="0" x2="${f(cx + w)}" y2="0">${s}</linearGradient>`);
    return `url(#${id})`;
  };
  return { night, L, shade, cyl, defs, pale: rgb.map((v) => v * 0.7 + 0.3) };
}

const OUT = 'stroke="rgba(10,14,20,.85)" stroke-width="0.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"';
const THIN = 'stroke="rgba(10,14,20,.6)" stroke-width="0.5" vector-effect="non-scaling-stroke"';
const BLUR = 'var(--ac-blur, rgba(30,36,42,.28))';
const pth = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const mirror = (d) => d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x, y) => `${f(-x)},${y}`);

function fusPath({ y0, y1, w, nl, tl, tw }) {
  return `M0,${y0} C${f(w * 0.75)},${y0} ${w},${f(y0 + nl * 0.5)} ${w},${f(y0 + nl)} L${w},${f(y1 - tl)} C${w},${f(y1 - tl * 0.4)} ${tw},${y1} 0,${y1}`
    + ` C${-tw},${y1} ${-w},${f(y1 - tl * 0.4)} ${-w},${f(y1 - tl)} L${-w},${f(y0 + nl)} C${-w},${f(y0 + nl * 0.5)} ${f(-w * 0.75)},${y0} 0,${y0}Z`;
}
const planform = ({ rx, ry, tx, ty, tc, rc }) => `M${rx},${ry} L${tx},${ty} Q${f(tx + 0.9)},${f(ty + tc * 0.5)} ${tx},${f(ty + tc)} L${rx},${f(ry + rc)}Z`;
const navLights = (x, y) => `<circle cx="${-x}" cy="${y}" r="3.2" fill="rgba(255,40,40,.35)"/><circle cx="${-x}" cy="${y}" r="1.3" fill="#ff4a4a"/>`
  + `<circle cx="${x}" cy="${y}" r="3.2" fill="rgba(40,255,110,.35)"/><circle cx="${x}" cy="${y}" r="1.3" fill="#3dff7a"/>`;
const propDisc = (cx, cy, r) => ell(cx, cy, r, 0.9, BLUR)
  + `<rect x="${f(cx - r)}" y="${f(cy - 0.25)}" width="${f(r * 2)}" height="0.5" rx="0.25" fill="${BLUR}"/>`;

const cache = new Map(); // family → { sil, ... } built once
function geometry(key) {
  if (cache.has(key)) return cache.get(key);
  const s = FAMILIES[key];
  let g;
  if (s.heli) {
    g = { sil: '<circle cx="0" cy="-4" r="26" fill-opacity="0.22"/><ellipse cx="0" cy="-5" rx="5.6" ry="9.5"/>'
      + '<rect x="-1.1" y="3" width="2.2" height="22" rx="1"/><rect x="-6" y="17.5" width="12" height="2.4" rx="1.2"/><circle cx="0" cy="25" r="2.6"/>' };
  } else {
    const fus = fusPath(s.fus), wing = planform(s.wing), stab = planform(s.stab);
    const sil = [fus, wing, mirror(wing), stab, mirror(stab)].map((d) => `<path d="${d}"/>`);
    for (const e of s.engines || []) for (const sx of [1, -1]) {
      sil.push(`<ellipse cx="${sx * e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}"/>`);
      if (e.kind === 'prop') sil.push(`<ellipse cx="${sx * e.x}" cy="${f(e.y - e.ry - 0.8)}" rx="${e.prop}" ry="0.9" fill-opacity="0.35"/>`);
    }
    if (s.noseProp) sil.push(`<ellipse cx="0" cy="${s.fus.y0 - 0.9}" rx="${s.noseProp}" ry="0.9" fill-opacity="0.35"/>`);
    let le = null;
    if (s.wing.le) { const { rx, ry, tx, ty } = s.wing; le = `M${rx + 0.2},${ry + 0.4} L${f(tx - 0.3)},${f(ty + 0.1)} L${f(tx - 0.1)},${f(ty + 0.9)} L${rx + 0.2},${f(ry + 1.7)}Z`; }
    g = { sil: sil.join(''), fus, wing, stab, le, hump: s.hump && fusPath(s.hump) };
  }
  cache.set(key, g);
  return g;
}

function heliBody(p) {
  const blades = [0, 90, 180, 270].map((a) => `<rect x="-0.7" y="-30" width="1.4" height="26" rx="0.7" transform="rotate(${a} 0 -4)"/>`).join('');
  return `<rect x="-6" y="17.5" width="12" height="2.4" rx="1.2" fill="${p.shade([0, 0, 1])}" ${OUT}/>`
    + `<rect x="-1.1" y="3" width="2.2" height="22" rx="1" fill="${p.cyl(0, 1.1)}" ${OUT}/>`
    + `<circle cx="0" cy="25" r="2.6" fill="${p.cyl(0, 2.6, { spec: 0.5 })}" ${OUT}/><circle cx="0" cy="25" r="1.3" fill="#0d1318"/>`
    + `<ellipse cx="0" cy="-5" rx="5.6" ry="9.5" fill="${p.cyl(0, 5.6, { spec: 0.6 })}" ${OUT}/>`
    + pth('M-4.4,-10 Q0,-15.6 4.4,-10 L3.6,-8.2 Q0,-12 -3.6,-8.2Z', p.night ? '#ffe9a8' : 'rgba(8,14,22,.9)')
    + `<circle cx="0" cy="-4" r="26" fill="var(--ac-disc, rgba(30,36,42,.1))"/>`
    + `<g transform="rotate(22 0 -4)" fill="var(--ac-blade, rgba(20,26,32,.55))">${blades}</g>`
    + `<circle cx="0" cy="-4" r="1.6" fill="${p.shade([0, 0, 1], { spec: 0.8, rgb: p.pale })}" ${THIN}/>`
    + (p.night ? '<circle cx="-5.4" cy="-3" r="1.1" fill="#ff4a4a"/><circle cx="5.4" cy="-3" r="1.1" fill="#3dff7a"/>' : '');
}

function fixedWingBody(s, g, p) {
  const out = [];
  const stabs = () => out.push(pth(g.stab, p.shade([-0.1, 0, 1]), OUT), pth(mirror(g.stab), p.shade([0.1, 0, 1]), OUT));
  const wings = () => {
    out.push(pth(g.wing, p.shade([-DIH, 0, 1]), OUT), pth(mirror(g.wing), p.shade([DIH, 0, 1]), OUT));
    if (g.le) out.push(pth(g.le, p.shade([-0.1, 0.7, 0.7], { spec: 0.7, rgb: p.pale })), pth(mirror(g.le), p.shade([0.1, 0.7, 0.7], { spec: 0.7, rgb: p.pale })));
  };
  const engines = (kind) => {
    for (const e of s.engines || []) if (e.kind === kind) for (const sx of [1, -1]) {
      const cx = sx * e.x;
      if (kind === 'rear') out.push(`<rect x="${f(sx > 0 ? s.fus.w - 0.3 : cx + e.rx - 0.3)}" y="${e.y - 1.2}" width="${f(e.x - e.rx - s.fus.w + 0.6)}" height="2.4" fill="${p.shade([0, 0, 1])}" ${THIN}/>`);
      out.push(ell(cx, e.y, e.rx, e.ry, p.cyl(cx, e.rx, { spec: 0.6 }), OUT));
      if (kind === 'prop') {
        out.push(ell(cx, e.y - e.ry + 0.2, 0.9, 1.4, p.shade([0, 0.6, 0.8], { spec: 0.8, rgb: p.pale }), THIN));
        out.push(propDisc(cx, e.y - e.ry - 0.8, e.prop));
      } else out.push(ell(cx, e.y - e.ry + 0.6, f(e.rx * 0.66), f(Math.min(0.8, e.ry * 0.16)), '#0d1318'));
    }
  };
  if (!s.stab.t) stabs();
  engines('jet');
  if (!s.wing.high) wings();
  out.push(pth(g.fus, p.cyl(0, s.fus.w, { spec: 0.5 }), OUT));
  if (g.hump) out.push(pth(g.hump, p.cyl(0, s.hump.w, { spec: 0.6, amb: 0.56 }), THIN));
  if (s.wing.high) wings();
  engines('prop');
  engines('rear');
  const fn = s.fin;
  out.push(`<rect x="-0.85" y="${fn.y0}" width="1.7" height="${f(fn.y1 - fn.y0)}" rx="0.85" fill="${p.shade([0.3 * Math.sign(p.L.x || 1), 0, 1], { spec: 0.8, amb: 0.7 })}" ${OUT}/>`);
  if (s.stab.t) stabs();
  if (s.noseProp) {
    out.push(ell(0, s.fus.y0 + 0.6, 1, 1.3, p.shade([0, 0.6, 0.8], { spec: 0.8, rgb: p.pale }), THIN));
    out.push(propDisc(0, s.fus.y0 - 0.9, s.noseProp));
  }
  const ws = s.windscreen, w2 = s.fus.w * 0.62;
  out.push(pth(`M${f(-w2)},${ws} Q0,${f(ws - 1.6)} ${f(w2)},${ws} L${f(w2 * 0.9)},${f(ws + 1)} Q0,${f(ws - 0.3)} ${f(-w2 * 0.9)},${f(ws + 1)}Z`, p.night ? '#ffe9a8' : 'rgba(8,14,22,.9)'));
  if (p.night) out.push(navLights(f(s.wing.tx + 0.4), f(s.wing.ty + s.wing.tc * 0.5)));
  return out.join('');
}

// { html, size } for a divIcon. size = marker box in px; the SVG overflows it by SHADOW_PAD on each side.
// sun = { az, el } in degrees at the aircraft. scale enlarges the marker (emergencies).
export function aircraftIcon({ type, category, color, track, alt, onGround, sun, scale = 1 }) {
  const key = familyOf(type, category);
  const s = FAMILIES[key];
  const g = geometry(key);
  const size = Math.round(s.size * scale);
  const hdg = Math.round(track ?? 0);
  const ppu = size / UNITS; // px per unit
  const p = painter(parseColor(color), sun.az, sun.el, hdg);
  const body = s.heli ? heliBody(p) : fixedWingBody(s, g, p);

  let shadow = '';
  const offPx = shadowOffset({ alt, onGround, el: sun.el });
  if (offPx !== null) {
    const [ax, ay] = awayFromSun(sun.az);
    const off = offPx / ppu;
    const altT = Math.min(1, Math.max(0, alt ?? 0) / 40000);
    const fade = Math.min(1, Math.max(0, (sun.el + 1) / 7));
    const op = (onGround ? 1.25 : 1 - 0.45 * altT) * fade;
    let fin = '';
    if (s.fin) { // the vertical tail casts a streak of its own, longer when the sun is low
      const len = Math.min(26, s.fin.h / Math.tan(Math.max(4, sun.el) * D)); const r = hdg * D;
      const rot = (x, y) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
      const a = rot(0, s.fin.y0), b = rot(0, s.fin.y1), t = rot(0, (s.fin.y0 + s.fin.y1) / 2);
      fin = `<polygon points="${[a, b, [b[0] + ax * len, b[1] + ay * len], [t[0] + ax * len, t[1] + ay * len]].map((q) => q.map(f).join(',')).join(' ')}"/>`;
    }
    shadow = `<g class="ac-shadow" style="opacity:calc(var(--ac-shadow-k, .3) * ${f(op)})" fill="var(--ac-shadow, #14202b)" transform="translate(${f(ax * off)},${f(ay * off)})">`
      + `<g transform="rotate(${hdg})">${g.sil}</g>${fin}</g>`;
  }
  const half = f((size / 2 + SHADOW_PAD) / ppu);
  const box = size + 2 * SHADOW_PAD;
  const html = `<svg class="ac-svg" viewBox="${-half} ${-half} ${f(2 * half)} ${f(2 * half)}" width="${box}" height="${box}">`
    + `<defs>${p.defs.join('')}</defs>${shadow}<g class="ac-body" transform="rotate(${hdg})">${body}</g></svg>`;
  return { html, size, family: key };
}
