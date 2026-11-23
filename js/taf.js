// TAF parser: validity, change groups (FM, BECMG, TEMPO, PROBxx, PROBxx TEMPO) and a timeline for the meteogram
// and the text forecast. Times are UTC milliseconds. Pure code, no DOM.
import { decodeElements, categoryOf } from './metar.js';

const ELEMENTS = ['wind', 'visibility', 'weather', 'clouds'];

// Day/hour(/minute) of a TAF → UTC ms, in the month (of ref's, the one before or after) closest to ref.
export function resolveTime(day, hour, minute, ref) {
  const r = new Date(ref);
  let best = null;
  for (const dm of [-1, 0, 1]) {
    const t = Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + dm, day, hour, minute); // hour 24 rolls over
    if (best === null || Math.abs(t - ref) < Math.abs(best - ref)) best = t;
  }
  return best;
}

const range = (tok, ref) => {
  const m = tok.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!m) return null;
  const from = resolveTime(+m[1], +m[2], 0, ref);
  return { from, to: resolveTime(+m[3], +m[4], 0, from) };
};

// Raw TAF → { station, issued, from, to, base, groups: [{ kind, prob, from, to, el }] }, or null (NIL, CNL, unreadable).
// kind: 'FM' | 'BECMG' | 'TEMPO' | 'PROB' (prob = 30/40, also set for PROB30 TEMPO).
export function parseTaf(raw, now = Date.now()) {
  if (!raw) return null;
  const toks = raw.trim().replace(/=$/, '').split(/\s+/);
  let i = 0;
  while (/^(TAF|AMD|COR|RTD)$/.test(toks[i])) i++;
  const station = /^[A-Z][A-Z0-9]{3}$/.test(toks[i]) ? toks[i++] : null;
  let issued = now;
  const it = (toks[i] || '').match(/^(\d{2})(\d{2})(\d{2})Z$/);
  if (it) { issued = resolveTime(+it[1], +it[2], +it[3], now); i++; }
  const valid = range(toks[i] || '', issued);
  if (!valid || /^(NIL|CNL)$/.test(toks[i + 1] || '')) return null;
  i++;

  // Split the rest into the base forecast and change groups.
  const chunks = [{ kind: 'BASE', toks: [] }];
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (t === 'RMK') break;
    let m;
    if ((m = t.match(/^FM(\d{2})(\d{2})(\d{2})$/))) {
      chunks.push({ kind: 'FM', from: resolveTime(+m[1], +m[2], +m[3], valid.from), toks: [] });
    } else if (t === 'BECMG' || (t === 'TEMPO' && !/^PROB/.test(toks[i - 1]))) {
      chunks.push({ kind: t, toks: [] });
    } else if ((m = t.match(/^PROB(\d{2})$/))) {
      chunks.push({ kind: 'PROB', prob: +m[1], toks: [] });
    } else if (t === 'TEMPO') {
      chunks.at(-1).tempo = true; // PROB30 TEMPO
    } else if (chunks.length > 1 && chunks.at(-1).from === undefined && range(t, valid.from)) {
      Object.assign(chunks.at(-1), range(t, valid.from));
    } else if (!/^T[XN]M?\d{2}\/\d{4}Z$/.test(t)) {
      chunks.at(-1).toks.push(t); // TX/TN temperature groups are dropped
    }
  }

  const decode = (c) => { const el = {}; decodeElements(c.toks, el); return el; };
  const groups = chunks.slice(1).filter((c) => c.from !== undefined).map((c) => ({
    kind: c.kind, prob: c.prob ?? null, tempo: !!c.tempo, from: c.from, to: c.to ?? null, el: decode(c),
  }));
  // FM groups run until the next FM group or the end of the TAF.
  const fms = groups.filter((g) => g.kind === 'FM');
  fms.forEach((g, k) => { g.to = fms[k + 1]?.from ?? valid.to; });
  return { station, issued, from: valid.from, to: valid.to, base: decode(chunks[0]), groups };
}

// Group elements laid over a state. Elements the group does not mention stay as they were.
export function mergeState(state, el) {
  const s = { ...state };
  for (const k of ELEMENTS) if (el[k] !== undefined) s[k] = el[k];
  return s;
}

const withCategory = (s) => ({ ...s, category: categoryOf(s) });

// Timeline of a parsed TAF from `now` on.
//   prevailing: [{ from, to, state }]  expected conditions (base, FM from its start, BECMG from the end of its window)
//   possible:   [{ from, to, kind, prob, tempo, el, state }]  TEMPO/PROB, state = prevailing + group
//   periods:    every group still in force, in TAF order, for the text forecast
export function tafTimeline(taf, now = Date.now()) {
  if (!taf || taf.to <= now) return null;
  const changes = taf.groups
    .filter((g) => g.kind === 'FM' || g.kind === 'BECMG')
    .map((g) => ({ t: g.kind === 'FM' ? g.from : g.to, g }))
    .sort((a, b) => a.t - b.t);
  const prevailing = [];
  let state = { weather: [], ...taf.base };
  let t0 = taf.from;
  for (const { t, g } of changes) {
    if (t > t0) prevailing.push({ from: t0, to: t, state });
    state = g.kind === 'FM' ? { weather: [], ...g.el } : mergeState(state, g.el);
    t0 = Math.max(t0, t);
  }
  prevailing.push({ from: t0, to: taf.to, state });
  const stateAt = (t) => (prevailing.find((p) => t >= p.from && t < p.to) || prevailing.at(-1)).state;

  const possible = taf.groups
    .filter((g) => g.kind === 'TEMPO' || g.kind === 'PROB')
    .map((g) => ({ ...g, state: withCategory(mergeState(stateAt(g.from), g.el)) }));

  const firstFm = taf.groups.find((g) => g.kind === 'FM');
  const periods = [
    { kind: 'BASE', from: taf.from, to: firstFm ? firstFm.from : taf.to, el: taf.base, state: withCategory(taf.base) },
    ...taf.groups.map((g) => ({
      ...g,
      state: withCategory(g.kind === 'FM' ? g.el : mergeState(stateAt(g.kind === 'BECMG' ? g.to : g.from), g.el)),
    })),
  ].filter((p) => p.to > now);

  return {
    from: Math.max(taf.from, now),
    to: taf.to,
    prevailing: prevailing.filter((p) => p.to > now).map((p) => ({ ...p, from: Math.max(p.from, now), state: withCategory(p.state) })),
    possible: possible.filter((p) => p.to > now).map((p) => ({ ...p, from: Math.max(p.from, now) })),
    periods,
  };
}
