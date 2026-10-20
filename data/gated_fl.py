# Gated communities across Florida, from OpenStreetMap (private residential streets + gates)
# sized with FL statewide parcel records (homes, owner-occupied share, values).
import json, math, os, time, urllib.request, urllib.parse, collections
from concurrent.futures import ThreadPoolExecutor
OV="https://overpass-api.de/api/interpreter"; UA={"User-Agent":"doorstep-research/1.0 (dylan@floridaallrisk.com)"}
OUT="gated_fl"
def overpass(q, tries=4):
    for a in range(tries):
        try:
            r=urllib.request.Request(OV, data=urllib.parse.urlencode({"data":q}).encode(), headers=UA)
            return json.load(urllib.request.urlopen(r, timeout=300))
        except Exception as e:
            time.sleep(15*(a+1))
    return {"elements":[]}
# 1) Private residential streets + gates, Florida in tiles.
tiles=[]
lat=24.4
while lat<31.1:
    lon=-87.7
    while lon<-79.9: tiles.append((round(lat,2),round(lon,2),round(lat+1,2),round(lon+1.3,2))); lon+=1.3
    lat+=1
ways=[]; gates=[]
for i,(s,w,n,e) in enumerate(tiles):
    fn=f"{OUT}/osm_{s}_{w}.json"
    if os.path.exists(fn): d=json.load(open(fn))
    else:
        d=overpass(f'[out:json][timeout:240];(way["highway"~"^(residential|living_street)$"]["access"~"^(private|residents)$"]({s},{w},{n},{e});node["barrier"~"^(gate|lift_gate)$"]({s},{w},{n},{e}););out center tags;')
        json.dump(d,open(fn,"w")); time.sleep(2)
    for el in d.get("elements",[]):
        if el["type"]=="way" and "center" in el: ways.append((el["center"]["lat"],el["center"]["lon"],el.get("tags",{}).get("name","")))
        elif el["type"]=="node": gates.append((el["lat"],el["lon"]))
    print("tile",i+1,len(tiles),"ways",len(ways),"gates",len(gates),flush=True)
# 2) Cluster private streets into communities (streets within 250 m chain together).
cell=0.003; G=collections.defaultdict(list)
for i,(la,lo,_) in enumerate(ways): G[(int(la/cell),int(lo/cell))].append(i)
par=list(range(len(ways)))
def f(i):
    while par[i]!=i: par[i]=par[par[i]]; i=par[i]
    return i
def m(a,b): return math.hypot((a[0]-b[0])*111000,(a[1]-b[1])*96000)
for i,(la,lo,_) in enumerate(ways):
    cx,cy=int(la/cell),int(lo/cell)
    for dx in (-1,0,1):
        for dy in (-1,0,1):
            for j in G.get((cx+dx,cy+dy),()):
                if j>i and m(ways[i],ways[j])<250: par[f(i)]=f(j)
C=collections.defaultdict(list)
for i in range(len(ways)): C[f(i)].append(i)
GG=collections.defaultdict(list)
for la,lo in gates: GG[(int(la/cell),int(lo/cell))].append((la,lo))
comms=[]
for idx in C.values():
    if len(idx)<4: continue      # 4+ private streets ~ a real community, not a private driveway
    pts=[ways[i] for i in idx]
    bb=[min(p[1] for p in pts)-0.0012,min(p[0] for p in pts)-0.0012,max(p[1] for p in pts)+0.0012,max(p[0] for p in pts)+0.0012]
    ng=sum(1 for k in {(int(la/cell)+dx,int(lo/cell)+dy) for la,lo,_ in pts for dx in (-1,0,1) for dy in (-1,0,1)} for g in GG.get(k,()) if bb[1]<=g[0]<=bb[3] and bb[0]<=g[1]<=bb[2])
    comms.append(dict(streets=len(idx),gates=ng,bbox=bb,lat=sum(p[0] for p in pts)/len(pts),lon=sum(p[1] for p in pts)/len(pts),pts=[(p[0],p[1]) for p in pts],
                      street_names=[n for n,_ in collections.Counter(p[2] for p in pts if p[2]).most_common(3)]))
print("communities",len(comms),flush=True)
json.dump(comms,open(f"{OUT}/communities_raw.json","w"))
# 3) Homes inside each community from FL parcels (homes/mobile homes near the private streets).
PU="https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
def size(c):
    fn=f"{OUT}/c_{c['lat']:.5f}_{c['lon']:.5f}.json"
    if os.path.exists(fn): return json.load(open(fn))
    feats=[]; off=0
    while True:
        p=dict(where="DOR_UC IN ('001','002','004')",geometry=",".join(map(str,c["bbox"])),geometryType="esriGeometryEnvelope",inSR=4326,outSR=4326,spatialRel="esriSpatialRelIntersects",
               outFields="CO_NO,DOR_UC,JV,JV_HMSTD,ACT_YR_BLT,PHY_CITY,PHY_ZIPCD,S_LEGAL,OWN_STATE",returnGeometry="true",resultOffset=off,resultRecordCount=2000,orderByFields="OBJECTID",f="json")
        d=None
        for a in range(4):
            try: d=json.load(urllib.request.urlopen(PU+"?"+urllib.parse.urlencode(p),timeout=90)); break
            except Exception: time.sleep(3)
        if not d: break
        feats+=d.get("features",[])
        if not d.get("exceededTransferLimit") and len(d.get("features",[]))<2000: break
        off+=2000
    # keep homes within 120 m of a private street
    near=[x for x in feats if x.get("geometry") and min(m((x["geometry"]["y"],x["geometry"]["x"]),q) for q in c["pts"])<=120]
    if not near: r=dict(homes=0); json.dump(r,open(fn,"w")); return r
    a=[x["attributes"] for x in near]
    legal=collections.Counter(" ".join((t.get("S_LEGAL") or "").split()[:4]).upper() for t in a).most_common(1)[0][0]
    vals=sorted(t["JV"] for t in a if t.get("JV"))
    r=dict(homes=len(a), condos=sum(1 for t in a if t["DOR_UC"]=="004"), owner_occ=round(sum(1 for t in a if (t.get("JV_HMSTD") or 0)>0)/len(a),2),
           out_of_state=round(sum(1 for t in a if (t.get("OWN_STATE") or "FL").strip().upper() not in ("FL","FLORIDA",""))/len(a),2),
           median_value=vals[len(vals)//2] if vals else None, median_built=sorted(t["ACT_YR_BLT"] for t in a if t.get("ACT_YR_BLT"))[len(a)//2] if any(t.get("ACT_YR_BLT") for t in a) else None,
           city=collections.Counter((t.get("PHY_CITY") or "").strip().title() for t in a).most_common(1)[0][0], zip=collections.Counter(str(t.get("PHY_ZIPCD") or "")[:5] for t in a).most_common(1)[0][0],
           county=collections.Counter(t["CO_NO"] for t in a).most_common(1)[0][0], legal=legal)
    json.dump(r,open(fn,"w")); return r
with ThreadPoolExecutor(8) as ex:
    sized=list(ex.map(size, comms))
rows=[]
for c,s in zip(comms,sized):
    if s.get("homes",0)<25: continue
    rows.append(dict(**{k:c[k] for k in ("lat","lon","streets","gates","street_names")}, **s))
rows.sort(key=lambda r:-r["homes"])
json.dump(rows,open(f"{OUT}/gated_communities.json","w"),indent=1)
print("DONE communities with 25+ homes:",len(rows),"homes:",sum(r["homes"] for r in rows))
