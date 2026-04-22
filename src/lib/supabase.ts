// Deploy trigger
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy init: evita criar o client no top-level do módulo.
// Sem isso, `next build` falha com "supabaseUrl is required" quando
// NEXT_PUBLIC_SUPABASE_URL não está no env de build (ex: algumas envs do Vercel).
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing at runtime");
  // DB_SCHEMA: "public" (staging default) ou "prod"
  const schema = process.env.NEXT_PUBLIC_DB_SCHEMA || "public";
  _client = createClient(url, key, { db: { schema } });
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get: (_, prop) => getClient()[prop as keyof SupabaseClient],
});
