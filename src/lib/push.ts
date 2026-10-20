// Phone notifications (Web Push). Works on iPhone for the home-screen app (iOS 16.4+).
// Never throws: a failed notification must not break whatever triggered it.
import webpush from "web-push";
import { db } from "./db";

let ready = false;
function init() {
  if (ready) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:dylan@floridaallrisk.com", pub, priv);
  return (ready = true);
}

export type Push = { title: string; body: string; url?: string };

/** Send to one canvasser, or to every canvasser with notifications on ("all"). */
export async function sendPush(to: string | "all", msg: Push): Promise<number> {
  try {
    if (!init()) return 0;
    let q = db().from("canvass_push_subs").select("id, endpoint, p256dh, auth");
    if (to !== "all") q = q.eq("canvasser_id", to);
    const { data } = await q;
    let sent = 0;
    await Promise.all((data ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db().from("canvass_push_subs").delete().eq("id", s.id);
      }
    }));
    return sent;
  } catch {
    return 0;
  }
}
