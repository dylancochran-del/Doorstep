// Admin view: each canvasser's live route progress, routes saved for them, and recent runs.
import { db } from "@/lib/db";
import { admin, fail, isAdminId, json } from "@/lib/api";

type Ev = { session_id: string; house_id: number | null; kind: string; reason: string | null; created_at: string };

function tally(events: Ev[]) {
  // Latest tap per house wins; "undo" clears it (same rule as finish/route.ts).
  const latest: Record<string, Ev> = {};
  let last: string | null = null;
  for (const e of events) {
    if (!last || e.created_at > last) last = e.created_at;
    if (!e.house_id) continue;
    if (e.kind === "undo") delete latest[e.house_id];
    else if (["hung", "skipped", "talked"].includes(e.kind)) latest[e.house_id] = e;
  }
  const c = { hung: 0, talked: 0, skipped: 0, vacant: 0, lastTap: last };
  for (const e of Object.values(latest)) {
    if (e.kind === "skipped") { c.skipped++; if (e.reason === "vacant") c.vacant++; }
    else c[e.kind as "hung" | "talked"]++;
  }
  return c;
}

export async function GET() {
  if (!(await admin())) return fail("Admins only.", 403);
  const d = db();
  const [{ data: people }, { data: sessions }, { data: saved }] = await Promise.all([
    d.from("canvass_canvassers").select("id, full_name, avatar_path, status, last_seen_at").neq("status", "disabled"),
    d.from("canvass_sessions").select("id, route_id, canvasser_id, status, payout, started_at, finished_at, hangers_taken, leftover_count").order("started_at", { ascending: false }).limit(60),
    d.from("canvass_routes").select("id, city, name, doors, payout, est_minutes, hot_homes, status, assigned_to, rest_until").not("assigned_to", "is", null).order("sort"),
  ]);
  const routeIds = [...new Set((sessions ?? []).map((s) => s.route_id))];
  const { data: routes } = routeIds.length ? await d.from("canvass_routes").select("id, city, name, doors").in("id", routeIds) : { data: [] };
  const R = Object.fromEntries((routes ?? []).map((r) => [r.id, r]));
  const sessIds = (sessions ?? []).map((s) => s.id);
  const evs: Ev[] = [];
  for (let i = 0; i < sessIds.length; i += 20) {
    const { data } = await d.from("canvass_events").select("session_id, house_id, kind, reason, created_at").in("session_id", sessIds.slice(i, i + 20)).range(0, 19999);
    evs.push(...((data ?? []) as Ev[]));
  }
  const bySess: Record<string, Ev[]> = {};
  for (const e of evs) (bySess[e.session_id] ??= []).push(e);
  const ranRoutes = new Set((sessions ?? []).filter((s) => s.status !== "cancelled").map((s) => s.route_id));

  const team = (people ?? []).filter((p) => !isAdminId(p.id)).map((p) => {
    const mine = (sessions ?? []).filter((s) => s.canvasser_id === p.id).map((s) => ({
      ...s, route: R[s.route_id] ?? { id: s.route_id, city: "", name: s.route_id, doors: 0 }, counts: tally(bySess[s.id] ?? []),
    }));
    return {
      id: p.id, name: p.full_name, status: p.status, lastSeen: p.last_seen_at,
      live: mine.find((s) => s.status === "active") ?? null,
      recent: mine.filter((s) => s.status !== "active" && s.status !== "cancelled").slice(0, 10),
      saved: (saved ?? []).filter((r) => r.assigned_to === p.id).map((r) => ({ ...r, done: ranRoutes.has(r.id) })),
    };
  });
  const owed = (sessions ?? []).filter((s) => s.status === "submitted" || s.status === "approved").reduce((a, s) => a + Number(s.payout), 0);
  return json({ team, owed, vegaUrl: process.env.VEGA_CANVASS_URL || "https://vega-app-five.vercel.app/canvass" });
}
