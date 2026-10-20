// Password reset from a one-time link Dylan makes in Vega (Canvass → Reset password).
import { db } from "@/lib/db";
import { fail, json, text } from "@/lib/api";
import { hashPassword, setSession } from "@/lib/session";

async function find(token: string | null) {
  if (!token) return null;
  const { data } = await db().from("canvass_canvassers").select("id, full_name, email, status, reset_expires_at").eq("reset_token", token).maybeSingle();
  if (!data || data.status !== "active" || !data.reset_expires_at || new Date(data.reset_expires_at) < new Date()) return null;
  return data;
}

export async function GET(req: Request) {
  const c = await find(new URL(req.url).searchParams.get("token"));
  if (!c) return fail("This reset link has expired or was already used. Ask Dylan for a new one.", 404);
  return json({ email: c.email });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const c = await find(text(b.token, 100));
  if (!c) return fail("This reset link has expired or was already used. Ask Dylan for a new one.", 404);
  const password = typeof b.password === "string" ? b.password : "";
  if (password.length < 8) return fail("Use at least 8 characters for your password.");
  await db().from("canvass_canvassers").update({ pass_hash: await hashPassword(password), reset_token: null, reset_expires_at: null }).eq("id", c.id);
  await setSession({ cid: c.id, name: c.full_name ?? "" });
  return json({ ok: true });
}
