# Doorstep: v1 Spec

Door-hanger canvassing app for Florida All Risk. DoorDash-style route offers + game-styled map + house-by-house check-off. Canvasser installs it from Safari ("Add to Home Screen"). Everything lands in the shared Supabase (`hmdjzrovvvfvyjnxxyab`) so Vega and the Lead Engine see it live.

**Decisions locked (2026-10-19):** separate app on shared DB · door conversations become real Lead Engine leads · 2D game-styled map for v1 · name "Doorstep" (brand-neutral, can become a BindRadar product later).

**Hard rule:** the build never blocks canvassing. Brother runs non-Alachua Wave 1 routes on the route sheet while this is built.

---

## 1. Canvasser app (Doorstep)

| Screen | What it does |
|---|---|
| **Sign up / sign in** | Invite link from Dylan → full name, profile photo, password. Canvasser role only. |
| **Routes** (home) | Offers grouped by city: Fanning Springs, Chiefland, Trenton/Bell, Newberry, Jonesville, Williston, Bronson, Cross City, Gainesville. Each card: payout, doors, est. time, distance from him. Tap → preview map → **Start route**. No per-door math shown anywhere. Routes on hold (permits) show locked. |
| **Active route** | Game-styled map, every house a pin. Tap a pin → **Hung** · **Skipped** (gate / fence / dog / No Soliciting / vacant / can't reach / other) · **Talked to someone**. Avatar follows his GPS while the app is open. Progress bar (142/238). Each tap stores time + GPS = proof. "New house" button drops a pin for homes not on the map. "Report a problem" (note + photo). |
| **Talked to someone** | Name, phone, address (auto-filled from the pin), interest (home / auto / flood / other), short note. Writes a `leads` row (`source=canvass`, route id) and alerts Dylan. Script reminder on the form: no quoting, no coverage talk. |
| **Finish route** | Leftover hanger count + one photo → status *Pending approval*. Skipped houses never reduce pay. |
| **Earnings** | Completed / pending / paid, this week + all time. |
| **Playbook** | Door rules, scripts, FAQ answers ("40+ carriers, everything but health, St. Pete"). |

**Daylight lock:** a route can only be *started* between sunrise and 45 min before sunset (computed daily for his location, so the Nov DST change handles itself). An active route warns at sunset and pauses.

**Tracking reality:** iPhone home-screen apps can't track in the background. GPS is recorded while the app is open (screen wake lock requested during an active route). House taps are the proof; the route line is a bonus.

## 2. Dylan's side (Canvass tab in Vega)

- **Live map:** where he is and houses checked so far.
- **Route builder:** draw or pick an area → pulls every house from FL statewide parcels (homes + mobile homes, skips vacant/commercial) → auto door count → auto price (15¢/door + $5/stop, $10 big lots, round up to $5, $15 floor) → publish as an offer.
- **Payout queue:** finished routes with proof (taps, track, leftover count, photo) → Approve → mark Paid (Venmo/Cash App outside the app).
- **Results:** leads + QR scans per route and per 100 doors → which towns to rerun.
- **Do-not-knock list:** every "No Soliciting" / gate / dog skip is saved, so future routes exclude it automatically.
- **Problems inbox:** his reports and notes.

## 3. Background agent (Vega canvassing role)

Builds candidate routes from parcel data, checks gated entrances on satellite, flags new construction, keeps routes priced, writes a weekly summary (doors, leads, cost per lead, best/worst routes). Data sources: FL statewide parcel centroids (FloridaGIO), Census, Google satellite/Street View. **No Zillow** (no API, scraping violates ToS).

## 4. Data (new tables, shared Supabase)

`canvassers` (profile, role, status) · `canvass_routes` (city, name, payout, doors, polygon, status: draft/offered/held/active/done) · `canvass_houses` (parcel id, address, lat/lng, use code, year built, route id, do_not_knock) · `canvass_sessions` (route, canvasser, started/ended, leftover count, photo, payout status) · `canvass_events` (house tap: status, reason, note, lat/lng, time) · `canvass_track` (GPS points) · leads go into the existing `leads` table with `source='canvass'`.

## 5. Stack

Next.js on Vercel (matches Vega/Lead Engine) · Supabase auth + storage for photos · MapLibre GL with a custom game-style map design (free tiles, no Google Maps API bill) · PWA manifest + icon for Add to Home Screen.

## 6. Build order

1. **Data:** load parcels for the 24 routes → real door counts and repriced routes. Use the leftover-count week to sanity-check them.
2. **Canvasser flow:** sign in → routes → active route map → tap houses → finish. Test on a real phone at Fanning Springs.
3. **Talked-to-someone → Lead Engine + alert.**
4. **Vega Canvass tab:** live map, payout queue, results.
5. **Route builder + background agent.**
6. Polish: avatar, game styling, earnings animations.

v1 = steps 1–4 (~2–3 working days). Steps 5–6 follow.

## Not in v1
3D game world · native app / background tracking · in-app payments · multiple managers · Zillow.

## Open items for Dylan
- Permits: City of Newberry (352-472-5440) and Alachua County Ch. 118 before Newberry/Tioga routes go live.
- Who gets the lead alert: Dylan only, or Dylan + Mike?
- Bronson + Gainesville routes: add to route builder once Wave 1 data is in.
