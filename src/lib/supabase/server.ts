import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function createClient() {
  const cookieStore = await cookies();

  const schema = process.env.NEXT_PUBLIC_DB_SCHEMA || "public";
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — ignore
          }
        },
      },
    }
  );
}

/**
 * Authenticated Supabase client for API routes.
 * Uses the session cookie from the request so that auth.jwt() is populated
 * in RLS policies (e.g. email domain checks).
 */
export async function createAuthenticatedSupabaseAdmin(request: NextRequest) {
  const schema = process.env.NEXT_PUBLIC_DB_SCHEMA || "public";
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(_cookiesToSet) {
          // Read-only client for API routes — ignore writes
        },
      },
    }
  );
}
