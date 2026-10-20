# Turns every home in the corridor into walkable, priced routes.
#  1. Walkable = at least 3 other homes within 150 m ("trick-or-treat" streets). Isolated rural homes drop out.
#  2. Cluster walkable homes that sit within 150 m of each other into neighborhoods.
#  3. Big neighborhoods split into routes of <= 320 doors (a single named subdivision may run to 450, like Tioga).
#  4. Small clusters merge with neighbors within 2 km (up to 4 stops) so a route is worth the drive.
#  5. Price: 15c/door + $5 per stop ($10 if big lots), round up to $5, $15 floor. Canvassers only ever see the payout.
import json, math, re, collections
P=json.load(open("parcels.json")); places=json.load(open("places.json"))
# Gated communities (data/gated.json, researched 2026-10-19). High/med confidence = excluded.
# Low confidence or partial = kept, with a note telling the canvasser to skip if the gate is closed.
_g=json.load(open("gated.json")) if __import__("os").path.exists("gated.json") else []
def _pat(names): return re.compile("|".join(re.escape(n.upper()) for n in names) or "$^")
GATED=_pat(["RIVERWALK"]+[g["name"] for g in _g if g.get("gated") is True and g.get("confidence") in ("high","med")])
MAYBE_GATED=_pat([g["name"] for g in _g if (g.get("gated") is True and g.get("confidence")=="low") or g.get("gated")=="partial"])
KM_LAT=111.0; KM_LON=96.6

def pip(x,y,poly):
    inside=False
    for ring in poly:
        n=len(ring)
        for i in range(n):
            x1,y1=ring[i]; x2,y2=ring[(i+1)%n]
            if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1+1e-15)+x1: inside=not inside
    return inside
def polys(f):
    g=f["geometry"]; return [g["coordinates"]] if g["type"]=="Polygon" else g["coordinates"]
CITIES=[(f["properties"]["BASENAME"],polys(f),[min(p[0] for r in pp for p in r) for pp in polys(f)]) for f in places["city"]["features"]]
def city_of(lat,lon):
    for name,ps,_ in CITIES:
        for poly in ps:
            if pip(lon,lat,poly): return name
    return None

# Named areas for unincorporated homes (route grouping in the app).
AREAS={"Chiefland":(29.475,-82.860),"Fanning Springs":(29.588,-82.935),"Old Town":(29.601,-82.982),"Trenton":(29.613,-82.818),"Bell":(29.756,-82.862),
 "Bronson":(29.448,-82.642),"Williston":(29.387,-82.447),"Archer":(29.530,-82.519),"Newberry":(29.646,-82.607),"Jonesville":(29.655,-82.485),
 "High Springs":(29.827,-82.597),"Alachua":(29.785,-82.496),"Gainesville":(29.651,-82.325),"Haile / SW Gainesville":(29.585,-82.415),"Cross City":(29.634,-83.125),
 "Manatee Road":(29.505,-82.925)}
def area_of(lat,lon):
    return min(AREAS,key=lambda a: math.hypot((lat-AREAS[a][0])*KM_LAT,(lon-AREAS[a][1])*KM_LON))

H=[h for h in P if not GATED.search((h["legal"] or "").upper())]
print("homes",len(P),"after gated exclusions",len(H))
# spatial grid ~150m
G=collections.defaultdict(list); cell=0.0015
for i,h in enumerate(H): G[(int(h["lat"]/cell),int(h["lon"]/cell))].append(i)
def near(i,r_m):
    h=H[i]; cx,cy=int(h["lat"]/cell),int(h["lon"]/cell); k=math.ceil(r_m/150)
    for dx in range(-k,k+1):
        for dy in range(-k,k+1):
            for j in G.get((cx+dx,cy+dy),()):
                if j!=i and math.hypot((H[j]["lat"]-h["lat"])*111000,(H[j]["lon"]-h["lon"])*96600)<=r_m: yield j
nn=[0.0]*len(H); walk=[False]*len(H)
for i in range(len(H)):
    ds=sorted(math.hypot((H[j]["lat"]-H[i]["lat"])*111000,(H[j]["lon"]-H[i]["lon"])*96600) for j in near(i,150))
    nn[i]=ds[0] if ds else 999; walk[i]=len(ds)>=3
W=[i for i in range(len(H)) if walk[i]]
print("walkable",len(W))
par={i:i for i in W}
def f(i):
    while par[i]!=i: par[i]=par[par[i]]; i=par[i]
    return i
for i in W:
    for j in near(i,150):
        if walk[j]: par[f(i)]=f(j)
CL=collections.defaultdict(list)
for i in W: CL[f(i)].append(i)
clusters=[v for v in CL.values() if len(v)>=8]
print("clusters",len(clusters),"homes in them",sum(map(len,clusters)))

def tidy(n):
    n=re.sub(r"\b(NO|NUMBER|H|U|UN|EST NO|PB|ORB?)\.?$","",n.strip()).strip(" ,.-")
    n=n.title()
    n=re.sub(r"\b(\d+)(St|Nd|Rd|Th)\b",lambda m:m.group(1)+m.group(2).lower(),n)
    n=re.sub(r"\b(Nw|Ne|Sw|Se|Us|Sr|Cr)\b",lambda m:m.group(1).upper(),n)
    n=re.sub(r"\bEst\b","Estates",n); n=re.sub(r"\bSpgs\b","Springs",n); n=re.sub(r"\bHts\b","Heights",n); n=re.sub(r"\bTerr\b","Terrace",n)
    for w in ("Of","At","The","And","On"): n=re.sub(rf"(?<=\s){w}\b",w.lower(),n)
    return n
def subdiv(idx):
    names=collections.Counter()
    for i in idx:
        l=re.sub(r"^\S*\d+-\d+-\d+\S*\s+","",H[i]["legal"] or "").upper()
        l=re.split(r"\b(S/D|SUBD?|SUBDIVISION|UNIT|UNITS|PHASE|PH|ADD(ITION)?|REPLAT|LOT|BLK|BLOCK|PB|OR|SEC|A REPLAT|\d)\b",l)[0].strip(" ,.-")
        if 3<len(l)<40 and not re.search(r"COM |BEG|N 1/2|S 1/2|E 1/2|W 1/2|FT|TRACT|PARCEL|ACRES|AC\b",l): names[l]+=1
    if names:
        n,c=names.most_common(1)[0]
        if c>=0.35*len(idx) and not re.match(r"^(\d|PART\b|PT\b|THAT\b|ALL\b|LESS\b|LOTS?$|UNREC)", n): return tidy(n)
    return None
def streets(idx,k=2):
    c=collections.Counter()
    for i in idx:
        a=re.sub(r"^\d+\S*\s+","",H[i]["addr"] or "").strip()
        if a: c[tidy(a)]+=1
    return [s for s,_ in c.most_common(k)]

def split(idx, cap):
    if len(idx)<=cap: return [idx]
    lats=[H[i]["lat"] for i in idx]; lons=[H[i]["lon"] for i in idx]
    if (max(lats)-min(lats))*KM_LAT >= (max(lons)-min(lons))*KM_LON: key=lambda i: H[i]["lat"]
    else: key=lambda i: H[i]["lon"]
    s=sorted(idx,key=key); n=math.ceil(len(s)/cap); size=math.ceil(len(s)/n)
    return [s[k:k+size] for k in range(0,len(s),size)]

pieces=[]
for c in clusters:
    name=subdiv(c)
    cap=450 if name and len(c)<=450 else 320
    for part in split(c,cap): pieces.append(part)
def center(idx): return (sum(H[i]["lat"] for i in idx)/len(idx), sum(H[i]["lon"] for i in idx)/len(idx))
# merge small pieces (< 60 doors) into multi-stop routes with neighbors within 2 km
pieces.sort(key=len)
routes=[]; used=set()
cent=[center(p) for p in pieces]
for a in range(len(pieces)):
    if a in used: continue
    stops=[a]; used.add(a)
    if len(pieces[a])<60:
        cand=sorted((math.hypot((cent[a][0]-cent[b][0])*KM_LAT,(cent[a][1]-cent[b][1])*KM_LON),b) for b in range(len(pieces)) if b not in used)
        doors=len(pieces[a])
        for dkm,b in cand:
            if dkm>2.0 or len(stops)>=4 or doors>=120: break
            if doors+len(pieces[b])>320: continue
            stops.append(b); used.add(b); doors+=len(pieces[b])
    routes.append([pieces[s] for s in stops])

def ceil5(x): return int(math.ceil(x/5.0)*5)
out=[]; houses=[]
for stops in routes:
    idx=[i for s in stops for i in s]
    if len(idx)<8: continue
    lat,lon=center(idx)
    med=sorted(nn[i] for i in idx)[len(idx)//2]
    lot="spread" if med>55 else "tight"
    hm=sum(H[i]["hm"] for i in idx)/len(idx)
    cty=collections.Counter(city_of(H[i]["lat"],H[i]["lon"]) or "" for i in idx[::max(1,len(idx)//25)]).most_common(1)[0][0] or None
    area=cty or area_of(lat,lon)
    if area=="Gainesville" and lat<29.62 and lon<-82.38: area="Haile / SW Gainesville" if not cty else area
    co=collections.Counter(H[i]["co"] for i in idx).most_common(1)[0][0]
    fee=10 if lot=="spread" else 5
    pay=max(15,ceil5(0.15*len(idx)+fee*len(stops)))
    rate=40 if lot=="spread" else 75
    mins=int(round((len(idx)/rate*60+10*len(stops))/15.0)*15) or 15
    nm=subdiv(idx)
    if len(stops)>1:
        names=[subdiv(s) or (streets(s,1) or ["Homes"])[0] for s in stops]
        nm=" + ".join(dict.fromkeys(names))[:70]
    elif not nm: nm=" / ".join(streets(idx,2)) + " area"
    out.append(dict(area=area,city=cty,co=co,name=nm,doors=len(idx),stops=len(stops),lot=lot,pay=pay,mins=mins,lat=lat,lon=lon,hm=round(hm,3),idx=idx,
                    bbox=[min(H[i]["lon"] for i in idx),min(H[i]["lat"] for i in idx),max(H[i]["lon"] for i in idx),max(H[i]["lat"] for i in idx)]))

# Gainesville: skip rental-heavy routes (students). Homeowners insurance is the product.
before=len(out)
out=[r for r in out if not (r["area"] in ("Gainesville","Haile / SW Gainesville") and r["hm"]<0.5)]
print("dropped rental-heavy Gainesville routes:",before-len(out))

# Same name twice in one area (a big subdivision split in pieces) -> "Part 1", "Part 2".
dup=collections.Counter((r["area"],r["name"]) for r in out); seen=collections.Counter()
for r in out:
    if dup[(r["area"],r["name"])]>1:
        seen[(r["area"],r["name"])]+=1; r["name"]=f'{r["name"]} · Part {seen[(r["area"],r["name"])]}'
CODE={"Chiefland":"CHF","Fanning Springs":"FAN","Old Town":"OLD","Trenton":"TRN","Bell":"BEL","Bronson":"BRN","Williston":"WIL","Archer":"ARC","Newberry":"NBY",
      "Jonesville":"JON","High Springs":"HSP","Alachua":"ALA","Gainesville":"GNV","Haile / SW Gainesville":"HAI","Cross City":"CRX","Manatee Road":"MAN"}
ORDER=list(CODE)
out.sort(key=lambda r:(ORDER.index(r["area"]) if r["area"] in ORDER else 99, -r["doors"]))
cnt=collections.Counter()
for k,r in enumerate(out):
    code=CODE.get(r["area"]) or re.sub(r"[^A-Z]","",r["area"].upper())[:3]
    cnt[code]+=1; r["id"]=f'{code}-{cnt[code]:02d}'
    # Holds: Newberry requires a solicitor permit; unincorporated Alachua County (Ch. 118) unverified.
    r["status"]="offered"; r["hold"]=None
    if r["city"]=="Newberry": r["status"]="held"; r["hold"]="Waiting on City of Newberry permit"
    elif r["co"]==11 and not r["city"]: r["status"]="held"; r["hold"]="Waiting on Alachua County canvassing rules"
    # Low-value rural routes stay as drafts (not offered) so spend stays near 20c a door; Dylan can switch any on in Vega.
    r["maybe_gated"]=bool(MAYBE_GATED.search(r["name"].upper()))
    # Neighborhoods Dylan asked for by name always stay live.
    if r["status"]=="offered" and r["pay"]/r["doors"]>0.35 and not re.search(r"SPANISH TRACE|BUCK BAY|TIOGA", r["name"].upper()): r["status"]="draft"; r["hold"]=None
    # Possibly gated (weak sources or night-gated): keep off his list until someone sees the entrance.
    if r["status"]=="offered" and (r.get("maybe_gated") or "TURKEY CREEK" in r["name"].upper()): r["status"]="draft"; r["hold"]="Possible gate: check the entrance before offering"
    r["sort"]=k
json.dump([{k:v for k,v in r.items() if k!="idx"} for r in out],open("routes_built.json","w"),indent=0)
json.dump({r["id"]:[H[i] for i in r["idx"]] for r in out},open("route_houses.json","w"))
by=collections.defaultdict(lambda:[0,0,0,0])
for r in out:
    b=by[r["area"]]; b[0]+=1; b[1]+=r["doors"]; b[2]+=r["pay"]; b[3]+= r["status"]=="held"; b.append(r["status"]=="offered")
print("drafts (over 35c/door):",sum(1 for r in out if r["status"]=="draft"))
for a in ORDER:
    if a in by: print(f"{a:24} routes={by[a][0]:3} doors={by[a][1]:6} pay=${by[a][2]:6} held={by[a][3]} live={sum(by[a][4:])}")
print("TOTAL routes",len(out),"doors",sum(r["doors"] for r in out),"pay",sum(r["pay"] for r in out))
