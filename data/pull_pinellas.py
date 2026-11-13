# Beach towns (St Pete Beach, Treasure Island, Madeira Beach + neighbors) single-family homes, FloridaGIO parcels.
import json, os, urllib.request, urllib.parse, time
from concurrent.futures import ThreadPoolExecutor
U="https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
FIELDS="PARCEL_ID,CO_NO,DOR_UC,JV,JV_HMSTD,ACT_YR_BLT,EFF_YR_BLT,TOT_LVG_AR,SALE_YR1,SALE_MO1,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,S_LEGAL"
tiles=[]; lon=-82.82
while lon < -82.68:
    lat=27.66
    while lat < 27.83: tiles.append((round(lon,3),round(lat,3),round(lon+0.02,3),round(lat+0.02,3))); lat+=0.02
    lon+=0.02
def get(p):
    for a in range(5):
        try: return json.load(urllib.request.urlopen(U+"?"+urllib.parse.urlencode(p),timeout=90))
        except Exception: time.sleep(2+a*3)
def tile(t):
    fn=f"tiles_pin/{t[0]}_{t[1]}.json"
    if os.path.exists(fn): return 0
    rows=[]; off=0
    while True:
        d=get(dict(where="DOR_UC IN ('001','002')",geometry=",".join(map(str,t)),geometryType="esriGeometryEnvelope",inSR=4326,outSR=4326,
               spatialRel="esriSpatialRelIntersects",outFields=FIELDS,returnGeometry="true",orderByFields="OBJECTID",resultOffset=off,resultRecordCount=2000,f="json"))
        if d is None or "error" in d: return -1
        f=d.get("features",[])
        for x in f:
            a=x["attributes"]; g=x.get("geometry")
            if not g: continue
            rows.append(dict(pid=a["PARCEL_ID"],co=a["CO_NO"],uc=a["DOR_UC"],jv=a["JV"],hm=1 if (a["JV_HMSTD"] or 0)>0 else 0,yb=a["ACT_YR_BLT"],eyb=a["EFF_YR_BLT"],sqft=a["TOT_LVG_AR"],sy=a["SALE_YR1"],sm=a["SALE_MO1"],
               addr=(a["PHY_ADDR1"] or "").strip(),city=(a["PHY_CITY"] or "").strip(),zip=str(a["PHY_ZIPCD"] or ""),legal=(a["S_LEGAL"] or "").strip()[:80],lat=round(g["y"],6),lon=round(g["x"],6)))
        if not d.get("exceededTransferLimit") and len(f)<2000: break
        off+=2000
    json.dump(rows,open(fn,"w")); return len(rows)
with ThreadPoolExecutor(8) as ex: res=list(ex.map(tile,tiles))
print("failed tiles",res.count(-1))
out={}
for fn in os.listdir("tiles_pin"):
    for r in json.load(open("tiles_pin/"+fn)): out[f'{r["pid"]}|{r["co"]}']=r
json.dump(list(out.values()),open("parcels_pin.json","w"))
import collections; print(len(out)); print(collections.Counter(r["city"] for r in out.values()).most_common(25))
