// METAR decoder (wind, visibility, weather, clouds, temperature/dew point, QNH) and flight category.
// TAF is shown raw, one change group per line (formatTaf).

const WX_INTENSITY = { '-': 'Light', '+': 'Heavy', VC: 'In vicinity:' };
const WX_DESCRIPTOR = {
  MI: 'shallow', PR: 'partial', BC: 'patches of', DR: 'drifting', BL: 'blowing', SH: 'showers of',
  TS: 'thunderstorm', FZ: 'freezing',
};
const WX_PHENOMENA = {
  DZ: 'drizzle', RA: 'rain', SN: 'snow', SG: 'snow grains', IC: 'ice crystals', PL: 'ice pellets', GR: 'hail',
  GS: 'small hail', UP: 'unknown precipitation', BR: 'mist', FG: 'fog', FU: 'smoke', VA: 'volcanic ash',
  DU: 'dust', SA: 'sand', HZ: 'haze', PY: 'spray', PO: 'dust whirls', SQ: 'squalls', FC: 'funnel cloud',
  SS: 'sandstorm', DS: 'duststorm',
};
const COVER = { FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast', VV: 'Vertical visibility' };
const CLOUD_TYPE = { CB: 'cumulonimbus', TCU: 'towering cumulus' };

const WX_RE = /^(-|\+|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/;
const M_PER_SM = 1609.344;

const num = (s) => (s.startsWith('M') ? -Number(s.slice(1)) : Number(s));

function fraction(s) {
  const [a, b] = s.split('/').map(Number);
  return b ? a / b : a;
}

function decodeWeather(tok) {
  const m = tok.match(WX_RE);
  if (!m || (!m[2] && !m[3])) return null;
  const phen = (m[3].match(/.{2}/g) || []).map((p) => WX_PHENOMENA[p]);
  const parts = [m[1] && WX_INTENSITY[m[1]], m[2] && WX_DESCRIPTOR[m[2]], phen.join(' and ')].filter(Boolean);
  const text = parts.join(' ').replace(/^thunderstorm (\S)/, 'thunderstorm with $1');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Flight category (FAA): ceiling in ft (lowest BKN/OVC/VV), visibility in statute miles.
export function flightCategory(ceilingFt, visSm) {
  if (ceilingFt === null && visSm === null) return null;
  const c = ceilingFt ?? Infinity;
  const v = visSm ?? Infinity;
  if (c < 500 || v < 1) return 'LIFR';
  if (c < 1000 || v < 3) return 'IFR';
  if (c <= 3000 || v <= 5) return 'MVFR';
  return 'VFR';
}

export function decodeMetar(raw) {
  const out = {
    station: null, time: null, wind: null, visibility: null, weather: [], clouds: [],
    cavok: false, tempC: null, dewC: null, qnhHpa: null, ceilingFt: null, category: null,
  };
  if (!raw) return out;
  const toks = raw.trim().replace(/=$/, '').split(/\s+/);
  let i = 0;
  if (/^(METAR|SPECI)$/.test(toks[i])) i++;
  if (/^[A-Z][A-Z0-9]{3}$/.test(toks[i])) out.station = toks[i++];
  if (/^\d{6}Z$/.test(toks[i])) out.time = toks[i++];

  for (; i < toks.length; i++) {
    const t = toks[i];
    if (/^(RMK|NOSIG|BECMG|TEMPO)$/.test(t)) break; // remarks and trend: not decoded
    let m;
    if ((m = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/))) {
      const k = { KT: 1, MPS: 1.94384, KMH: 0.539957 }[m[4]];
      const speed = Math.round(Number(m[2]) * k);
      out.wind = {
        dir: m[1] === 'VRB' ? 'VRB' : Number(m[1]),
        speedKt: speed,
        gustKt: m[3] ? Math.round(Number(m[3]) * k) : null,
        calm: speed === 0,
      };
    } else if ((m = t.match(/^(\d{3})V(\d{3})$/)) && out.wind) {
      out.wind.varFrom = Number(m[1]);
      out.wind.varTo = Number(m[2]);
    } else if (t === 'CAVOK') {
      out.cavok = true;
      out.visibility = { meters: 10000, sm: 10000 / M_PER_SM, text: '10 km or more' };
    } else if ((m = t.match(/^(\d{4})(NDV)?$/)) && !out.visibility) {
      const meters = Number(m[1]);
      out.visibility = {
        meters, sm: meters / M_PER_SM,
        text: meters === 9999 ? '10 km or more' : meters >= 5000 ? `${meters / 1000} km` : `${meters} m`,
      };
    } else if ((m = t.match(/^(M|P)?(\d+(?:\/\d+)?)SM$/))) {
      let sm = fraction(m[2]);
      let label = m[2];
      if (/^\d+$/.test(toks[i - 1] || '') && m[2].includes('/') && out.visibility?.wholeSm !== undefined) {
        sm += out.visibility.wholeSm; // "1 1/2SM"
        label = `${out.visibility.wholeSm} ${m[2]}`;
      }
      const prefix = m[1] === 'P' ? 'more than ' : m[1] === 'M' ? 'less than ' : '';
      out.visibility = { meters: Math.round(sm * M_PER_SM), sm, text: `${prefix}${label} SM` };
    } else if (/^\d$/.test(t) && /^\d\/\dSM$/.test(toks[i + 1] || '')) {
      out.visibility = { wholeSm: Number(t) }; // completed by the next token
    } else if (/^(NSC|NCD|SKC|CLR)$/.test(t)) {
      out.clouds = [];
    } else if ((m = t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU|\/\/\/)?$/))) {
      const baseFt = m[2] === '///' ? null : Number(m[2]) * 100;
      out.clouds.push({ cover: m[1], text: COVER[m[1]], baseFt, type: CLOUD_TYPE[m[3]] || null });
    } else if ((m = t.match(/^(M?\d{2})\/(M?\d{2})?$/))) {
      out.tempC = num(m[1]);
      out.dewC = m[2] ? num(m[2]) : null;
    } else if ((m = t.match(/^Q(\d{4})$/))) {
      out.qnhHpa = Number(m[1]);
    } else if ((m = t.match(/^A(\d{4})$/))) {
      out.qnhHpa = Math.round((Number(m[1]) / 100) * 33.8639);
    } else if (/^R\d{2}[LCR]?\//.test(t) || /^(AUTO|COR|NIL)$/.test(t)) {
      // runway visual range and report flags: not shown
    } else {
      const wx = decodeWeather(t);
      if (wx) out.weather.push(wx);
    }
  }

  const ceiling = out.clouds.filter((c) => /BKN|OVC|VV/.test(c.cover) && c.baseFt !== null);
  out.ceilingFt = ceiling.length ? Math.min(...ceiling.map((c) => c.baseFt)) : null;
  const visSm = out.visibility?.sm ?? null;
  // No reported ceiling counts as unlimited once we know the visibility.
  out.category = visSm === null && out.ceilingFt === null ? null : flightCategory(out.ceilingFt, visSm);
  return out;
}

export function formatTaf(raw) {
  return (raw || '').trim().replace(/\s+(?=(FM\d{6}|BECMG|TEMPO|PROB\d{2}))/g, '\n').replace(/\n(PROB\d{2})\n/g, '\n$1 ');
}

// One readable line from decodeMetar(): "Wind 320° 12 kt, Visibility 10+ km, Few clouds 2,500 ft, 18 °C, QNH 1015".
export function metarSummary(d) {
  const parts = [];
  if (d.wind) {
    const w = d.wind;
    const dir = w.dir === 'VRB' ? 'variable' : `${String(w.dir).padStart(3, '0')}°`;
    parts.push(w.calm ? 'Wind calm' : `Wind ${dir} ${w.speedKt} kt${w.gustKt ? `, gusting ${w.gustKt} kt` : ''}`);
  }
  if (d.visibility?.text) parts.push(`Visibility ${d.visibility.meters >= 9999 ? '10+ km' : d.visibility.text}`);
  parts.push(...d.weather);
  if (d.cavok) parts.push('No significant cloud');
  for (const c of d.clouds) {
    const base = c.baseFt !== null ? ` ${c.baseFt.toLocaleString('en')} ft` : '';
    const type = c.type ? ` (${c.type})` : '';
    parts.push(c.cover === 'OVC' || c.cover === 'VV' ? `${c.text}${base}${type}` : `${c.text} clouds${base}${type}`);
  }
  if (d.tempC !== null) parts.push(`${d.tempC} °C`);
  if (d.qnhHpa !== null) parts.push(`QNH ${d.qnhHpa}`);
  return parts.join(', ');
}
