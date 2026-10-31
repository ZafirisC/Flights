// Flights relay on Google Apps Script (relay/README.md). Same allowlisted live-position routes as worker/worker.js,
// for sources that refuse or ignore Cloudflare. Deployed as a web app: https://script.google.com/macros/s/<id>/exec
//   GET <exec>/adsbfi/v3/lat/40.5/lon/22.9/dist/100      GET <exec>/opensky/states/all?lamin=..&lomin=..&lamax=..&lomax=..
//   GET <exec>/opensky-check                              GET <exec>/health
// Apps Script cannot set an HTTP status, so a failure is answered as 200 with { relayError: true, status, error }.
// OpenSky login: Script properties OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET (anonymous without them).

var NUM = '-?\\d+(?:\\.\\d+)?';
var ROUTES = [
  { prefix: 'adsbfi', upstream: 'https://opendata.adsb.fi/api',
    path: new RegExp('^/(v3/lat/' + NUM + '/lon/' + NUM + '/dist/\\d{1,3}|v2/(callsign/[A-Za-z0-9]{1,8}|registration/[A-Za-z0-9-]{2,10}|hex/[0-9a-fA-F]{6}))$') },
  { prefix: 'adsblol', upstream: 'https://api.adsb.lol',
    path: new RegExp('^/v2/(point/' + NUM + '/' + NUM + '/\\d{1,3}|callsign/[A-Za-z0-9]{1,8}|reg/[A-Za-z0-9-]{2,10}|hex/[0-9a-fA-F]{6})$') },
  { prefix: 'airplaneslive', upstream: 'https://api.airplanes.live',
    path: new RegExp('^/v2/(point/' + NUM + '/' + NUM + '/\\d{1,3}|callsign/[A-Za-z0-9]{1,8}|reg/[A-Za-z0-9-]{2,10}|hex/[0-9a-fA-F]{6})$') },
  { prefix: 'adsbtrace', upstream: 'https://adsb.lol',
    path: /^\/data\/traces\/[0-9a-f]{2}\/trace_(full|recent)_[0-9a-f]{6}\.json$/ },
  { prefix: 'opensky', upstream: 'https://opensky-network.org/api', path: /^\/states\/all$/, auth: true,
    query: ['lamin', 'lomin', 'lamax', 'lomax', 'icao24'], valid: /^(-?\d{1,3}(\.\d{1,4})?|[0-9a-f]{6})$/ },
];

var TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

function doGet(e) {
  var path = '/' + ((e && e.pathInfo) || '');
  var params = (e && e.parameter) || {};
  if (path === '/' || path === '/health') return out({ ok: true });
  if (path === '/opensky-check') return out(openSkyCheck());

  var parts = path.match(/^\/([a-z]+)(\/.*)$/);
  var route = parts && ROUTES.filter(function (r) { return r.prefix === parts[1]; })[0];
  if (!route || !route.path.test(parts[2])) return fail(404, 'Unknown route');

  var query = [];
  var keys = route.query || [];
  for (var i = 0; i < keys.length; i++) {
    var v = params[keys[i]];
    if (v === undefined) continue;
    if (!route.valid.test(v)) return fail(400, 'Bad ' + keys[i]);
    query.push(keys[i] + '=' + encodeURIComponent(v));
  }
  var url = route.upstream + parts[2] + (query.length ? '?' + query.join('&') : '');

  var headers = { Accept: 'application/json' };
  var token = route.auth ? openSkyToken() : null;
  if (token) headers.Authorization = 'Bearer ' + token;
  var res;
  try {
    res = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
  } catch (err) {
    return fail(502, 'Upstream unreachable: ' + err.message);
  }
  var status = res.getResponseCode();
  if (status === 401 && route.auth) CacheService.getScriptCache().remove('osToken');
  if (status !== 200) return fail(status, 'Upstream HTTP ' + status);
  return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
}

// OAuth2 client-credentials token, cached ~29 min (OpenSky tokens last 30 min).
function openSkyToken() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('OPENSKY_CLIENT_ID');
  var secret = props.getProperty('OPENSKY_CLIENT_SECRET');
  if (!id || !secret) return null;
  var cache = CacheService.getScriptCache();
  var token = cache.get('osToken');
  if (token) return token;
  try {
    var res = UrlFetchApp.fetch(TOKEN_URL, {
      method: 'post',
      payload: { grant_type: 'client_credentials', client_id: id, client_secret: secret },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) return null;
    var data = JSON.parse(res.getContentText());
    cache.put('osToken', data.access_token, Math.max(60, (data.expires_in || 1800) - 60));
    return data.access_token;
  } catch (err) {
    return null; // fall back to an anonymous request
  }
}

// Which step fails (secrets, login, data) and how long each took. No secrets in the answer; costs 1 OpenSky credit.
function openSkyCheck() {
  var props = PropertiesService.getScriptProperties();
  var result = { secrets: !!(props.getProperty('OPENSKY_CLIENT_ID') && props.getProperty('OPENSKY_CLIENT_SECRET')) };
  var token = null;
  if (result.secrets) {
    CacheService.getScriptCache().remove('osToken');
    result.login = step(function () {
      token = openSkyToken();
      return token ? 200 : 'no token';
    });
  }
  result.data = step(function () {
    var h = token ? { Authorization: 'Bearer ' + token } : {};
    return UrlFetchApp.fetch('https://opensky-network.org/api/states/all?lamin=40&lomin=22&lamax=41&lomax=23',
      { headers: h, muteHttpExceptions: true }).getResponseCode();
  });
  return result;
}

function step(fn) {
  var t = Date.now();
  try {
    var code = fn();
    return { result: code === 200 ? 'ok' : (typeof code === 'number' ? 'HTTP ' + code : code), ms: Date.now() - t };
  } catch (err) {
    return { result: 'error: ' + err.message, ms: Date.now() - t };
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail(status, message) {
  return out({ relayError: true, status: status, error: message });
}
