// Everything the active-route screen needs in one round trip: the route, its
// houses, and each house's latest status. All reads run in parallel.
import { db } from "@/lib/db";
import { activeSession, canvasser, fail, json } from "@/lib/api";
import { daylight } from "@/lib/daylight";

type H = { id: number; address: string | null; lat: number; lon: number; kind: string; [k: string]: unknown };

export async function GET() {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const session = await activeSession(s.cid);
  if (!session) return json({ session: null });
  const [{ data: route }, { data: houses }, { data: events }] = await Promise.all([
    db().from("canvass_routes").select("id, city, name, payout, doors, center_lat, center_lon, notes").eq("id", session.route_id).single(),
    db().from("canvass_houses").select("id, address, lat, lon, kind, year_built, living_sqft, sale_year, homestead, prospect, prospect_reasons, owner_name, occupancy").eq("route_id", session.route_id).eq("do_not_knock", false).range(0, 4999),
    db().from("canvass_events").select("house_id, kind, reason, canvass_houses(id, address, lat, lon, kind, year_built, living_sqft, sale_year, homestead, prospect, prospect_reasons, owner_name, occupancy)").eq("session_id", session.id).order("created_at").range(0, 9999),
  ]);
  const status: Record<string, { kind: string; reason: string | null }> = {};
  const all: H[] = [...((houses ?? []) as H[])];
  const known = new Set(all.map((h) => h.id));
  for (const e of events ?? []) {
    if (!e.house_id) continue;
    if (e.kind === "new_house") {
      // Houses he added on this route (not on the original map) belong on his map too.
      const h = e.canvass_houses as unknown as H | null;
      if (h && !known.has(h.id)) { all.push(h); known.add(h.id); }
    } else if (e.kind === "undo") delete status[e.house_id];
    else if (["hung", "skipped", "talked"].includes(e.kind)) status[e.house_id] = { kind: e.kind, reason: e.reason };
  }
  return json({
    session: { id: session.id, startedAt: session.started_at, payout: Number(session.payout) },
    route: route ? { ...route, payout: Number(route.payout) } : null,
    houses: all,
    status,
    daylight: route ? daylight(route.center_lat, route.center_lon) : null,
  });
}
