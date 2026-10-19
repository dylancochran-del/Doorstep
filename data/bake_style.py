# Bakes the game look into a trimmed copy of OpenFreeMap "bright" so the phone
# downloads one small style file and skips recoloring 100+ layers at startup.
# Dropped: POIs, shields (so no sprite sheet download), tunnels, airports,
# boundaries, transit, 3D building tops — nothing a canvasser needs.
import json, re
s=json.load(open("data/bright.json"))
DROP=re.compile(r"glacier|ice-shelf|sand|^tunnel|ferry|aeroway|pier|railway-transit|railway-service|cablecar|^boundary|oneway|^poi_|shield|^airport|label_country|label_state|building-top|hatching")
L=[]
for l in s["layers"]:
    if DROP.search(l["id"]): continue
    p=l.setdefault("paint",{}); t=l["type"]; i=l["id"]
    if t=="background": p["background-color"]="#b5e08f"
    elif t=="fill":
        if "water" in i: p["fill-color"]="#5ec2ff"
        elif re.search(r"wood|park|grass",i): p["fill-color"]="#8fd16a"
        elif i=="building": p["fill-color"]="#f3d3b0"; p["fill-outline-color"]="#c9a27a"
        elif "landuse" in i: p["fill-color"]="#c6e8a3"
    elif t=="line":
        if re.search(r"water|river|stream",i): p["line-color"]="#5ec2ff"
        elif "casing" in i: p["line-color"]="#d8b977"
        elif re.search(r"motorway|trunk|primary",i): p["line-color"]="#ffd666"
        elif re.search(r"highway|bridge|minor|link|service|path|secondary",i): p["line-color"]="#fffbe8"
    elif t=="symbol":
        p["text-halo-color"]="#ffffff"; p["text-halo-width"]=2
    L.append(l)
s["layers"]=L
s["sources"]={k:v for k,v in s["sources"].items() if k=="openmaptiles"}
# Keep the TileJSON url: OpenFreeMap rotates versioned tile paths, so inlining them would break later.

s.pop("sprite",None)
s["name"]="Doorstep game"
json.dump(s,open("public/map-style.json","w"),separators=(",",":"))
print("layers",len(L),"bytes",len(json.dumps(s,separators=(",",":"))))
