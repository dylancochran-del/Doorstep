import { db, signedUrl } from "@/lib/db";
import { canvasser, fail, json } from "@/lib/api";

export async function GET() {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const { data } = await db().from("canvass_canvassers").select("full_name, avatar_path, email").eq("id", s.cid).single();
  return json({ name: data?.full_name, email: data?.email, avatar: await signedUrl(data?.avatar_path ?? null, 86400) });
}
