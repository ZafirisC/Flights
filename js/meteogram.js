// Meteogram for the airport Weather tab: wind, visibility and cloud on one time axis (airport local time).
// tafMeteogram() draws a TAF timeline (taf.js); modelMeteogram() draws the Open-Meteo hourly forecast for airports
// without a TAF. Both return an SVG string. Pure code, no DOM.
import { localParts, cloudLabel } from './wx-text.js';

const H = 3600000;
const W = 340;
const X0 = 10;
const X1 = 300; // plot area; axis labels on the right from X1 + 4
const Y = { wind: 10, arrow: 27, speed: 49, gust: 61, visLabel: 78, visTop: 84, visBot: 124, cloudLabel: 140, cloudTop: 146, cloudBot: 186, cat: 193 };
const VIS_MIN = 200;
const VIS_MAX = 10000;
const CLOUD_MAX = 5000;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const r1 = (n) => Math.round(n * 10) / 10;
const text = (x, y, s, cls = '', anchor = 'start') =>
  `<text x="${r1(x)}" y="${r1(y)}"${cls ? ` class="${cls}"` : ''}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;

const scale = (from, to) => (t) => X0 + ((Math.min(Math.max(t, from), to) - from) / (to - from)) * (X1 - X0);
const visY = (m) => Y.visBot - (Math.log(Math.min(Math.max(m, VIS_MIN), VIS_MAX) / VIS_MIN) / Math.log(VIS_MAX / VIS_MIN)) * (Y.visBot - Y.visTop);
// Square-root scale: more room for low cloud, where it matters.
const cloudY = (ft) => Y.cloudBot - Math.sqrt(Math.min(Math.max(ft, 0), CLOUD_MAX) / CLOUD_MAX) * (Y.cloudBot - Y.cloudTop);

export function visShort(m) {
  if (m >= 9999) return '10+ km';
  if (m >= 5000) return `${Math.round(m / 1000)} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace(/\.0$/, '')} km`;
  return `${Math.round(m / 50) * 50} m`;
}

function arrow(cx, w) {
  if (!w || w.dir === null || w.dir === undefined) return '';
  if (w.calm || w.speedKt === 0) return `<circle cx="${r1(cx)}" cy="${Y.arrow}" r="3.5" class="mg-calm"/>`;
  if (w.dir === 'VRB') return text(cx, Y.arrow + 4, 'VRB', 'm', 'middle');
  return `<g transform="translate(${r1(cx)} ${Y.arrow}) rotate(${Math.round(w.dir)})"><path d="M0 -8 V7 M-4 2 L0 8 L4 2" class="mg-arrow"/></g>`;
}

const speedText = (w) => {
  if (!w) return '';
  if (w.calm || w.speedKt === 0) return 'calm';
  return `${Math.round(w.speedKt)}${w.gustKt ? `G${Math.round(w.gustKt)}` : ''}`;
};

// Gridlines and time labels: every 6 h (3 h for short spans) of airport local time; day name under midnight.
function axis(from, to, tz, x, bottom) {
  const step = to - from > 18 * H ? 6 : 3;
  const out = [];
  const q = 15 * 60000;
  for (let t = Math.ceil(from / q) * q; t <= to; t += q) {
    const p = localParts(t, tz);
    if (p.minute !== 0 || p.hour % step) continue;
    const xx = x(t);
    out.push(`<line x1="${r1(xx)}" y1="14" x2="${r1(xx)}" y2="${bottom}" class="mg-grid"/>`);
    if (xx - X0 < 26 || X1 - xx < 12) continue;
    out.push(text(xx, bottom + 11, p.hm, 'm', 'middle'));
    if (p.hour === 0) out.push(text(xx, bottom + 22, `${p.weekday} ${p.day}`, 'm', 'middle'));
  }
  out.push(text(X0, bottom + 11, 'Now', 'b'));
  return out.join('');
}

function frames(bottom) {
  return [
    `<rect x="${X0}" y="${Y.visTop}" width="${X1 - X0}" height="${Y.visBot - Y.visTop}" rx="3" class="mg-box"/>`,
    `<rect x="${X0}" y="${Y.cloudTop}" width="${X1 - X0}" height="${Y.cloudBot - Y.cloudTop}" rx="3" class="mg-box"/>`,
    ...[1000, 5000].map((m) => `<line x1="${X0}" y1="${r1(visY(m))}" x2="${X1}" y2="${r1(visY(m))}" class="mg-grid"/>`),
    text(X1 + 4, visY(VIS_MAX) + 4, '10 km', 'm'),
    text(X1 + 4, visY(1000) + 4, '1 km', 'm'),
    text(X1 + 4, Y.visBot + 1, '200 m', 'm'),
    `<line x1="${X0}" y1="14" x2="${X0}" y2="${bottom}" class="mg-now"/>`,
  ].join('');
}

// Labels of overlapping "possible" groups go to separate lanes so they do not overlap.
function laneFor(lanes, x0, width) {
  let k = lanes.findIndex((end) => x0 > end + 4);
  if (k === -1) { k = lanes.length; lanes.push(0); }
  lanes[k] = x0 + width;
  return k;
}
const labelWidth = (s) => s.length * 5.2;

// x for a label of `width` inside [x0, x1] that avoids the blocked ranges (labels of possible groups); null if none.
function freeX(x0, x1, width, blocked) {
  let lx = x0 + 3;
  for (const [a, b] of [...blocked].sort((p, q) => p[0] - q[0])) {
    if (lx + width > a && lx < b) lx = b + 4;
  }
  return lx + width <= x1 ? lx : null;
}

function lowest(clouds) {
  const known = (clouds || []).filter((c) => c.baseFt !== null);
  return known.length ? known.reduce((a, b) => (b.baseFt < a.baseFt ? b : a)) : null;
}

export function tafMeteogram(tl, tz) {
  const { from, to } = tl;
  const x = scale(from, to);
  const bottom = Y.cat + 11;
  const out = [axis(from, to, tz, x, bottom), frames(bottom)];
  const stateAt = (t) => (tl.prevailing.find((p) => t >= p.from && t < p.to) || tl.prevailing.at(-1)).state;

  // Wind: 8 arrows across the period, expected conditions; possible winds/gusts in accent below.
  out.push(text(X0, Y.wind, 'Wind (kt), arrow shows where it blows', 'm'));
  for (let k = 0; k < 8; k++) {
    const t = from + ((k + 0.5) * (to - from)) / 8;
    const w = stateAt(t).wind;
    out.push(arrow(x(t), w), text(x(t), Y.speed, speedText(w), '', 'middle'));
  }
  let lastGust = -Infinity;
  for (const p of tl.possible) {
    const w = p.el.wind;
    if (!w) continue;
    const cx = (x(p.from) + x(p.to)) / 2;
    if (cx - lastGust < 50) continue;
    out.push(text(cx, Y.gust, w.gustKt ? `gusts ${w.gustKt}` : `wind ${w.speedKt}`, 'a', 'middle'));
    lastGust = cx;
  }

  // Visibility: expected as a solid step line, possible as dashed accent with a shaded band.
  out.push(text(X0, Y.visLabel, 'Visibility', 'm'));
  const visSegs = tl.prevailing.filter((p) => p.state.visibility?.meters !== undefined);
  out.push(`<path d="${visSegs.map((p, i) => `${i && visSegs[i - 1].to === p.from ? 'L' : 'M'}${r1(x(p.from))} ${r1(visY(p.state.visibility.meters))} H${r1(x(p.to))}`).join(' ')}" class="mg-line"/>`);
  let lanes = [];
  let blocked = [];
  for (const p of tl.possible) {
    if (!p.el.visibility && !p.el.weather?.length) continue;
    const m = p.state.visibility?.meters;
    if (m === undefined) continue;
    const y = visY(m);
    const x0 = x(p.from);
    const x1 = x(p.to);
    out.push(`<rect x="${r1(x0)}" y="${r1(y)}" width="${r1(x1 - x0)}" height="${r1(Y.visBot - y)}" class="mg-soft"/>`,
      `<line x1="${r1(x0)}" y1="${r1(y)}" x2="${r1(x1)}" y2="${r1(y)}" class="mg-poss"/>`);
    const wx = p.state.weather?.[0];
    const label = [visShort(m), wx && wx.toLowerCase(), p.prob && `${p.prob}%`].filter(Boolean).join(' · ');
    const lx = Math.min(x0 + 2, X1 - labelWidth(label));
    const lane = laneFor(lanes, lx, labelWidth(label));
    out.push(text(lx, (Y.visBot - y >= 14 ? y + 11 : y - 3) + lane * 10 * (Y.visBot - y >= 14 ? 1 : -1), label, 'a'));
    blocked.push([lx, lx + labelWidth(label)]);
  }
  for (const p of visSegs) {
    const y = visY(p.state.visibility.meters);
    const label = visShort(p.state.visibility.meters);
    const lx = freeX(x(p.from), x(p.to), labelWidth(label), blocked);
    if (lx !== null) out.push(text(lx, y < (Y.visTop + Y.visBot) / 2 ? y + 11 : y - 4, label));
  }

  // Cloud: every layer below 5,000 ft (solid = broken/overcast, dotted = few/scattered), lowest one labelled.
  out.push(text(X0, Y.cloudLabel, 'Cloud base (ft)', 'm'));
  out.push(text(X1 + 4, Y.cloudTop + 4, '5,000', 'm'), text(X1 + 4, cloudY(1000) + 4, '1,000', 'm'), text(X1 + 4, Y.cloudBot + 1, '0', 'm'),
    `<line x1="${X0}" y1="${r1(cloudY(1000))}" x2="${X1}" y2="${r1(cloudY(1000))}" class="mg-grid"/>`);
  for (const p of tl.prevailing) {
    const clouds = p.state.clouds;
    const x0 = x(p.from);
    const x1 = x(p.to);
    if (!clouds) continue;
    if (!clouds.length) { if (x1 - x0 > 30) out.push(text((x0 + x1) / 2, (Y.cloudTop + Y.cloudBot) / 2 + 4, 'clear', 'm', 'middle')); continue; }
    for (const c of clouds) {
      if (c.baseFt === null) continue;
      const y = cloudY(c.baseFt);
      out.push(`<line x1="${r1(x0)}" y1="${r1(y)}" x2="${r1(x1)}" y2="${r1(y)}" class="${/BKN|OVC|VV/.test(c.cover) ? 'mg-cloud' : 'mg-cloud thin'}"/>`);
    }
  }
  lanes = [];
  blocked = [];
  for (const p of tl.possible) {
    const low = lowest(p.el.clouds);
    if (!low) continue;
    const y = cloudY(low.baseFt);
    const x0 = x(p.from);
    const x1 = x(p.to);
    const label = cloudLabel(low);
    const lx = Math.min(x0 + 2, X1 - labelWidth(label));
    const lane = laneFor(lanes, lx, labelWidth(label));
    out.push(`<line x1="${r1(x0)}" y1="${r1(y)}" x2="${r1(x1)}" y2="${r1(y)}" class="mg-poss thick"/>`,
      text(lx, (Y.cloudBot - y >= 12 ? y + 11 : y - 5) + lane * 10 * (Y.cloudBot - y >= 12 ? 1 : -1), label, 'a'));
    blocked.push([lx, lx + labelWidth(label)]);
  }
  for (const p of tl.prevailing) {
    const low = lowest(p.state.clouds);
    if (!low) continue;
    const y = cloudY(low.baseFt);
    const label = cloudLabel(low);
    const lx = freeX(x(p.from), x(p.to), labelWidth(label), blocked);
    if (lx !== null) out.push(text(lx, y < (Y.cloudTop + Y.cloudBot) / 2 ? y + 12 : y - 5, label));
  }

  // Flight category: expected (wide strip), possible (thin strip under it).
  for (const p of tl.prevailing) {
    if (p.state.category) out.push(`<rect x="${r1(x(p.from))}" y="${Y.cat}" width="${r1(x(p.to) - x(p.from))}" height="5" class="mg-cat-${p.state.category}"/>`);
  }
  for (const p of tl.possible) {
    if (p.state.category) out.push(`<rect x="${r1(x(p.from))}" y="${Y.cat + 6}" width="${r1(x(p.to) - x(p.from))}" height="3" class="mg-cat-${p.state.category}"/>`);
  }
  return svg(bottom + 26, out, 'Forecast from the TAF: wind, visibility, cloud base and flight category over time');
}

export function modelMeteogram(hours, tz) {
  const hs = hours.filter((h) => Number.isFinite(h.t));
  if (!hs.length) return '';
  const from = hs[0].t;
  const to = hs.at(-1).t + H;
  const x = scale(from, to);
  const bottom = Y.cloudBot + 4;
  const out = [axis(from, to, tz, x, bottom), frames(bottom)];
  const mid = (h) => x(h.t + H / 2);

  out.push(text(X0, Y.wind, 'Wind (kt), arrow shows where it blows', 'm'));
  const every = Math.max(1, Math.round(hs.length / 8));
  for (let i = Math.floor(every / 2); i < hs.length; i += every) {
    const h = hs[i];
    if (h.windKt === null) continue;
    const w = { dir: h.windDir, speedKt: Math.round(h.windKt), gustKt: h.gustKt - h.windKt >= 10 ? Math.round(h.gustKt) : null };
    out.push(arrow(mid(h), w), text(mid(h), Y.speed, speedText(w), '', 'middle'));
  }

  out.push(text(X0, Y.visLabel, 'Visibility', 'm'));
  const vis = hs.filter((h) => h.visM !== null);
  if (vis.length) out.push(`<path d="${vis.map((h, i) => `${i ? 'L' : 'M'}${r1(mid(h))} ${r1(visY(h.visM))}`).join(' ')}" class="mg-line"/>`);
  else out.push(text((X0 + X1) / 2, (Y.visTop + Y.visBot) / 2 + 4, 'Not available', 'm', 'middle'));
  const worst = vis.length ? vis.reduce((a, b) => (b.visM < a.visM ? b : a)) : null;
  if (worst && worst.visM < 5000) {
    const y = visY(worst.visM);
    out.push(`<circle cx="${r1(mid(worst))}" cy="${r1(y)}" r="2.5" class="mg-dot"/>`,
      text(Math.min(mid(worst) + 4, X1 - 40), y < (Y.visTop + Y.visBot) / 2 ? y + 11 : y - 4, visShort(worst.visM), 'a'));
  }

  // Cloud cover per hour: whole bar = total, darker part = low cloud.
  out.push(text(X0, Y.cloudLabel, 'Cloud cover (darker = low cloud)', 'm'));
  out.push(text(X1 + 4, Y.cloudTop + 4, '100%', 'm'), text(X1 + 4, Y.cloudBot + 1, '0', 'm'));
  const bw = (X1 - X0) / hs.length;
  const hgt = Y.cloudBot - Y.cloudTop;
  for (const h of hs) {
    const bx = x(h.t) + 0.5;
    if (h.cloud) out.push(`<rect x="${r1(bx)}" y="${r1(Y.cloudBot - (h.cloud / 100) * hgt)}" width="${r1(bw - 1)}" height="${r1((h.cloud / 100) * hgt)}" class="mg-cc"/>`);
    if (h.cloudLow) out.push(`<rect x="${r1(bx)}" y="${r1(Y.cloudBot - (h.cloudLow / 100) * hgt)}" width="${r1(bw - 1)}" height="${r1((h.cloudLow / 100) * hgt)}" class="mg-cc low"/>`);
  }
  return svg(bottom + 26, out, 'Model forecast: wind, visibility and cloud cover over time');
}

function svg(height, parts, label) {
  return `<svg class="mg" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">${parts.join('')}</svg>`;
}
