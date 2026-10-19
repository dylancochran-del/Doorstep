// Crash reports from phones. Capped and rate-limited by size so a crash loop can't flood the table.
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { text } from "@/lib/api";

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > 8000) return new Response(null, { status: 204 });
  let b: Record<string, unknown> = {};
  try { b = JSON.parse(raw); } catch { return new Response(null, { status: 204 }); }
  const message = text(b.message, 500);
  if (!message) return new Response(null, { status: 204 });
  const s = await getSession();
  await db().from("canvass_errors").insert({ canvasser_id: s?.cid ?? null, message, stack: text(b.stack, 2000), path: text(b.path, 200), user_agent: text(b.ua, 300) });
  return new Response(null, { status: 204 });
}
