// GPS breadcrumbs, batched from the phone while the app is open on an active route.
import { db } from "@/lib/db";
import { activeSession, canvasser, fail, json, num } from "@/lib/api";

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const session = await activeSession(s.cid);
  if (!session) return json({ ok: false });
  const b = await req.json().catch(() => ({}));
  const pts = Array.isArray(b.points) ? b.points.slice(0, 500) : [];
  const rows = pts
    .map((p: Record<string, unknown>) => ({ session_id: session.id, lat: num(p.lat), lon: num(p.lon), accuracy_m: num(p.acc), recorded_at: typeof p.at === "string" ? p.at : new Date().toISOString() }))
    .filter((r: { lat: number | null; lon: number | null }) => r.lat != null && r.lon != null);
  if (rows.length) await db().from("canvass_track").insert(rows);
  return json({ ok: true, saved: rows.length });
}
