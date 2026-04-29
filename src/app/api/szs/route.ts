// SZS (Serviços) module — 3 squads by canal, city filter
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getModuleConfig } from "@/lib/modules";
import { NUM_DAYS } from "@/lib/constants";
import { generateDates } from "@/lib/dates";
import type { TabKey, AcompanhamentoData, SquadData } from "@/lib/types";
import {
  getSquadIdFromCanalGroup,
  getCidadeGroup,
  SZS_METAS_WON_BY_SQUAD,
  getSquadMetasFromNekt,
} from "@/lib/szs-utils";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";

const mc = getModuleConfig("szs");
const TABS: TabKey[] = ["mql", "sql", "opp", "won"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") as TabKey) || "mql";
  const cityParam = req.nextUrl.searchParams.get("city"); // all | sao-paulo | salvador | florianopolis | outros

  try {
    const dates = generateDates();
    const startDate = dates[dates.length - 1].date;
    const endDate = dates[0].date;
    const dateIndex = new Map(dates.map((d, i) => [d.date, i]));

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // City filter mapping
    const cityFilter: string | null =
      cityParam === "sao-paulo" ? "São Paulo"
        : cityParam === "salvador" ? "Salvador"
          : cityParam === "florianopolis" ? "Florianópolis"
            : cityParam === "outros" ? "Outros"
              : null; // null = all cities

    // Fetch from szs_daily_counts (paginated)
    const allRows: Array<{ date: string; empreendimento: string; canal_group: string; is_paid: boolean; count: number }> = [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("szs_daily_counts")
        .select("date, empreendimento, canal_group, is_paid, count")
        .eq("tab", tab)
        .gte("date", startDate)
        .lte("date", endDate)
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`szs_daily_counts: ${error.message}`);
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }

    // Build counts per squadId|canalGroup
    const squadCidadeCounts = new Map<string, number[]>();

    for (const row of allRows) {
      const idx = dateIndex.get(row.date);
      if (idx === undefined) continue;
      if (cityFilter && getCidadeGroup(row.empreendimento) !== cityFilter) continue;
      const canalGroup = row.canal_group || "Outros";
      const squadId = getSquadIdFromCanalGroup(canalGroup, row.is_paid);
      const gKey = `${squadId}|${canalGroup}`;
      if (!squadCidadeCounts.has(gKey)) squadCidadeCounts.set(gKey, new Array(NUM_DAYS).fill(0));
      squadCidadeCounts.get(gKey)![idx] += row.count;
    }

    // Build squads from mc.squads (3 squads)
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const curMonthKey = `${year}-${String(month).padStart(2, "0")}`;
    const metaDateStr = `01/${String(month).padStart(2, "0")}/${year}`;

    // Fetch city-specific metas from nekt_meta26_metas
    let monthMetas: Record<number, number> = SZS_METAS_WON_BY_SQUAD[curMonthKey] || {};
    try {
      const admin = createSquadSupabaseAdmin();
      const { data: nektRow } = await admin
        .from("nekt_meta26_metas")
        .select("*")
        .eq("data", metaDateStr)
        .single();
      if (nektRow) {
        monthMetas = getSquadMetasFromNekt(nektRow as Record<string, unknown>, cityFilter);
      }
    } catch { /* fallback to hardcoded */ }

    const squads: SquadData[] = mc.squads.map((sq) => {
      const cidadeKeys: string[] = [];
      for (const gKey of squadCidadeCounts.keys()) {
        if (gKey.startsWith(`${sq.id}|`)) cidadeKeys.push(gKey);
      }

      const sqRows = cidadeKeys.map((gKey) => {
        const cidade = gKey.split("|")[1];
        const daily = squadCidadeCounts.get(gKey) || new Array(NUM_DAYS).fill(0);
        let totalMes = 0;
        daily.forEach((v, i) => {
          if (dates[i] && dates[i].date >= monthStart) totalMes += v;
        });
        return { emp: cidade, daily, totalMes };
      });

      sqRows.sort((a, b) => b.totalMes - a.totalMes);

      const metaWon = monthMetas[sq.id] || 0;
      const metaToDate = tab === "won" ? (day / totalDaysInMonth) * metaWon : 0;

      return {
        id: sq.id,
        name: sq.name,
        marketing: sq.marketing,
        preVenda: sq.preVenda,
        venda: sq.venda,
        rows: sqRows,
        metaToDate,
      };
    });

    // Calculate metas for non-won tabs using 90d ratios
    if (tab !== "won") {
      const start90 = new Date(now);
      start90.setDate(start90.getDate() - 90);
      const startDate90 = start90.toISOString().substring(0, 10);

      const counts90: Array<{ tab: string; canal_group: string; is_paid: boolean; count: number }> = [];
      let o90 = 0;
      while (true) {
        const { data, error } = await supabase
          .from("szs_daily_counts")
          .select("tab, canal_group, is_paid, count")
          .gte("date", startDate90)
          .lte("date", endDate)
          .range(o90, o90 + PAGE - 1);
        if (error) throw new Error(`90d counts: ${error.message}`);
        if (!data || data.length === 0) break;
        counts90.push(...data);
        if (data.length < PAGE) break;
        o90 += PAGE;
      }

      // Build 90d counts per squad
      const squadCounts90 = new Map<number, Record<string, number>>();
      for (const r of counts90) {
        const sqId = getSquadIdFromCanalGroup(r.canal_group || "Outros", r.is_paid);
        if (!squadCounts90.has(sqId)) squadCounts90.set(sqId, { mql: 0, sql: 0, opp: 0, won: 0 });
        const c = squadCounts90.get(sqId)!;
        if (r.tab in c) c[r.tab] += r.count || 0;
      }

      for (const sq of squads) {
        const c = squadCounts90.get(sq.id) || { mql: 0, sql: 0, opp: 0, won: 0 };
        const metaWon = monthMetas[sq.id] || 0;
        const ratios = {
          opp_won: c.won > 0 ? c.opp / c.won : 0,
          sql_opp: c.opp > 0 ? c.sql / c.opp : 0,
          mql_sql: c.sql > 0 ? c.mql / c.sql : 0,
        };
        const metaMap: Record<TabKey, number> = {
          won: (day / totalDaysInMonth) * metaWon,
          opp: (day / totalDaysInMonth) * ratios.opp_won * metaWon,
          sql: (day / totalDaysInMonth) * ratios.sql_opp * ratios.opp_won * metaWon,
          mql: (day / totalDaysInMonth) * ratios.mql_sql * ratios.sql_opp * ratios.opp_won * metaWon,
        };
        sq.metaToDate = metaMap[tab] || 0;
      }
    }

    // Grand totals
    const grandDaily = new Array(NUM_DAYS).fill(0);
    let grandTotal = 0;
    let grandMeta = 0;
    squads.forEach((sq) => {
      grandMeta += sq.metaToDate;
      sq.rows.forEach((r) => {
        grandTotal += r.totalMes;
        r.daily.forEach((v, i) => (grandDaily[i] += v));
      });
    });

    const result: AcompanhamentoData = {
      squads,
      dates,
      grand: { totalMes: grandTotal, metaToDate: grandMeta, daily: grandDaily },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("SZS Dashboard API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
