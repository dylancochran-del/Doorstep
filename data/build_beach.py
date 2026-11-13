# Beach-town routes (Pinellas barrier islands): St Pete Beach, Treasure Island, Madeira Beach, Redington Beach.
# Separate from the corridor build (build_routes.py / load_routes.py), which leave county 62 alone.
#  - Single-family homes only (condos excluded), HANG ONLY everywhere (Madeira requires a solicitation permit;
#    St Pete Beach / Treasure Island unverified).
#  - Routes are ~2 hour chunks (<= 170 doors), split along the island so each is one contiguous strip.
#  - Storm flags from county values (2024 Helene/Milton flooding):
#      "Storm:"   building worth < 15% of the parcel, or value deleted this year -> likely gutted/empty
#      "Rebuilt:" built 2024+ -> new or rebuilt home, needs a policy (best doors)
# Usage: python3 build_beach.py [--load]
import json, math, sys, collections, datetime, re
sys.path.insert(0, ".")
YEAR = datetime.date.today().year
TOWNS = {"ST PETE BEACH": ("St. Pete Beach", "SPB"), "TREASURE ISLAND": ("Treasure Island", "TRI"),
         "MADEIRA BEACH": ("Madeira Beach", "MAD"), "REDINGTON BEACH": ("Redington Beach", "RED"), "NORTH REDINGTON BEACH": ("Redington Beach", "RED")}
CAP = 170
# Causeway Isles (St. Petersburg mailing city, so matched by subdivision name instead).
def town_key(p):
    if p["city"] == "ST PETERSBURG" and "CAUSEWAY" in (p["legal"] or "").upper(): return "CAUSEWAY ISLES"
    return p["city"] if p["city"] in TOWNS else None
TOWNS["CAUSEWAY ISLES"] = ("Causeway Isles", "CSW")
P = [dict(p, city=town_key(p)) for p in json.load(open("parcels_pin.json")) if p["uc"] == "001" and town_key(p)]
V = json.load(open("pin_values.json"))
print("homes", len(P), "with value data", sum(1 for p in P if p["pid"] in V))

def flags(p):
    v = V.get(p["pid"])
    yb = p.get("yb") or 0
    if yb >= 2024: return "rebuilt", "Rebuilt: built %d, new or rebuilt home, needs a policy" % yb
    if v:
        jv = v.get("JV") or 0; land = v.get("LND_VAL") or 0
        if jv and (jv - land) < 0.15 * jv: return "storm", "Storm: county values the house near zero, may be gutted or empty. Skip as Vacant if no one lives here"
        if (v.get("DEL_VAL") or 0) > 0 and (v.get("NCONST_VAL") or 0) == 0: return "storm", "Storm: county removed value this year, may be damaged or empty. Skip as Vacant if no one lives here"
        if (v.get("NCONST_VAL") or 0) >= 50000: return "rebuilt", "Rebuilt: repaired or rebuilt since the storms, owners moving back in"
    return None, None

def score(p, flag):
    pts, why = 0, []
    if flag == "storm": return 5, []
    if flag == "rebuilt": pts += 40
    yb = p.get("yb") or 0
    if 1900 < yb <= 2001: pts += 25; why.append(f"Built {yb}: older home")
    elif 2001 < yb <= 2010: pts += 15
    if p.get("hm"): pts += 25; why.append("Owner lives here")
    sy = int(p.get("sy") or 0)
    if sy > 1900:
        yrs = YEAR - sy
        if 0 <= yrs <= 2: pts += 20; why.append(f"Bought {sy}: new owner")
        elif 3 <= yrs <= 6: pts += 10
    return min(pts, 100), why

KM_LAT, KM_LON = 111.0, 98.6
def split(idx, cap):
    if len(idx) <= cap: return [idx]
    lats = [P[i]["lat"] for i in idx]; lons = [P[i]["lon"] for i in idx]
    key = (lambda i: P[i]["lat"]) if (max(lats)-min(lats))*KM_LAT >= (max(lons)-min(lons))*KM_LON else (lambda i: P[i]["lon"])
    s = sorted(idx, key=key); mid = len(s)//2
    return split(s[:mid], cap) + split(s[mid:], cap)

def ceil5(x): return int(math.ceil(x/5.0)*5)
def tidy(n): return re.sub(r"\b(\d+)(St|Nd|Rd|Th)\b", lambda m: m.group(1)+m.group(2).lower(), n.title())
def streets(idx, k=2):
    c = collections.Counter(tidy(re.sub(r"^\d+\S*\s+", "", P[i]["addr"]).strip()) for i in idx if P[i]["addr"])
    return [s for s, _ in c.most_common(k)]

by_town = collections.defaultdict(list)
for i, p in enumerate(P): by_town[TOWNS[p["city"]][1]].append(i)
routes, houses = [], {}
for code in ["SPB", "TRI", "MAD", "RED", "CSW"]:
    parts = split(by_town[code], CAP)
    parts.sort(key=lambda s: -sum(P[i]["lat"] for i in s)/len(s))  # north to south
    for k, idx in enumerate(parts, 1):
        rid = f"{code}-{k:02d}"
        fl = [flags(P[i]) for i in idx]
        n_storm = sum(1 for f, _ in fl if f == "storm"); n_new = sum(1 for f, _ in fl if f == "rebuilt")
        lat = sum(P[i]["lat"] for i in idx)/len(idx); lon = sum(P[i]["lon"] for i in idx)/len(idx)
        town = TOWNS[P[idx[0]]["city"]][0]
        notes = ["HANG ONLY: leave the hanger and move on, no knocking. If someone comes out, be friendly, don't pitch, tell them to scan the code.",
                 "Skip any house with a No Soliciting sign. Many homes are still empty or under repair from the 2024 floods: mark those Skipped (Vacant) and keep the hanger."]
        if n_storm: notes.append(f"Records flag about {n_storm} houses here as possibly storm-damaged/empty (⚠️ on the house card).")
        if n_new: notes.append(f"{n_new} rebuilt homes (🏗️ on the card): best doors on the route.")
        routes.append(dict(id=rid, city=town, name=" / ".join(streets(idx)) + " area", payout=max(15, ceil5(0.15*len(idx)+5)), doors=len(idx), stops=1,
                           lot_type="tight", status="offered", hold_reason=None, est_minutes=int(round((len(idx)/75*60+10)/15.0)*15), center_lat=lat, center_lon=lon,
                           bbox=[min(P[i]["lon"] for i in idx), min(P[i]["lat"] for i in idx), max(P[i]["lon"] for i in idx), max(P[i]["lat"] for i in idx)],
                           homestead_share=round(sum(P[i]["hm"] for i in idx)/len(idx), 3),
                           sort=-1000+len(routes), notes=" ".join(notes), _storm=n_storm, _new=n_new))
        if code == "MAD": routes[-1].update(status="draft", hold_reason="Madeira Beach requires a solicitation permit: call 727-391-9951 x255 before offering")
        houses[rid] = [(P[i], f, why) for i, (f, why) in zip(idx, fl)]

for r in routes:
    print(f'{r["id"]} {r["city"]:16} {r["doors"]:4} doors ${r["payout"]:3} ~{r["est_minutes"]}m storm={r["_storm"]:3} rebuilt={r["_new"]:3} {r["name"]}')
print("TOTAL", len(routes), "routes", sum(r["doors"] for r in routes), "doors")

if "--load" in sys.argv:
    import sb
    rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in routes]
    sb.upsert("canvass_routes", rows, on="id", chunk=100)
    H = []
    for rid, hs in houses.items():
        for p, f, why in hs:
            s, w = score(p, f)
            H.append(dict(route_id=rid, parcel_id=p["pid"], co_no=p["co"], address=p["addr"] or None, city=("St. Petersburg" if p["city"] == "CAUSEWAY ISLES" else p["city"].title()), zip=p["zip"] or None,
                          lat=p["lat"], lon=p["lon"], kind="home", year_built=p["yb"] if (p.get("yb") or 0) > 1800 else None, homestead=bool(p["hm"]),
                          subdivision=p["legal"] or None, living_sqft=int(p["sqft"]) if p.get("sqft") else None,
                          just_value=int(p["jv"]) if p.get("jv") else None, sale_year=p["sy"] if (p.get("sy") or 0) > 1900 else None,
                          prospect=s, prospect_reasons=([why] if why else []) + w))
    for i in range(0, len(H), 1000): sb.upsert("canvass_houses", H[i:i+1000], on="parcel_id,co_no", chunk=1000)
    ids = ",".join(r["id"] for r in routes)
    print("loaded routes", len(rows), "houses", len(H))
