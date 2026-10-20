"use client";
// The active route. Every tap is saved to an outbox first, so a dead zone on a
// country road never loses a door; the outbox drains whenever signal comes back.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, money, postJSON, shrink, useMe } from "../ui";
import { prefetchRoute } from "@/lib/tiles";
import { pathPieces, walkOrder } from "@/lib/walk";
import { HOT } from "../GameMap";
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
const TAPS = "doorstep-taps";
/** Houses within this many meters of a GPS fix get auto-marked as hung (when auto-mark is on). */
const AUTO_M = 20;
type Tap = { houseId: number; kind: "hung" | "skipped" | "undo"; reason?: string; lat?: number; lon?: number; acc?: number; at: string; note?: string };

function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return Math.hypot((a.lat - b.lat) * 111_000, (a.lon - b.lon) * 96_500);
}
function readBox(): Outgoing[] { try { return JSON.parse(localStorage.getItem(OUTBOX) || "[]"); } catch { return []; } }
function writeBox(b: Outgoing[]) { try { localStorage.setItem(OUTBOX, JSON.stringify(b)); } catch { /* storage blocked */ } }
function readTaps(): Tap[] { try { return JSON.parse(localStorage.getItem(TAPS) || "[]"); } catch { return []; } }
function writeTaps(t: Tap[]) { try { localStorage.setItem(TAPS, JSON.stringify(t)); } catch { /* storage blocked */ } }
/** "1234 NW 73rd St" -> "NW 73RD ST", so a whole street can be marked at once. */
function streetOf(address?: string | null) { return (address ?? "").replace(/^\d+\S*\s+/, "").trim().toUpperCase(); }
function readAuto() { try { return localStorage.getItem("doorstep-auto") !== "off"; } catch { return true; } }

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
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trackBuf = useRef<{ lat: number; lon: number; acc: number; at: string }[]>([]);
  const lastPt = useRef<Pos | null>(null);
  const history = useRef<number[][]>([]);
  const [auto, setAuto] = useState(true);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const housesRef = useRef<House[]>([]);
  const statusRef = useRef<Status>({});
  const autoRef = useRef(true);
  useEffect(() => { const a = readAuto(); setAuto(a); autoRef.current = a; }, []);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 1800); };

  const load = useCallback(() => {
    api<Active>("/api/session/active").then((x) => {
      if (!x.session) { location.href = "/"; return; }
      setD(x); setStatus((s) => ({ ...x.status, ...s }));
      prefetchRoute(x.houses);
    }).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  // Outbox: queue first, send second.
  const draining = useRef(false);
  const drain = useCallback(async () => {
    // One upload at a time, so two overlapping sends can never save the same taps twice.
    if (draining.current) return;
    draining.current = true;
    try {
    // Taps go up in one batch; everything else one by one.
    const taps = readTaps();
    if (taps.length) {
      try {
        await postJSON("/api/session/events", { events: taps });
        writeTaps(readTaps().slice(taps.length));
      } catch { /* keep them for the next try */ }
    }
    let box = readBox();
    while (box.length) {
      try { await postJSON(box[0].url, box[0].body); box = box.slice(1); writeBox(box); }
      catch { break; }
    }
    setPending(readBox().length + readTaps().length);
    } finally { draining.current = false; }
    // Anything queued while we were uploading goes on the next pass.
    if (readTaps().length && navigator.onLine && !flushTimer.current) flushTimer.current = setTimeout(() => { flushTimer.current = undefined; drain(); }, 1500);
  }, []);
  const queueTaps = useCallback((t: Tap[]) => {
    writeTaps([...readTaps(), ...t]);
    setPending(readBox().length + readTaps().length);
    // Batch taps for up to a second, but never keep postponing: while he walks with
    // auto-mark on, taps arrive every second and must still upload steadily.
    if (!flushTimer.current) flushTimer.current = setTimeout(() => { flushTimer.current = undefined; drain(); }, 1000);
  }, [drain]);
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
      if (autoRef.current && q.acc <= 30) autoMark(q);
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
  housesRef.current = houses;
  statusRef.current = status;
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
  // Walking plan: computed from where he is when the route opens (or the first house),
  // then simply skips houses as they get marked. Re-planning every GPS tick would make
  // the line jump around; "Re-plan from here" in the menu does it on demand.
  const [planFrom, setPlanFrom] = useState<{ lat: number; lon: number } | null>(null);
  useEffect(() => { if (pos && !planFrom) setPlanFrom({ lat: pos.lat, lon: pos.lon }); }, [pos, planFrom]);
  const plan = useMemo(() => walkOrder(houses, planFrom), [houses, planFrom]);
  const todo = useMemo(() => plan.filter((h) => !status[h.id]), [plan, status]);
  const path = useMemo<[number, number][][]>(() => {
    const pts = todo.slice(0, 60);
    return pathPieces(pos && pts.length ? [{ lat: pos.lat, lon: pos.lon }, ...pts] : pts, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo, Math.round((pos?.lat ?? 0) * 2000), Math.round((pos?.lon ?? 0) * 2000)]);
  const nextDoor = todo[0] ?? null;
  const left = houses.filter((h) => !status[h.id]).length;
  // Multi-stop routes: when nothing is in walking range, point him at the closest unfinished house.
  const nextArea = useMemo(() => {
    if (!pos || nearest || !left) return null;
    let best: { lat: number; lon: number; m: number } | null = null;
    for (const h of houses) {
      if (status[h.id]) continue;
      const m = meters(pos, h);
      if (!best || m < best.m) best = { lat: h.lat, lon: h.lon, m };
    }
    return best && best.m > 250 ? best : null;
  }, [pos, nearest, houses, status, left]);
  const gps = () => (pos ? { lat: pos.lat, lon: pos.lon, acc: pos.acc } : {});

  function markMany(ids: number[], kind: "hung" | "skipped", reason?: string, quiet = false) {
    if (!ids.length) return;
    const at = new Date().toISOString();
    setStatus((s) => { const n = { ...s }; for (const id of ids) n[id] = { kind, reason }; return n; });
    history.current.push(ids);
    queueTaps(ids.map((houseId) => ({ houseId, kind, reason, ...gps(), at, note: quiet ? "auto" : undefined })));
    if (navigator.vibrate) navigator.vibrate(kind === "hung" ? 30 : [20, 40, 20]);
    if (!quiet) flash(kind === "hung" ? (ids.length > 1 ? `+${ids.length} doors ✓` : "+1 door ✓") : `Skipped ${ids.length > 1 ? ids.length + " houses" : ""}. You still get paid.`);
    setMode(null); setSel(null);
  }
  const mark = (houseId: number, kind: "hung" | "skipped", reason?: string) => markMany([houseId], kind, reason);
  function autoMark(q: Pos) {
    const st = statusRef.current;
    const ids = housesRef.current.filter((h) => !st[h.id] && meters(q, h) <= AUTO_M).map((h) => h.id);
    if (ids.length) { markMany(ids, "hung", undefined, true); flash(ids.length > 1 ? `Auto +${ids.length} ✓` : "Auto +1 ✓"); }
  }
  // Street index built once per route, not on every GPS tick.
  const byStreet = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const h of houses) { const st = streetOf(h.address); if (st) m.set(st, [...(m.get(st) ?? []), h.id]); }
    return m;
  }, [houses]);
  function streetLeft(h: House | null) {
    const ids = byStreet.get(streetOf(h?.address)) ?? [];
    return ids.filter((id) => !status[id]);
  }
  function undo() {
    const ids = history.current.pop();
    if (!ids?.length) return;
    setStatus((s) => { const n = { ...s }; for (const id of ids) delete n[id]; return n; });
    const at = new Date().toISOString();
    queueTaps(ids.map((houseId) => ({ houseId, kind: "undo" as const, ...gps(), at })));
    flash(ids.length > 1 ? `Undid ${ids.length}` : "Undone");
  }
  function toggleAuto() {
    const v = !auto; setAuto(v); autoRef.current = v;
    try { localStorage.setItem("doorstep-auto", v ? "on" : "off"); } catch { /* ignore */ }
    flash(v ? "Auto-mark on: houses you pass turn green" : "Auto-mark off");
  }

  const nearLeft = nearest ? streetLeft(nearest.h) : [];
  const selLeft = selHouse ? streetLeft(selHouse) : [];

  if (err) return <main className="page"><div className="error">{err}</div><Link className="btn gray" href="/">Back</Link></main>;
  if (!d?.route) return <main className="page"><p className="muted">Loading your route…</p></main>;

  return (
    <div className="run">
      <GameMap houses={houses} status={status} me={pos} avatar={me?.avatar} track={track} satellite={sat} fit={houses} focus={focus} picked={picked} path={path}
        onHouse={(id) => {
          if (picking) setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
          else { setSel(id); setMode("house"); }
        }} />

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
            <button className="chip" onClick={toggleAuto} aria-pressed={auto} style={{ border: 0, background: auto ? "#dff3e5" : "#fff" }}>{auto ? "🚶 Auto-mark on" : "🚶 Auto-mark off"}</button>
            {d.daylight?.isDark && <span className="chip" style={{ background: "#fde8e6" }}>🌙 After sunset. Wrap up.</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="iconbtn" onClick={() => setMode("menu")} aria-label="Route menu">☰</button>
            <button className="iconbtn" onClick={() => setSat(!sat)} aria-pressed={sat} aria-label="Toggle satellite view">{sat ? "🗺️" : "🛰️"}</button>
            <button className="iconbtn" onClick={() => pos && setFocus({ ...pos })} aria-label="Center on me">📍</button>
            <button className="iconbtn" onClick={() => { setPicking(!picking); setPicked(new Set()); setMode(null); }} aria-pressed={picking} aria-label="Select several houses" style={picking ? { background: "var(--gold)" } : undefined}>☑︎</button>
            {history.current.length > 0 && <button className="iconbtn" onClick={undo} aria-label="Undo last tap">↩︎</button>}
          </div>
        </div>
      </div>

      {picking && !mode && (
        <div className="sheet">
          <h3>{picked.size ? `${picked.size} selected` : "Tap houses to select them"}</h3>
          <div className="grid3">
            <button className="btn green" disabled={!picked.size} onClick={() => { markMany([...picked], "hung"); setPicked(new Set()); }}>Hung ✓</button>
            <button className="btn gray" disabled={!picked.size} onClick={() => setMode("skip")}>Skip</button>
            <button className="btn gray" onClick={() => { setPicking(false); setPicked(new Set()); }}>Done</button>
          </div>
          <button className="btn gray block" onClick={() => setPicked(new Set(houses.filter((h) => !status[h.id]).map((h) => h.id)))}>Select every house left ({houses.filter((h) => !status[h.id]).length})</button>
        </div>
      )}

      {!mode && !picking && (
        <div className="sheet">
          {nearest ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}><span className="tag">Closest door · {Math.round(nearest.m)} m</span>{(nearest.h.prospect ?? 0) >= HOT && <span className="tag gold" style={{ marginLeft: 6 }}>🔥 Hot prospect</span>}<button onClick={() => { setSel(nearest.h.id); setMode("house"); }} style={{ all: "unset", cursor: "pointer", display: "block", marginTop: 4 }} aria-label="Show house details"><h3>{nearest.h.address || "House"} <span style={{ fontSize: ".8rem", color: "var(--navy-2)", fontFamily: "var(--body)", fontWeight: 800 }}>Details ›</span></h3></button></div>
              </div>
              <div className="grid3">
                <button className="btn green" onClick={() => mark(nearest.h.id, "hung")}>Hung ✓</button>
                <button className="btn gray" onClick={() => { setSel(nearest.h.id); setMode("skip"); }}>Skip</button>
                <button className="btn" onClick={() => { setSel(nearest.h.id); setMode("talk"); }}>Talked</button>
              </div>
              {nearLeft.length > 1 && (
                <button className="btn navy block" onClick={() => markMany(nearLeft, "hung")}>Hung the whole street ({nearLeft.length} on {streetOf(nearest.h.address).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())})</button>
              )}
            </>
          ) : (
            <>
              <h3>{pct >= 100 ? "Every door done!" : nextDoor ? `Next: ${nextDoor.address || "the next house"}` : "Tap a house on the map"}</h3>
              {nextDoor && pct < 100 && <p className="muted" style={{ margin: 0 }}>Follow the dotted line. {pos ? "" : "Turn on location to see the closest door."}</p>}
              {nextArea && (
                <a className="btn green block" href={`https://www.google.com/maps/dir/?api=1&destination=${nextArea.lat},${nextArea.lon}`} target="_blank" rel="noopener">
                  Drive to next area ({left} left, {(nextArea.m / 1609).toFixed(1)} mi)
                </a>
              )}
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
          <HouseCard h={selHouse} />
          {status[selHouse.id] && <span className="tag">Marked {status[selHouse.id].kind}</span>}
          <div className="grid3">
            <button className="btn green" onClick={() => mark(selHouse.id, "hung")}>Hung ✓</button>
            <button className="btn gray" onClick={() => setMode("skip")}>Skip</button>
            <button className="btn" onClick={() => setMode("talk")}>Talked</button>
          </div>
          <a className="btn gray block" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selHouse.lat},${selHouse.lon}`} target="_blank" rel="noopener">Street View: check for gates &amp; dogs</a>
          {selLeft.length > 1 && (
            <button className="btn navy block" onClick={() => markMany(selLeft, "hung")}>Hung the whole street ({selLeft.length} left)</button>
          )}
          <button className="btn gray block" onClick={() => { setMode(null); setSel(null); }}>Close</button>
        </div>
      )}

      {mode === "skip" && (sel != null || picked.size > 0) && (
        <SkipSheet onPick={(r) => {
          if (picking && picked.size) { markMany([...picked], "skipped", r); setPicked(new Set()); }
          else if (sel != null) mark(sel, "skipped", r);
        }} onClose={() => { setMode(null); setSel(null); }} />
      )}

      {mode === "talk" && (
        <TalkSheet house={selHouse} gps={gps()} onDone={(ok) => {
          if (ok && sel != null) { setStatus((s) => ({ ...s, [sel]: { kind: "talked" } })); history.current.push([sel]); flash("Lead sent to Dylan ⭐"); }
          setMode(null); setSel(null);
        }} />
      )}

      {mode === "menu" && (
        <div className="sheet">
          <div className="grab" />
          <h3>Route menu</h3>
          {d.route.notes && <p className="muted" style={{ margin: 0 }}>{d.route.notes}</p>}
          <button className="btn gray block" onClick={toggleAuto}>{auto ? "Turn off auto-mark" : "Turn on auto-mark (houses you pass turn green)"}</button>
          <button className="btn gray block" onClick={() => { setPicking(true); setMode(null); }}>Select several houses</button>
          <button className="btn gray block" onClick={() => { if (pos) { setPlanFrom({ lat: pos.lat, lon: pos.lon }); flash("New walking path from here"); } setMode(null); }}>Re-plan walking path from here</button>
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
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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

/** The Zillow-style facts for one house, from public property records. */
const USE: Record<string, { label: string; tip?: string }> = {
  primary: { label: "🏠 Primary residence: owner lives here" },
  owner_here: { label: "🏠 Owner lives here", tip: "Owner's mailing address is this house (no homestead exemption on file)." },
  second_home: { label: "🏖️ Vacation / second home: owner lives out of state", tip: "Owner is probably not home. Hang it and move on." },
  rental: { label: "🔑 Rental: owner lives elsewhere", tip: "Whoever answers is likely a tenant. Renters insurance is something we sell too." },
  company: { label: "🏢 Company-owned (likely a rental)", tip: "Tenant probably answers. Renters insurance works here." },
};

function HouseCard({ h }: { h: House }) {
  const use = h.occupancy ? USE[h.occupancy] : null;
  const facts = [
    h.year_built ? `Built ${h.year_built}` : null,
    h.living_sqft ? `${h.living_sqft.toLocaleString()} sq ft` : null,
    !h.occupancy && h.homestead ? "Owner lives here" : null,
    h.sale_year ? `Bought ${h.sale_year}` : null,
    h.kind === "mobile" ? "Mobile home" : null,
  ].filter(Boolean);
  const hot = (h.prospect ?? 0) >= HOT;
  if (!facts.length && !hot && !use && !h.owner_name) return null;
  return (
    <div className="card" style={{ padding: 12, display: "grid", gap: 6, boxShadow: "none", border: `2px solid ${hot ? "var(--gold)" : "var(--line)"}` }}>
      {hot && <b style={{ color: "#c25400" }}>🔥 Hot prospect: worth a knock if someone&apos;s outside</b>}
      {h.owner_name && <span><span className="muted" style={{ fontSize: ".8rem", fontWeight: 800 }}>OWNER OF RECORD</span><br /><b>{h.owner_name}</b></span>}
      {use && <span style={{ fontWeight: 800 }}>{use.label}</span>}
      {use?.tip && <span className="muted" style={{ fontSize: ".85rem" }}>{use.tip}</span>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{facts.map((f) => <span key={f} className="tag">{f}</span>)}</div>
      {hot && h.prospect_reasons?.length ? <span className="muted" style={{ fontSize: ".85rem" }}>{h.prospect_reasons.join(" · ")}</span> : null}
    </div>
  );
}
