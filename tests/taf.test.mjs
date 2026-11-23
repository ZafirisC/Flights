// Run: node --test tests/   (Node 22+, no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMetar } from '../js/metar.js';
import { parseTaf, tafTimeline, resolveTime } from '../js/taf.js';
import { metarSentences, trendSentence, groupSentence, periodKind, periodWhen, compass } from '../js/wx-text.js';
import { tafMeteogram, modelMeteogram, visShort } from '../js/meteogram.js';

const NOW = Date.parse('2026-11-13T14:20:00Z');
const LGTS = 'TAF LGTS 131100Z 1312/1412 31010KT 9999 SCT025 TEMPO 1312/1318 32015G28KT 4000 RA BKN012 '
  + 'BECMG 1318/1320 34008KT 9999 FEW030 PROB30 1402/1406 1500 BR BKN004 BECMG 1408/1410 02006KT CAVOK';
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);

test('resolveTime: picks the month closest to the reference, hour 24 rolls over', () => {
  assert.equal(iso(resolveTime(13, 12, 0, NOW)), '2026-11-13T12:00');
  assert.equal(iso(resolveTime(1, 6, 0, Date.parse('2026-11-30T20:00:00Z'))), '2026-12-01T06:00');
  assert.equal(iso(resolveTime(30, 18, 0, Date.parse('2026-12-01T02:00:00Z'))), '2026-11-30T18:00');
  assert.equal(iso(resolveTime(13, 24, 0, NOW)), '2026-11-14T00:00');
});

test('parseTaf: validity and change groups', () => {
  const t = parseTaf(LGTS, NOW);
  assert.equal(t.station, 'LGTS');
  assert.equal(iso(t.from), '2026-11-13T12:00');
  assert.equal(iso(t.to), '2026-11-14T12:00');
  assert.equal(t.base.wind.dir, 310);
  assert.equal(t.base.clouds[0].baseFt, 2500);
  assert.deepEqual(t.groups.map((g) => [g.kind, g.prob, iso(g.from).slice(8), iso(g.to).slice(8)]), [
    ['TEMPO', null, '13T12:00', '13T18:00'],
    ['BECMG', null, '13T18:00', '13T20:00'],
    ['PROB', 30, '14T02:00', '14T06:00'],
    ['BECMG', null, '14T08:00', '14T10:00'],
  ]);
  assert.equal(t.groups[0].el.wind.gustKt, 28);
  assert.equal(t.groups[3].el.cavok, true);
});

test('parseTaf: NIL / cancelled / garbage → null', () => {
  assert.equal(parseTaf('TAF LGXX 131100Z NIL', NOW), null);
  assert.equal(parseTaf('TAF AMD LGTS 131300Z 1312/1412 CNL', NOW), null);
  assert.equal(parseTaf('hello', NOW), null);
  assert.equal(parseTaf('', NOW), null);
});

test('tafTimeline: expected conditions, possible groups and periods from now', () => {
  const tl = tafTimeline(parseTaf(LGTS, NOW), NOW);
  assert.equal(tl.from, NOW);
  assert.deepEqual(tl.prevailing.map((p) => [iso(p.from).slice(8), p.state.wind.dir, p.state.category]), [
    ['13T14:20', 310, 'VFR'], ['13T20:00', 340, 'VFR'], ['14T10:00', 20, 'VFR'],
  ]);
  assert.deepEqual(tl.possible.map((p) => [p.kind, p.state.category]), [['TEMPO', 'IFR'], ['PROB', 'LIFR']]);
  assert.equal(tl.periods.length, 5);
  assert.equal(tl.prevailing.at(-1).state.clouds.length, 0); // CAVOK clears clouds
});

test('tafTimeline: US FM groups, P6SM, past groups dropped, expired TAF → null', () => {
  const now = Date.parse('2026-11-24T03:00:00Z');
  const raw = 'TAF KJFK 231130Z 2312/2418 31012KT P6SM FEW050 FM231800 30015G25KT P6SM SCT040 '
    + 'FM240200 32008KT P6SM SKC TEMPO 2404/2408 2SM BR OVC008';
  const tl = tafTimeline(parseTaf(raw, now), now);
  assert.deepEqual(tl.prevailing.map((p) => [iso(p.from).slice(8), p.state.wind.dir]), [['24T03:00', 320]]);
  assert.equal(tl.prevailing[0].state.visibility.meters, 10000);
  assert.deepEqual(tl.periods.map((p) => p.kind), ['FM', 'TEMPO']);
  assert.equal(tl.possible[0].state.category, 'IFR');
  assert.equal(tafTimeline(parseTaf(raw, now), Date.parse('2026-11-24T19:00:00Z')), null);
});

test('METAR trend is decoded; sentences read naturally', () => {
  const d = decodeMetar('LGTS 131420Z 32012G24KT 290V350 6000 -RA BKN018 OVC035 12/09 Q1008 TEMPO 3000 RA BKN010');
  assert.equal(d.category, 'MVFR');
  assert.deepEqual(metarSentences(d), [
    'Light rain.',
    'Wind from the north-west (320°) at 12 kt, gusting 24 kt, varying between west and north.',
    'Visibility 6 km.',
    'Broken cloud at 1,800 ft, overcast at 3,500 ft.',
    '12 °C, dew point 9 °C.',
    'Pressure (QNH) 1008 hPa.',
  ]);
  assert.equal(trendSentence(d.trend), 'Next 2 hours, at times: rain, visibility 3000 m, broken cloud at 1,000 ft.');
  assert.equal(trendSentence(decodeMetar('EGLL 131420Z 24008KT CAVOK 12/05 Q1020 NOSIG').trend),
    'No significant change expected in the next 2 hours.');
  assert.deepEqual(metarSentences(decodeMetar('EGLL 131420Z 00000KT CAVOK 12/05 Q1020')).slice(0, 2),
    ['Calm wind.', 'Visibility 10 km or more, no significant cloud.']);
});

test('group sentences, badges and wind words', () => {
  const t = parseTaf(LGTS, NOW);
  assert.equal(groupSentence(t.groups[0].el),
    'Rain, wind from the north-west (320°) at 15 kt, gusting 28 kt, visibility 4000 m, broken cloud at 1,200 ft.');
  assert.equal(groupSentence(t.groups[3].el),
    'Wind from the north (020°) at 6 kt, good visibility, no significant cloud or weather.');
  assert.equal(periodKind(t.groups[2]), '30% chance');
  assert.equal(periodKind({ kind: 'PROB', prob: 40, tempo: true }), '40% chance, at times');
  assert.deepEqual([0, 44, 46, 180, 338, 359].map(compass), ['north', 'north-east', 'north-east', 'south', 'north', 'north']);
});

test('period times in airport local time', () => {
  const tz = 'Europe/Athens'; // UTC+2 in November
  assert.equal(periodWhen(Date.parse('2026-11-13T12:00Z'), Date.parse('2026-11-13T18:00Z'), tz, NOW), 'Until 20:00');
  assert.equal(periodWhen(Date.parse('2026-11-13T18:00Z'), Date.parse('2026-11-13T20:00Z'), tz, NOW), 'Today 20:00 – 22:00');
  assert.equal(periodWhen(Date.parse('2026-11-14T02:00Z'), Date.parse('2026-11-14T06:00Z'), tz, NOW), 'Tomorrow 04:00 – 08:00');
  assert.equal(periodWhen(Date.parse('2026-11-13T20:00Z'), Date.parse('2026-11-14T12:00Z'), tz, NOW), 'Today 22:00 – Tomorrow 14:00');
});

test('meteograms render without NaN', () => {
  const svg = tafMeteogram(tafTimeline(parseTaf(LGTS, NOW), NOW), 'Europe/Athens');
  assert.match(svg, /^<svg class="mg"/);
  assert.doesNotMatch(svg, /NaN|undefined/);
  assert.match(svg, /gusts 28/);
  assert.match(svg, /broken 400/);
  const hours = Array.from({ length: 24 }, (_, i) => ({
    t: Date.parse('2026-11-13T14:00:00Z') + i * 3600000, windDir: 300, windKt: 9, gustKt: i === 3 ? 25 : 14,
    visM: i === 10 ? 800 : 24000, cloud: 40, cloudLow: 10, code: 3,
  }));
  const m = modelMeteogram(hours, 'Europe/Athens');
  assert.doesNotMatch(m, /NaN|undefined/);
  assert.match(m, /800 m/);
  assert.deepEqual([9999, 6000, 4000, 1500, 800].map(visShort), ['10+ km', '6 km', '4 km', '1.5 km', '800 m']);
});
