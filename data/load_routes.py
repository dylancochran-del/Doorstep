# Loads built routes + their houses into Supabase. Idempotent: routes upsert by id, houses by (parcel_id, co_no).
# Never touches routes that already have sessions' payouts (payout is snapshotted per session anyway).
import json, sb, sys
R=json.load(open("routes_built.json")); HS=json.load(open("route_houses.json"))
# Safety: never reshuffle routes while someone is walking one.
if sb.req("GET","canvass_sessions?status=eq.active&select=id",prefer="return=representation"):
    sys.exit("Someone is on an active route. Load again after they finish.")
new_ids={r["id"] for r in R}
old=sb.req("GET","canvass_routes?select=id",prefer="return=representation") or []
ran={x["route_id"] for x in (sb.req("GET","canvass_sessions?select=route_id",prefer="return=representation") or [])}
# Unassign every parcel house; the upsert below re-attaches the ones still on a route.
sb.req("PATCH","canvass_houses?kind=neq.added&route_id=not.is.null",{"route_id":None})
rows=[dict(id=r["id"],city=r["area"],name=r["name"],payout=r["pay"],doors=r["doors"],stops=r["stops"],lot_type=r["lot"],est_minutes=r["mins"],
          center_lat=r["lat"],center_lon=r["lon"],bbox=r["bbox"],homestead_share=r["hm"],status=r["status"],hold_reason=r["hold"],sort=r["sort"],
          notes=" ".join(x for x in [
              "HANG ONLY: leave the hanger and move on, no knocking. If someone comes out, be friendly but don't pitch; tell them to scan the code." if r.get("hang_only") else "",
              "Big lots: houses are spread out, bring water." if r["lot"]=="spread" else "",
              "May have a gate at the entrance. If it's closed, mark the houses Skipped (Gate) and move on." if r.get("maybe_gated") else ""] if x) or None) for r in R]
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

# Routes that no longer exist: retire them if anyone ever ran them (keeps pay history), otherwise delete.
for x in old:
    if x["id"] in new_ids: continue
    if x["id"] in ran: sb.req("PATCH",f"canvass_routes?id=eq.{x['id']}",{"status":"retired"})
    else: sb.req("DELETE",f"canvass_routes?id=eq.{x['id']}")
print("retired/removed", len([x for x in old if x["id"] not in new_ids]))
