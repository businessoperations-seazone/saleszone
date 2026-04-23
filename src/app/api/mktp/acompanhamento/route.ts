// MKTP (Marketplace) module
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { getModuleConfig } from "@/lib/modules";
import { NUM_DAYS } from "@/lib/constants";
import { generateDates } from "@/lib/dates";
import { paginate } from "@/lib/paginate";
import type { TabKey, AcompanhamentoData, SquadData } from "@/lib/types";

const mc = getModuleConfig("mktp");

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") as TabKey) || "mql";
  const filterParam = req.nextUrl.searchParams.get("filter");
  const paidOnly = filterParam === "paid";
  const marketingOnly = filterParam === "marketing";
  const ctwaOnly = filterParam === "ctwa";
  const hasFilter = paidOnly || marketingOnly || ctwaOnly;

  try {
    const dates = generateDates();
    const startDate = dates[dates.length - 1].date;
    const endDate = dates[0].date;
    const dateIndex = new Map(dates.map((d, i) => [d.date, i]));

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const empCounts = new Map<string, number[]>();

    if (hasFilter) {
      // Filtered: compute from mktp_deals (not pre-aggregated counts)
      const admin = createSquadSupabaseAdmin();
      const rows = await paginate((o, ps) =>
        admin
          .from("mktp_deals")
          .select("empreendimento, canal, rd_source, is_marketing, max_stage_order, status, add_time, lost_reason")
          .not("canal", "is", null)
          .gte("add_time", startDate)
          .range(o, o + ps - 1),
      );

      // MKTP pipeline (37): MQL=Contatados (2), SQL=Qualificado (4), OPP=Reunião Realizada (8), WON=Contrato (13)
      const tabThreshold: Record<string, number> = { mql: 2, sql: 4, opp: 8, won: 13 };
      const threshold = tabThreshold[tab] ?? 0;
      for (const d of rows) {
        if (d.lost_reason === "Duplicado/Erro") continue;
        if (d.status === "won" && tab !== "won") continue;
        if (d.status !== "won" && (d.max_stage_order || 0) < threshold) continue;

        const rdLower = (d.rd_source || "").toLowerCase();
        if (paidOnly && !rdLower.includes("pag")) continue;
        if (ctwaOnly && !rdLower.includes("whats")) continue;

        const dateStr = (d.add_time || "").substring(0, 10);
        const idx = dateIndex.get(dateStr);
        if (idx === undefined) continue;
        if (!empCounts.has(d.empreendimento)) {
          empCounts.set(d.empreendimento, new Array(NUM_DAYS).fill(0));
        }
        empCounts.get(d.empreendimento)![idx] += 1;
      }
    } else {
      const { data: rows, error } = await supabase
        .from("mktp_daily_counts")
        .select("date, empreendimento, count")
        .eq("tab", tab)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw new Error(`Supabase error: ${error.message}`);
      for (const row of rows || []) {
        const idx = dateIndex.get(row.date);
        if (idx === undefined) continue;
        if (!empCounts.has(row.empreendimento)) {
          empCounts.set(row.empreendimento, new Array(NUM_DAYS).fill(0));
        }
        empCounts.get(row.empreendimento)![idx] += row.count;
      }
    }

    const squads: SquadData[] = mc.squads.map((sq) => {
      const emps = sq.empreendimentos.length > 0 ? sq.empreendimentos : [...empCounts.keys()].sort();
      const sqRows = emps.map((emp) => {
        const daily = empCounts.get(emp) || new Array(NUM_DAYS).fill(0);
        let totalMes = 0;
        daily.forEach((v, i) => {
          if (dates[i] && dates[i].date >= monthStart) totalMes += v;
        });
        return { emp, daily, totalMes };
      });
      return {
        id: sq.id,
        name: sq.name,
        marketing: sq.marketing,
        preVenda: sq.preVenda,
        venda: sq.venda,
        rows: sqRows,
        metaToDate: 0,
      };
    });

    const monthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const { data: metaRows } = await supabase
      .from("mktp_metas")
      .select("squad_id, meta")
      .eq("month", monthDate)
      .eq("tab", tab);

    if (metaRows) {
      for (const m of metaRows) {
        const sq = squads.find((s) => s.id === m.squad_id);
        if (sq) sq.metaToDate = m.meta;
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
    console.error("MKTP Acompanhamento error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
