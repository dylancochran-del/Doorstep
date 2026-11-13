# County value signals (land vs building, deleted value) for beach-town homes -> pin_values.json
import json, urllib.request, urllib.parse, collections, time
from concurrent.futures import ThreadPoolExecutor
U="https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
F="PARCEL_ID,JV,LND_VAL,NCONST_VAL,DEL_VAL,JV_CHNG,JV_CHNG_CD,SPC_CIR_CD,SPC_CIR_YR,ASMNT_YR,ACT_YR_BLT"
P=[p for p in json.load(open("parcels_pin.json")) if p["city"] in ("ST PETE BEACH","TREASURE ISLAND","MADEIRA BEACH","REDINGTON BEACH","NORTH REDINGTON BEACH")]
ids=[p["pid"] for p in P]
def get(chunk):
    w="CO_NO=62 AND PARCEL_ID IN ("+",".join("'%s'"%i for i in chunk)+")"
    for a in range(5):
        try:
            d=json.load(urllib.request.urlopen(U,data=urllib.parse.urlencode(dict(where=w,outFields=F,returnGeometry="false",f="json")).encode(),timeout=90))
            if "error" in d: print(d["error"]); return []
            return [x["attributes"] for x in d["features"]]
        except Exception as e: time.sleep(2+a*3)
    return []
chunks=[ids[i:i+150] for i in range(0,len(ids),150)]
rows={}
with ThreadPoolExecutor(8) as ex:
    for res in ex.map(get,chunks):
        for a in res: rows[a["PARCEL_ID"]]=a
json.dump(rows,open("pin_values.json","w"))
H=list(rows.values()); print("got",len(H),"of",len(ids))
bld=lambda r:(r["JV"] or 0)-(r["LND_VAL"] or 0)
print("assess yr",collections.Counter(r["ASMNT_YR"] for r in H))
print("bldg<15%",sum(1 for r in H if r["JV"] and bld(r)<0.15*r["JV"]),"DEL_VAL>0",sum(1 for r in H if (r["DEL_VAL"] or 0)>0),"NCONST>0",sum(1 for r in H if (r["NCONST_VAL"] or 0)>0))
print("spc",collections.Counter((r["SPC_CIR_CD"],r["SPC_CIR_YR"]) for r in H).most_common(6))
print("chg",collections.Counter(r["JV_CHNG_CD"] for r in H).most_common(6))
