import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Se ?code= chegar na raiz (OAuth redirect mal-configurado), redirecionar para /auth/callback
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });

  const schema = process.env.NEXT_PUBLIC_DB_SCHEMA || "public";
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  if (!user) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Validar domínio @seazone.com.br
  if (user.email && !user.email.endsWith("@seazone.com.br")) {
    await supabase.auth.signOut();
    if (isApiRoute) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "domain");
    return NextResponse.redirect(url);
  }

  // Verificar user_profiles — acesso por convite
  const email = user.email!;

  // 1. Checar se tem profile ativo
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, status")
    .eq("email", email)
    .single();

  if (profile) {
    if (profile.status === "inactive") {
      await supabase.auth.signOut();
      if (isApiRoute) {
        return NextResponse.json({ error: "Account inactive" }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "not_invited");
      return NextResponse.redirect(url);
    }
    // Profile ativo — acesso permitido
    return supabaseResponse;
  }

  // 2. Sem profile — checar convite pendente (por email)
  const { data: invitation } = await supabase
    .from("user_invitations")
    .select("id, role, invited_by")
    .eq("email", email)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (invitation) {
    // Auto-provision: criar profile a partir do convite
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split("@")[0];

    await supabase.from("user_profiles").insert({
      email,
      full_name: fullName,
      role: invitation.role,
      invited_by: invitation.invited_by,
    });

    // Remover convite usado
    await supabase.from("user_invitations").delete().eq("id", invitation.id);

    return supabaseResponse;
  }

  // 2b. Checar invite link (token via cookie)
  const inviteToken = request.cookies.get("invite_token")?.value;
  if (inviteToken) {
    const { data: link } = await supabase
      .from("user_invite_links")
      .select("id, role, created_by, max_uses, used_count")
      .eq("token", inviteToken)
      .eq("active", true)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (link && (link.max_uses === 0 || link.used_count < link.max_uses)) {
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split("@")[0];

      await supabase.from("user_profiles").insert({
        email,
        full_name: fullName,
        role: link.role,
        invited_by: link.created_by,
      });

      // Incrementar used_count
      await supabase
        .from("user_invite_links")
        .update({ used_count: link.used_count + 1 })
        .eq("id", link.id);

      // Limpar cookie
      supabaseResponse.cookies.set("invite_token", "", { maxAge: 0, path: "/" });

      return supabaseResponse;
    }

    // Token inválido — limpar cookie
    supabaseResponse.cookies.set("invite_token", "", { maxAge: 0, path: "/" });
  }

  // 3. Sem profile e sem convite — acesso negado
  await supabase.auth.signOut();
  if (isApiRoute) {
    return NextResponse.json({ error: "Not invited" }, { status: 403 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("error", "not_invited");
  return NextResponse.redirect(url);
}
