import { db } from "@/lib/db";
import { activeSession, canvasser, fail, json } from "@/lib/api";

export async function POST() {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const session = await activeSession(s.cid);
  if (!session) return json({ ok: true });
  await db().from("canvass_sessions").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", session.id);
  return json({ ok: true });
}
