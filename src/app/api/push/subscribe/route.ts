import { db } from "@/lib/db";
import { canvasser, fail, json, text } from "@/lib/api";

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const b = await req.json().catch(() => ({}));
  const endpoint = text(b.endpoint, 1000), p256dh = text(b.keys?.p256dh, 300), auth = text(b.keys?.auth, 300);
  if (!endpoint || !p256dh || !auth) return fail("Bad subscription.");
  await db().from("canvass_push_subs").upsert({ canvasser_id: s.cid, endpoint, p256dh, auth }, { onConflict: "endpoint" });
  return json({ ok: true });
}
