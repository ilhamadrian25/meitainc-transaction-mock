import { createClient } from "@supabase/supabase-js";

/**
 * Client server-side saja. Pakai service_role key supaya bisa baca/tulis
 * tanpa policy RLS tambahan — jangan pernah expose key ini ke browser
 * (karena itu env var-nya TIDAK diberi prefix NEXT_PUBLIC_).
 */
let client: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi. Salin dari Project Settings > API di Supabase, lalu isi .env.local.",
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
