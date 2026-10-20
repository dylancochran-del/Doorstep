// Vega calls this to notify canvassers (approved, paid, boosts, new routes).
// Locked with NOTIFY_SECRET so nobody else can push to his phone.
import { fail, json, text } from "@/lib/api";
import { sendPush } from "@/lib/push";

export async function POST(req: Request) {
  if (!process.env.NOTIFY_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.NOTIFY_SECRET}`) return fail("unauthorized", 401);
  const b = await req.json().catch(() => ({}));
  const title = text(b.title, 80), body = text(b.body, 200);
  if (!title || !body) return fail("title and body required");
  const sent = await sendPush(text(b.to, 60) ?? "all", { title, body, url: text(b.url, 200) ?? "/" });
  return json({ ok: true, sent });
}
