"use client";
// The active route. Every tap is saved to an outbox first, so a dead zone on a
// country road never loses a door; the outbox drains whenever signal comes back.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, money, postJSON, shrink, useMe } from "../ui";
import type { House, Status } from "../GameMap";

const GameMap = dynamic(() => import("../GameMap"), { ssr: false });

type Active = {
  session: { id: string; startedAt: string; payout: number } | null;
  route: { id: string; city: string; name: string; payout: number; doors: number; notes: string | null } | null;
  houses: House[];
  status: Status;
  daylight: { isDark: boolean; sunset: string } | null;
};
type Pos = { lat: number; lon: number; acc: number };
type Outgoing = { url: string; body: Record<string, unknown> };

const SKIPS: [string, string][] = [["gate", "Gate"], ["fence", "Fence"], ["dog", "Dog"], ["no_soliciting", "No Soliciting"], ["vacant", "Vacant"], ["no_access", "Can't reach"], ["other", "Other"]];
const OUTBOX = "doorstep-outbox";

function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return Math.hypot((a.lat - b.lat) * 111_000, (a.lon - b.lon) * 96_500);
}
function readBox(): Outgoing[] { try { return JSON.parse(localStorage.getItem(OUTBOX) || "[]"); } catch { return []; } }
function writeBox(b: Outgoing[]) { try { localStorage.setItem(OUTBOX, JSON.stringify(b)); } catch { /* storage blocked */ } }

export default function Run() {
  const me = useMe();
  const [d, setD] = useState<Active | null>(null);
  const [status, setStatus] = useState<Status>({});
  const [pos, setPos] = useState<Pos | null>(null);
  const [track, setTrack] = useState<[number, number][]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<"house" | "skip" | "talk" | "finish" | "menu" | "problem" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sat, setSat] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null);
  const [pending, setPending] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const trackBuf = useRef<{ lat: number; lon: number; acc: number; at: string }[]>([]);
  const lastPt = useRef<Pos | null>(null);
  const history = useRef<number[]>([]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 1800); };

  const load = useCallback(() => {
    api<Active>("/api/session/active").then((x) => {
      if (!x.session) { location.href = "/"; return; }
      setD(x); setStatus((s) => ({ ...x.status, ...s }));
    }).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  // Outbox: queue first, send second.
  const drain = useCallback(async () => {
    let box = readBox();
    while (box.length) {
      try { await postJSON(box[0].url, box[0].body); box = box.slice(1); writeBox(box); }
      catch { break; }
    }
    setPending(readBox().length);
  }, []);
  const send = useCallback((url: string, body: Record<string, unknown>) => {
    writeBox([...readBox(), { url, body: { ...body, at: new Date().toISOString() } }]);
    setPending(readBox().length);
    drain();
  }, [drain]);
  useEffect(() => {
    drain();
    const t = setInterval(drain, 15000);
    window.addEventListener("online", drain);
    return () => { clearInterval(t); window.removeEventListener("online", drain); };
  }, [drain]);

  // GPS while the app is open, plus a screen wake lock so it stays open.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((p) => {
      const q = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      setPos(q);
      if (!lastPt.current || meters(lastPt.current, q) > 15) {
        lastPt.current = q;
        trackBuf.current.push({ ...q, at: new Date().toISOString() });
        setTrack((t) => [...t, [q.lon, q.lat]]);
      }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
    const flush = setInterval(() => {
      if (!trackBuf.current.length) return;
      const points = trackBuf.current.splice(0);
      postJSON("/api/session/track", { points }).catch(() => trackBuf.current.unshift(...points));
    }, 30000);
    let lock: { release: () => Promise<void> } | null = null;
    const wake = async () => { try { lock = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<typeof lock> } }).wakeLock.request("screen"); } catch { /* not allowed */ } };
    wake();
    const vis = () => document.visibilityState === "visible" && wake();
    document.addEventListener("visibilitychange", vis);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(flush); lock?.release().catch(() => {}); document.removeEventListener("visibilitychange", vis); };
  }, []);

  const houses = d?.houses ?? [];
  const counts = useMemo(() => {
    const c = { hung: 0, skipped: 0, talked: 0 };
    for (const v of Object.values(status)) c[v.kind as keyof typeof c] = (c[v.kind as keyof typeof c] ?? 0) + 1;
    return c;
  }, [status]);
  const done = counts.hung + counts.skipped + counts.talked;
  const total = Math.max(houses.filter((h) => h.kind !== "added").length, 1);
  const pct = Math.min(100, Math.round((done / total) * 100));

  const nearest = useMemo(() => {
    if (!pos) return null;
    let best: { h: House; m: number } | null = null;
    for (const h of houses) {
      if (status[h.id]) continue;
      const m = meters(pos, h);
      if (!best || m < best.m) best = { h, m };
    }
    return best && best.m < 80 ? best : null;
  }, [pos, houses, status]);

  const selHouse = houses.find((h) => h.id === sel) ?? null;
  const gps = () => (pos ? { lat: pos.lat, lon: pos.lon, acc: pos.acc } : {});

  function mark(houseId: number, kind: "hung" | "skipped", reason?: string) {
    setStatus((s) => ({ ...s, [houseId]: { kind, reason } }));
    history.current.push(houseId);
    send("/api/session/event", { houseId, kind, reason, ...gps() });
    if (navigator.vibrate) navigator.vibrate(kind === "hung" ? 30 : [20, 40, 20]);
    flash(kind === "hung" ? "+1 door ✓" : "Skipped. You still get paid.");
    setMode(null); setSel(null);
  }
  function undo() {
    const id = history.current.pop();
    if (id == null) return;
    setStatus((s) => { const n = { ...s }; delete n[id]; return n; });
    send("/api/session/event", { houseId: id, kind: "undo", ...gps() });
    flash("Undone");
  }

  if (err) return <main className="page"><div className="error">{err}</div><Link className="btn gray" href="/">Back</Link></main>;
  if (!d?.route) return <main className="page"><p className="muted">Loading your route…</p></main>;

  return (
    <div className="run">
      <GameMap houses={houses} status={status} me={pos} avatar={me?.avatar} track={track} satellite={sat} fit={houses} focus={focus}
        onHouse={(id) => { setSel(id); setMode("house"); }} />

      <div className="hud">
        <div className="hud-top">
          {me?.avatar ? <img src={me.avatar} alt="" className="avatar" /> : <span className="avatar" />}
          <div className="hud-title">
            <b>{d.route.name}</b>
            <div className="xp" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
          </div>
          <span className="hud-pay">{money(d.session!.payout)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div className="chips">
            <span className="chip"><i className="dot" style={{ background: "var(--hung)" }} />{counts.hung + counts.talked} / {total}</span>
            {counts.skipped > 0 && <span className="chip"><i className="dot" style={{ background: "var(--skip)" }} />{counts.skipped} skipped</span>}
            {counts.talked > 0 && <span className="chip"><i className="dot" style={{ background: "var(--talk)" }} />{counts.talked} talked</span>}
            {pending > 0 && <span className="chip">⏳ {pending} saving</span>}
            {d.daylight?.isDark && <span className="chip" style={{ background: "#fde8e6" }}>🌙 After sunset. Wrap up.</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="iconbtn" onClick={() => setMode("menu")} aria-label="Route menu">☰</button>
            <button className="iconbtn" onClick={() => setSat(!sat)} aria-pressed={sat} aria-label="Toggle satellite view">{sat ? "🗺️" : "🛰️"}</button>
            <button className="iconbtn" onClick={() => pos && setFocus({ ...pos })} aria-label="Center on me">📍</button>
            {history.current.length > 0 && <button className="iconbtn" onClick={undo} aria-label="Undo last tap">↩︎</button>}
          </div>
        </div>
      </div>

      {!mode && (
        <div className="sheet">
          {nearest ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}><span className="tag">Closest door · {Math.round(nearest.m)} m</span><h3 style={{ marginTop: 4 }}>{nearest.h.address || "House"}</h3></div>
              </div>
              <div className="grid3">
                <button className="btn green" onClick={() => mark(nearest.h.id, "hung")}>Hung ✓</button>
                <button className="btn gray" onClick={() => { setSel(nearest.h.id); setMode("skip"); }}>Skip</button>
                <button className="btn" onClick={() => { setSel(nearest.h.id); setMode("talk"); }}>Talked</button>
              </div>
            </>
          ) : (
            <>
              <h3>{pct >= 100 ? "Every door done!" : pos ? "Walk to a house or tap one on the map" : "Turn on location to see the closest door"}</h3>
              <div className="grid2">
                <button className="btn gray" onClick={() => setMode("menu")}>Menu</button>
                <button className="btn navy" onClick={() => setMode("finish")}>Finish route</button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === "house" && selHouse && (
        <div className="sheet">
          <div className="grab" />
          <h3>{selHouse.address || "House"}</h3>
          {status[selHouse.id] && <span className="tag">Marked {status[selHouse.id].kind}</span>}
          <div className="grid3">
            <button className="btn green" onClick={() => mark(selHouse.id, "hung")}>Hung ✓</button>
            <button className="btn gray" onClick={() => setMode("skip")}>Skip</button>
            <button className="btn" onClick={() => setMode("talk")}>Talked</button>
          </div>
          <button className="btn gray block" onClick={() => { setMode(null); setSel(null); }}>Close</button>
        </div>
      )}

      {mode === "skip" && sel != null && (
        <SkipSheet onPick={(r) => mark(sel, "skipped", r)} onClose={() => { setMode(null); setSel(null); }} />
      )}

      {mode === "talk" && (
        <TalkSheet house={selHouse} gps={gps()} onDone={(ok) => {
          if (ok && sel != null) { setStatus((s) => ({ ...s, [sel]: { kind: "talked" } })); history.current.push(sel); flash("Lead sent to Dylan ⭐"); }
          setMode(null); setSel(null);
        }} />
      )}

      {mode === "menu" && (
        <div className="sheet">
          <div className="grab" />
          <h3>Route menu</h3>
          {d.route.notes && <p className="muted" style={{ margin: 0 }}>{d.route.notes}</p>}
          <button className="btn gray block" onClick={() => {
            if (!pos) { flash("Need your location to add a house"); return; }
            send("/api/session/event", { kind: "new_house", ...gps() });
            flash("House added. Reloading map…"); setMode(null); setTimeout(load, 2500);
          }}>+ Add a house that isn&apos;t on the map</button>
          <button className="btn gray block" onClick={() => setMode("problem")}>Report a problem</button>
          <Link className="btn gray block" href="/playbook">Scripts &amp; rules</Link>
          <button className="btn navy block" onClick={() => setMode("finish")}>Finish route</button>
          <button className="btn gray block" onClick={async () => { await postJSON("/api/session/cancel", {}); location.href = "/"; }}>Cancel route (no pay)</button>
          <button className="btn gray block" onClick={() => setMode(null)}>Back to map</button>
        </div>
      )}

      {mode === "problem" && (
        <NoteSheet title="Report a problem" placeholder="What happened? (closed road, new gate, someone upset, etc.)" onSend={(note) => {
          send("/api/session/event", { kind: "problem", note, ...gps() }); flash("Sent to Dylan"); setMode(null);
        }} onClose={() => setMode(null)} />
      )}

      {mode === "finish" && <FinishSheet doors={done} total={total} pending={pending} onClose={() => setMode(null)} />}

      {toast && <div className="toast pop" role="status">{toast}</div>}
    </div>
  );
}

function SkipSheet({ onPick, onClose }: { onPick: (r: string) => void; onClose: () => void }) {
  return (
    <div className="sheet">
      <div className="grab" />
      <h3>Why couldn&apos;t you hang it?</h3>
      <p className="muted" style={{ margin: 0 }}>Skips never cost you pay. Gates and No Soliciting signs get removed from future routes.</p>
      <div className="grid3">{SKIPS.map(([k, label]) => <button key={k} className="reason" onClick={() => onPick(k)}>{label}</button>)}</div>
      <button className="btn gray block" onClick={onClose}>Cancel</button>
    </div>
  );
}

function TalkSheet({ house, gps, onDone }: { house: House | null; gps: Record<string, number | undefined>; onDone: (ok: boolean) => void }) {
  const [interest, setInterest] = useState("home");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      await postJSON("/api/session/lead", { houseId: house?.id, name: f.get("name"), phone: f.get("phone"), interest, note: f.get("note"), ...gps });
      onDone(true);
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <form className="sheet" onSubmit={submit}>
      <div className="grab" />
      <h3>Talked to someone ⭐</h3>
      <p className="muted" style={{ margin: 0 }}>{house?.address ?? "Current location"} · Only if they want a call. Don&apos;t quote prices or talk coverage.</p>
      <div className="field"><label htmlFor="ln">Their name</label><input id="ln" name="name" autoComplete="off" required /></div>
      <div className="field"><label htmlFor="lp">Phone</label><input id="lp" name="phone" type="tel" inputMode="tel" autoComplete="off" required /></div>
      <div className="field"><label>Interested in</label>
        <div className="grid3">{[["home", "Home"], ["auto", "Auto"], ["flood", "Flood"], ["bundle", "Home + auto"], ["other", "Other"]].map(([k, l]) => (
          <button type="button" key={k} className="reason" aria-pressed={interest === k} onClick={() => setInterest(k)}>{l}</button>
        ))}</div>
      </div>
      <div className="field"><label htmlFor="lnote">Note (optional)</label><textarea id="lnote" name="note" rows={2} placeholder="Renewal in March, just bought the house, etc." /></div>
      {err && <div className="error" role="alert">{err}</div>}
      <div className="grid2"><button type="button" className="btn gray" onClick={() => onDone(false)}>Cancel</button><button className="btn" disabled={busy}>{busy ? "Sending…" : "Send to Dylan"}</button></div>
    </form>
  );
}

function NoteSheet({ title, placeholder, onSend, onClose }: { title: string; placeholder: string; onSend: (n: string) => void; onClose: () => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="sheet">
      <div className="grab" />
      <h3>{title}</h3>
      <div className="field"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} aria-label={title} /></div>
      <div className="grid2"><button className="btn gray" onClick={onClose}>Cancel</button><button className="btn" disabled={!note.trim()} onClick={() => onSend(note.trim())}>Send</button></div>
    </div>
  );
}

function FinishSheet({ doors, total, pending, onClose }: { doors: number; total: number; pending: number; onClose: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (photo) f.set("photo", photo);
    setBusy(true); setErr(null);
    try { await api("/api/session/finish", { method: "POST", body: f }); location.href = "/earnings?done=1"; }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <form className="sheet" onSubmit={submit}>
      <div className="grab" />
      <h3>Finish route</h3>
      <p style={{ margin: 0 }}><b>{doors}</b> of {total} doors marked.{doors < total * 0.9 ? " Some doors aren't marked yet. Finish them or mark them skipped first." : ""}</p>
      {pending > 0 && <div className="sunbar">⏳ {pending} taps still saving. Wait for signal before you submit.</div>}
      <div className="field"><label htmlFor="left">Leftover hangers</label><input id="left" name="leftover" type="number" inputMode="numeric" min={0} required /></div>
      <div className="field"><label htmlFor="proof">Proof photo: hanger on a door with the street sign behind it</label>
        <input id="proof" type="file" accept="image/*" capture="environment" required onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await shrink(f)); }} />
      </div>
      <div className="field"><label htmlFor="fnote">Anything Dylan should know? (optional)</label><textarea id="fnote" name="note" rows={2} /></div>
      {err && <div className="error" role="alert">{err}</div>}
      <div className="grid2"><button type="button" className="btn gray" onClick={onClose}>Not yet</button><button className="btn green" disabled={busy || pending > 0}>{busy ? "Submitting…" : "Submit for pay"}</button></div>
    </form>
  );
}
