// Route offers, grouped by city. Payout only: the per-door math never leaves the server.
import { db } from "@/lib/db";
import { canvasser, fail, isAdminId, json } from "@/lib/api";
import { daylight } from "@/lib/daylight";

export async function GET(req: Request) {
  const me = await canvasser();
  if (!me) return fail("Sign in first.", 401);
  // Managers can see the list through a canvasser's eyes (?as=<id>), and get names in manage mode.
  const q = new URL(req.url).searchParams;
  const asId = q.get("as");
  const manage = q.get("manage") === "1";
  if ((asId || manage) && !isAdminId(me.cid)) return fail("Admins only.", 403);
  const s = asId ? { cid: asId } : me;
  const { data: routes } = await db()
    .from("canvass_routes")
    .select("id, city, name, payout, doors, stops, lot_type, est_minutes, center_lat, center_lon, notes, status, hold_reason, sort, hot_homes, boost, boost_until, boost_note, assigned_to, rest_until")
    // Resting routes (recently done) stay off the list until their cooldown ends.
    .or(`rest_until.is.null,rest_until.lt.${new Date().toISOString()}`)
    .in("status", ["offered", "held"])
    .order("sort");
  // A route someone else is running right now is not on offer.
  const { data: busy } = await db().from("canvass_sessions").select("route_id, canvasser_id").eq("status", "active");
  const { data: done } = await db().from("canvass_sessions").select("route_id").eq("canvasser_id", s.cid).in("status", ["submitted", "approved", "paid"]);
  const taken = new Map((busy ?? []).map((b) => [b.route_id, b.canvasser_id]));
  const finished = new Set((done ?? []).map((d) => d.route_id));
  const first = routes?.[0];
  const names: Record<string, string> = {};
  if (manage || asId) {
    const { data: people } = await db().from("canvass_canvassers").select("id, full_name");
    for (const p of people ?? []) names[p.id] = p.full_name ?? "";
  }
  return json({
    daylight: first ? daylight(first.center_lat, first.center_lon) : null,
    routes: (routes ?? []).map((r) => ({
      ...r,
      // A live boost is shown as part of the payout (DoorDash style), and flagged so it stands out.
      boost: r.boost_until && new Date(r.boost_until) > new Date() ? Number(r.boost) : 0,
      payout: Number(r.payout) + (r.boost_until && new Date(r.boost_until) > new Date() ? Number(r.boost) : 0),
      mine: taken.get(r.id) === s.cid,
      reservedForMe: r.assigned_to === s.cid,
      reservedForOther: !!r.assigned_to && r.assigned_to !== s.cid,
      taken: taken.has(r.id) && taken.get(r.id) !== s.cid,
      finishedByMe: finished.has(r.id),
      ...(manage ? { assignedName: r.assigned_to ? names[r.assigned_to] ?? null : null, runningName: taken.has(r.id) ? names[taken.get(r.id)!] ?? null : null } : {}),
    })),
  });
}
