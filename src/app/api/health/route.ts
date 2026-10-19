// Health check for the smoke test and uptime checks: database reachable, routes loaded.
import { db } from "@/lib/db";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const t = Date.now();
  const { count, error } = await db().from("canvass_routes").select("id", { count: "exact", head: true }).eq("status", "offered");
  if (error) return json({ ok: false, error: "database" }, 503);
  return json({ ok: (count ?? 0) > 0, liveRoutes: count, dbMs: Date.now() - t });
}
