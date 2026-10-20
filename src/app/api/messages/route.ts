// Messages from Dylan. Direct messages stay until he taps "Got it"; messages to
// everyone show for 3 days.
import { db } from "@/lib/db";
import { canvasser, fail, json, num } from "@/lib/api";

export async function GET() {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const [{ data: direct }, { data: all }] = await Promise.all([
    db().from("canvass_messages").select("id, body, created_at").eq("canvasser_id", s.cid).is("read_at", null).order("created_at", { ascending: false }).limit(5),
    db().from("canvass_messages").select("id, body, created_at").is("canvasser_id", null).gte("created_at", since).order("created_at", { ascending: false }).limit(3),
  ]);
  return json({ messages: [...(direct ?? []).map((m) => ({ ...m, direct: true })), ...(all ?? []).map((m) => ({ ...m, direct: false }))] });
}

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const id = num((await req.json().catch(() => ({}))).id);
  if (id) await db().from("canvass_messages").update({ read_at: new Date().toISOString() }).eq("id", id).eq("canvasser_id", s.cid);
  return json({ ok: true });
}
