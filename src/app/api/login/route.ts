import { db } from "@/lib/db";
import { fail, json, text } from "@/lib/api";
import { checkPassword, setSession } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = text(body.email, 200)?.toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail("Enter your email and password.");
  const { data } = await db().from("canvass_canvassers").select("id, full_name, pass_hash, status").eq("email", email).maybeSingle();
  if (!data || !(await checkPassword(password, data.pass_hash))) return fail("That email and password don't match.", 401);
  if (data.status !== "active") return fail("This account is turned off. Text Dylan.", 403);
  await setSession({ cid: data.id, name: data.full_name ?? "" });
  return json({ ok: true });
}
