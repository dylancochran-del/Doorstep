# Owner of record + how the home is used, from the county property appraiser rolls
# (FL statewide parcels). The owner's mailing address is used only to classify the
# home and is not stored.
import json, re, sb
COMPANY = re.compile(r"\b(LLC|L L C|INC|CORP|CORPORATION|LTD|LP|LLP|PROPERTIES|PROPERTY|HOLDINGS|INVEST\w*|RENTALS?|HOMES|REALTY|BANK|FEDERAL|MORTGAGE|AUTHORITY|HOUSING|ASSOC\w*|PARTNERS\w*|VENTURES?|CAPITAL|GROUP|FUND)\b")
def norm(a): return re.sub(r"[^A-Z0-9]", "", (a or "").upper())
def street_key(a):
    m = re.match(r"\s*(\d+)\s+(.*)", (a or "").upper())
    return (m.group(1), norm(m.group(2))[:6]) if m else None

def occupancy(o):
    own = (o["own"] or "").upper()
    if o["hm"]: return "primary"
    if COMPANY.search(own): return "company"
    st = (o["os"] or "").upper()
    if st and st not in ("FL", "FLORIDA"): return "second_home"
    sk, mk = street_key(o["pa"]), street_key(o["oa"])
    if sk and mk and sk[0] == mk[0] and sk[1][:4] == mk[1][:4]: return "owner_here"
    if o["oa"]: return "rental"
    return None

def tidy_name(n):
    n = re.sub(r"\s+", " ", (n or "").strip())
    if not n: return None
    # Appraiser rolls write "LAST FIRST M"; keep their order but fix the capitals.
    t = n.title()
    t = re.sub(r"\b(Llc|Inc|Lp|Ltd|Llp|Ii|Iii|Iv|Jr|Sr)\b", lambda m: m.group(1).upper() if m.group(1) not in ("Jr", "Sr") else m.group(1), t)
    return t[:80]

O = {f'{o["pid"]}|{o["co"]}': o for o in json.load(open("owners.json"))}
HS = json.load(open("route_houses.json"))
rows = []; counts = {}
for rid, hs in HS.items():
    for h in hs:
        o = O.get(f'{h["pid"]}|{h["co"]}')
        if not o: continue
        occ = occupancy(o)
        counts[occ] = counts.get(occ, 0) + 1
        rows.append(dict(route_id=rid, parcel_id=h["pid"], co_no=h["co"], lat=h["lat"], lon=h["lon"], owner_name=tidy_name(o["own"]), occupancy=occ))
for i in range(0, len(rows), 1000):
    sb.upsert("canvass_houses", rows[i:i+1000], on="parcel_id,co_no", chunk=1000)
print("updated", len(rows), counts)
