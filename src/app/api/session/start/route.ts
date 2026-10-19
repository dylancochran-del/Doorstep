import { db } from "@/lib/db";
import { activeSession, canvasser, fail, json, text } from "@/lib/api";
import { daylight } from "@/lib/daylight";

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const body = await req.json().catch(() => ({}));
  const routeId = text(body.routeId, 40);
  if (!routeId) return fail("Pick a route.");
  if (await activeSession(s.cid)) return fail("Finish or cancel your current route first.", 409);

  const { data: route } = await db().from("canvass_routes").select("id, payout, status, hold_reason, center_lat, center_lon").eq("id", routeId).single();
  if (!route) return fail("Route not found.", 404);
  if (route.status === "held") return fail(route.hold_reason || "This route is on hold.", 409);
  if (route.status !== "offered") return fail("This route is not available.", 409);
  const sun = daylight(route.center_lat, route.center_lon);
  if (!sun.canStart) return fail(sun.reason || "Routes run in daylight only.", 409);
  const { data: busy } = await db().from("canvass_sessions").select("id").eq("route_id", routeId).eq("status", "active").maybeSingle();
  if (busy) return fail("Someone is already running this route.", 409);

  const { data, error } = await db()
    .from("canvass_sessions")
    .insert({ route_id: routeId, canvasser_id: s.cid, payout: route.payout })
    .select("id")
    .single();
  if (error) return fail("Could not start the route. Try again.", 500);
  return json({ sessionId: data.id });
}
