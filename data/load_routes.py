# Loads built routes + their houses into Supabase. Idempotent: routes upsert by id, houses by (parcel_id, co_no).
# Never touches routes that already have sessions' payouts (payout is snapshotted per session anyway).
import json, sb
R=json.load(open("routes_built.json")); HS=json.load(open("route_houses.json"))
rows=[dict(id=r["id"],city=r["area"],name=r["name"],payout=r["pay"],doors=r["doors"],stops=r["stops"],lot_type=r["lot"],est_minutes=r["mins"],
          center_lat=r["lat"],center_lon=r["lon"],bbox=r["bbox"],homestead_share=r["hm"],status=r["status"],hold_reason=r["hold"],sort=r["sort"],
          notes=("Big lots: houses are spread out, bring water." if r["lot"]=="spread" else None)) for r in R]
sb.upsert("canvass_routes",rows,on="id",chunk=200)
print("routes",len(rows))
H=[]
for rid,hs in HS.items():
    for h in hs:
        H.append(dict(route_id=rid,parcel_id=h["pid"],co_no=h["co"],address=h["addr"] or None,city=h["city"] or None,zip=h["zip"] or None,lat=h["lat"],lon=h["lon"],
                      kind="mobile" if h["uc"]=="002" else "home",year_built=h["yb"] or None,homestead=bool(h["hm"]),subdivision=(h["legal"] or None)))
for i in range(0,len(H),1000):
    sb.upsert("canvass_houses",H[i:i+1000],on="parcel_id,co_no",chunk=1000)
    if i%10000==0: print("houses",i)
print("houses",len(H))
