# Live-position relay (Google Apps Script)

adsb.fi, airplanes.live and OpenSky refuse or ignore the Cloudflare Worker, and adsb.lol's daily quota runs out on its
shared IP. This relay runs the same allowlisted live-position routes from Google's servers instead.
Free, no card. Limit: about 20,000 outside requests a day per Google account (one phone polling all day ≈ 7,000).

Routes (after the web app URL, which ends in `/exec`): `/adsbfi/…`, `/adsblol/…`, `/airplaneslive/…`, `/adsbtrace/…`,
`/opensky/states/all?…`, `/opensky-check`, `/health`. Same paths and allowlist as `worker/worker.js`.
Apps Script always answers HTTP 200; failures come back as `{ "relayError": true, "status": 403, "error": "…" }`, which
`js/api.js` treats as a failed source. The URL is public (Apps Script cannot check the page origin), but it only
forwards the routes above.

## Set up
1. Open https://script.google.com → **New project**. Name it `flights-relay`.
2. Delete the sample code in `Code.gs` and paste all of `relay/apps-script/Code.gs`. Save (Ctrl+S).
3. **Project Settings** (gear, left) → **Script Properties** → **Add script property** twice:
   `OPENSKY_CLIENT_ID` = your OpenSky client id, `OPENSKY_CLIENT_SECRET` = your client secret → **Save**.
4. **Deploy** (top right) → **New deployment** → gear next to "Select type" → **Web app**.
   Execute as: **Me**. Who has access: **Anyone**. → **Deploy**.
5. Google asks for permission: **Authorize access** → pick your account → "Google hasn't verified this app" →
   **Advanced** → **Go to flights-relay (unsafe)** → **Allow**. (It is your own script; it only fetches URLs.)
6. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).

## Test
- `<URL>/opensky-check` → `{"secrets":true,"login":{"result":"ok",…},"data":{"result":"ok",…}}` when OpenSky answers Google.
- Check page: `https://zafirisc.github.io/Flights/tools/api-check.html?relay=<URL>` → rows marked "via relay".
- When rows pass, set `RELAY_URL` in `js/api.js` to the URL.

## Update the code later
Paste the new code, then **Deploy** → **Manage deployments** → pencil → Version: **New version** → **Deploy**.
The URL stays the same. (A *New deployment* would give a new URL.)
