// Route offers, grouped by city. Payout only: the per-door math never leaves the server.
import { db } from "@/lib/db";
import { canvasser, fail, json } from "@/lib/api";
import { daylight } from "@/lib/daylight";

export async function GET() {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const { data: routes } = await db()
    .from("canvass_routes")
    .select("id, city, name, payout, doors, stops, lot_type, est_minutes, center_lat, center_lon, notes, status, hold_reason, sort")
    .in("status", ["offered", "held"])
    .order("sort");
  // A route someone else is running right now is not on offer.
  const { data: busy } = await db().from("canvass_sessions").select("route_id, canvasser_id").eq("status", "active");
  const { data: done } = await db().from("canvass_sessions").select("route_id").eq("canvasser_id", s.cid).in("status", ["submitted", "approved", "paid"]);
  const taken = new Map((busy ?? []).map((b) => [b.route_id, b.canvasser_id]));
  const finished = new Set((done ?? []).map((d) => d.route_id));
  const first = routes?.[0];
  return json({
    daylight: first ? daylight(first.center_lat, first.center_lon) : null,
    routes: (routes ?? []).map((r) => ({
      ...r,
      payout: Number(r.payout),
      mine: taken.get(r.id) === s.cid,
      taken: taken.has(r.id) && taken.get(r.id) !== s.cid,
      finishedByMe: finished.has(r.id),
    })),
  });
}
