"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Tabs, api, minutes, money, useLoad, useMe } from "./ui";

type Route = { id: string; city: string; name: string; payout: number; doors: number; stops: number; lot_type: string; est_minutes: number | null; notes: string | null; status: string; hold_reason: string | null; mine: boolean; taken: boolean; finishedByMe: boolean; center_lat: number; center_lon: number };
type Sun = { sunrise: string; sunset: string; lastStart: string; canStart: boolean; isDark: boolean; reason: string | null };

// Default order follows the home base (Fanning Springs) out along SR-26 to Gainesville.
const CITY_ORDER = ["Fanning Springs", "Old Town", "Manatee Road", "Chiefland", "Trenton", "Bell", "Bronson", "Williston", "Archer", "Newberry", "Jonesville", "High Springs", "Alachua", "Gainesville", "Haile / SW Gainesville", "Micanopy", "McIntosh", "Brooker", "La Crosse", "Cross City"];
const rank = (c: string) => { const i = CITY_ORDER.indexOf(c); return i < 0 ? 99 : i; };

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 96.5);
}

export default function Routes() {
  const me = useMe();
  const { data, error } = useLoad<{ routes: Route[]; daylight: Sun | null }>("/api/routes");
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    api<{ session: unknown }>("/api/session/active").then((d) => setActive(!!d.session)).catch(() => {});
    navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lon: p.coords.longitude }), () => {}, { maximumAge: 300000, timeout: 8000 });
  }, []);

  const routes = data?.routes ?? [];
  const liveIn = (c: string) => routes.some((r) => r.city === c && r.status === "offered");
  const cities = [...new Set(routes.map((r) => r.city))].sort((a, b) => {
    // Cities with something to do now come first; held-only cities sink to the bottom.
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
      <div className="hero">
        {me?.avatar ? <img src={me.avatar} alt="" className="avatar" /> : <span className="avatar" />}
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1>Hey {me?.name?.split(" ")[0] ?? "there"}</h1>
          <p>{open.length} {open.length === 1 ? "route" : "routes"} open · up to {money(open.reduce((a, r) => Math.max(a, r.payout), 0))} each</p>
        </div>
      </div>

      {active && <Link href="/run" className="btn green block">Resume your route</Link>}

      {sun && (
        <div className={`sunbar ${sun.canStart ? "" : "dark"}`}>
          <span aria-hidden="true">{sun.canStart ? "☀️" : "🌙"}</span>
          <span>{sun.canStart ? `Routes open until ${sun.lastStart}. Sunset ${sun.sunset}.` : sun.reason}</span>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Loading routes…</p>}
      {data && routes.length === 0 && <div className="card">No routes posted yet. Dylan will add some soon.</div>}

      {cities.map((city) => {
        const all = routes.filter((r) => r.city === city);
        const rs = all.filter((r) => r.status === "offered" || r.mine);
        const held = all.filter((r) => r.status === "held" && !r.mine);
        const dist = here ? Math.min(...rs.map((r) => km(here, { lat: r.center_lat, lon: r.center_lon }))) : null;
        return (
          <section className="city" key={city}>
            <h2>{city}<small>{dist != null ? `${Math.round(dist * 0.621)} mi away` : `${rs.length} ${rs.length === 1 ? "route" : "routes"}`}</small></h2>
            {held.length > 0 && rs.length === 0 && <p className="muted" style={{ margin: 0 }}>{held.length} routes coming soon ({held[0].hold_reason?.toLowerCase() ?? "on hold"}).</p>}
            {rs.map((r) => {
              const cls = ["offer", r.status === "held" && "held", r.taken && "taken", r.mine && "mine"].filter(Boolean).join(" ");
              return (
                <Link key={r.id} href={`/route/${r.id}`} className={cls}>
                  <span className="name">{r.name}</span>
                  <span className="pay">{money(r.payout)}</span>
                  <span className="meta">
                    <span>{r.doors} doors</span>
                    {r.est_minutes ? <span>~{minutes(r.est_minutes)}</span> : null}
                    {r.lot_type === "spread" && <span className="tag">Big lots</span>}
                    {r.status === "held" && <span className="tag red">On hold</span>}
                    {r.taken && <span className="tag">Taken</span>}
                    {r.mine && <span className="tag gold">Your route</span>}
                    {r.finishedByMe && <span className="tag green">Done before</span>}
                  </span>
                </Link>
              );
            })}
            {held.length > 0 && rs.length > 0 && <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>+ {held.length} more coming soon</p>}
          </section>
        );
      })}
      <Tabs />
    </main>
  );
}
