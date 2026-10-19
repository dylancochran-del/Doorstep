# Every home + mobile home (DOR 001/002) in the Chiefland -> Gainesville corridor plus Cross City,
# from FloridaGIO statewide parcel centroids. Owner names are deliberately not pulled.
# Resumable: each tile is cached in tiles/; rerun to fill gaps.
import json, os, urllib.request, urllib.parse, sys, time
from concurrent.futures import ThreadPoolExecutor
U="https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
FIELDS="PARCEL_ID,CO_NO,DOR_UC,JV,JV_HMSTD,ACT_YR_BLT,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,S_LEGAL"
tiles=[]
lon=-83.02
while lon < -82.24:
    lat=29.33
    while lat < 29.87:
        tiles.append((round(lon,3),round(lat,3),round(lon+0.04,3),round(lat+0.04,3))); lat+=0.04
    lon+=0.04
tiles.append((-83.20,29.57,-83.12,29.70)); tiles.append((-83.12,29.57,-83.05,29.70))
def get(p):
    for a in range(5):
        try: return json.load(urllib.request.urlopen(U+"?"+urllib.parse.urlencode(p),timeout=90))
        except Exception: time.sleep(2+a*3)
    return None
def tile(t):
    fn=f"tiles/{t[0]}_{t[1]}.json"
    if os.path.exists(fn): return 0
    rows=[]; off=0
    while True:
        p=dict(where="DOR_UC IN ('001','002')",geometry=",".join(map(str,t)),geometryType="esriGeometryEnvelope",inSR=4326,outSR=4326,
               spatialRel="esriSpatialRelIntersects",outFields=FIELDS,returnGeometry="true",orderByFields="OBJECTID",resultOffset=off,resultRecordCount=2000,f="json")
        d=get(p)
        if d is None or "error" in d: return -1
        f=d.get("features",[])
        for x in f:
            a=x["attributes"]; g=x.get("geometry")
            if not g: continue
            rows.append(dict(pid=a["PARCEL_ID"],co=a["CO_NO"],uc=a["DOR_UC"],jv=a["JV"],hm=1 if (a["JV_HMSTD"] or 0)>0 else 0,yb=a["ACT_YR_BLT"],
               addr=(a["PHY_ADDR1"] or "").strip(),city=(a["PHY_CITY"] or "").strip(),zip=str(a["PHY_ZIPCD"] or ""),legal=(a["S_LEGAL"] or "").strip()[:80],lat=round(g["y"],6),lon=round(g["x"],6)))
        if not d.get("exceededTransferLimit") and len(f)<2000: break
        off+=2000
    json.dump(rows,open(fn,"w")); return len(rows)
done=0
with ThreadPoolExecutor(8) as ex:
    for n in ex.map(tile,tiles):
        done+=1
        if done%20==0: open("progress.txt","w").write(f"{done}/{len(tiles)}\n")
open("progress.txt","w").write(f"{done}/{len(tiles)} done\n")
out={}
for fn in os.listdir("tiles"):
    for r in json.load(open("tiles/"+fn)): out[f'{r["pid"]}|{r["co"]}']=r
json.dump(list(out.values()),open("parcels.json","w"))
print("tiles",len(tiles),"homes",len(out))
