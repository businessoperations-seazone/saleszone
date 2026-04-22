// Decor (Decor) module
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { getModuleConfig } from "@/lib/modules";
import { NUM_DAYS } from "@/lib/constants";
import { generateDates } from "@/lib/dates";
import type { TabKey, AcompanhamentoData, SquadData, MetaInfo } from "@/lib/types";
import { paginate } from "@/lib/paginate";

const mc = getModuleConfig("decor");

const SQUAD_CLOSERS: Record<number, number> = {};
for (const [sqId, indices] of Object.entries(mc.squadCloserMap)) {
  SQUAD_CLOSERS[Number(sqId)] = indices.length;
}
const TOTAL_CLOSERS = Object.values(SQUAD_CLOSERS).reduce((a, b) => a + b, 0) || 1;
const TABS: TabKey[] = ["mql", "sql", "opp", "won"];
// stage thresholds for decor_deals.max_stage_order
const STAGE_THRESHOLDS: Record<TabKey, number> = { mql: 2, sql: 5, opp: 9, won: 14 };

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
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // Build date index
    const dateIndex = new Map(dates.map((d, i) => [d.date, i]));

    // Build counts per empreendimento
    const empCounts = new Map<string, number[]>();

    {
      // Always use decor_deals for consistency across all filter modes
      const admin = createSquadSupabaseAdmin();
      const isWon = tab === "won";
      const dateCol = tab === "won" ? "won_time" : tab === "opp" ? "reuniao_date" : tab === "sql" ? "qualificacao_date" : "add_time";

      const deals = await paginate((o, ps) => {
        let q = admin
          .from("decor_deals")
          .select(`empreendimento, canal, rd_source, ${dateCol}, max_stage_order, status, lost_reason`)
          .gte(dateCol, startDate);
        if (isWon) q = q.eq("status", "won");
        if (ctwaOnly) {
          q = q.eq("is_marketing", true).eq("rd_source", "Click To WhatsApp");
        } else if (paidOnly) {
          q = q.eq("is_marketing", true).ilike("rd_source", "%pag%");
        } else if (marketingOnly) {
          q = q.eq("is_marketing", true);
        }
        return q.range(o, o + ps - 1);
      });

      for (const d of deals) {
        if (d.lost_reason === "Duplicado/Erro") continue;
        const emp = d.empreendimento || "Aguardando definição";
        const dateStr = (d[dateCol] || "").substring(0, 10);
        const idx = dateIndex.get(dateStr);
        if (idx === undefined) continue;
        if (!empCounts.has(emp)) empCounts.set(emp, new Array(NUM_DAYS).fill(0));
        empCounts.get(emp)![idx] += 1;
      }
    }

    // Map to squads — Decor discovers empreendimentos from DB (60+ dynamic)
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

    // Calculate metas in real-time with per-squad ratios (90d counts by empreendimento)
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    // TODO: Decor may have a different metas source than nekt_meta26_metas
    const metaDateStr = `01/${String(month).padStart(2, "0")}/${year}`;

    const start90 = new Date(now);
    start90.setDate(start90.getDate() - 90);
    const startDate90 = start90.toISOString().substring(0, 10);

    // Quando filtro ativo, buscar deals 90d filtrados para ratios precisos
    const filteredRatioPromise = hasFilter
      ? (() => {
          const admin2 = createSquadSupabaseAdmin();
          return paginate((o, ps) => {
            let q = admin2
              .from("decor_deals")
              .select("empreendimento, max_stage_order, status, lost_reason")
              .not("empreendimento", "is", null)
              .gte("add_time", startDate90);
            if (ctwaOnly) {
              q = q.eq("is_marketing", true).eq("rd_source", "Click To WhatsApp");
            } else if (paidOnly) {
              q = q.eq("is_marketing", true).ilike("rd_source", "%pag%");
            } else if (marketingOnly) {
              q = q.eq("is_marketing", true);
            }
            return q.range(o, o + ps - 1);
          });
        })()
      : null;

    const [nektRes, counts90Res, filteredDeals90] = await Promise.all([
      createSquadSupabaseAdmin()
        .from("nekt_meta26_metas")
        .select("won_decor_meta_pago, won_decor_meta_direto")
        .eq("data", metaDateStr)
        .single(),
      supabase.from("decor_daily_counts").select("tab, empreendimento, count").gte("date", startDate90).lte("date", endDate),
      filteredRatioPromise,
    ]);

    let metaInfo: MetaInfo | undefined;
    const nektData = nektRes.data as { won_decor_meta_pago: number; won_decor_meta_direto: number } | null;
    if (nektData) {
      const metaPago = Number(nektData.won_decor_meta_pago) || 0;
      const metaDireto = Number(nektData.won_decor_meta_direto) || 0;
      const wonMetaTotal = hasFilter ? metaPago : metaPago + metaDireto;
      const wonPerCloser = wonMetaTotal / TOTAL_CLOSERS;

      // Decor has 1 squad — all deals go to squad 1
      const squadCounts = new Map<number, Record<string, number>>();
      for (const sq of mc.squads) {
        squadCounts.set(sq.id, { mql: 0, sql: 0, opp: 0, won: 0 });
      }
      const sqId = mc.squads[0]?.id || 1;

      if (hasFilter && filteredDeals90) {
        for (const d of filteredDeals90) {
          if (d.lost_reason === "Duplicado/Erro") continue;
          const mso = d.max_stage_order || 0;
          const c = squadCounts.get(sqId)!;
          if (mso >= STAGE_THRESHOLDS.mql) c.mql++;
          if (mso >= STAGE_THRESHOLDS.sql) c.sql++;
          if (mso >= STAGE_THRESHOLDS.opp) c.opp++;
          if (d.status === "won") c.won++;
        }
      } else {
        for (const r of counts90Res.data || []) {
          const c = squadCounts.get(sqId)!;
          if (r.tab in c) c[r.tab] += r.count || 0;
        }
      }

      const metaInfoSquads: MetaInfo["squads"] = [];
      for (const sq of squads) {
        const closers = SQUAD_CLOSERS[sq.id] || 1;
        const wonMetaSquad = wonPerCloser * closers;
        const c = squadCounts.get(sq.id)!;
        const ratios = {
          opp_won: c.won > 0 ? c.opp / c.won : 0,
          sql_opp: c.opp > 0 ? c.sql / c.opp : 0,
          mql_sql: c.sql > 0 ? c.mql / c.sql : 0,
        };
        const metaMap: Record<TabKey, number> = {
          won: (day / totalDaysInMonth) * wonMetaSquad,
          opp: (day / totalDaysInMonth) * ratios.opp_won * wonMetaSquad,
          sql: (day / totalDaysInMonth) * ratios.sql_opp * ratios.opp_won * wonMetaSquad,
          mql: (day / totalDaysInMonth) * ratios.mql_sql * ratios.sql_opp * ratios.opp_won * wonMetaSquad,
        };
        sq.metaToDate = metaMap[tab] || 0;
        metaInfoSquads.push({
          id: sq.id,
          closers,
          counts90d: { mql: c.mql, sql: c.sql, opp: c.opp, won: c.won },
          ratios: { mql_sql: Math.round(ratios.mql_sql * 100) / 100, sql_opp: Math.round(ratios.sql_opp * 100) / 100, opp_won: Math.round(ratios.opp_won * 100) / 100 },
        });
      }
      metaInfo = { wonMetaTotal, wonPerCloser, day, totalDaysInMonth, squads: metaInfoSquads };
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
      metaInfo,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Decor Dashboard API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
