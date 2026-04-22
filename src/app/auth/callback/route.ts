import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (data.user.email?.endsWith("@seazone.com.br")) {
        return NextResponse.redirect(origin);
      }
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=domain`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
