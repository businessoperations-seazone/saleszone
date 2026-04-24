import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Rotas do Audit MQL e Audit CTWPP são públicas (Meta webhook + cron endpoints)
  // /api/debug/* é público para diagnóstico de deploy/versão
  // Em desenvolvimento, também permite acesso à página de Audit MQL para testes
  if (
    request.nextUrl.pathname.startsWith("/api/growth/audit-mql/") ||
    request.nextUrl.pathname.startsWith("/api/growth/audit-ctwpp/") ||
    request.nextUrl.pathname.startsWith("/api/growth/audit-lp/") ||
    request.nextUrl.pathname.startsWith("/api/debug/") ||
    (process.env.NODE_ENV === "development" && request.nextUrl.pathname === "/growth/audit-mql")
  ) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|invite|auth/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
