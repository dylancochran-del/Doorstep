"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { use, useState } from "react";
import { minutes, money, postJSON, useLoad } from "../../ui";
import type { House } from "../../GameMap";

const GameMap = dynamic(() => import("../../GameMap"), { ssr: false });

type Data = {
  route: { id: string; city: string; name: string; payout: number; doors: number; est_minutes: number | null; lot_type: string; notes: string | null; status: string; hold_reason: string | null; center_lat: number; center_lon: number };
  houses: House[];
  daylight: { canStart: boolean; reason: string | null; lastStart: string; sunset: string };
};

export default function RoutePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useLoad<Data>(`/api/routes/${id}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sat, setSat] = useState(false);

  async function start() {
    setBusy(true); setErr(null);
    try { await postJSON("/api/session/start", { routeId: id }); location.href = "/run"; }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  if (error) return <main className="page"><div className="error">{error}</div><Link href="/" className="btn gray">Back to routes</Link></main>;
  if (!data) return <main className="page"><p className="muted">Loading route…</p></main>;
  const r = data.route;
  const held = r.status === "held";
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${r.center_lat},${r.center_lon}`;
  return (
    <div className="run">
      <GameMap houses={data.houses} fit={data.houses.length ? data.houses : [{ lat: r.center_lat, lon: r.center_lon }]} satellite={sat} />
      <div className="hud">
        <div className="hud-top">
          <Link href="/" className="iconbtn" aria-label="Back to routes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg></Link>
          <div className="hud-title"><b>{r.name}</b><span style={{ fontSize: ".8rem", color: "#c9d6e6" }}>{r.city}</span></div>
          <span className="hud-pay">{money(r.payout)}</span>
        </div>
        <div className="hud-tools"><button className="iconbtn" onClick={() => setSat(!sat)} aria-pressed={sat} aria-label="Toggle satellite view" title="Satellite">{sat ? "🗺️" : "🛰️"}</button></div>
      </div>
      <div className="sheet">
        <div className="grab" />
        <div className="grid3" style={{ textAlign: "center" }}>
          <div><h3>{r.doors}</h3><span className="muted" style={{ fontSize: ".8rem", fontWeight: 800 }}>DOORS</span></div>
          <div><h3>{minutes(r.est_minutes) || "—"}</h3><span className="muted" style={{ fontSize: ".8rem", fontWeight: 800 }}>ABOUT</span></div>
          <div><h3>{Math.ceil(r.doors * 1.1)}</h3><span className="muted" style={{ fontSize: ".8rem", fontWeight: 800 }}>HANGERS</span></div>
        </div>
        {r.notes && <p style={{ margin: 0 }}>{r.notes}</p>}
        {held && <div className="error">On hold: {r.hold_reason ?? "Dylan will open this route soon."}</div>}
        {!held && !data.daylight.canStart && <div className="sunbar dark">🌙 {data.daylight.reason}</div>}
        {err && <div className="error" role="alert">{err}</div>}
        <div className="grid2">
          <a className="btn gray" href={directions} target="_blank" rel="noopener">Directions</a>
          <button className="btn green" onClick={start} disabled={busy || held || !data.daylight.canStart}>{busy ? "Starting…" : "Start route"}</button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>Tap Start when you&apos;re parked at the first street. Count your hangers before you go.</p>
      </div>
    </div>
  );
}
