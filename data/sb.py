# Tiny Supabase REST client for loading data (service role, from ../.env.local).
import json, urllib.request
env=dict(l.strip().split("=",1) for l in open("../.env.local") if "=" in l)
URL=env["SUPABASE_URL"]; KEY=env["SUPABASE_SERVICE_ROLE_KEY"]
def req(method, path, body=None, prefer="return=minimal"):
    r=urllib.request.Request(f"{URL}/rest/v1/{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey":KEY,"Authorization":f"Bearer {KEY}","Content-Type":"application/json","Prefer":prefer})
    with urllib.request.urlopen(r, timeout=120) as res:
        t=res.read(); return json.loads(t) if t else None
def upsert(table, rows, on=None, chunk=500):
    for i in range(0,len(rows),chunk):
        req("POST", f"{table}"+(f"?on_conflict={on}" if on else ""), rows[i:i+chunk], prefer="resolution=merge-duplicates,return=minimal")
