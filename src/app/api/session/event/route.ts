// One tap on a house. Append-only: time and GPS on every tap are the proof of work.
import { db } from "@/lib/db";
import { activeSession, canvasser, fail, json, num, text } from "@/lib/api";

const KINDS = new Set(["hung", "skipped", "undo", "new_house", "problem"]);
const SKIP_REASONS = new Set(["gate", "fence", "dog", "no_soliciting", "vacant", "no_access", "other"]);
// These reasons mean nobody should knock here again, on any future route.
const DNK = new Set(["gate", "no_soliciting"]);

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const session = await activeSession(s.cid);
  if (!session) return fail("No active route.", 409);
  const b = await req.json().catch(() => ({}));
  const kind = text(b.kind, 20);
  if (!kind || !KINDS.has(kind)) return fail("Unknown action.");
  let houseId = num(b.houseId);
  const reason = text(b.reason, 30);
  if (kind === "skipped" && (!reason || !SKIP_REASONS.has(reason))) return fail("Pick why you skipped it.");
  const lat = num(b.lat), lon = num(b.lon), acc = num(b.acc);

  if (kind === "new_house") {
    if (lat == null || lon == null) return fail("Need your location to add a house.");
    const { data: h, error } = await db()
      .from("canvass_houses")
      .insert({ route_id: null, lat, lon, kind: "added", address: text(b.address, 120) ?? "Added on route" })
      .select("id")
      .single();
    if (error) return fail("Could not add the house.", 500);
    houseId = h.id;
  }

  const { error } = await db().from("canvass_events").insert({
    session_id: session.id,
    house_id: houseId,
    kind,
    reason,
    note: text(b.note),
    lat, lon, accuracy_m: acc,
    created_at: typeof b.at === "string" ? b.at : undefined,
  });
  if (error) return fail("Could not save that tap.", 500);
  if (kind === "skipped" && reason && DNK.has(reason) && houseId) {
    await db().from("canvass_houses").update({ do_not_knock: true, dnk_reason: reason }).eq("id", houseId);
  }
  return json({ ok: true, houseId });
}
