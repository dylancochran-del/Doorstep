// Door-lead alert. Goes to Dylan and nobody else: the recipient is read from
// vega_alert_config (Dylan's own alert address), never from the Lead Engine's
// LEAD_ALERT_TO list. Never throws: a failed email must not lose the lead,
// which is already saved before this runs.
import { db } from "./db";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function alertDylan(subject: string, lines: [string, string][]): Promise<boolean> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return false;
    const { data } = await db().from("vega_alert_config").select("alert_to").limit(1).single();
    const to = data?.alert_to as string | undefined;
    if (!to) return false;
    const rows = lines
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#55657a">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`)
      .join("");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DOORSTEP_ALERT_FROM || "Doorstep <leads@bindradar.com>",
        to: [to],
        subject,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px"><h2 style="margin:0 0 12px;color:#0a2540">${esc(subject)}</h2><table>${rows}</table></div>`,
        text: lines.map(([k, v]) => `${k}: ${v}`).join("\n"),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
