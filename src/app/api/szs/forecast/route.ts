// SZS (Serviços) module — forecast agrupado por squad (3 squads)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { ForecastData, ForecastStageSnapshot, ForecastStageBreakdown, ForecastSquadRow, ForecastCloserRow } from "@/lib/types";
import { paginate } from "@/lib/paginate";
import { getModuleConfig } from "@/lib/modules";
import { getSquadIdFromDeal, getSquadName, getCanalGroupFromId, SZS_METAS_WON_BY_SQUAD } from "@/lib/szs-utils";

export const dynamic = "force-dynamic";

const mc = getModuleConfig("szs");

const STAGE_NAMES: Record<number, string> = {
  1: "Lead in", 2: "Contatados", 3: "Qualificação", 4: "Qualificado", 5: "Aguardando data",
  6: "Agendado", 7: "No Show", 8: "Reunião Realizada", 9: "FUP",
  10: "Negociação", 11: "Aguardando Dados", 12: "Contrato",
};
const ALL_STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// Meta fields from nekt_meta26_metas, consolidated per squad
const META_FIELDS_BY_SQUAD: Record<number, string[]> = {
  1: ["won_szs_meta_pago"],                                         // Marketing
  2: ["won_szs_meta_parceiro"],                                     // Parceiros
  3: ["won_szs_meta_exp", "won_szs_meta_spot", "won_szs_meta_direto"], // Expansão + Spots + Outros
};

export async function GET() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const mesStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    const mesInicio = `${mesStr}-01`;
    const mesFim = `${year}-${String(month + 2).padStart(2, "0")}-01`;
    const diasNoMes = new Date(year, month + 1, 0).getDate();
    const diasPassados = now.getDate();
    const diasRestantes = diasNoMes - diasPassados;

    const d90 = new Date(now);
    d90.setDate(d90.getDate() - 90);
    const d90Str = d90.toISOString().substring(0, 10);

    // --- Queries paralelas (SZS: todos os canais) ---
    const [openDeals, hist90d, won90d, wonThisMonth, metasRows] = await Promise.all([
      paginate((o, ps) =>
        supabase
          .from("szs_deals")
          .select("deal_id, stage_order, owner_name, canal, canal_de_origem, rd_source")
          .eq("status", "open")
          .range(o, o + ps - 1),
      ),
      paginate((o, ps) =>
        supabase
          .from("szs_deals")
          .select("deal_id, status, stage_order, max_stage_order, lost_reason, add_time, won_time, canal")
          .in("status", ["won", "lost"])
          .gte("add_time", d90Str)
          .range(o, o + ps - 1),
      ),
      paginate((o, ps) =>
        supabase
          .from("szs_deals")
          .select("deal_id, add_time, won_time, max_stage_order")
          .eq("status", "won")
          .gte("won_time", d90Str)
          .range(o, o + ps - 1),
      ),
      paginate((o, ps) =>
        supabase
          .from("szs_deals")
          .select("deal_id, owner_name, canal, canal_de_origem, rd_source")
          .eq("status", "won")
          .gte("won_time", mesInicio)
          .lt("won_time", mesFim)
          .range(o, o + ps - 1),
      ),
      // Meta WON por canal (nekt_meta26_metas via service role key)
      (() => {
        const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const srvClient = srvKey
          ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, srvKey)
          : supabase;
        const metaDateStr = `01/${String(month + 1).padStart(2, "0")}/${year}`;
        return srvClient
          .from("nekt_meta26_metas")
          .select("won_szs_meta, won_szs_meta_pago, won_szs_meta_direto, won_szs_meta_parceiro, won_szs_meta_spot, won_szs_meta_exp")
          .eq("data", metaDateStr)
          .single();
      })(),
    ]);

    // --- Taxa de conversão por etapa (90d) ---
    const reachedStage: Record<number, number> = {};
    const wonFromStage: Record<number, number> = {};
    for (const so of ALL_STAGES) { reachedStage[so] = 0; wonFromStage[so] = 0; }

    for (const d of hist90d) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const maxSO = d.max_stage_order || d.stage_order || 1;
      for (const so of ALL_STAGES) {
        if (maxSO >= so) {
          reachedStage[so]++;
          if (d.status === "won") wonFromStage[so]++;
        }
      }
    }

    const convRate: Record<number, number> = {};
    for (const so of ALL_STAGES) {
      convRate[so] = reachedStage[so] > 0 ? wonFromStage[so] / reachedStage[so] : 0;
    }

    // --- Leadtime médio por etapa ---
    const leadtimeSums: Record<number, number> = {};
    const leadtimeCounts: Record<number, number> = {};
    for (const so of ALL_STAGES) { leadtimeSums[so] = 0; leadtimeCounts[so] = 0; }

    for (const d of won90d) {
      if (!d.add_time || !d.won_time) continue;
      const cycleDays = (new Date(d.won_time).getTime() - new Date(d.add_time).getTime()) / (1000 * 60 * 60 * 24);
      if (cycleDays <= 0) continue;
      const maxSO = d.max_stage_order || 12;
      for (const so of ALL_STAGES) {
        if (maxSO >= so) {
          const remainingDays = cycleDays * (12 - so) / 11;
          leadtimeSums[so] += Math.max(0, remainingDays);
          leadtimeCounts[so]++;
        }
      }
    }

    const leadtimeByStage: Record<number, number> = {};
    for (const so of ALL_STAGES) {
      leadtimeByStage[so] = leadtimeCounts[so] > 0 ? Math.round(leadtimeSums[so] / leadtimeCounts[so]) : 0;
    }

    // --- Deals abertos por etapa ---
    const openByStage: Record<number, number> = {};
    const openByStageCanal: Record<number, Record<string, number>> = {};
    for (const d of openDeals) {
      const so = d.stage_order || 1;
      openByStage[so] = (openByStage[so] || 0) + 1;
      const canalName = getCanalGroupFromId(String(d.canal));
      if (!openByStageCanal[so]) openByStageCanal[so] = {};
      openByStageCanal[so][canalName] = (openByStageCanal[so][canalName] || 0) + 1;
    }

    // --- Stage snapshots ---
    const stages: ForecastStageSnapshot[] = ALL_STAGES.map((so) => {
      const deals = openByStage[so] || 0;
      const rate = convRate[so] || 0;
      const canalCounts = openByStageCanal[so] || {};
      const breakdown: ForecastStageBreakdown[] = Object.entries(canalCounts)
        .map(([name, count]) => ({
          name,
          openDeals: count,
          expectedWon: Math.round(count * rate * 10) / 10,
        }))
        .sort((a, b) => b.openDeals - a.openDeals);
      return {
        stage: STAGE_NAMES[so] || `Stage ${so}`,
        stageOrder: so,
        openDeals: deals,
        convRate: rate,
        leadtimeDays: leadtimeByStage[so] || 0,
        expectedWon: Math.round(deals * rate * 10) / 10,
        breakdown,
      };
    });

    // --- Open / Won deals: Marketing-only subsets para cards/ranges (não para squad/closer table) ---
    const isMarketing = (canal: unknown) => canal === "Marketing" || canal === "12";
    const openDealsMarketing = openDeals.filter((d) => isMarketing(d.canal));
    const wonThisMonthMarketing = wonThisMonth.filter((d) => isMarketing(d.canal));

    // Pipeline esperado MARKETING (cards) — apenas canal Marketing × convRate
    let totalPipelineMarketing = 0;
    for (const d of openDealsMarketing) {
      const so = d.stage_order || 1;
      totalPipelineMarketing += convRate[so] || 0;
    }
    totalPipelineMarketing = Math.round(totalPipelineMarketing * 10) / 10;
    const totalWonMarketing = wonThisMonthMarketing.length;

    // --- WON do mês por squad (TODOS os canais — alimenta tabela Forecast por Squad/Closer) ---
    const wonBySquad: Record<number, number> = {};
    for (const d of wonThisMonth) {
      const sqId = getSquadIdFromDeal(d.canal, d.canal_de_origem, d.rd_source);
      wonBySquad[sqId] = (wonBySquad[sqId] || 0) + 1;
    }
    const totalWonActual = wonThisMonth.length;

    // --- Pipeline por squad + canal ---
    const pipelineBySquad: Record<number, number> = {};
    const openBySquadStage: Record<number, Record<number, number>> = {};
    const wonByCanal: Record<string, number> = {};
    const pipelineByCanal: Record<string, number> = {};
    for (const d of openDeals) {
      const sqId = getSquadIdFromDeal(d.canal, d.canal_de_origem, d.rd_source);
      const canalKey = `${sqId}|${getCanalGroupFromId(d.canal)}`;
      const so = d.stage_order || 1;
      pipelineBySquad[sqId] = (pipelineBySquad[sqId] || 0) + (convRate[so] || 0);
      pipelineByCanal[canalKey] = (pipelineByCanal[canalKey] || 0) + (convRate[so] || 0);
      if (!openBySquadStage[sqId]) openBySquadStage[sqId] = {};
      openBySquadStage[sqId][so] = (openBySquadStage[sqId][so] || 0) + 1;
    }
    for (const d of wonThisMonth) {
      const sqId = getSquadIdFromDeal(d.canal, d.canal_de_origem, d.rd_source);
      const canalKey = `${sqId}|${getCanalGroupFromId(d.canal)}`;
      wonByCanal[canalKey] = (wonByCanal[canalKey] || 0) + 1;
    }

    // --- Meta WON por squad (from nekt_meta26_metas, consolidated) ---
    const metaBySquad: Record<number, number> = {};
    const nektMeta = metasRows.data;
    if (nektMeta) {
      for (const [sqIdStr, fields] of Object.entries(META_FIELDS_BY_SQUAD)) {
        const sqId = Number(sqIdStr);
        metaBySquad[sqId] = fields.reduce(
          (sum, field) => sum + (Number(nektMeta[field as keyof typeof nektMeta]) || 0),
          0,
        );
      }
    }
    // Fallback: if nekt_meta26_metas unavailable, use hardcoded SZS_METAS_WON_BY_SQUAD
    if (!nektMeta && SZS_METAS_WON_BY_SQUAD[mesStr]) {
      const fallback = SZS_METAS_WON_BY_SQUAD[mesStr];
      for (const sqId of [1, 2, 3]) {
        metaBySquad[sqId] = fallback[sqId] || 0;
      }
    }

    // --- Squad rows (iterate over mc.squads — 3 items) ---
    const squadsResult: ForecastSquadRow[] = mc.squads
      .filter((sq) => {
        const sqId = sq.id;
        return (wonBySquad[sqId] || 0) > 0 || (pipelineBySquad[sqId] || 0) > 0 || (metaBySquad[sqId] || 0) > 0;
      })
      .map((sq) => {
        const sqId = sq.id;
        const wonActual = wonBySquad[sqId] || 0;
        const pipeline = pipelineBySquad[sqId] || 0;
        const total = wonActual + pipeline;
        const meta = metaBySquad[sqId] || 0;

        // Stage snapshot per squad
        const squadOpenByStage = openBySquadStage[sqId] || {};
        const squadStages: ForecastStageSnapshot[] = ALL_STAGES.map((so) => {
          const deals = squadOpenByStage[so] || 0;
          const rate = convRate[so] || 0;
          return {
            stage: STAGE_NAMES[so] || `Stage ${so}`,
            stageOrder: so,
            openDeals: deals,
            convRate: rate,
            leadtimeDays: leadtimeByStage[so] || 0,
            expectedWon: Math.round(deals * rate * 10) / 10,
          };
        });

        // Build canal-level breakdown for this squad
        const canalRows: ForecastCloserRow[] = [];
        const seenCanals = new Set<string>();
        for (const key of [...Object.keys(wonByCanal), ...Object.keys(pipelineByCanal)]) {
          if (!key.startsWith(`${sqId}|`)) continue;
          const canalName = key.split("|")[1];
          if (seenCanals.has(canalName)) continue;
          seenCanals.add(canalName);
          const cWon = wonByCanal[key] || 0;
          const cPipeline = pipelineByCanal[key] || 0;
          const cTotal = cWon + cPipeline;
          canalRows.push({
            name: canalName,
            squadId: sqId,
            wonActual: cWon,
            pipeline: Math.round(cPipeline * 10) / 10,
            generation: 0,
            total: Math.round(cTotal * 10) / 10,
            meta: 0,
            pctMeta: 0,
          });
        }
        canalRows.sort((a, b) => b.total - a.total);

        return {
          id: sqId,
          name: getSquadName(sqId),
          closers: canalRows,
          wonActual,
          pipeline: Math.round(pipeline * 10) / 10,
          generation: 0,
          total: Math.round(total * 10) / 10,
          meta,
          pctMeta: meta > 0 ? Math.round((total / meta) * 100) : 0,
          stages: squadStages,
        };
      });

    // --- Grand total ---
    // Cards/range usam Marketing-only. Squad/Closer table mantém todos os canais (suaTotal pode divergir dos cards — esperado).
    const grandTotalMarketing = totalWonMarketing + totalPipelineMarketing;
    const grandMeta = Object.values(metaBySquad).reduce((s, v) => s + v, 0);

    const result: ForecastData = {
      month: mesStr,
      diasPassados,
      diasRestantes,
      diasNoMes,
      wonActual: totalWonMarketing,
      pipeline: Math.round(totalPipelineMarketing * 10) / 10,
      generation: 0,
      total: Math.round(grandTotalMarketing * 10) / 10,
      meta: grandMeta,
      pctMeta: grandMeta > 0 ? Math.round((grandTotalMarketing / grandMeta) * 100) : 0,
      ranges: {
        pessimista: Math.round((totalWonMarketing + totalPipelineMarketing * 0.7) * 10) / 10,
        esperado: Math.round(grandTotalMarketing * 10) / 10,
        otimista: Math.round((totalWonMarketing + totalPipelineMarketing * 1.3) * 10) / 10,
      },
      stages,
      squads: squadsResult,
      marketingOpenDeals: openDealsMarketing.length,
      metodologia: `Cards (Já Ganhos, Pipeline Esperado, Forecast Total, Range): apenas canal Marketing. Pipeline por Etapa: TODOS os canais com breakdown ao clicar. Tabela Forecast por Squad/Closer: TODOS os canais (Marketing/Parceiros/Outros) — pode divergir dos cards. Taxa de conversão por etapa calculada com base nos últimos 90 dias. Meta por squad: nekt_meta26_metas (consolidada por squad). totalWonActual=${totalWonActual} (todos canais).`,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("SZS Forecast error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
