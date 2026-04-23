// MKTP (Marketplace) module — Ratios (computed from mktp_daily_counts + mktp_deals for canal grouping)
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { paginate } from "@/lib/paginate";
import { generateDates } from "@/lib/dates";
import type { RatioHistoryData, RatioSnapshot } from "@/lib/types";
import { getMktpCanalName } from "@/lib/mktp-utils";

export const dynamic = "force-dynamic";

function ratio(n: number, d: number): number {
  if (d < 5) return 0; // minimum 5 deals for meaningful conversion
  return d > 0 ? Math.round((n / d) * 100) / 100 : 0;
}

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "90");
  const filterParam = req.nextUrl.searchParams.get("filter");
  const paidOnly = filterParam === "paid";
  const marketingOnly = filterParam === "marketing";
  const ctwaOnly = filterParam === "ctwa";
  const hasFilter = paidOnly || marketingOnly || ctwaOnly;

  try {
    const now = new Date();
    const today = now.toISOString().substring(0, 10);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffDate = cutoff.toISOString().substring(0, 10);
    const dates = generateDates();
    const startDate = dates[dates.length - 1].date;

    // Fetch daily counts for rolling ratios (mktp_daily_counts)
    const countsData = await paginate((o, ps) =>
      supabase
        .from("mktp_daily_counts")
        .select("date, tab, count")
        .gte("date", cutoffDate)
        .lte("date", today)
        .range(o, o + ps - 1),
    );

    // Aggregate daily totals by date+tab
    const dailyTotals = new Map<string, Record<string, number>>();
    for (const r of countsData) {
      if (!["mql", "sql", "opp", "won"].includes(r.tab)) continue;
      if (!dailyTotals.has(r.date)) dailyTotals.set(r.date, { mql: 0, sql: 0, opp: 0, won: 0 });
      dailyTotals.get(r.date)![r.tab] += r.count || 0;
    }

    // Build rolling 90d ratio snapshots for each date
    const sortedDates = Array.from(dailyTotals.keys()).sort();
    const history: RatioSnapshot[] = [];
    for (const d of sortedDates) {
      const windowStart = new Date(d + "T12:00:00");
      windowStart.setDate(windowStart.getDate() - 89);
      const wsStr = windowStart.toISOString().substring(0, 10);
      let mql = 0, sql = 0, opp = 0, won = 0;
      for (const [dt, counts] of dailyTotals) {
        if (dt >= wsStr && dt <= d) {
          mql += counts.mql; sql += counts.sql; opp += counts.opp; won += counts.won;
        }
      }
      history.push({
        date: d, squad_id: 0,
        ratios: {
          mql_sql: ratio(sql, mql),
          sql_opp: ratio(opp, sql),
          opp_won: ratio(won, opp),
        },
        counts_90d: { mql, sql, opp, won },
      });
    }

    const globalCurrent = history.length > 0 ? history[history.length - 1] : {
      date: today, squad_id: 0,
      ratios: { mql_sql: 0, sql_opp: 0, opp_won: 0 },
      counts_90d: { mql: 0, sql: 0, opp: 0, won: 0 },
    };

    // Build empDaily by CANAL (from mktp_deals which has canal field)
    const admin = createSquadSupabaseAdmin();
    const dealRows = await paginate((o, ps) => {
      const q = admin
        .from("mktp_deals")
        .select("canal, add_time, rd_source, is_marketing, max_stage_order, status, lost_reason")
        .not("canal", "is", null)
        .gte("add_time", startDate)
        .range(o, o + ps - 1);
      return q;
    });

    const empDaily: Record<string, Record<string, Record<string, number>>> = {};
    for (const d of dealRows) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const rdLower = (d.rd_source || "").toLowerCase();
      if (paidOnly && !rdLower.includes("pag")) continue;
      if (ctwaOnly && !rdLower.includes("whats")) continue;

      const canalName = getMktpCanalName(d.canal);
      const dateStr = (d.add_time || "").substring(0, 10);
      if (!dateStr) continue;
      if (!empDaily[canalName]) empDaily[canalName] = {};
      if (!empDaily[canalName][dateStr]) empDaily[canalName][dateStr] = { mql: 0, sql: 0, opp: 0, won: 0 };
      const mso = d.max_stage_order || 0;
      // MKTP pipeline (37): MQL=Contatados (2), SQL=Qualificado (4), OPP=Reunião Realizada (8)
      if (mso >= 2) empDaily[canalName][dateStr].mql += 1;
      if (mso >= 4) empDaily[canalName][dateStr].sql += 1;
      if (mso >= 8) empDaily[canalName][dateStr].opp += 1;
      if (d.status === "won") empDaily[canalName][dateStr].won += 1;
    }

    // Recalculate globalCurrent from filtered empDaily when filter is active
    if (hasFilter) {
      const totMql = Object.values(empDaily).reduce((s, byDate) =>
        s + Object.values(byDate).reduce((s2, c) => s2 + (c.mql || 0), 0), 0);
      const totSql = Object.values(empDaily).reduce((s, byDate) =>
        s + Object.values(byDate).reduce((s2, c) => s2 + (c.sql || 0), 0), 0);
      const totOpp = Object.values(empDaily).reduce((s, byDate) =>
        s + Object.values(byDate).reduce((s2, c) => s2 + (c.opp || 0), 0), 0);
      const totWon = Object.values(empDaily).reduce((s, byDate) =>
        s + Object.values(byDate).reduce((s2, c) => s2 + (c.won || 0), 0), 0);
      globalCurrent.ratios = {
        mql_sql: ratio(totSql, totMql),
        sql_opp: ratio(totOpp, totSql),
        opp_won: ratio(totWon, totOpp),
      };
      globalCurrent.counts_90d = { mql: totMql, sql: totSql, opp: totOpp, won: totWon };
    }

    const result: RatioHistoryData = {
      current: { global: globalCurrent, squads: [] },
      history,
      empDaily,
      dates: dates.map(d => d.date),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("MKTP Ratios error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
