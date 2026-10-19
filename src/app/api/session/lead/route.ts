// "Talked to someone." Saved as a field lead (in-person table, kept out of the
// web-funnel alert path) and emailed to Dylan only.
import { db } from "@/lib/db";
import { activeSession, canvasser, fail, json, num, text } from "@/lib/api";
import { alertDylan } from "@/lib/alert";

const INTEREST: Record<string, string> = { home: "Home", auto: "Auto", flood: "Flood", bundle: "Home + auto", other: "Other" };

export async function POST(req: Request) {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const session = await activeSession(s.cid);
  if (!session) return fail("No active route.", 409);
  const b = await req.json().catch(() => ({}));
  const name = text(b.name, 80);
  const phone = text(b.phone, 30);
  const interest = text(b.interest, 20) ?? "other";
  const note = text(b.note, 500);
  const houseId = num(b.houseId);
  if (!name) return fail("Add their name.");
  if (!phone || phone.replace(/\D/g, "").length < 10) return fail("Add a 10-digit phone number.");

  let address = text(b.address, 160);
  if (houseId) {
    const { data: h } = await db().from("canvass_houses").select("address, city, zip").eq("id", houseId).single();
    if (h) address = [h.address, h.city, h.zip].filter(Boolean).join(", ");
  }
  const { data: src } = await db().from("marketing_sources").select("id").eq("slug", "door-hangers").single();
  const { data: route } = await db().from("canvass_routes").select("id, name, city").eq("id", session.route_id).single();
  const { data: lead, error } = await db()
    .from("field_leads")
    .insert({
      source_id: src?.id ?? null,
      name,
      contact: phone,
      line: interest,
      stage: "new",
      note: [address && `Address: ${address}`, route && `Route: ${route.id} ${route.name}`, `Canvasser: ${s.name}`, note].filter(Boolean).join("\n"),
    })
    .select("id")
    .single();
  if (error) return fail("Could not save the lead. Try again.", 500);

  await db().from("canvass_events").insert({
    session_id: session.id, house_id: houseId, kind: "talked", note, field_lead_id: lead.id,
    lat: num(b.lat), lon: num(b.lon), accuracy_m: num(b.acc),
  });
  const sent = await alertDylan(`Door lead: ${name} (${INTEREST[interest] ?? interest})`, [
    ["Name", name],
    ["Phone", phone],
    ["Interested in", INTEREST[interest] ?? interest],
    ["Address", address ?? "Not given"],
    ["Route", route ? `${route.city}: ${route.name}` : session.route_id],
    ["Canvasser", s.name],
    ["Note", note ?? "None"],
  ]);
  return json({ ok: true, alerted: sent });
}
