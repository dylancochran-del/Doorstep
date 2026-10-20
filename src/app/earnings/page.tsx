"use client";
import { useEffect, useState } from "react";
import { Tabs, api, money, useLoad } from "../ui";

function PayHandle() {
  const [app, setApp] = useState("venmo");
  const [handle, setHandle] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ payApp?: string; payHandle?: string }>("/api/me").then((m) => { if (m.payApp) setApp(m.payApp); if (m.payHandle) { setHandle(m.payHandle); setSaved(m.payHandle); } }).catch(() => {}); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { await api("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payApp: app, payHandle: handle }) }); setSaved(handle); }
    catch (x) { setErr((x as Error).message); }
  }
  const label = app === "venmo" ? "Venmo username" : app === "cashapp" ? "Cash App $cashtag" : "Zelle phone or email";
  return (
    <form className="card" onSubmit={save} style={{ display: "grid", gap: 10 }}>
      <b>How should Dylan pay you?</b>
      <div className="grid3">{[["venmo", "Venmo"], ["cashapp", "Cash App"], ["zelle", "Zelle"]].map(([k, l]) => (
        <button type="button" key={k} className="reason" aria-pressed={app === k} onClick={() => setApp(k)}>{l}</button>
      ))}</div>
      <div className="field"><label htmlFor="ph">{label}</label><input id="ph" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={app === "cashapp" ? "$yourname" : app === "venmo" ? "your-username" : "352-555-0100"} /></div>
      {err && <div className="error">{err}</div>}
      <button className="btn">{saved && saved === handle ? "Saved ✓" : "Save"}</button>
    </form>
  );
}

type E = { pending: number; approved: number; paid: number; thisWeek: number; rows: { id: string; status: string; payout: number; date: string; city: string; name: string; note: string | null }[] };
const LABEL: Record<string, [string, string]> = { submitted: ["Waiting on Dylan", ""], approved: ["Approved", "gold"], paid: ["Paid", "green"] };

export default function Earnings() {
  const { data, error } = useLoad<E>("/api/earnings");
  const justDone = typeof window !== "undefined" && location.search.includes("done=1");
  return (
    <main className="page">
      <div className="hero" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <p style={{ position: "relative", zIndex: 1 }}>This week</p>
        <h1 style={{ fontSize: "3rem", color: "var(--gold)", position: "relative", zIndex: 1 }}>{money(data?.thisWeek ?? 0)}</h1>
      </div>
      {justDone && <div className="sunbar">🎉 Route submitted. Dylan gets a message and pays you once it&apos;s approved.</div>}
      {error && <div className="error">{error}</div>}
      <div className="grid3">
        {([["Waiting", data?.pending], ["Approved", data?.approved], ["Paid", data?.paid]] as const).map(([l, v]) => (
          <div className="card" key={l} style={{ textAlign: "center", padding: 12 }}><h3>{money(v ?? 0)}</h3><span className="muted" style={{ fontSize: ".78rem", fontWeight: 800, textTransform: "uppercase" }}>{l}</span></div>
        ))}
      </div>
      <PayHandle />
      <section className="city">
        <h2>Your routes</h2>
        {data && data.rows.length === 0 && <div className="card">No finished routes yet. Pick one from Routes to get started.</div>}
        {data?.rows.map((r) => (
          <div className="offer" key={r.id}>
            <span className="name">{r.name}<br /><span className="muted" style={{ fontWeight: 700, fontSize: ".85rem" }}>{r.city} · {new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></span>
            <span className="pay">{money(r.payout)}</span>
            <span className="meta"><span className={`tag ${LABEL[r.status]?.[1] ?? ""}`}>{LABEL[r.status]?.[0] ?? r.status}</span>{r.note && <span>{r.note}</span>}</span>
          </div>
        ))}
      </section>
      <Tabs />
    </main>
  );
}
