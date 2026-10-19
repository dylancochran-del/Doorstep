import { db } from "@/lib/db";
import { canvasser, fail, json } from "@/lib/api";
import { daylight } from "@/lib/daylight";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const { id } = await ctx.params;
  const { data: route } = await db()
    .from("canvass_routes")
    .select("id, city, name, payout, doors, stops, lot_type, est_minutes, center_lat, center_lon, bbox, notes, status, hold_reason")
    .eq("id", id)
    .single();
  if (!route) return fail("Route not found.", 404);
  const { data: houses } = await db()
    .from("canvass_houses")
    .select("id, address, lat, lon, kind")
    .eq("route_id", id)
    .eq("do_not_knock", false)
    .range(0, 4999);
  return json({ route: { ...route, payout: Number(route.payout) }, houses: houses ?? [], daylight: daylight(route.center_lat, route.center_lon) });
}
