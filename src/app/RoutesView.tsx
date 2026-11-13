"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Tabs, api, minutes, money, postJSON, useLoad, useMe } from "./ui";
import Notify from "./Notify";

type Route = { id: string; city: string; name: string; payout: number; assigned_to?: string | null; assignedName?: string | null; runningName?: string | null; hot_homes?: number | null; boost?: number; boost_note?: string | null; reservedForMe?: boolean; reservedForOther?: boolean; doors: number; stops: number; lot_type: string; est_minutes: number | null; notes: string | null; status: string; hold_reason: string | null; mine: boolean; taken: boolean; finishedByMe: boolean; center_lat: number; center_lon: number };
type Sun = { sunrise: string; sunset: string; lastStart: string; canStart: boolean; isDark: boolean; reason: string | null };

// Default order (no location): beach towns first while Logan is in St. Pete, then the home base (Fanning Springs) out along SR-26.
const CITY_ORDER = ["St. Pete Beach", "Causeway Isles", "Treasure Island", "Redington Beach", "Madeira Beach", "Fanning Springs", "Old Town", "Manatee Road", "Chiefland", "Trenton", "Bell", "Bronson", "Williston", "Archer", "Newberry", "Jonesville", "High Springs", "Alachua", "Gainesville", "Haile / SW Gainesville", "Micanopy", "McIntosh", "Brooker", "La Crosse", "Cross City"];
const rank = (c: string) => { const i = CITY_ORDER.indexOf(c); return i < 0 ? 99 : i; };

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 96.5);
}

type Mode = "canvasser" | "manage" | "preview";
type Who = { id: string; name: string | null };

// One route list, three ways: the canvasser's own list, the manager's list (save/unsave routes
// for a canvasser), and a read-only preview of exactly what a canvasser sees.
export function RoutesView({ mode }: { mode: Mode }) {
  const me = useMe();
  const [who, setWho] = useState<Who | null>(null);
  const [team, setTeam] = useState<Who[]>([]);
  useEffect(() => {
    if (mode === "canvasser") return;
    api<{ team: Who[] }>("/api/admin/team").then((d) => { setTeam(d.team); setWho((w) => w ?? d.team[0] ?? null); }).catch(() => {});
  }, [mode]);
  const url = mode === "canvasser" ? "/api/routes" : who ? `/api/routes?as=${who.id}${mode === "manage" ? "&manage=1" : ""}` : null;
  const { data, error, reload } = useLoad<{ routes: Route[]; daylight: Sun | null }>(url);
  const first = who?.name?.split(" ")[0] ?? "them";
  async function toggle(r: Route) {
    if (!who) return;
    await postJSON("/api/admin/assign", { routeId: r.id, canvasserId: r.reservedForMe ? null : who.id }).catch((e) => alert((e as Error).message));
    reload();
  }
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [active, setActive] = useState(false);
  // Areas start collapsed (except ones with a route saved for him); tap an area to open its routes.
  const [openCity, setOpenCity] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (mode !== "canvasser") { navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lon: p.coords.longitude }), () => {}, { maximumAge: 300000, timeout: 8000 }); return; }
    // Warm the map code while he browses routes, so opening one doesn't wait on a download.
    const warm = () => import("./GameMap").catch(() => {});
    const w = window as unknown as { requestIdleCallback?: (f: () => void) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(warm); else setTimeout(warm, 1500);
    api<{ session: unknown }>("/api/session/active").then((d) => setActive(!!d.session)).catch(() => {});
    navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lon: p.coords.longitude }), () => {}, { maximumAge: 300000, timeout: 8000 });
  }, [mode]);

  const routes = data?.routes ?? [];
  const liveIn = (c: string) => routes.some((r) => r.city === c && r.status === "offered");
  const savedIn = (c: string) => routes.some((r) => r.city === c && (r.reservedForMe || r.mine));
  const cities = [...new Set(routes.map((r) => r.city))].sort((a, b) => {
    // Areas with a route saved for him come first, then anything live; held-only areas sink to the bottom.
    if (savedIn(a) !== savedIn(b)) return savedIn(a) ? -1 : 1;
    if (liveIn(a) !== liveIn(b)) return liveIn(a) ? -1 : 1;
    if (here) {
      const d = (c: string) => Math.min(...routes.filter((r) => r.city === c).map((r) => km(here, { lat: r.center_lat, lon: r.center_lon })));
      return d(a) - d(b);
    }
    return rank(a) - rank(b);
  });
  const open = routes.filter((r) => r.status === "offered" && !r.taken);
  const sun = data?.daylight;

  return (
    <main className="page">
      {mode === "canvasser" ? (
        <div className="hero">
          {me?.avatar ? <img src={me.avatar} alt="" className="avatar" /> : <span className="avatar" />}
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1>Hey {me?.name?.split(" ")[0] ?? "there"}</h1>
            <p>{open.length} {open.length === 1 ? "route" : "routes"} open · up to {money(open.reduce((a, r) => Math.max(a, r.payout), 0))} each</p>
          </div>
        </div>
      ) : (
        <div className="hero manager">
          <div style={{ position: "relative", zIndex: 1 }}>
            <span className="tag gold">{mode === "manage" ? "MANAGER" : "PREVIEW · READ ONLY"}</span>
            <h1>{mode === "manage" ? "Manage routes" : `${first}'s view`}</h1>
            <p>{mode === "manage"
              ? `${routes.filter((r) => r.reservedForMe).length} saved for ${first} · ${open.length} open. Tap Save to put a route on ${first}'s list.`
              : `Exactly what ${first} sees on his phone.`}</p>
          </div>
        </div>
      )}
      {mode !== "canvasser" && team.length > 1 && (
        <div className="field"><label htmlFor="who">Canvasser</label>
          <select id="who" value={who?.id ?? ""} onChange={(e) => setWho(team.find((t) => t.id === e.target.value) ?? null)}>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      )}
      {mode === "canvasser" && active && <Link href="/run" className="btn green block">Resume your route</Link>}
      {mode === "canvasser" && <Notify />}
      {mode === "canvasser" && <Messages />}

      {sun && (
        <div className={`sunbar ${sun.canStart ? "" : "dark"}`}>
          <span aria-hidden="true">{sun.canStart ? "☀️" : "🌙"}</span>
          <span>{sun.canStart ? `Routes open until ${sun.lastStart}. Sunset ${sun.sunset}.` : sun.reason}</span>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Loading routes…</p>}
      {data && routes.length === 0 && <div className="card">No routes posted yet.{mode === "canvasser" ? " Dylan will add some soon." : ""}</div>}

      {cities.map((city) => {
        const all = routes.filter((r) => r.city === city);
        const rs = all.filter((r) => mode === "manage" ? r.status === "offered" : (r.status === "offered" && !r.reservedForOther) || r.mine)
          .sort((a, b) => Number(!!b.reservedForMe) - Number(!!a.reservedForMe) || (b.boost ?? 0) - (a.boost ?? 0));
        const held = all.filter((r) => r.status === "held" && !r.mine);
        const dist = here && rs.length ? Math.min(...rs.map((r) => km(here, { lat: r.center_lat, lon: r.center_lon }))) : null;
        const saved = rs.filter((r) => r.reservedForMe || r.mine).length;
        const hot = rs.reduce((a, r) => a + (r.hot_homes ?? 0), 0);
        const isOpen = openCity[city] ?? saved > 0;
        return (
          <section className="city" key={city}>
            <button type="button" className="area" aria-expanded={isOpen} onClick={() => setOpenCity((o) => ({ ...o, [city]: !isOpen }))}>
              <span className="area-name">{city}</span>
              <span className="area-meta">
                <span>{rs.length ? `${rs.length} ${rs.length === 1 ? "route" : "routes"}` : "Coming soon"}</span>
                {rs.length > 0 && <span>up to {money(Math.max(...rs.map((r) => r.payout)))}</span>}
                {dist != null && <span>{Math.round(dist * 0.621)} mi</span>}
                {saved > 0 && <span className="tag gold">⭐ {saved} saved for {mode === "canvasser" ? "you" : first}</span>}
                {hot > 0 && <span className="tag gold">🔥 {hot} hot</span>}
              </span>
              <span className="area-chev" aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
            </button>
            {isOpen && held.length > 0 && rs.length === 0 && <p className="muted" style={{ margin: 0 }}>{held.length} routes coming soon ({held[0].hold_reason?.toLowerCase() ?? "on hold"}).</p>}
            {isOpen && rs.map((r) => {
              const cls = ["offer", r.status === "held" && "held", r.taken && mode === "canvasser" && "taken", r.mine && "mine", mode === "manage" && r.reservedForMe && "mine"].filter(Boolean).join(" ");
              const tags = (
                <span className="meta">
                  <span>{r.doors} doors</span>
                  {r.est_minutes ? <span>~{minutes(r.est_minutes)}</span> : null}
                  {r.reservedForMe && <span className="tag gold">⭐ Saved for {mode === "canvasser" ? "you" : first}</span>}
                  {mode === "manage" && r.reservedForOther && r.assignedName && <span className="tag">Saved for {r.assignedName.split(" ")[0]}</span>}
                  {(r.boost ?? 0) > 0 && <span className="tag green">🚀 +{money(r.boost!)} boost{r.boost_note ? `: ${r.boost_note}` : ""}</span>}
                  {(r.hot_homes ?? 0) > 0 && <span className="tag gold">🔥 {r.hot_homes} hot</span>}
                  {r.lot_type === "spread" && <span className="tag">Big lots</span>}
                  {r.status === "held" && <span className="tag red">On hold</span>}
                  {(r.mine || r.taken) && mode !== "canvasser" && <span className="tag green">🟢 {r.runningName?.split(" ")[0] ?? "Someone"} is on it</span>}
                  {r.taken && mode === "canvasser" && <span className="tag">Taken</span>}
                  {r.mine && mode === "canvasser" && <span className="tag gold">Your route</span>}
                  {r.finishedByMe && <span className="tag green">Done before</span>}
                </span>
              );
              if (mode === "manage") return (
                <div key={r.id} className={cls}>
                  <Link href={`/route/${r.id}`} className="name" style={{ color: "inherit" }}>{r.name}</Link>
                  <span className="pay">{money(r.payout)}</span>
                  {tags}
                  <button type="button" className={`btn ${r.reservedForMe ? "gray" : ""}`} style={{ gridColumn: "1 / -1", padding: "10px 14px", fontSize: "1rem" }} onClick={() => toggle(r)}>
                    {r.reservedForMe ? `Unsave from ${first}` : r.reservedForOther ? `Move to ${first}` : `⭐ Save for ${first}`}
                  </button>
                </div>
              );
              return (
                <Link key={r.id} href={`/route/${r.id}`} className={cls}>
                  <span className="name">{r.name}</span>
                  <span className="pay">{money(r.payout)}</span>
                  {tags}
                </Link>
              );
            })}
            {isOpen && held.length > 0 && rs.length > 0 && <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>+ {held.length} more coming soon</p>}
          </section>
        );
      })}
      <Tabs />
    </main>
  );
}

function Messages() {
  const [msgs, setMsgs] = useState<{ id: number; body: string; created_at: string; direct: boolean }[]>([]);
  useEffect(() => { api<{ messages: typeof msgs }>("/api/messages").then((d) => setMsgs(d.messages)).catch(() => {}); }, []);
  if (!msgs.length) return null;
  return (
    <>
      {msgs.map((m) => (
        <div key={m.id} className="card" style={{ border: "2px solid var(--gold)", display: "grid", gap: 8 }}>
          <b>💬 From Dylan</b>
          <span style={{ whiteSpace: "pre-wrap" }}>{m.body}</span>
          {m.direct && <button className="btn gray" onClick={() => { api("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id }) }).catch(() => {}); setMsgs((x) => x.filter((y) => y.id !== m.id)); }}>Got it</button>}
        </div>
      ))}
    </>
  );
}
