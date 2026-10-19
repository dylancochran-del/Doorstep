import { db } from "@/lib/db";
import { canvasser, fail, json } from "@/lib/api";

export async function GET() {
  const s = await canvasser();
  if (!s) return fail("Sign in first.", 401);
  const { data } = await db()
    .from("canvass_sessions")
    .select("id, status, payout, started_at, finished_at, approved_at, paid_at, review_note, canvass_routes(city, name)")
    .eq("canvasser_id", s.cid)
    .in("status", ["submitted", "approved", "paid"])
    .order("started_at", { ascending: false });
  const rows = (data ?? []).map((r) => {
    const route = r.canvass_routes as unknown as { city: string; name: string } | null;
    return { id: r.id, status: r.status, payout: Number(r.payout), date: r.finished_at ?? r.started_at, paidAt: r.paid_at, note: r.review_note, city: route?.city, name: route?.name };
  });
  const sum = (st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((a, r) => a + r.payout, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
  return json({
    pending: sum(["submitted"]),
    approved: sum(["approved"]),
    paid: sum(["paid"]),
    thisWeek: rows.filter((r) => new Date(r.date) >= weekStart).reduce((a, r) => a + r.payout, 0),
    rows,
  });
}
