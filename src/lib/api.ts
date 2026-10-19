import { NextResponse } from "next/server";
import { getSession, type Session } from "./session";
import { db } from "./db";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** The signed-in, active canvasser, or null. Disabled accounts are signed out everywhere at once. */
export async function canvasser(): Promise<Session | null> {
  const s = await getSession();
  if (!s) return null;
  const { data } = await db().from("canvass_canvassers").select("status, full_name, last_seen_at").eq("id", s.cid).single();
  if (!data || data.status !== "active") return null;
  // "Last seen" only needs minute-level freshness; skip the write on most requests.
  if (!data.last_seen_at || Date.now() - new Date(data.last_seen_at).getTime() > 5 * 60_000) {
    void db().from("canvass_canvassers").update({ last_seen_at: new Date().toISOString() }).eq("id", s.cid).then(() => {});
  }
  // Name from the database, not the cookie, so a renamed canvasser shows correctly everywhere.
  return { cid: s.cid, name: data.full_name ?? "" };
}

export async function activeSession(cid: string) {
  const { data } = await db()
    .from("canvass_sessions")
    .select("*")
    .eq("canvasser_id", cid)
    .eq("status", "active")
    .maybeSingle();
  return data;
}

export function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Plain text, trimmed and capped, so a note can never become a novel or markup. */
export function text(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}
