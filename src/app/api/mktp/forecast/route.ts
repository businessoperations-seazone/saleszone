// MKTP (Marketplace) module
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getModuleConfig } from "@/lib/modules";
import type { ForecastData, ForecastStageSnapshot, ForecastCloserRow, ForecastSquadRow } from "@/lib/types";
import { paginate } from "@/lib/paginate";

const mc = getModuleConfig("mktp");
const V_COLS = mc.closers;

export const dynamic = "force-dynamic";

// MKTP pipeline (37) — 13 stages
const STAGE_NAMES: Record<number, string> = {
  1: "Lead In", 2: "Contatados", 3: "Qualificação", 4: "Qualificado",
  5: "Aguardando data", 6: "Reunião Agendada", 7: "No show", 8: "Reunião Realizada",
  9: "FUP", 10: "Negociação", 11: "Proposta Aprovada", 12: "Reserva", 13: "Contrato",
};

const ALL_STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const MAX_STAGE = 13;

function getSquadId(closerName: string): number {
  for (const [sqId, indices] of Object.entries(mc.squadCloserMap)) {
    for (const idx of indices) {
      if (V_COLS[idx] === closerName) return Number(sqId);
    }
  }
  return 0;
}

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

    // --- Queries paralelas ---
    const [openDeals, hist90d, won90d, wonThisMonth, metasRows] = await Promise.all([
      paginate((o, ps) =>
        supabase
          .from("mktp_deals")
          .select("deal_id, stage_order, owner_name, empreendimento")
          .eq("status", "open")
          .not("empreendimento", "is", null)
          .range(o, o + ps - 1),
      ),
      paginate((o, ps) =>
        supabase
          .from("mktp_deals")
          .select("deal_id, status, stage_order, max_stage_order, lost_reason, add_time, won_time")
          .not("empreendimento", "is", null)
          .in("status", ["won", "lost"])
          .gte("add_time", d90Str)
          .range(o, o + ps - 1),
      ),
      paginate((o, ps) =>
        supabase
          .from("mktp_deals")
          .select("deal_id, add_time, won_time, max_stage_order")
          .eq("status", "won")
          .not("empreendimento", "is", null)
          .gte("won_time", d90Str)
          .range(o, o + ps - 1),
      ),
      paginate((o, ps) =>
        supabase
          .from("mktp_deals")
          .select("deal_id, owner_name, empreendimento")
          .eq("status", "won")
          .gte("won_time", mesInicio)
          .lt("won_time", mesFim)
          .range(o, o + ps - 1),
      ),
      supabase
        .from("mktp_metas")
        .select("squad_id, meta")
        .eq("month", mesInicio)
        .eq("tab", "won"),
    ]);

    // --- Taxa de conversão por etapa (90d) ---
    const reachedStage: Record<number, number> = {};
    const wonFromStage: Record<number, number> = {};
    for (const so of ALL_STAGES) {
      reachedStage[so] = 0;
      wonFromStage[so] = 0;
    }

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
      const maxSO = d.max_stage_order || MAX_STAGE;
      for (const so of ALL_STAGES) {
        if (maxSO >= so) {
          const remainingDays = cycleDays * (MAX_STAGE - so) / (MAX_STAGE - 1);
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
    for (const d of openDeals) {
      const so = d.stage_order || 1;
      openByStage[so] = (openByStage[so] || 0) + 1;
    }

    // --- Stage snapshots ---
    const stages: ForecastStageSnapshot[] = ALL_STAGES.map((so) => {
      const deals = openByStage[so] || 0;
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

    const totalPipeline = stages.reduce((s, st) => s + st.expectedWon, 0);

    // --- WON do mês por closer ---
    const wonByCloser: Record<string, number> = {};
    for (const d of wonThisMonth) {
      const owner = d.owner_name || "Sem dono";
      wonByCloser[owner] = (wonByCloser[owner] || 0) + 1;
    }
    const totalWonActual = wonThisMonth.length;

    // --- Pipeline por closer ---
    const pipelineByCloser: Record<string, number> = {};
    for (const d of openDeals) {
      const owner = d.owner_name || "Sem dono";
      const so = d.stage_order || 1;
      pipelineByCloser[owner] = (pipelineByCloser[owner] || 0) + (convRate[so] || 0);
    }

    // --- Meta WON do mês inteiro por squad ---
    const metaBySquad: Record<number, number> = {};
    for (const row of metasRows.data || []) {
      const metaToDate = Number(row.meta) || 0;
      const metaFullMonth = diasPassados > 0 ? Math.round(metaToDate / diasPassados * diasNoMes) : 0;
      metaBySquad[row.squad_id] = metaFullMonth;
    }

    // --- Closer rows ---
    const closerRows: ForecastCloserRow[] = V_COLS.map((name) => {
      const sqId = getSquadId(name);
      const wonActual = wonByCloser[name] || 0;
      const pipeline = pipelineByCloser[name] || 0;
      const total = wonActual + pipeline;
      const squadCloserCount = mc.squadCloserMap[sqId]?.length || 1;
      const meta = (metaBySquad[sqId] || 0) / squadCloserCount;

      return {
        name,
        squadId: sqId,
        wonActual,
        pipeline: Math.round(pipeline * 10) / 10,
        generation: 0,
        total: Math.round(total * 10) / 10,
        meta: Math.round(meta * 10) / 10,
        pctMeta: meta > 0 ? Math.round((total / meta) * 100) : 0,
      };
    });

    // Collect all empreendimentos from deal data for dynamic discovery
    const allDealEmps = new Set<string>();
    for (const d of openDeals) { if (d.empreendimento) allDealEmps.add(d.empreendimento); }
    for (const d of wonThisMonth) { if (d.empreendimento) allDealEmps.add(d.empreendimento); }

    // --- Squad rows ---
    const squadsResult: ForecastSquadRow[] = mc.squads.map((sq) => {
      const sqClosers = closerRows.filter((c) => c.squadId === sq.id);
      const wonActual = sqClosers.reduce((s, c) => s + c.wonActual, 0);
      const pipeline = sqClosers.reduce((s, c) => s + c.pipeline, 0);
      const total = sqClosers.reduce((s, c) => s + c.total, 0);
      const meta = metaBySquad[sq.id] || 0;

      const sqEmps = sq.empreendimentos.length > 0
        ? new Set(sq.empreendimentos as readonly string[])
        : allDealEmps;
      const sqOpenByStage: Record<number, number> = {};
      for (const d of openDeals) {
        if (sqEmps.has(d.empreendimento)) {
          const so = d.stage_order || 1;
          sqOpenByStage[so] = (sqOpenByStage[so] || 0) + 1;
        }
      }
      const sqStages: ForecastStageSnapshot[] = ALL_STAGES.map((so) => {
        const deals = sqOpenByStage[so] || 0;
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

      return {
        id: sq.id,
        name: sq.name,
        closers: sqClosers,
        wonActual,
        pipeline: Math.round(pipeline * 10) / 10,
        generation: 0,
        total: Math.round(total * 10) / 10,
        meta,
        pctMeta: meta > 0 ? Math.round((total / meta) * 100) : 0,
        stages: sqStages,
      };
    });

    // --- Grand total ---
    const grandTotal = totalWonActual + totalPipeline;
    const grandMeta = Object.values(metaBySquad).reduce((s, v) => s + v, 0);

    const result: ForecastData = {
      month: mesStr,
      diasPassados,
      diasRestantes,
      diasNoMes,
      wonActual: totalWonActual,
      pipeline: Math.round(totalPipeline * 10) / 10,
      generation: 0,
      total: Math.round(grandTotal * 10) / 10,
      meta: grandMeta,
      pctMeta: grandMeta > 0 ? Math.round((grandTotal / grandMeta) * 100) : 0,
      ranges: {
        pessimista: Math.round((totalWonActual + totalPipeline * 0.7) * 10) / 10,
        esperado: Math.round(grandTotal * 10) / 10,
        otimista: Math.round((totalWonActual + totalPipeline * 1.3) * 10) / 10,
      },
      stages,
      squads: squadsResult,
      metodologia: `Deals abertos filtrados por canal Marketing (is_marketing). Taxa de conversão por etapa calculada com base nos últimos 90 dias: de todos os deals que passaram pela etapa X (max_stage_order >= X), qual % virou WON. Forecast = WON já ganhos no mês + Σ(deals abertos por etapa × taxa conversão da etapa).`,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("MKTP Forecast error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
