// Manager: save a route for a canvasser (it jumps to the top of their list), or unsave it.
import { db } from "@/lib/db";
import { admin, fail, json, text } from "@/lib/api";

export async function POST(req: Request) {
  if (!(await admin())) return fail("Admins only.", 403);
  const b = await req.json().catch(() => ({}));
  const routeId = text(b.routeId, 20);
  const to = b.canvasserId == null ? null : text(b.canvasserId, 40);
  if (!routeId) return fail("Pick a route.");
  if (to) {
    const { data: c } = await db().from("canvass_canvassers").select("id").eq("id", to).eq("status", "active").maybeSingle();
    if (!c) return fail("That canvasser isn't active.");
  }
  const { error } = await db().from("canvass_routes").update({ assigned_to: to }).eq("id", routeId);
  if (error) return fail("Could not save. Try again.", 500);
  return json({ ok: true });
}
