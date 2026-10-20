// Change profile photo (already cropped on the phone).
import { db, signedUrl, upload } from "@/lib/db";
import { canvasser, fail, json } from "@/lib/api";

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const photo = (await req.formData()).get("photo");
  if (!(photo instanceof File) || photo.size === 0) return fail("Pick a photo.");
  if (photo.size > 8_000_000) return fail("That photo is too large.");
  const path = await upload(`avatars/${s.cid}-${Date.now()}.jpg`, photo);
  const { data: old } = await db().from("canvass_canvassers").select("avatar_path").eq("id", s.cid).single();
  await db().from("canvass_canvassers").update({ avatar_path: path }).eq("id", s.cid);
  if (old?.avatar_path) await db().storage.from("doorstep").remove([old.avatar_path]);
  return json({ ok: true, avatar: await signedUrl(path, 86400) });
}
