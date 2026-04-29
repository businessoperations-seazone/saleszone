import { NextRequest, NextResponse } from "next/server";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { generateDates } from "@/lib/dates";
import { getModuleConfig } from "@/lib/modules";
import { getSquadIdFromCanalGroup, getCidadeGroup } from "@/lib/szs-utils";
import type { RatioHistoryData, RatioSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

const mc = getModuleConfig("szs");

// Old squad_id mapping in szs_ratios_daily:
//   0=Global, 1=Marketing, 2=Parceiros, 3=Expansao, 4=Spots, 5=Monica, 6=Outros
// New consolidated mapping:
//   0=Global, 1=Marketing, 2=Parceiros, 3=Expansao/Spot/Outros (aggregate 3+4+5+6)

const OLD_IDS_TO_MERGE = new Set([3, 4, 5, 6]);
const MERGED_SQUAD_ID = 3;

type Counts = { mql: number; sql: number; opp: number; won: number };
type Ratios = { mql_sql: number; sql_opp: number; opp_won: number };

function emptyCounts(): Counts {
  return { mql: 0, sql: 0, opp: 0, won: 0 };
}

function computeRatios(c: Counts): Ratios {
  return {
    mql_sql: c.mql > 0 ? c.sql / c.mql : 0,
    sql_opp: c.sql > 0 ? c.opp / c.sql : 0,
    opp_won: c.opp > 0 ? c.won / c.opp : 0,
  };
}

/** Remap and aggregate old 7-squad rows into 4 (global + 3 squads) for a single date */
function aggregateRows(rows: RatioSnapshot[]): RatioSnapshot[] {
  const out: RatioSnapshot[] = [];
  const mergedCounts = emptyCounts();
  let mergedDate = "";

  for (const r of rows) {
    if (r.squad_id === 0 || r.squad_id === 1 || r.squad_id === 2) {
      // Global, Marketing, Parceiros — pass through unchanged
      out.push(r);
    } else if (OLD_IDS_TO_MERGE.has(r.squad_id)) {
      mergedDate = r.date;
      const c = r.counts_90d || emptyCounts();
      mergedCounts.mql += c.mql;
      mergedCounts.sql += c.sql;
      mergedCounts.opp += c.opp;
      mergedCounts.won += c.won;
    }
  }

  // Emit merged squad 3 if we accumulated any data
  if (mergedDate) {
    out.push({
      date: mergedDate,
      squad_id: MERGED_SQUAD_ID,
      ratios: computeRatios(mergedCounts),
      counts_90d: mergedCounts,
    });
  }

  return out;
}

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "90");
  const cityParam = req.nextUrl.searchParams.get("city");
  const cityFilter: string | null =
    cityParam === "sao-paulo" ? "São Paulo"
      : cityParam === "salvador" ? "Salvador"
        : cityParam === "florianopolis" ? "Florianópolis"
          : cityParam === "outros" ? "Outros"
            : null;

  try {
    const now = new Date();
    const today = now.toISOString().substring(0, 10);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffDate = cutoff.toISOString().substring(0, 10);

    const dates = generateDates();
    const startDate = dates[dates.length - 1].date;

    const admin = createSquadSupabaseAdmin();

    const [ratiosRes] = await Promise.all([
      admin
        .from("szs_ratios_daily")
        .select("date, squad_id, ratios, counts_90d")
        .gte("date", cutoffDate)
        .lte("date", today)
        .order("date", { ascending: false }),
    ]);

    // Paginate szs_daily_counts (>1000 rows possible in 28d window)
    const countsAll: Array<{ date: string; tab: string; empreendimento: string; canal_group: string; is_paid: boolean; count: number }> = [];
    let o = 0;
    while (true) {
      const { data, error } = await admin
        .from("szs_daily_counts")
        .select("date, tab, empreendimento, canal_group, is_paid, count")
        .gte("date", startDate)
        .lte("date", today)
        .range(o, o + 999);
      if (error) throw new Error(`szs_daily_counts paginate: ${error.message}`);
      if (!data || data.length === 0) break;
      countsAll.push(...data);
      if (data.length < 1000) break;
      o += 1000;
    }

    if (ratiosRes.error) throw new Error(`Supabase error: ${ratiosRes.error.message}`);

    const rawRows = (ratiosRes.data || []) as RatioSnapshot[];

    // Group raw rows by date, then aggregate each date's rows
    const byDate = new Map<string, RatioSnapshot[]>();
    for (const r of rawRows) {
      const arr = byDate.get(r.date);
      if (arr) arr.push(r);
      else byDate.set(r.date, [r]);
    }

    const allRows: RatioSnapshot[] = [];
    byDate.forEach((dateRows) => {
      allRows.push(...aggregateRows(dateRows));
    });
    // Sort descending by date (same as original query order)
    allRows.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

    // Current = most recent date's snapshots
    const latestDate = allRows.length > 0 ? allRows[0].date : today;
    const currentRows = allRows.filter(r => r.date === latestDate);
    const globalCurrent = currentRows.find(r => r.squad_id === 0) || {
      date: latestDate, squad_id: 0,
      ratios: { mql_sql: 0, sql_opp: 0, opp_won: 0 },
      counts_90d: { mql: 0, sql: 0, opp: 0, won: 0 },
    };
    let squadsCurrent = currentRows.filter(r => r.squad_id !== 0);

    // Build per-squad daily counts keyed by squad name (using canal_group → squad mapping)
    const empDaily: Record<string, Record<string, Record<string, number>>> = {};
    for (const row of countsAll) {
      const tab = row.tab as string;
      if (!["mql", "sql", "opp", "won"].includes(tab)) continue;
      if (cityFilter && getCidadeGroup(row.empreendimento) !== cityFilter) continue;

      const canalGroup = row.canal_group || "Outros";
      const squadId = getSquadIdFromCanalGroup(canalGroup, row.is_paid);
      const squad = mc.squads.find(s => s.id === squadId);
      const key = squad?.name || "Outros";

      if (!empDaily[key]) empDaily[key] = {};
      if (!empDaily[key][row.date]) empDaily[key][row.date] = { mql: 0, sql: 0, opp: 0, won: 0 };
      empDaily[key][row.date][tab] += row.count || 0;
    }

    // Recalculate globalCurrent and squadsCurrent when city filter is active
    if (cityFilter) {
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);
      const ninetyCutoff = ninetyDaysAgo.toISOString().substring(0, 10);

      const ninetyCounts: Array<{ tab: string; canal_group: string; is_paid: boolean; count: number }> = [];
      let o = 0;
      while (true) {
        const { data, error } = await admin
          .from("szs_daily_counts")
          .select("tab, canal_group, is_paid, empreendimento, count")
          .in("tab", ["mql", "sql", "opp", "won"])
          .gte("date", ninetyCutoff)
          .lte("date", today)
          .range(o, o + 999);
        if (error) throw new Error(`szs_daily_counts 90d: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const r of data) {
          if (cityFilter && getCidadeGroup(r.empreendimento) !== cityFilter) continue;
          ninetyCounts.push(r);
        }
        if (data.length < 1000) break;
        o += 1000;
      }

      // Aggregate by squad
      const sqTotals = new Map<number, Counts>();
      for (const r of ninetyCounts) {
        if (!["mql", "sql", "opp", "won"].includes(r.tab)) continue;
        const sqId = getSquadIdFromCanalGroup(r.canal_group || "Outros", r.is_paid);
        if (!sqTotals.has(sqId)) sqTotals.set(sqId, emptyCounts());
        const c = sqTotals.get(sqId)!;
        c[r.tab as keyof Counts] += r.count || 0;
      }

      let totMql = 0, totSql = 0, totOpp = 0, totWon = 0;
      const filteredSquads: RatioSnapshot[] = [];
      for (const [sqId, c] of sqTotals) {
        totMql += c.mql; totSql += c.sql; totOpp += c.opp; totWon += c.won;
        filteredSquads.push({
          date: latestDate, squad_id: sqId,
          ratios: computeRatios(c),
          counts_90d: c,
        });
      }

      const globalCounts = { mql: totMql, sql: totSql, opp: totOpp, won: totWon };
      globalCurrent.ratios = computeRatios(globalCounts);
      globalCurrent.counts_90d = globalCounts;

      // squadsCurrent: aggregate filteredSquads by consolidated squad mapping
      const merged3 = emptyCounts();
      const filteredSquadsOut: RatioSnapshot[] = [];
      for (const r of filteredSquads) {
        if (r.squad_id === 0 || r.squad_id === 1 || r.squad_id === 2) {
          filteredSquadsOut.push(r);
        } else {
          merged3.mql += r.counts_90d.mql;
          merged3.sql += r.counts_90d.sql;
          merged3.opp += r.counts_90d.opp;
          merged3.won += r.counts_90d.won;
        }
      }
      if (merged3.mql > 0 || merged3.sql > 0 || merged3.opp > 0 || merged3.won > 0) {
        filteredSquadsOut.push({ date: latestDate, squad_id: 3, ratios: computeRatios(merged3), counts_90d: merged3 });
      }

      squadsCurrent = filteredSquadsOut;
    }

    const result: RatioHistoryData = {
      current: { global: globalCurrent, squads: squadsCurrent },
      history: allRows,
      empDaily,
      dates: dates.map(d => d.date),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("SZS Ratios error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
