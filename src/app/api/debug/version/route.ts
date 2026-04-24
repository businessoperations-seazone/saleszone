// Público: retorna o commit SHA do build atual + timestamp.
// Usado para diagnosticar deploy travado (Coolify sem check-runs GitHub).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.COMMIT_SHA
      || process.env.GIT_COMMIT
      || process.env.SOURCE_COMMIT
      || "unknown",
    commit_ref: process.env.VERCEL_GIT_COMMIT_REF
      || process.env.GIT_REF
      || "unknown",
    build_time: process.env.BUILD_TIME || "unknown",
    node_env: process.env.NODE_ENV || "unknown",
    // Teste do toDate() — se estiver deployado, deve retornar "2026-03-31"
    todate_fix_test: (() => {
      const d = new Date("2026-04-01T00:45:41+00:00");
      const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      return brt.toISOString().substring(0, 10);
    })(),
    now: new Date().toISOString(),
  });
}
