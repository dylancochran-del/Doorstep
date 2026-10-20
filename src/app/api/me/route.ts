import { db, signedUrl } from "@/lib/db";
import { canvasser, fail, json, text } from "@/lib/api";

export async function GET() {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const { data } = await db().from("canvass_canvassers").select("full_name, avatar_path, email, pay_app, pay_handle").eq("id", s.cid).single();
  return json({ name: data?.full_name, email: data?.email, avatar: await signedUrl(data?.avatar_path ?? null, 86400), payApp: data?.pay_app, payHandle: data?.pay_handle });
}

// Where Dylan sends his pay.
export async function PATCH(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const b = await req.json().catch(() => ({}));
  const app = text(b.payApp, 10), handle = text(b.payHandle, 80);
  if (!app || !["venmo", "cashapp", "zelle"].includes(app)) return fail("Pick Venmo, Cash App, or Zelle.");
  if (!handle) return fail("Enter your username, $cashtag, or Zelle phone/email.");
  await db().from("canvass_canvassers").update({ pay_app: app, pay_handle: handle.replace(/^@/, "") }).eq("id", s.cid);
  return json({ ok: true });
}
