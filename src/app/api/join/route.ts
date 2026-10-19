// Finishes an invite: name, photo, password. The invite token is single use.
import { db, upload } from "@/lib/db";
import { fail, json, text } from "@/lib/api";
import { hashPassword, setSession } from "@/lib/session";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const { data } = await db().from("canvass_canvassers").select("email, status").eq("invite_token", token).maybeSingle();
  if (!data || data.status !== "invited") return fail("This invite link has already been used or is not valid.", 404);
  return json({ email: data.email });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const token = text(form.get("token"), 100);
  const fullName = text(form.get("full_name"), 80);
  const phone = text(form.get("phone"), 30);
  const password = String(form.get("password") ?? "");
  const photo = form.get("photo");
  if (!token) return fail("Missing invite.");
  if (!fullName || fullName.split(/\s+/).length < 2) return fail("Enter your first and last name.");
  if (password.length < 8) return fail("Use at least 8 characters for your password.");
  if (!(photo instanceof File) || photo.size === 0) return fail("Add a profile photo.");
  if (photo.size > 8_000_000) return fail("That photo is too large. Pick one under 8 MB.");

  const { data: c } = await db().from("canvass_canvassers").select("id, status").eq("invite_token", token).maybeSingle();
  if (!c || c.status !== "invited") return fail("This invite link has already been used.", 404);
  const avatar = await upload(`avatars/${c.id}-${Date.now()}.jpg`, photo);
  const { error } = await db()
    .from("canvass_canvassers")
    .update({ full_name: fullName, phone, avatar_path: avatar, pass_hash: await hashPassword(password), status: "active", invite_token: null })
    .eq("id", c.id);
  if (error) return fail("Could not save your profile. Try again.", 500);
  await setSession({ cid: c.id, name: fullName });
  return json({ ok: true });
}
