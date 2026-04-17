import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin, hasServiceRole } from "@/lib/squad/supabase";
import { createAuthenticatedSupabaseAdmin } from "@/lib/supabase/server";
import { paginate } from "@/lib/paginate";
import { queryNekt } from "@/lib/nekt";
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

    // Nekt real-time open count (preferido sobre pdTotalOpen que é diário/stale)
    let nektTotalOpen = 0;
    try {
      const nektOpenResult = await queryNekt(`
        SELECT COUNT(*) as total
        FROM nekt_silver.pipedrive_deals_readable
        WHERE status = 'open' AND pipeline_id = 28
      `);
      nektTotalOpen = parseInt(String(nektOpenResult.rows[0]?.total || "0"));
      console.log(`[geral] Nekt total open pipeline 28: ${nektTotalOpen}`);
    } catch (e) {
      console.warn("[geral] Nekt indisponível para open count, usando pdTotalOpen:", e);
    }

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

    // stageByDay[channel][stage][dateIdx] — stock of open deals per stage bucket per day
    // MQL = stage_order 1-4 (Lead in, Contatados, Qualificação)
    // SQL = stage_order 5-8 (Qualificado onwards)
    // OPP = stage_order 9-12 (Reunião Realizada onwards, excl. Reserva/Contrato)
    // Reserva = stage_order 13, Contrato = stage_order 14
    // WON = deals won on that day (flow)
    const stageByDay: Record<string, Record<string, number[]>> = {};
    for (const ch of HIST_CHANNELS) {
      stageByDay[ch] = {
        mql: new Array(N).fill(0),
        sql: new Array(N).fill(0),
        opp: new Array(N).fill(0),
        reserva: new Array(N).fill(0),
        contrato: new Array(N).fill(0),
        won: new Array(N).fill(0),
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

      // Stage bucket stock: count open deals in their current stage bucket for each day
      const so = (d as any).stage_order ?? 0;
      const stageBucket = so >= TH_CONTRATO ? "contrato" : so >= TH_RESERVA ? "reserva" : so >= TH_OPP ? "opp" : so >= TH_SQL ? "sql" : "mql";

      if (d.status === "open") {
        for (let i = addIdx; i < N; i++) {
          for (const ch of targets) stageByDay[ch][stageBucket][i]++;
        }
      } else if (d.status === "won") {
        const wonDay = d.won_time?.substring(0, 10);
        if (wonDay) {
          const wonIdx = dateIndex.get(wonDay);
          if (wonIdx !== undefined) {
            for (const ch of targets) stageByDay[ch]["won"][wonIdx]++;
          }
        }
      }
    }

    // Build channelHistory: cumulative total (stock) + stage bucket stock per day
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
            mql: stageByDay[ch]["mql"][i],
            sql: stageByDay[ch]["sql"][i],
            opp: stageByDay[ch]["opp"][i],
            reserva: stageByDay[ch]["reserva"][i],
            contrato: stageByDay[ch]["contrato"][i],
            won: stageByDay[ch]["won"][i],
          },
        });
      }
      channelHistory[ch] = arr;
    }

    // Conta deals abertos no funil por canal — status=open, max_stage_order >= TH_MQL
    // Usa histDeals que já carregou todos os deals abertos (sem cutoff de data para status=open)
    const openByChannel: Record<string, number> = { Geral: 0, "Vendas Diretas": 0, Parceiros: 0 };
    for (const d of histDeals) {
      if (d.status !== "open") continue;
      if (d.lost_reason === "Duplicado/Erro") continue;
      const mso = (d as any).max_stage_order ?? (d as any).stage_order ?? 0;
      if (mso < TH_MQL) continue;
      const macro = getMacroChannel(d.canal);
      openByChannel["Geral"]++;
      if (macro === "Vendas Diretas") openByChannel["Vendas Diretas"]++;
      else if (macro === "Parceiros") openByChannel["Parceiros"]++;
    }

    // Sobrescreve o último ponto de cada canal com a contagem real de abertos
    // Para Geral, prefere pdTotalOpen (pipedrive_daily_snapshot) se disponível
    for (const ch of HIST_CHANNELS) {
      const arr = channelHistory[ch];
      if (!arr || arr.length === 0) continue;
      const last = arr[arr.length - 1];
      const geralOpen = nektTotalOpen > 0 ? nektTotalOpen : pdTotalOpen;
      const realOpen = ch === "Geral" && geralOpen > 0 ? geralOpen : openByChannel[ch];
      arr[arr.length - 1] = { ...last, total: realOpen, openTotal: realOpen };
    }

    // ── 8. Ocupação Agenda + No-Show ──
    // Agendadas = deals abertos no stage "Agendado" (187) do pipeline 28
    // Capacidade = nClosers × 16 slots/dia × 5 dias
    const { data: closerRules } = await admin.from("squad_closer_rules").select("email").eq("setor", "SZI");
    const CLOSER_EMAILS = (closerRules || []).map((r: { email: string }) => r.email);
    const MEETINGS_PER_DAY = 16;
    const WORK_DAYS = 5;
    const capacidade = CLOSER_EMAILS.length * MEETINGS_PER_DAY * WORK_DAYS;

    // Busca deals abertos no stage Agendado (187) via Nekt — dados em tempo real do Pipedrive
    const agendaByChannel: Record<string, number> = { Geral: 0, "Vendas Diretas": 0, Parceiros: 0 };
    try {
      const nektResult = await queryNekt(`
        SELECT *
        FROM nekt_silver.pipedrive_deals_readable
        WHERE status = 'open'
          AND pipeline_id = 28
          AND CAST(etapa AS INTEGER) = 187
      `);
      console.log(`[geral/agendados] Nekt rows: ${nektResult.rows.length}, columns: ${nektResult.columns.join(", ")}`);
      for (const r of nektResult.rows) {
        const canalId = String(r.canal_id ?? r.canal ?? "");
        const macro = getMacroChannel(canalId);
        agendaByChannel["Geral"]++;
        if (macro === "Parceiros") agendaByChannel["Parceiros"]++;
        else if (macro === "Vendas Diretas") agendaByChannel["Vendas Diretas"]++;
      }
    } catch (e) {
      console.warn("[geral] Nekt indisponível para agendados, usando squad_deals:", e);
      const agendadosDeals = await paginate((o, ps) =>
        admin.from("squad_deals").select("canal")
          .eq("status", "open").eq("stage_id", 187).range(o, o + ps - 1)
      );
      for (const d of agendadosDeals) {
        const macro = getMacroChannel(d.canal);
        agendaByChannel["Geral"]++;
        if (macro === "Parceiros") agendaByChannel["Parceiros"]++;
        else if (macro === "Vendas Diretas") agendaByChannel["Vendas Diretas"]++;
      }
    }
    console.log("[geral/agendados] agendaByChannel:", agendaByChannel);

    // No-Show: eventos cancelados nos últimos 7 dias via calendar
    const past7 = new Date(now); past7.setDate(past7.getDate() - 6);
    const past7Str = past7.toISOString().substring(0, 10);
    const noShowRows = CLOSER_EMAILS.length > 0
      ? await paginate((o, ps) =>
          admin.from("squad_calendar_events").select("cancelou")
            .in("closer_email", CLOSER_EMAILS).gte("dia", past7Str).lte("dia", today).range(o, o + ps - 1),
        )
      : [];
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
      const chAgendadas = agendaByChannel[name] ?? 0;
      result.noShow = { canceladas: noShowCanceladas, total: noShowTotal, percent: noShowPct };
      result.ocupacaoAgenda = { agendadas: chAgendadas, capacidade, percent: capacidade > 0 ? Math.round((chAgendadas / capacidade) * 1000) / 10 : 0 };

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
