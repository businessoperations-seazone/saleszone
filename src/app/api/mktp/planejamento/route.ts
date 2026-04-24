// MKTP (Marketplace) module
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { getModuleConfig } from "@/lib/modules";
import { paginate } from "@/lib/paginate";
import type { PlanejamentoData, PlanejamentoEmpRow, PlanejamentoMetrics } from "@/lib/types";
import { getMktpCanalName } from "@/lib/mktp-utils";

const mc = getModuleConfig("mktp");

export const dynamic = "force-dynamic";

function rate(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 10000) / 10000 : 0;
}

function cost(spend: number, den: number): number {
  return den > 0 ? Math.round((spend / den) * 100) / 100 : 0;
}

function buildMetrics(leads: number, mql: number, sql: number, opp: number, won: number, spend: number): PlanejamentoMetrics {
  return {
    leads, mql, sql, opp, won, spend: Math.round(spend * 100) / 100,
    cpl: cost(spend, leads),
    cmql: cost(spend, mql),
    copp: cost(spend, opp),
    cpw: cost(spend, won),
    mqlToSql: rate(sql, mql),
    sqlToOpp: rate(opp, sql),
    oppToWon: rate(won, opp),
  };
}

function sumMetrics(rows: PlanejamentoMetrics[]): PlanejamentoMetrics {
  const leads = rows.reduce((s, r) => s + r.leads, 0);
  const mql = rows.reduce((s, r) => s + r.mql, 0);
  const sql = rows.reduce((s, r) => s + r.sql, 0);
  const opp = rows.reduce((s, r) => s + r.opp, 0);
  const won = rows.reduce((s, r) => s + r.won, 0);
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  return buildMetrics(leads, mql, sql, opp, won, spend);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysBack = parseInt(searchParams.get("days") || "0", 10);

    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const startDate = `${curMonth}-01`;

    const metaCutoffDate = daysBack > 0
      ? new Date(now.getTime() - daysBack * 86400000).toISOString().substring(0, 10)
      : null;

    const histMetaQuery = supabase
      .from("mktp_meta_ads")
      .select("ad_id, empreendimento, leads_month, spend_month, snapshot_date")
      .lt("snapshot_date", startDate);
    if (metaCutoffDate) histMetaQuery.gte("snapshot_date", metaCutoffDate);

    // Query mktp_deals directly instead of RPC (get_mktp_planejamento_counts doesn't exist)
    const admin = createSquadSupabaseAdmin();

    const dealsCutoff = daysBack > 0
      ? new Date(now.getTime() - daysBack * 86400000).toISOString().substring(0, 10)
      : daysBack === 0
        ? new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString().substring(0, 10)
        : null; // daysBack === -1: no date filter

    const [dealsData, curMetaData, histMetaData] = await Promise.all([
      paginate((o, ps) => {
        let q = admin.from("mktp_deals")
          .select("empreendimento, canal, add_time, max_stage_order, status, lost_reason, won_time")
          .not("empreendimento", "is", null);
        if (dealsCutoff) q = q.gte("add_time", dealsCutoff);
        return q.range(o, o + ps - 1);
      }),
      paginate((o, ps) =>
        supabase
          .from("mktp_meta_ads")
          .select("ad_id, empreendimento, leads_month, spend_month")
          .gte("snapshot_date", startDate)
          .range(o, o + ps - 1),
      ),
      paginate((o, ps) => histMetaQuery.range(o, o + ps - 1)),
    ]);

    // Compute counts by month/canal from deals (grouped by canal instead of empreendimento)
    // MKTP pipeline (37): MQL=Contatados (2), SQL=Qualificado (4), OPP=Reunião Realizada (8)
    const rpcLikeData: Array<{ month: string; empreendimento: string; mql: number; sql: number; opp: number; won: number }> = [];
    const canalMonthCounts = new Map<string, { mql: number; sql: number; opp: number; won: number }>();
    for (const d of dealsData) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const canal = getMktpCanalName(d.canal);
      const month = (d.add_time || "").substring(0, 7);
      if (!month) continue;
      const key = `${canal}|${month}`;
      if (!canalMonthCounts.has(key)) canalMonthCounts.set(key, { mql: 0, sql: 0, opp: 0, won: 0 });
      const c = canalMonthCounts.get(key)!;
      const mso = d.max_stage_order || 0;
      if (mso >= 2) c.mql++;
      if (mso >= 4) c.sql++;
      if (mso >= 8) c.opp++;
      if (d.status === "won") c.won++;
    }
    for (const [key, c] of canalMonthCounts) {
      const [canal, month] = key.split("|");
      rpcLikeData.push({ month, empreendimento: canal, ...c });
    }
    // paginate() already throws on error

    const curCounts = new Map<string, Record<string, number>>();
    const histByEmpMonth = new Map<string, Map<string, Record<string, number>>>();
    for (const row of rpcLikeData) {
      if (row.month === curMonth) {
        curCounts.set(row.empreendimento, {
          mql: Number(row.mql) || 0,
          sql: Number(row.sql) || 0,
          opp: Number(row.opp) || 0,
          won: Number(row.won) || 0,
        });
      } else {
        if (!histByEmpMonth.has(row.empreendimento)) histByEmpMonth.set(row.empreendimento, new Map());
        histByEmpMonth.get(row.empreendimento)!.set(row.month, {
          mql: Number(row.mql) || 0,
          sql: Number(row.sql) || 0,
          opp: Number(row.opp) || 0,
          won: Number(row.won) || 0,
        });
      }
    }
    const histCounts = new Map<string, Record<string, number>>();
    for (const [emp, monthMap] of histByEmpMonth) {
      const total: Record<string, number> = { mql: 0, sql: 0, opp: 0, won: 0 };
      for (const counts of monthMap.values()) {
        for (const tab of ["mql", "sql", "opp", "won"]) total[tab] += counts[tab] || 0;
      }
      histCounts.set(emp, total);
    }

    // Meta Ads data is keyed by empreendimento (spot) — aggregate into total
    // since canal mapping is not available in mktp_meta_ads
    const curAdMax = new Map<string, { leads_month: number; spend_month: number }>();
    for (const row of curMetaData) {
      const cur = curAdMax.get(row.ad_id);
      if (!cur || (Number(row.spend_month) || 0) > cur.spend_month) {
        curAdMax.set(row.ad_id, {
          leads_month: row.leads_month || 0,
          spend_month: Number(row.spend_month) || 0,
        });
      }
    }
    // Aggregate all Meta Ads spend into "Marketing" canal (ads = paid media)
    const curMeta = new Map<string, { leads: number; spend: number }>();
    let curMetaTotalLeads = 0, curMetaTotalSpend = 0;
    for (const ad of curAdMax.values()) {
      curMetaTotalLeads += ad.leads_month;
      curMetaTotalSpend += ad.spend_month;
    }
    if (curMetaTotalLeads > 0 || curMetaTotalSpend > 0) {
      curMeta.set("Marketing", { leads: curMetaTotalLeads, spend: curMetaTotalSpend });
    }

    // Historical Meta Ads: aggregate all spots into "Marketing" canal
    const histAdMonthMax = new Map<string, { leads: number; spend: number }>();
    for (const row of histMetaData) {
      const month = (row.snapshot_date as string).substring(0, 7);
      const adMonthKey = `${row.ad_id}|${month}`;
      const existing = histAdMonthMax.get(adMonthKey);
      const spend = Number(row.spend_month) || 0;
      const leads = row.leads_month || 0;
      if (!existing || spend > existing.spend) {
        histAdMonthMax.set(adMonthKey, { leads: Math.max(leads, existing?.leads || 0), spend });
      } else if (existing) {
        existing.leads = Math.max(existing.leads, leads);
      }
    }
    let histMetaTotalLeads = 0, histMetaTotalSpend = 0;
    for (const vals of histAdMonthMax.values()) {
      histMetaTotalLeads += vals.leads;
      histMetaTotalSpend += vals.spend;
    }
    const histMeta = new Map<string, { leads: number; spend: number }>();
    if (histMetaTotalLeads > 0 || histMetaTotalSpend > 0) {
      histMeta.set("Marketing", { leads: histMetaTotalLeads, spend: Math.round(histMetaTotalSpend * 100) / 100 });
    }

    // Collect all canal names from deals and meta data
    const allCanals = new Set<string>();
    for (const canal of curCounts.keys()) allCanals.add(canal);
    for (const canal of histCounts.keys()) allCanals.add(canal);
    for (const canal of curMeta.keys()) allCanals.add(canal);
    for (const canal of histMeta.keys()) allCanals.add(canal);

    const empRows: PlanejamentoEmpRow[] = [];
    for (const emp of allCanals) {
      const squadId = 0;
      const cc = curCounts.get(emp) || { mql: 0, sql: 0, opp: 0, won: 0 };
      const cm = curMeta.get(emp) || { leads: 0, spend: 0 };
      const hc = histCounts.get(emp) || { mql: 0, sql: 0, opp: 0, won: 0 };
      const hm = histMeta.get(emp) || { leads: 0, spend: 0 };

      const current = buildMetrics(cm.leads, cc.mql, cc.sql, cc.opp, cc.won, cm.spend);
      const historical = buildMetrics(hm.leads, hc.mql, hc.sql, hc.opp, hc.won, hm.spend);

      let efficiency: "high" | "medium" | "low" = "medium";
      if (current.won > 0 && current.cpw > 0) {
        const cpwBetter = historical.cpw > 0 && current.cpw <= historical.cpw;
        const convBetter = historical.oppToWon > 0 && current.oppToWon >= historical.oppToWon;
        if (cpwBetter && convBetter) efficiency = "high";
        else if (!cpwBetter && !convBetter) efficiency = "low";
      } else if (current.opp > 0) {
        efficiency = "medium";
      } else if (current.mql > 0 && current.sql === 0) {
        efficiency = "low";
      }

      empRows.push({ emp, squadId, current, historical, efficiency });
    }

    empRows.sort((a, b) => a.emp.localeCompare(b.emp));

    const result: PlanejamentoData = {
      month: curMonth,
      empreendimentos: empRows,
      totals: {
        current: sumMetrics(empRows.map((r) => r.current)),
        historical: sumMetrics(empRows.map((r) => r.historical)),
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("MKTP Planejamento error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
