import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin, hasServiceRole } from "@/lib/squad/supabase";
import { createAuthenticatedSupabaseAdmin } from "@/lib/supabase/server";
import { paginate } from "@/lib/paginate";
import type { GeralData, GeralChannelResult, GeralMetricPair } from "@/lib/types";

export const dynamic = "force-dynamic";

// SZI channel classification
// Vendas Diretas = tudo que NÃO é indicação de parceiros, Expansão ou Spot
// canal in squad_deals has mixed values: names ("Marketing") and IDs ("582", "1748", etc.)
const CANAL_IDS_PARCEIROS = new Set(["582", "583", "2876"]);
const CANAL_IDS_EXPANSAO = new Set(["1748"]);
const CANAL_IDS_SPOT = new Set(["3189"]);

function getMacroChannel(canal: string | null): "Vendas Diretas" | "Parceiros" | "Expansao" | "Spot" {
  if (!canal) return "Vendas Diretas"; // null canal → sem canal → Vendas Diretas
  const lower = canal.toLowerCase();
  // Parceiros = Corretor (582), Franquia (583), Outros Parceiros (2876)
  // NÃO inclui Colaborador, Clientes, Embaixador, Hóspede (esses são VD)
  if (CANAL_IDS_PARCEIROS.has(canal) || lower.includes("corretor") || lower.includes("franquia") || lower.includes("outros parceiros")) return "Parceiros";
  if (CANAL_IDS_EXPANSAO.has(canal) || lower.includes("expans")) return "Expansao";
  if (CANAL_IDS_SPOT.has(canal) || lower.includes("spot")) return "Spot";
  return "Vendas Diretas"; // Marketing, Mônica, Colaborador, Clientes, e qualquer outro canal = Vendas Diretas
}

const CHANNEL_ORDER = ["Geral", "Vendas Diretas", "Parceiros"] as const;

// Stage thresholds for squad_deals.max_stage_order (SZI pipeline 28)
const TH_MQL = 1;
const TH_SQL = 5;
const TH_OPP = 9;
const TH_RESERVA = 13;
const TH_CONTRATO = 14;

// Hardcoded metas for March 2026
interface ChannelMetas {
  orcamento?: number;
  leads?: number;
  mql: number;
  sql: number;
  opp: number;
  reserva?: number;
  contrato?: number;
  won: number;
}

const METAS_BY_MONTH: Record<string, Record<string, ChannelMetas>> = {
  "2026-03": {
    "Vendas Diretas": { orcamento: 232389, leads: 9661, mql: 2839, sql: 921, opp: 228, won: 40 },
    Parceiros: { mql: 1348, sql: 524, opp: 260, won: 55 },
    Geral: { mql: 4187, sql: 1445, opp: 488, reserva: 217, contrato: 125, won: 95 },
  },
  "2026-04": {
    "Vendas Diretas": { leads: 4726, mql: 3953, sql: 966, opp: 236, won: 26 },
    Parceiros: { mql: 896, sql: 154, opp: 126, won: 38 },
    Geral: { mql: 4849, sql: 1120, opp: 362, won: 64 },
  },
};

function pair(real: number, meta: number): GeralMetricPair {
  return { real, meta };
}

export async function GET(req: NextRequest) {
  try {
    // Use authenticated client so that auth.jwt() is populated in RLS policies.
    // Falls back to createSquadSupabaseAdmin() if cookies aren't available (e.g. internal calls).
    let admin = createSquadSupabaseAdmin();
    try {
      admin = await createAuthenticatedSupabaseAdmin(req);
    } catch {
      // Fall through to fallback
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const startDate = `${monthKey}-01`;

    const prevDate = new Date(year, month - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevStart = `${prevKey}-01`;
    const prevEnd = `${prevKey}-${new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate()}`;

    const cutoff90 = new Date(now);
    cutoff90.setDate(cutoff90.getDate() - 90);
    const cutoffDate = cutoff90.toISOString().substring(0, 10);

    // ── 1. Funnel counts Geral from squad_deals (cada etapa pela data correta, todos os canais) ──
    const [geralMqlDeals, geralSqlDeals, geralOppDeals, geralWonDeals] = await Promise.all([
      // MQL: por add_time
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("canal, lost_reason")
          .gte("add_time", startDate)
          .range(o, o + ps - 1),
      ),
      // SQL: por qualificacao_date
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("canal, lost_reason")
          .gte("qualificacao_date", startDate)
          .range(o, o + ps - 1),
      ),
      // OPP: por reuniao_date
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("canal, lost_reason")
          .gte("reuniao_date", startDate)
          .range(o, o + ps - 1),
      ),
      // WON: por won_time
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("canal, lost_reason")
          .eq("status", "won")
          .gte("won_time", startDate)
          .range(o, o + ps - 1),
      ),
    ]);

    // Count by date AND by macro channel from the same deal sets
    // This ensures Geral = VD + Parceiros + Expansão + Spot (all date-based)
    function countByChannel(deals: { canal: string; lost_reason: string }[]): Record<string, number> {
      const counts: Record<string, number> = { Geral: 0, "Vendas Diretas": 0, Parceiros: 0 };
      for (const d of deals) {
        if (d.lost_reason === "Duplicado/Erro") continue;
        counts.Geral++;
        const macro = getMacroChannel(d.canal);
        if (macro === "Vendas Diretas") counts["Vendas Diretas"]++;
        else if (macro === "Parceiros") counts.Parceiros++;
        // Expansão e Spot só contam no Geral
      }
      return counts;
    }

    // Leads = todos os canais, sem Duplicado/Erro
    let totalLeadsAll = 0;
    for (const d of geralMqlDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      totalLeadsAll++;
    }

    // Count MQL/SQL/OPP/WON per channel (all date-based, consistent)
    const channelCounts: Record<string, Record<string, number>> = {};
    for (const ch of CHANNEL_ORDER) channelCounts[ch] = { mql: 0, sql: 0, opp: 0, won: 0, reserva: 0, contrato: 0 };

    if (hasServiceRole() && geralMqlDeals.length > 0) {
      const mqlByChannel = countByChannel(geralMqlDeals);
      const sqlByChannel = countByChannel(geralSqlDeals);
      const oppByChannel = countByChannel(geralOppDeals);
      const wonByChannel = countByChannel(geralWonDeals);
      for (const ch of CHANNEL_ORDER) {
        channelCounts[ch].mql = mqlByChannel[ch] || 0;
        channelCounts[ch].sql = sqlByChannel[ch] || 0;
        channelCounts[ch].opp = oppByChannel[ch] || 0;
        channelCounts[ch].won = wonByChannel[ch] || 0;
      }
    } else {
      // Fallback: squad_daily_counts (anon key) — only Geral, no channel split
      console.warn("[geral] Fallback to squad_daily_counts (no service role or empty squad_deals)");
      const countsRows = await paginate((o, ps) =>
        supabase.from("squad_daily_counts").select("tab, count").in("tab", ["mql", "sql", "opp", "won"]).gte("date", startDate).range(o, o + ps - 1),
      );
      for (const r of countsRows) channelCounts.Geral[r.tab] = (channelCounts.Geral[r.tab] || 0) + (r.count || 0);
      totalLeadsAll = channelCounts.Geral.mql;
    }
    console.log(`[geral] channelCounts Geral: mql=${channelCounts.Geral.mql}, sql=${channelCounts.Geral.sql}, opp=${channelCounts.Geral.opp}, won=${channelCounts.Geral.won}`);
    console.log(`[geral] channelCounts VD: mql=${channelCounts["Vendas Diretas"].mql}, sql=${channelCounts["Vendas Diretas"].sql}, opp=${channelCounts["Vendas Diretas"].opp}, won=${channelCounts["Vendas Diretas"].won}`);
    console.log(`[geral] channelCounts Parceiros: mql=${channelCounts.Parceiros.mql}, sql=${channelCounts.Parceiros.sql}, opp=${channelCounts.Parceiros.opp}, won=${channelCounts.Parceiros.won}`);

    // ── 2. Reserva/Contrato acumulado from squad_deals (stage-based, não date-based) ──
    const deals = await paginate((o, ps) =>
      admin
        .from("squad_deals")
        .select("canal, max_stage_order, stage_order, status, lost_reason, won_time")
        .not("empreendimento", "is", null)
        .or(`status.eq.open,won_time.gte.${startDate},lost_time.gte.${startDate},add_time.gte.${startDate}`)
        .range(o, o + ps - 1),
    );
    console.log(`[geral] squad_deals returned ${deals.length} deals (for reserva/contrato)`);

    for (const d of deals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const mso = d.max_stage_order ?? d.stage_order ?? 0;
      const macro = getMacroChannel(d.canal);
      // Reserva/Contrato acumulado (stage-based) — todos os canais no Geral
      if (mso >= TH_RESERVA) channelCounts.Geral.reserva++;
      if (mso >= TH_CONTRATO) channelCounts.Geral.contrato++;
      if (macro === "Parceiros") {
        if (mso >= TH_RESERVA) channelCounts.Parceiros.reserva++;
        if (mso >= TH_CONTRATO) channelCounts.Parceiros.contrato++;
      }
      if (macro === "Vendas Diretas") {
        if (mso >= TH_RESERVA) channelCounts["Vendas Diretas"].reserva++;
        if (mso >= TH_CONTRATO) channelCounts["Vendas Diretas"].contrato++;
      }
    }

    // ── 3. Previous month WON ──
    const prevRows = await paginate((o, ps) =>
      supabase
        .from("squad_daily_counts")
        .select("count")
        .eq("tab", "won")
        .gte("date", prevStart)
        .lte("date", prevEnd)
        .range(o, o + ps - 1),
    );
    const prevTotalWon = prevRows.reduce((s, r) => s + (r.count || 0), 0);

    // Per-channel previous won from squad_deals
    const prevDeals = await paginate((o, ps) =>
      admin
        .from("squad_deals")
        .select("canal, status")
        .eq("status", "won")
        .gte("won_time", prevStart)
        .lte("won_time", prevEnd)
        .range(o, o + ps - 1),
    );
    const prevWon: Record<string, number> = { "Vendas Diretas": 0, Parceiros: 0, Geral: prevTotalWon };
    for (const d of prevDeals) {
      const macro = getMacroChannel(d.canal);
      if (macro === "Vendas Diretas" || macro === "Parceiros") prevWon[macro]++;
    }

    // ── 4. Meta Ads spend + leads (Vendas Diretas only) ──
    const metaRows = await paginate((o, ps) =>
      supabase
        .from("squad_meta_ads")
        .select("ad_id, spend_month, leads_month")
        .gte("snapshot_date", startDate)
        .range(o, o + ps - 1),
    );
    const adMax = new Map<string, { spend: number; leads: number }>();
    for (const r of metaRows) {
      const spend = Number(r.spend_month) || 0;
      const leads = Number(r.leads_month) || 0;
      const cur = adMax.get(r.ad_id);
      if (!cur || spend > cur.spend) adMax.set(r.ad_id, { spend, leads });
    }
    let totalSpend = 0, totalLeads = 0;
    for (const v of adMax.values()) { totalSpend += v.spend; totalLeads += v.leads; }

    // ── 5. Orçamento ──
    const { data: orcData } = await supabase
      .from("squad_orcamento")
      .select("orcamento_total")
      .eq("mes", monthKey)
      .maybeSingle();
    const orcamentoMeta = orcData?.orcamento_total || 0;

    // ── 6. Pipedrive daily snapshot (from pipedrive_daily_snapshot table, updated 1x/day) ──
    const today = now.toISOString().substring(0, 10);
    const { data: pdSnapshot } = await admin
      .from("pipedrive_daily_snapshot")
      .select("total_open, by_stage")
      .eq("pipeline_id", 28)
      .eq("date", today)
      .maybeSingle();
    const pdTotalOpen = pdSnapshot?.total_open || 0;
    const pdByStage = (pdSnapshot?.by_stage || {}) as Record<string, number>;

    // Snapshots: Geral from daily snapshot, VD/Parceiros from squad_deals
    const snaps: Record<string, { reserva: number; contrato: number }> = {};
    for (const ch of CHANNEL_ORDER) snaps[ch] = { reserva: 0, contrato: 0 };
    snaps.Geral.reserva = pdByStage["191"] || 0;
    snaps.Geral.contrato = pdByStage["192"] || 0;

    const openStageDeals = await paginate((o, ps) =>
      admin.from("squad_deals").select("canal, stage_id").eq("status", "open").in("stage_id", [191, 192]).range(o, o + ps - 1),
    );
    for (const d of openStageDeals) {
      const macro = getMacroChannel(d.canal);
      if (macro === "Vendas Diretas") {
        if (d.stage_id === 191) snaps["Vendas Diretas"].reserva++;
        if (d.stage_id === 192) snaps["Vendas Diretas"].contrato++;
      } else if (macro === "Parceiros") {
        if (d.stage_id === 191) snaps.Parceiros.reserva++;
        if (d.stage_id === 192) snaps.Parceiros.contrato++;
      }
    }

    // ── 7. History — fetch open deals directly from Pipedrive for accurate "today" count ──
    // Then use squad_deals for historical snapshot (last 30 days)
    const cutoff30 = new Date(now);
    cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff30Str = cutoff30.toISOString().substring(0, 10);

    const histDeals = await paginate((o, ps) =>
      admin
        .from("squad_deals")
        .select("canal, max_stage_order, stage_order, status, lost_reason, add_time, won_time, lost_time, update_time, qualificacao_date, reuniao_date")
        .not("empreendimento", "is", null)
        .or(`status.eq.open,won_time.gte.${cutoff30Str},lost_time.gte.${cutoff30Str},qualificacao_date.gte.${cutoff30Str},reuniao_date.gte.${cutoff30Str}`)
        .range(o, o + ps - 1),
    );

    // Build date array for last 30 days
    const allHistDates: string[] = [];
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      allHistDates.push(d.toISOString().substring(0, 10));
    }
    const dateIndex = new Map<string, number>();
    for (let i = 0; i < allHistDates.length; i++) dateIndex.set(allHistDates[i], i);
    const N = allHistDates.length;

    const HIST_CHANNELS = ["Geral", "Vendas Diretas", "Parceiros"] as const;

    // delta[channel][dateIdx] — for total open deals (AreaChart)
    const delta: Record<string, number[]> = {};
    for (const ch of HIST_CHANNELS) delta[ch] = new Array(N + 1).fill(0);

    // dailyEvents[channel][stage][dateIdx] — event count per day per stage (MultiLineChart)
    // MQL uses add_time, SQL uses qualificacao_date, OPP uses reuniao_date
    const dailyEvents: Record<string, Record<string, number[]>> = {};
    for (const ch of HIST_CHANNELS) {
      dailyEvents[ch] = {
        mql: new Array(N).fill(0),
        sql: new Array(N).fill(0),
        opp: new Array(N).fill(0),
      };
    }

    for (const d of histDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const canal = (d.canal || "").toLowerCase();
      const macro = getMacroChannel(d.canal);
      const addDay = d.add_time?.substring(0, 10) || "";
      const closeDay = d.status === "won" ? d.won_time?.substring(0, 10)
        : d.status === "lost" ? (d.lost_time || d.update_time || d.add_time)?.substring(0, 10)
        : null;

      // Clamp addIdx to 0 if deal was created before the window
      const addIdx = dateIndex.get(addDay) ?? (addDay < allHistDates[0] ? 0 : -1);
      if (addIdx < 0) continue;

      let closeIdx: number | null = null;
      if (closeDay) {
        const ci = dateIndex.get(closeDay);
        if (ci !== undefined) closeIdx = ci;
        else if (closeDay < allHistDates[0]) continue; // closed before window — skip
      }

      const targets = (macro === "Vendas Diretas" || macro === "Parceiros") ? [macro, "Geral"] : ["Geral"];

      // Total open deals delta (for AreaChart)
      for (const ch of targets) {
        delta[ch][addIdx]++;
        if (closeIdx !== null) delta[ch][closeIdx]--;
      }

      // Daily events per stage using stage-specific dates
      // MQL: add_time (exclude indicação for Vendas Diretas)
      const mqlIdx = dateIndex.get(addDay);
      if (mqlIdx !== undefined) {
        for (const ch of targets) dailyEvents[ch]["mql"][mqlIdx]++;
      }

      // SQL: qualificacao_date
      const sqlDay = (d as any).qualificacao_date?.substring(0, 10);
      if (sqlDay) {
        const sqlIdx = dateIndex.get(sqlDay);
        if (sqlIdx !== undefined) {
          for (const ch of targets) dailyEvents[ch]["sql"][sqlIdx]++;
        }
      }

      // OPP: reuniao_date
      const oppDay = (d as any).reuniao_date?.substring(0, 10);
      if (oppDay) {
        const oppIdx = dateIndex.get(oppDay);
        if (oppIdx !== undefined) {
          for (const ch of targets) dailyEvents[ch]["opp"][oppIdx]++;
        }
      }
    }

    // Build channelHistory: cumulative total (stock) + daily events per stage (flow)
    const channelHistory: Record<string, { date: string; total: number; openTotal: number; byStage: Record<string, number> }[]> = {};
    for (const ch of HIST_CHANNELS) {
      const arr: { date: string; total: number; openTotal: number; byStage: Record<string, number> }[] = [];
      let cumTotal = 0;
      for (let i = 0; i < N; i++) {
        cumTotal += delta[ch][i];
        arr.push({
          date: allHistDates[i],
          total: cumTotal,
          openTotal: cumTotal,
          byStage: {
            mql: dailyEvents[ch]["mql"][i],
            sql: dailyEvents[ch]["sql"][i],
            opp: dailyEvents[ch]["opp"][i],
          },
        });
      }
      channelHistory[ch] = arr;
    }

    // Override Geral's last data point total with daily snapshot (accurate open count from Pipedrive)
    // byStage is NOT overridden — it shows today's daily events from squad_deals
    if (pdTotalOpen > 0) {
      const geralArr = channelHistory["Geral"];
      if (geralArr && geralArr.length > 0) {
        const last = geralArr[geralArr.length - 1];
        geralArr[geralArr.length - 1] = { ...last, total: pdTotalOpen, openTotal: pdTotalOpen };
      }
    }

    // ── 8. Ocupação Agenda + No-Show (calendar events, next 7 days / last 7 days) ──
    // Dynamic: read closer emails from squad_closer_rules
    const { data: closerRules } = await admin.from("squad_closer_rules").select("email").eq("setor", "SZI");
    const CLOSER_EMAILS = (closerRules || []).map((r: { email: string }) => r.email);
    const MEETINGS_PER_DAY = 16;
    const WORK_DAYS = 5;

    // Vendas Diretas: closers de V_COLS
    const { data: vdCloserRules } = await admin.from("squad_closer_rules").select("email").in("prefixo", ["Apresentação"]).eq("setor", "SZI");
    const VD_CLOSER_EMAILS = (vdCloserRules || []).map((r: { email: string }) => r.email);
    const VD_SLOTS_PER_DAY = 16;
    const next7 = new Date(now); next7.setDate(next7.getDate() + 6);
    const next7Str = next7.toISOString().substring(0, 10);
    const past7 = new Date(now); past7.setDate(past7.getDate() - 6);
    const past7Str = past7.toISOString().substring(0, 10);

    const [agendaRows, noShowRows] = await Promise.all([
      paginate((o, ps) =>
        admin.from("squad_calendar_events").select("closer_email").gte("dia", today).lte("dia", next7Str).eq("cancelou", false).range(o, o + ps - 1),
      ),
      paginate((o, ps) =>
        admin.from("squad_calendar_events").select("cancelou").gte("dia", past7Str).lte("dia", today).range(o, o + ps - 1),
      ),
    ]);

    const agendadas = agendaRows.filter((e: any) => CLOSER_EMAILS.includes(e.closer_email)).length;
    const capacidade = CLOSER_EMAILS.length * MEETINGS_PER_DAY * WORK_DAYS;
    const agendaPct = capacidade > 0 ? Math.round((agendadas / capacidade) * 1000) / 10 : 0;

    // Vendas Diretas ocupação
    const vdAgendadas = agendaRows.filter((e: any) => VD_CLOSER_EMAILS.includes(e.closer_email)).length;
    const vdCapacidade = VD_CLOSER_EMAILS.length * VD_SLOTS_PER_DAY * WORK_DAYS;
    const vdAgendaPct = vdCapacidade > 0 ? Math.round((vdAgendadas / vdCapacidade) * 1000) / 10 : 0;
    const noShowTotal = noShowRows.length;
    const noShowCanceladas = noShowRows.filter((e: any) => e.cancelou).length;
    const noShowPct = noShowTotal > 0 ? Math.round((noShowCanceladas / noShowTotal) * 1000) / 10 : 0;

    // ── Build channels ──
    const metas = METAS_BY_MONTH[monthKey] || {};

    const channels: GeralChannelResult[] = CHANNEL_ORDER.map((name) => {
      const counts = channelCounts[name];
      const meta = metas[name] || { mql: 0, sql: 0, opp: 0, won: 0 };
      const snap = snaps[name];

      const metrics: GeralChannelResult["metrics"] = {
        mql: pair(counts.mql, meta.mql),
        sql: pair(counts.sql, meta.sql),
        opp: pair(counts.opp, meta.opp),
        won: pair(counts.won, meta.won),
      };

      // Vendas Diretas: add orcamento + leads
      if (name === "Vendas Diretas") {
        metrics.orcamento = pair(Math.round(totalSpend), orcamentoMeta || meta.orcamento || 0);
        metrics.leads = pair(totalLeadsAll, meta.leads || 0);
      }

      // Geral: add reserva + contrato bars
      if (name === "Geral" && meta.reserva != null) {
        metrics.reserva = pair(counts.reserva, meta.reserva);
        metrics.contrato = pair(counts.contrato, meta.contrato || 0);
      }

      const result: GeralChannelResult = {
        name,
        filterDescription:
          name === "Vendas Diretas" ? "Deals do canal Marketing (canal 12). Orçamento = gasto Meta Ads do mês."
            : name === "Parceiros" ? "Deals de canais de parceiros (Ind. Corretor, Ind. Franquia, Outros Parceiros)."
              : "Todos os canais sem filtro. Reservas e contratos mostram acumulado no mês.",
        metrics,
        lastMonthWon: prevWon[name] || 0,
        dealsHistory: channelHistory[name] || [],
      };

      // All channels get snapshots
      result.snapshots = snap;
      result.noShow = { canceladas: noShowCanceladas, total: noShowTotal, percent: noShowPct };
      if (name === "Geral") {
        result.ocupacaoAgenda = { agendadas, capacidade, percent: agendaPct };
      }
      if (name === "Vendas Diretas") {
        result.ocupacaoAgenda = { agendadas: vdAgendadas, capacidade: vdCapacidade, percent: vdAgendaPct };
      }

      // Geral: reservaHistory (latest accumulated values)
      if (name === "Geral") {
        result.reservaHistory = [{ date: monthKey, reserva: channelCounts.Geral.reserva, contrato: channelCounts.Geral.contrato }];
      }

      return result;
    });

    return NextResponse.json({ month: monthKey, channels } as GeralData);
  } catch (err: unknown) {
    console.error("[geral] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
