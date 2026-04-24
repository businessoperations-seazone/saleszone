// Público: retorna commit SHA, timezone do servidor, e diagnósticos do fix.
// Temporário — remover depois de diagnosticar deploy travado.
import { NextResponse } from "next/server";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";

export const dynamic = "force-dynamic";

function toDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts.substring(0, 10);
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().substring(0, 10);
}

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diag: Record<string, any> = {
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.COMMIT_SHA
      || process.env.GIT_COMMIT
      || process.env.SOURCE_COMMIT
      || "unknown",
    node_env: process.env.NODE_ENV || "unknown",
    // TZ do servidor
    server_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tz_env: process.env.TZ || "(not set)",
    tz_offset_minutes: new Date().getTimezoneOffset(), // 0 = UTC, 180 = BRT (UTC-3)
    now_utc: new Date().toISOString(),
    now_local: new Date().toString(),
    // Testes de toDate com diferentes formatos
    test_cases: [
      { input: "2026-04-01T00:45:41+00:00", expected_brt_date: "2026-03-31", actual: toDate("2026-04-01T00:45:41+00:00") },
      { input: "2026-04-01T00:45:41Z", expected_brt_date: "2026-03-31", actual: toDate("2026-04-01T00:45:41Z") },
      { input: "2026-04-01T00:45:41", expected_brt_date: "2026-03-31 (se server UTC)", actual: toDate("2026-04-01T00:45:41") },
      { input: "2026-04-01 00:45:41", expected_brt_date: "2026-03-31 (se server UTC)", actual: toDate("2026-04-01 00:45:41") },
    ],
    deal_251717: null,
  };

  // Query Deal 251717 in mktp_deals to check actual format
  try {
    const admin = createSquadSupabaseAdmin();
    const { data } = await admin.from("mktp_deals")
      .select("deal_id, canal, status, won_time, add_time")
      .eq("deal_id", 251717)
      .maybeSingle();
    if (data) {
      diag.deal_251717 = {
        ...data,
        won_time_type: typeof data.won_time,
        won_time_as_string: String(data.won_time),
        won_time_toDate_result: toDate(data.won_time),
        in_april_bug: toDate(data.won_time) >= "2026-04-01",
      };
    } else {
      diag.deal_251717 = { not_found: true };
    }
  } catch (e) {
    diag.deal_251717 = { error: String(e) };
  }

  return NextResponse.json(diag, { status: 200 });
}
