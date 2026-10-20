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
  // Mondays: the weekly summary, sent whether or not anything is wrong.
  if (new Date().getUTCDay() === 1) await weekly();
  if (problems.length) await alertDylan(`Doorstep check: ${problems.length} thing${problems.length > 1 ? "s" : ""} need you`, problems);
  return json({ ok: true, problems: problems.length });
}

async function weekly() {
  const week = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const [{ data: runs }, { data: src }, { count: dnk }] = await Promise.all([
    db().from("canvass_sessions").select("id, status, payout, route_id").gte("started_at", week).in("status", ["submitted", "approved", "paid"]),
    db().from("marketing_sources").select("id").eq("slug", "door-hangers").maybeSingle(),
    db().from("canvass_houses").select("id", { count: "exact", head: true }).eq("do_not_knock", true),
  ]);
  const ids = (runs ?? []).map((r) => r.id);
  const { data: stats } = ids.length ? await db().from("canvass_session_stats").select("*").in("session_id", ids) : { data: [] };
  const { count: leads } = src ? await db().from("field_leads").select("id", { count: "exact", head: true }).eq("source_id", src.id).gte("created_at", week) : { count: 0 };
  const sum = (k: string) => (stats ?? []).reduce((a, x) => a + Number((x as Record<string, unknown>)[k] ?? 0), 0);
  const pay = (runs ?? []).reduce((a, r) => a + Number(r.payout), 0);
  const doors = sum("hung") + sum("talked");
  await alertDylan("Doorstep weekly: last 7 days", [
    ["Routes finished", String(ids.length)],
    ["Doors hung", doors.toLocaleString()],
    ["Skipped", String(sum("skipped"))],
    ["Door conversations → leads", String(leads ?? 0)],
    ["Route pay", `$${pay}`],
    ["Cost per door", doors ? `$${(pay / doors).toFixed(2)}` : "—"],
    ["Cost per door lead", leads ? `$${(pay / leads).toFixed(0)}` : "—"],
    ["Houses on the do-not-knock list", String(dnk ?? 0)],
  ]);
}
