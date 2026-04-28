import { NextResponse } from "next/server";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { V_COLS, SQUAD_V_MAP } from "@/lib/constants";
import type { DiagVendasData, DiagVendasDealRow, DiagVendasCloserSummary, VendasSeveridade } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_NAMES: Record<number, string> = {
  1: "FUP Parceiro",
  2: "Lead in",
  3: "Contatados",
  4: "Qualificação",
  5: "Qualificado",
  6: "Aguardando data",
  7: "Agendado",
  8: "No Show/Reagendamento",
  9: "Reunião/OPP",
  10: "FUP",
  11: "Negociação",
  12: "Fila de espera",
  13: "Reservas",
  14: "Contrato",
};

function getSeveridade(hours: number): VendasSeveridade {
  // Calendar-day precision: 48h+ = 2+ dias sem atividade, 24h = 1 dia
  if (hours >= 48) return "CRITICO";
  if (hours >= 24) return "ALERTA";
  return "OK";
}

function getSquadId(closerName: string): number {
  for (const [sqId, indices] of Object.entries(SQUAD_V_MAP)) {
    for (const idx of indices) {
      if (V_COLS[idx] === closerName) return Number(sqId);
    }
  }
  return 0;
}

export async function GET() {
  try {
    const now = new Date();

    // Paginate squad_deals WHERE status = 'open'
    const allRows: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 1000;

    while (true) {
      const admin = createSquadSupabaseAdmin();
      const { data, error } = await admin
        .from("squad_deals")
        .select("deal_id, title, owner_name, empreendimento, stage_order, last_activity_date, next_activity_date, add_time, lost_reason")
        .eq("status", "open")
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw new Error(`Supabase error: ${error.message}`);
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Filter to closers only, exclude Agendado (7) and No Show/Reagendamento (8)
    const closerSet = new Set(V_COLS);
    const closerDeals = allRows.filter((d) => closerSet.has(d.owner_name) && d.stage_order !== 7 && d.stage_order !== 8 && d.lost_reason !== "Duplicado/Erro");

    // Calculate leadtime and activity status for each deal
    const todayStr = now.toISOString().substring(0, 10);
    const deals: DiagVendasDealRow[] = closerDeals.map((d) => {
      const refDate = d.last_activity_date || d.add_time;
      let leadtimeHours = 0;
      if (refDate) {
        // last_activity_date is DATE only (no time) — count calendar days in BRT
        const dateOnly = refDate.substring(0, 10);
        const todayBRT = new Date(now.getTime() - 3 * 3600000); // UTC-3
        const todayDate = todayBRT.toISOString().substring(0, 10);
        const diffDays = Math.floor((new Date(todayDate + "T12:00:00Z").getTime() - new Date(dateOnly + "T12:00:00Z").getTime()) / 86400000);
        leadtimeHours = Math.max(0, diffDays * 24);
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

    // Group by closer — initialize all V_COLS so closers with 0 open deals still appear
    const byCloser = new Map<string, DiagVendasDealRow[]>();
    for (const name of V_COLS) byCloser.set(name, []);
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

    // Sort closers by avg leadtime DESC
    closers.sort((a, b) => b.avgLeadtimeHours - a.avgLeadtimeHours);

    // Totals
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
    console.error("Diagnostico vendas error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
