// Server-only. The service-role key never reaches a browser: every read and
// write goes through a route handler, and the canvass_* tables have RLS on
// with no policies, so the anon key can't touch them even if it leaked.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured");
  }
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export const BUCKET = "doorstep";

/** Short-lived link to a private photo. Null when there is no photo. */
export async function signedUrl(path: string | null, seconds = 3600): Promise<string | null> {
  if (!path) return null;
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function upload(path: string, file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await db()
    .storage.from(BUCKET)
    .upload(path, buf, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}
