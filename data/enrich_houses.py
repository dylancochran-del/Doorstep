# Adds the "Zillow card" facts and an insurance prospect score to every routed house.
# Public property records only (FL statewide parcels). No owner names, no demographics.
import json, sb, datetime
YEAR = datetime.date.today().year

def score(p):
    pts, why = 0, []
    yb = p.get("yb") or 0
    if 1900 < yb <= 2001: pts += 35; why.append(f"Built {yb}: older roof")
    elif 2001 < yb <= 2010: pts += 25; why.append(f"Built {yb}: roof replacement age")
    elif 2010 < yb <= 2016: pts += 10
    if p.get("hm"): pts += 25; why.append("Owner lives here")
    sy = int(p.get("sy") or 0)
    if sy > 1900:
        yrs = YEAR - sy
        if 1 <= yrs <= 3: pts += 20; why.append(f"Bought {sy}: first renewals")
        elif 4 <= yrs <= 7: pts += 10; why.append(f"Bought {sy}: may not have re-shopped")
    if p.get("uc") == "002": pts += 10; why.append("Mobile home: fewer carrier options")
    jv = p.get("jv") or 0
    if 120_000 <= jv <= 700_000: pts += 10
    return min(pts, 100), why

P = {f'{p["pid"]}|{p["co"]}': p for p in json.load(open("parcels2.json"))}
HS = json.load(open("route_houses.json"))
rows = []
for rid, hs in HS.items():
    for h in hs:
        p = P.get(f'{h["pid"]}|{h["co"]}')
        if not p: continue
        s, why = score(p)
        rows.append(dict(route_id=rid, parcel_id=h["pid"], co_no=h["co"], lat=h["lat"], lon=h["lon"],
                         just_value=int(p["jv"]) if p.get("jv") else None, living_sqft=int(p["sqft"]) if p.get("sqft") else None,
                         sale_year=p["sy"] if p.get("sy") and p["sy"] > 1900 else None, sale_month=int(str(p["sm"]).strip()) if str(p.get("sm") or "").strip().isdigit() else None,
                         year_built=p["yb"] if p.get("yb") and p["yb"] > 1800 else None, prospect=s, prospect_reasons=why))
for i in range(0, len(rows), 1000):
    sb.upsert("canvass_houses", rows[i:i+1000], on="parcel_id,co_no", chunk=1000)
print("houses enriched", len(rows), "hot", sum(1 for r in rows if r["prospect"] >= 70), "warm", sum(1 for r in rows if 45 <= r["prospect"] < 70))
# Route totals (hot_homes, prospect_avg) are refreshed with one SQL update; see README.
