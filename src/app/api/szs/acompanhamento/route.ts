// SZS (Serviços) module — acompanhamento heatmap with 3 squads (Marketing, Parceiros, Expansão)
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
} from "@/lib/szs-utils";

const mc = getModuleConfig("szs");

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") as TabKey) || "mql";
  const cityParam = req.nextUrl.searchParams.get("city");

  try {
    const dates = generateDates();
    const startDate = dates[dates.length - 1].date;
    const endDate = dates[0].date;
    const dateIndex = new Map(dates.map((d, i) => [d.date, i]));

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const cityFilter: string | null =
      cityParam === "sao-paulo" ? "São Paulo"
        : cityParam === "salvador" ? "Salvador"
          : cityParam === "florianopolis" ? "Florianópolis"
            : cityParam === "outros" ? "Outros"
              : null;

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

    // Build counts per squadId|canalGroup (sub-rows are canais)
    const squadCanalCounts = new Map<string, number[]>();
    for (const row of allRows) {
      const idx = dateIndex.get(row.date);
      if (idx === undefined) continue;
      if (cityFilter && getCidadeGroup(row.empreendimento) !== cityFilter) continue;
      const canalGroup = row.canal_group || "Outros";
      const squadId = getSquadIdFromCanalGroup(canalGroup, row.is_paid);
      const gKey = `${squadId}|${canalGroup}`;
      if (!squadCanalCounts.has(gKey)) squadCanalCounts.set(gKey, new Array(NUM_DAYS).fill(0));
      squadCanalCounts.get(gKey)![idx] += row.count;
    }

    // Build squads from mc.squads (3 squads: Marketing, Parceiros, Expansão)
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const curMonthKey = `${year}-${String(month).padStart(2, "0")}`;
    const monthMetas = SZS_METAS_WON_BY_SQUAD[curMonthKey] || {};

    const squads: SquadData[] = mc.squads.map((sq) => {
      const canalKeys: string[] = [];
      for (const gKey of squadCanalCounts.keys()) {
        if (gKey.startsWith(`${sq.id}|`)) canalKeys.push(gKey);
      }

      const sqRows = canalKeys.map((gKey) => {
        const canal = gKey.split("|")[1];
        const daily = squadCanalCounts.get(gKey) || new Array(NUM_DAYS).fill(0);
        let totalMes = 0;
        daily.forEach((v, i) => {
          if (dates[i] && dates[i].date >= monthStart) totalMes += v;
        });
        return { emp: canal, daily, totalMes };
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

    // Non-won tabs: compute meta using 90d ratios
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
          opp_won: c.opp > 0 ? c.won / c.opp : 0,
          sql_opp: c.sql > 0 ? c.opp / c.sql : 0,
          mql_sql: c.mql > 0 ? c.sql / c.mql : 0,
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
    console.error("SZS Acompanhamento error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}