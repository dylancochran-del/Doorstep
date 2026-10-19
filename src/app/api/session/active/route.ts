// Everything the active-route screen needs: the route, its houses, and each house's latest status.
import { db } from "@/lib/db";
import { activeSession, canvasser, fail, json } from "@/lib/api";
import { daylight } from "@/lib/daylight";

export async function GET() {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const session = await activeSession(s.cid);
  if (!session) return json({ session: null });
  const [{ data: route }, { data: houses }, { data: events }] = await Promise.all([
    db().from("canvass_routes").select("id, city, name, payout, doors, center_lat, center_lon, bbox, notes").eq("id", session.route_id).single(),
    db().from("canvass_houses").select("id, address, lat, lon, kind").eq("route_id", session.route_id).eq("do_not_knock", false).range(0, 4999),
    db().from("canvass_events").select("house_id, kind, reason, created_at").eq("session_id", session.id).order("created_at").range(0, 9999),
  ]);
  const status: Record<string, { kind: string; reason: string | null }> = {};
  for (const e of events ?? []) {
    if (!e.house_id) continue;
    if (e.kind === "undo") delete status[e.house_id];
    else if (["hung", "skipped", "talked"].includes(e.kind)) status[e.house_id] = { kind: e.kind, reason: e.reason };
  }
  // Houses he added on this route (not on the original map) belong on his map too.
  const { data: extra } = await db()
    .from("canvass_events")
    .select("house_id, canvass_houses(id, address, lat, lon, kind)")
    .eq("session_id", session.id)
    .eq("kind", "new_house");
  const allHouses = [...(houses ?? [])];
  for (const x of extra ?? []) {
    const h = x.canvass_houses as unknown as { id: number; address: string; lat: number; lon: number; kind: string } | null;
    if (h && !allHouses.some((a) => a.id === h.id)) allHouses.push(h);
  }
  return json({
    session: { id: session.id, startedAt: session.started_at, payout: Number(session.payout) },
    route: route ? { ...route, payout: Number(route.payout) } : null,
    houses: allHouses,
    status,
    daylight: route ? daylight(route.center_lat, route.center_lon) : null,
  });
}
