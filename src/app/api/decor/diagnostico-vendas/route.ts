// Decor (Decor) module
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { paginate } from "@/lib/paginate";
import { getModuleConfig } from "@/lib/modules";
import type { DiagVendasData, DiagVendasDealRow, DiagVendasCloserSummary, VendasSeveridade } from "@/lib/types";

const mc = getModuleConfig("decor");
const V_COLS = mc.closers;

export const dynamic = "force-dynamic";

// Pipeline 44: 12 stages (inspect-stages confirmed)
const STAGE_NAMES: Record<number, string> = {
  1: "Lead in", 2: "Contatados", 3: "Qualificação", 4: "Qualificado",
  5: "Aguardando data", 6: "Agendado", 7: "No show", 8: "Reunião Realizada",
  9: "FUP", 10: "Negociação", 11: "Ag. Dados", 12: "Contrato",
};

function getSeveridade(hours: number): VendasSeveridade {
  if (hours >= 24) return "CRITICO";
  if (hours >= 12) return "ALERTA";
  return "OK";
}

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

    const allRows = await paginate((o, ps) =>
      supabase
        .from("decor_deals")
        .select("deal_id, title, owner_name, empreendimento, stage_order, last_activity_date, next_activity_date, add_time, lost_reason")
        .eq("status", "open")
        .range(o, o + ps - 1),
    );

    // Filter to closers only, exclude Agendado (7) and No Show/Reagendamento (8)
    const closerSet = new Set(V_COLS);
    const closerDeals = allRows.filter((d) => closerSet.has(d.owner_name) && d.stage_order !== 7 && d.stage_order !== 8 && d.lost_reason !== "Duplicado/Erro");

    // Calculate leadtime and activity status for each deal
    const todayStr = now.toISOString().substring(0, 10);
    const deals: DiagVendasDealRow[] = closerDeals.map((d) => {
      const refDate = d.last_activity_date || d.add_time;
      let leadtimeHours = 0;
      if (refDate) {
        const ref = new Date(refDate);
        leadtimeHours = Math.max(0, (now.getTime() - ref.getTime()) / (1000 * 60 * 60));
      }
      const severidade = getSeveridade(leadtimeHours);
      const semAtividadeFutura = !d.next_activity_date;
      const atividadeAtrasada = !!d.next_activity_date && d.next_activity_date < todayStr;

      return {
        deal_id: d.deal_id,
        title: d.title || `Deal #${d.deal_id}`,
        owner_name: d.owner_name,
        empreendimento: d.empreendimento,
        stage_order: d.stage_order,
        stage_name: STAGE_NAMES[d.stage_order] || `Stage ${d.stage_order}`,
        last_activity_date: d.last_activity_date,
        next_activity_date: d.next_activity_date,
        leadtime_hours: Math.round(leadtimeHours),
        severidade,
        sem_atividade_futura: semAtividadeFutura,
        atividade_atrasada: atividadeAtrasada,
        link: `https://seazone-fd92b9.pipedrive.com/deal/${d.deal_id}`,
      };
    });

    // Sort by leadtime DESC
    deals.sort((a, b) => b.leadtime_hours - a.leadtime_hours);

    // Group by closer
    const byCloser = new Map<string, DiagVendasDealRow[]>();
    for (const deal of deals) {
      if (!byCloser.has(deal.owner_name)) byCloser.set(deal.owner_name, []);
      byCloser.get(deal.owner_name)!.push(deal);
    }

    const closers: DiagVendasCloserSummary[] = [];
    for (const [name, cDeals] of byCloser) {
      const leadtimes = cDeals.map((d) => d.leadtime_hours);
      const avg = leadtimes.length > 0 ? leadtimes.reduce((a, b) => a + b, 0) / leadtimes.length : 0;
      const max = leadtimes.length > 0 ? Math.max(...leadtimes) : 0;
      const criticos = cDeals.filter((d) => d.severidade === "CRITICO").length;
      const alertas = cDeals.filter((d) => d.severidade === "ALERTA").length;
      const ok = cDeals.filter((d) => d.severidade === "OK").length;

      closers.push({
        name,
        squadId: getSquadId(name),
        totalDeals: cDeals.length,
        avgLeadtimeHours: Math.round(avg),
        maxLeadtimeHours: Math.round(max),
        criticos,
        alertas,
        ok,
        semAtividadeFutura: cDeals.filter((d) => d.sem_atividade_futura).length,
        atividadeAtrasada: cDeals.filter((d) => d.atividade_atrasada).length,
        severidade: getSeveridade(avg),
      });
    }

    closers.sort((a, b) => b.avgLeadtimeHours - a.avgLeadtimeHours);

    const allLeadtimes = deals.map((d) => d.leadtime_hours);
    const totalAvg = allLeadtimes.length > 0 ? allLeadtimes.reduce((a, b) => a + b, 0) / allLeadtimes.length : 0;

    const result: DiagVendasData = {
      closers,
      deals,
      totals: {
        totalDeals: deals.length,
        avgLeadtimeHours: Math.round(totalAvg),
        criticos: deals.filter((d) => d.severidade === "CRITICO").length,
        alertas: deals.filter((d) => d.severidade === "ALERTA").length,
        ok: deals.filter((d) => d.severidade === "OK").length,
        semAtividadeFutura: deals.filter((d) => d.sem_atividade_futura).length,
        atividadeAtrasada: deals.filter((d) => d.atividade_atrasada).length,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Decor Diagnostico vendas error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
