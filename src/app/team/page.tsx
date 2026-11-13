"use client";
// Admin home: how each canvasser is doing right now, what's saved for them, and their recent runs.
import Link from "next/link";
import { useEffect } from "react";
import { Tabs, minutes, money, useLoad } from "../ui";

type Counts = { hung: number; talked: number; skipped: number; vacant: number; lastTap: string | null };
type Sess = { id: string; route_id: string; status: string; payout: number; started_at: string; finished_at: string | null; hangers_taken: number | null; leftover_count: number | null; route: { id: string; city: string; name: string; doors: number }; counts: Counts };
type Person = { id: string; name: string | null; status: string; lastSeen: string | null; live: Sess | null; recent: Sess[];
  saved: { id: string; city: string; name: string; doors: number; payout: number; est_minutes: number | null; hot_homes: number | null; status: string; done: boolean }[] };

function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}
const STATUS: Record<string, string> = { submitted: "Waiting on your approval", approved: "Approved, not paid", paid: "Paid" };

export default function Team() {
  const { data, error, reload } = useLoad<{ team: Person[]; owed: number; vegaUrl: string }>("/api/admin/team");
  useEffect(() => { const t = setInterval(reload, 30000); return () => clearInterval(t); }, [reload]);
  return (
    <main className="page">
      <div className="hero manager"><div style={{ position: "relative", zIndex: 1 }}><span className="tag gold">MANAGER</span><h1>Team</h1><p>{data ? `${data.team.length} canvasser${data.team.length === 1 ? "" : "s"} · ${money(data.owed)} to approve or pay` : "Loading…"}</p></div></div>
      {error && <div className="error">{error}</div>}
      {data?.team.map((p) => {
        const done = p.live ? p.live.counts.hung + p.live.counts.talked + p.live.counts.skipped : 0;
        const pct = p.live?.route.doors ? Math.min(100, Math.round((done / p.live.route.doors) * 100)) : 0;
        return (
          <section key={p.id} className="city">
            <div className="area" style={{ cursor: "default" }}>
              <span className="area-name">{p.name ?? "Canvasser"}</span>
              <span className="area-meta"><span>{p.live ? "🟢 On a route now" : "Not on a route"}</span><span>Last seen {ago(p.lastSeen)}</span></span>
            </div>

            {p.live && (
              <Link href={`/route/${p.live.route_id}`} className="offer mine" style={{ display: "grid", gap: 8 }}>
                <span className="name">{p.live.route.city}: {p.live.route.name}</span>
                <span className="pay">{money(Number(p.live.payout))}</span>
                <div style={{ gridColumn: "1 / -1", height: 12, background: "var(--line)", borderRadius: 8, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "var(--hung)" }} /></div>
                <span className="meta">
                  <span><b>{done}</b> of {p.live.route.doors} doors ({pct}%)</span>
                  <span>Hung {p.live.counts.hung + p.live.counts.talked}</span>
                  <span>Skipped {p.live.counts.skipped}{p.live.counts.vacant ? ` (${p.live.counts.vacant} vacant)` : ""}</span>
                  <span>Started {ago(p.live.started_at)}</span>
                  <span>Last tap {ago(p.live.counts.lastTap)}</span>
                </span>
              </Link>
            )}

            <h3 style={{ fontSize: "1.05rem", margin: "6px 2px 0" }}>Saved for {p.name?.split(" ")[0] ?? "them"} ({p.saved.length})</h3>
            {p.saved.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing saved. Reserve routes in the manager portal.</p>}
            {p.saved.map((r) => (
              <Link key={r.id} href={`/route/${r.id}`} className={`offer ${r.done ? "taken" : ""}`}>
                <span className="name">{r.city}: {r.name}</span>
                <span className="pay">{money(Number(r.payout))}</span>
                <span className="meta">
                  <span>{r.doors} doors</span>
                  {r.est_minutes ? <span>~{minutes(r.est_minutes)}</span> : null}
                  {(r.hot_homes ?? 0) > 0 && <span className="tag gold">🔥 {r.hot_homes} hot</span>}
                  {r.done ? <span className="tag green">Done</span> : p.live?.route_id === r.id ? <span className="tag gold">In progress</span> : <span className="tag">Not started</span>}
                  {r.status !== "offered" && <span className="tag red">{r.status}</span>}
                </span>
              </Link>
            ))}

            {p.recent.length > 0 && <h3 style={{ fontSize: "1.05rem", margin: "6px 2px 0" }}>Finished runs</h3>}
            {p.recent.map((s) => (
              <div key={s.id} className="offer" style={{ cursor: "default" }}>
                <span className="name">{s.route.city}: {s.route.name}</span>
                <span className="pay">{money(Number(s.payout))}</span>
                <span className="meta">
                  <span>Hung {s.counts.hung + s.counts.talked}</span>
                  <span>Skipped {s.counts.skipped}{s.counts.vacant ? ` (${s.counts.vacant} vacant)` : ""}</span>
                  {s.leftover_count != null && <span>{s.leftover_count} hangers left</span>}
                  <span>{ago(s.finished_at)}</span>
                  <span className={`tag ${s.status === "paid" ? "green" : "gold"}`}>{STATUS[s.status] ?? s.status}</span>
                </span>
              </div>
            ))}
          </section>
        );
      })}
      {data && <a href={data.vegaUrl} className="btn block" style={{ background: "var(--navy)", color: "#fff", boxShadow: "0 5px 0 #061a2f" }}>🧭 Manager portal: approve, pay, reserve routes</a>}
      <Tabs />
    </main>
  );
}
