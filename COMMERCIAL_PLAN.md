# Commercial plan — Flights on the App Store and Google Play

Goal: sell Flights as a native-installable app on iOS and Android, with user registration and a
**one-time payment**. Written 2026-11-21. Prices, fees and store rules below are from memory and must be
re-checked at the time of each phase.

## 1. Biggest findings (read first)

1. **The data is the blocker, not the app.** Nearly every source we use is free for non-commercial use only:
   adsb.fi (personal, non-commercial), airplanes.live (non-commercial), OpenSky (research/non-commercial),
   AeroDataBox free tier (non-commercial), Windy Webcams free tier, Open-Meteo free API, RainViewer free
   tier, Transitland free tier. OpenStreetMap's public tile servers also forbid app-scale use.
   Safe to keep: OurAirports (public domain), aviationweather.gov (US government), OSM *data* (ODbL, with
   attribution), adsb.lol (open data, ODbL; but 500 requests/day per IP), adsbdb and Planespotters
   (check terms for commercial use; Planespotters photos need credit).
2. **Live positions already do not work** (PROGRESS.md: every free source blocks Cloudflare's IPs or rate
   limits us). A paid app cannot ship on that. A paid, licensed live feed is step one, not an extra.
3. **"No backend of our own" ends.** Accounts, purchase checks and a paid data key all need a server.
   The Cloudflare Worker is the natural place (Workers + D1/KV). Still no servers to administer.
4. **One-time payment vs running costs.** A licensed live feed costs money every month per active user.
   A one-time price only works if per-user data cost is small (cached, shared proxy) or the price is set
   against a worst-case lifetime. See §4 and the decision list in §8.
5. **Apple rejects thin website wrappers (guideline 4.2).** The app needs real native value
   (push alerts, offline airport data, widgets, native share), not just the PWA in a frame.

## 2. Target architecture

```
iOS / Android app (Capacitor shell + existing vanilla JS, same code as the PWA)
   │  HTTPS + user token
   ▼
Cloudflare Worker "gateway" ── verifies token + entitlement ── caches + rate-limits
   │                          └─ D1: users, entitlements, usage
   ├─ licensed ADS-B feed (key lives only here)
   ├─ weather (aviationweather.gov, Open-Meteo commercial plan)
   ├─ flight times (commercial AeroDataBox / FlightAware tier)
   └─ other sources as in js/api.js
Auth provider (Firebase Auth or Supabase) ── Sign in with Apple, Google, email
Purchases: StoreKit 2 / Google Play Billing via RevenueCat ── webhook → D1 entitlement
```

- All fetches stay in `js/api.js`; sources point at the gateway (one-line change per source, as designed).
- Shared cache in the Worker is what keeps feed cost flat as users grow (many users, one upstream call per area).
- Build step: Capacitor needs npm for the native shell only. Web code stays plain files in the repo root;
  the shell copies them. CLAUDE.md "no build step" still holds for the web app. Update CLAUDE.md when this starts.

## 3. Phases

One phase per session, as today. Each ends with a PROGRESS.md update.

| # | Phase | Output | Done when |
|---|---|---|---|
| C0 | **Decisions** (by Zaf): app name, legal entity, price, free vs paid scope, data provider shortlist | §8 answered | Written in PROGRESS.md |
| C1 | **Licensed data + cost model** | Contract or paid key for live positions; commercial terms confirmed for every source; spreadsheet of cost per active user | Live map works with real aircraft from the gateway; cost/user known |
| C2 | **Gateway + accounts** | Worker gateway (token check, caching, rate limit), sign-up/sign-in, account deletion, password reset | A signed-in user sees aircraft; an anonymous request is refused |
| C3 | **Payments** | "Unlock Pro" non-consumable on both stores, RevenueCat, restore purchases, entitlement in D1 | Sandbox purchase unlocks on a second device after sign-in |
| C4 | **Native shell** | Capacitor iOS + Android projects, icons, splash, safe areas, deep links (`?flight=`), push (alerts for a followed flight, emergencies), offline airport data, native share | Runs on a real iPhone and a real Android phone, passes 4.2 self-check |
| C5 | **Compliance + store assets** | Privacy policy, terms, data-use disclaimer, Apple privacy labels, Google Data Safety, screenshots, description, age rating, support page, attributions screen | All store forms complete |
| C6 | **Beta** | TestFlight + Google Play closed test | ≥ 2 weeks, no crash, purchase flow verified by testers |
| C7 | **Launch + operations** | Release, monitoring (Worker analytics, Sentry or similar), support email, feed-cost alert | Live in both stores; budget alarm set |

C1 must succeed before C3–C7 are worth starting. If no feed fits the price, stop there.

## 4. Business model and money

- **Product:** Free download. Free tier = map, search, basic aircraft panel (limited, e.g. no weather/times/cameras,
  or a daily cap). **Pro = one-time purchase** unlocking everything. A free tier is also what satisfies reviewers
  and drives conversion. Alternative: paid-upfront app (simpler, lower conversion, no free trial).
- **Fees (verify):** Apple Developer Program ~$99/year; Google Play ~$25 once. Store commission 15% under the
  Small Business Program (Apple, < $1M/yr) and on the first $1M (Google); 30% above. Stores act as merchant of
  record for VAT/sales tax in most countries.
- **Cost model to build in C1:** monthly feed fee + hosting ÷ monthly active users, versus price × (1 − fee) spread
  over the expected lifetime of a user. Example target: if a user is active 3 years and costs ≤ €0.15/month,
  the lifetime cost is ~€5.40, so price ≥ ~€9.99 after fees and tax. Real numbers come from C1.
- **Risk to decide now:** a one-time price with unbounded feed usage can lose money on heavy users. Mitigations:
  fair-use rate limit per account, aggressive shared caching, lower refresh when idle, and an optional
  later subscription ("Pro+" with schedules/history) without taking Pro away.
- **Web version:** keep the PWA on GitHub Pages as a free demo, or turn it off for live data. Needs a choice
  (a paid feature available free on the web undermines the app).

## 5. Store requirements checklist

**Apple**
- Apple Developer account (company account needs a D-U-N-S number). Mac + Xcode required for builds
  (needs the user's machine or a CI Mac, e.g. GitHub Actions macOS runner / Codemagic).
- In-App Purchase for the unlock (digital features must use IAP). Restore Purchases button.
- Sign in with Apple is mandatory if any other third-party login (Google) is offered.
- In-app account deletion (mandatory since 2022) that also deletes server data.
- Guideline 4.2: native features beyond the website; 5.1: privacy policy + labels; "not for navigation" disclaimer.
- Review notes with a demo account, and explain the data sources.

**Google**
- Play Console account (identity verification). Personal accounts created recently must run a **closed test
  with ~12 testers for 14 days** before production (verify the current rule). Organisation accounts are exempt.
- Play Billing one-time product; target the current required API level; Data Safety form;
  in-app and web account-deletion link; app signing by Play.

**Both:** unique app name and bundle ID (`com.<owner>.<name>`); "Flights" is too generic to be protectable or
available. Check trademarks and store name availability. Do not imitate Flightradar24 branding.

## 6. Legal and privacy (get a lawyer for the final text)

- Legal entity (Greek sole proprietorship or company) and tax registration; bank account for payouts.
- GDPR: privacy policy, lawful basis, minimal data (email + purchase status), EU data region where possible,
  data processing agreements with the auth provider and Cloudflare, deletion on request.
- Terms of service with "Not for operational use / navigation" (SPEC footer already says this).
- Source attributions (OSM, OurAirports, Planespotters, Open-Meteo, feed provider) on an in-app "Credits" screen.
- LiveATC: stays link-only. Never re-stream.
- Webcams: embed only through the provider's own player, per their commercial terms.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| No affordable licensed live feed | Project stops | Do C1 first; consider own RTL-SDR receiver network later |
| One-time price vs ongoing cost | Loss on heavy users | Cost model, caching, fair-use cap, option for a later subscription |
| Apple rejection (4.2, IAP, deletion) | Weeks of delay | Native features in C4, self-check list, clear review notes |
| Free sources change terms or block us | Broken features | Contracts for paid ones, fallbacks, status messages already built |
| Worker abuse / key drain | Cost spike | Token + entitlement check on every route, per-account limits, budget alerts |
| No Mac for iOS builds | Cannot ship iOS | Cloud Mac CI or Zaf's machine |
| Duplicate branding / trademark | Forced rename | Check before spending on assets |

## 8. Decisions needed from Zaf (C0)

1. App name (and domain, support email).
2. Legal entity and country for tax and payouts; any D-U-N-S number.
3. Price and model: free + Pro unlock (recommended) or paid upfront; price point.
4. What is free vs Pro (map/search free; weather, times, cameras, alerts Pro?).
5. Budget ceiling per month for data, and whether to accept a later subscription.
6. Web version: free demo, same rules as the app, or retired.
7. Access to a Mac or approval of a cloud Mac CI service.
8. Auth methods: Apple + Google + email (recommended).

## 9. Suggested first step

Phase C1, research part (no code): get commercial terms and prices for ADS-B Exchange (RapidAPI),
FlightAware AeroAPI, Flightradar24 API, OpenSky commercial, airplanes.live/adsb.fi commercial licences, plus
commercial tiers of Open-Meteo, AeroDataBox, map tiles (MapTiler/Stadia/Mapbox) and RainViewer; fill the cost model.
