// Submit a finished route for Dylan's approval. Skipped houses never reduce pay.
import { db, upload } from "@/lib/db";
import { activeSession, canvasser, fail, json, num, text } from "@/lib/api";
import { alertDylan } from "@/lib/alert";

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const session = await activeSession(s.cid);
  if (!session) return fail("No active route.", 409);
  const form = await req.formData();
  const leftover = num(form.get("leftover"));
  const photo = form.get("photo");
  const note = text(form.get("note"));
  if (leftover == null || leftover < 0) return fail("Count your leftover hangers and enter the number.");
  if (!(photo instanceof File) || photo.size === 0) return fail("Add your proof photo: a hanger on a door with the street sign behind it.");
  const path = await upload(`proof/${session.id}.jpg`, photo);

  const { data: events } = await db().from("canvass_events").select("house_id, kind").eq("session_id", session.id).range(0, 9999);
  const latest: Record<string, string> = {};
  for (const e of events ?? []) if (e.house_id) e.kind === "undo" ? delete latest[e.house_id] : ["hung", "skipped", "talked"].includes(e.kind) && (latest[e.house_id] = e.kind);
  const counts = { hung: 0, skipped: 0, talked: 0 };
  for (const k of Object.values(latest)) counts[k as keyof typeof counts]++;

  const { error } = await db()
    .from("canvass_sessions")
    .update({ status: "submitted", finished_at: new Date().toISOString(), leftover_count: Math.round(leftover), proof_photo_path: path, canvasser_note: note })
    .eq("id", session.id);
  if (error) return fail("Could not submit. Try again.", 500);
  const { data: route } = await db().from("canvass_routes").select("city, name").eq("id", session.route_id).single();
  await alertDylan(`Route done: ${route?.city} ${route?.name} ($${Number(session.payout)})`, [
    ["Canvasser", s.name],
    ["Hung", String(counts.hung + counts.talked)],
    ["Skipped", String(counts.skipped)],
    ["Talked to", String(counts.talked)],
    ["Leftover hangers", String(Math.round(leftover))],
    ["Payout to approve", `$${Number(session.payout)}`],
    ["Note", note ?? "None"],
  ]);
  return json({ ok: true, counts });
}
