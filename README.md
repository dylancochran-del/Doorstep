# Doorstep

DoorDash-style door-hanger canvassing app for Florida All Risk. Live: https://doorstep-far.vercel.app
Manager side: Vega → Canvass tab (vega-app/src/app/canvass).

- `src/app` – canvasser PWA (routes, game map, active route, earnings, playbook). Add to Home Screen from Safari.
- `src/app/api` – server routes; all DB access via service role. Door leads → `field_leads` (source `door-hangers`), alert to `vega_alert_config.alert_to` only.
- `data/pull_parcels.py` → FL statewide parcel centroids (homes + mobile homes, no owner names).
- `data/build_routes.py` → walkable clusters → priced routes (15¢/door + $5 stop, $10 big lots, ceil $5, $15 floor; >35¢/door = draft; Newberry + unincorporated Alachua = held).
- `data/load_routes.py` → upserts routes + houses. Rerun build + load any time; ids are stable.
- Deploy: `vercel deploy --prod` (project doorstep-far). Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, SESSION_SECRET, DOORSTEP_ALERT_FROM.
- `data/pull_parcels2.py` + `data/enrich_houses.py` → house cards (year built, size, owner-occupied, purchase year) and prospect score 0-100 (hot ≥ 75 ≈ top 5%). Then refresh route totals:
  `update canvass_routes r set hot_homes=x.hot, prospect_avg=x.avg from (select route_id, count(*) filter (where prospect>=75) hot, round(avg(prospect))::smallint avg from canvass_houses where route_id is not null group by route_id) x where x.route_id=r.id;`
- `src/lib/walk.ts` → suggested walking order (street by street, serpentine) drawn as the dotted path.
