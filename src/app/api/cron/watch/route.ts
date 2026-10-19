// Daily watchdog (Vercel cron). Emails Dylan only when something needs attention:
// phone crashes, a route left "active" overnight, or no live routes on offer.
import { db } from "@/lib/db";
import { json } from "@/lib/api";
import { alertDylan } from "@/lib/alert";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [errors, stuck, live, waiting] = await Promise.all([
    db().from("canvass_errors").select("message", { count: "exact" }).gte("created_at", day).limit(5),
    db().from("canvass_sessions").select("id, route_id, started_at").eq("status", "active").lt("started_at", new Date(Date.now() - 12 * 3600_000).toISOString()),
    db().from("canvass_routes").select("id", { count: "exact", head: true }).eq("status", "offered"),
    db().from("canvass_sessions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
  ]);
  const problems: [string, string][] = [];
  if ((errors.count ?? 0) > 0) problems.push(["App crashes (24h)", `${errors.count}: ${(errors.data ?? []).map((e) => e.message).join(" | ").slice(0, 300)}`]);
  if ((stuck.data ?? []).length) problems.push(["Routes left open 12h+", (stuck.data ?? []).map((s) => s.route_id).join(", ")]);
  if ((live.count ?? 0) === 0) problems.push(["Live routes", "None on offer. Release some in Vega → Canvass."]);
  if ((waiting.count ?? 0) > 0) problems.push(["Waiting on your approval", `${waiting.count} finished route(s)`]);
  if (problems.length) await alertDylan(`Doorstep check: ${problems.length} thing${problems.length > 1 ? "s" : ""} need you`, problems);
  return json({ ok: true, problems: problems.length });
}
