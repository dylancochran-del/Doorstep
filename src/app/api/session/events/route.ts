// Batched taps: the phone's outbox sends everything it has in one request, so a
// whole street marked at once (or a backlog from a dead zone) is one round trip.
import { db } from "@/lib/db";
import { activeSession, canvasser, fail, json, num, text } from "@/lib/api";

const KINDS = new Set(["hung", "skipped", "undo"]);
const SKIP_REASONS = new Set(["gate", "fence", "dog", "no_soliciting", "vacant", "no_access", "other"]);
const DNK = new Set(["gate", "no_soliciting"]);

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const session = await activeSession(s.cid);
  if (!session) return fail("No active route.", 409);
  const b = await req.json().catch(() => ({}));
  const items: Record<string, unknown>[] = Array.isArray(b.events) ? b.events.slice(0, 1000) : [];
  const rows = [];
  const dnk: { id: number; reason: string }[] = [];
  for (const e of items) {
    const kind = text(e.kind, 20);
    const houseId = num(e.houseId);
    if (!kind || !KINDS.has(kind) || houseId == null) continue;
    const reason = kind === "skipped" ? text(e.reason, 30) : null;
    if (kind === "skipped" && (!reason || !SKIP_REASONS.has(reason))) continue;
    rows.push({
      session_id: session.id, house_id: houseId, kind, reason,
      note: text(e.note), lat: num(e.lat), lon: num(e.lon), accuracy_m: num(e.acc),
      created_at: typeof e.at === "string" ? e.at : new Date().toISOString(),
    });
    if (reason && DNK.has(reason)) dnk.push({ id: houseId, reason });
  }
  if (rows.length) {
    const { error } = await db().from("canvass_events").insert(rows);
    if (error) return fail("Could not save those taps.", 500);
  }
  for (const d of dnk) await db().from("canvass_houses").update({ do_not_knock: true, dnk_reason: d.reason }).eq("id", d.id);
  return json({ ok: true, saved: rows.length });
}
