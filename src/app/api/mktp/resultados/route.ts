import { NextResponse } from "next/server";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { paginate } from "@/lib/paginate";
import { queryNekt } from "@/lib/nekt";

/* ── Channel definitions ──────────────────────────────────── */
const CHANNEL_ORDER = ["Funil Completo", "Vendas Diretas", "Parcerias"] as const;
type MktpChannel = (typeof CHANNEL_ORDER)[number];

const CHANNEL_FILTERS: Record<MktpChannel, string> = {
  "Vendas Diretas": "canal NOT IN (582, 583, 2876) — todos os canais exceto parcerias",
  Parcerias: "canal IN (582, 583, 2876) — Indicação Corretor + Franquia + Outros Parceiros",
  "Funil Completo": "Todos os canais combinados",
};

const PARCERIA_CANAL_IDS = new Set(["582", "583", "2876"]);

function getCanalGroup(canal: string): "Vendas Diretas" | "Parcerias" {
  // Match by ID or by name (mktp_deals stores names from Nekt, not IDs)
  if (PARCERIA_CANAL_IDS.has(canal)) return "Parcerias";
  const lower = canal.toLowerCase();
  // Só Corretor, Franquia e Outros Parceiros são Parcerias (IDs 582, 583, 2876)
  // NÃO inclui Colaborador, Clientes, Embaixador, Hóspede (esses são VD)
  if (lower.includes("corretor") || lower.includes("franquia") || lower.includes("outros parceiros")) return "Parcerias";
  return "Vendas Diretas";
}

/* ── Stage IDs (pipeline 37) ─────────────────────────────── */
const STAGE_RESERVA = 305;
const STAGE_CONTRATO = 271;

/* ── Metas (preencher com valores reais) ─────────────────── */
interface ChannelMetas {
  orcamento?: number;
  leads?: number;
  mql: number;
  sql: number;
  opp: number;
  won: number;
  reserva?: number;
  contrato?: number;
}

const MKTP_RESULTADOS_METAS: Record<string, Record<string, ChannelMetas>> = {
  "2026-03": {
    "Vendas Diretas": { orcamento: 65000, leads: 3354, mql: 1677, sql: 530, opp: 126, won: 9 },
    Parcerias: { mql: 31, sql: 23, opp: 17, won: 6 },
    "Funil Completo": { leads: 3354, mql: 1677, sql: 530, opp: 126, won: 15, reserva: 25, contrato: 18 },
  },
  "2026-04": {
    "Vendas Diretas": { mql: 804, sql: 201, opp: 69, won: 10 },
    Parcerias: { mql: 20, sql: 16, opp: 14, won: 5 },
    "Funil Completo": { mql: 1707, sql: 406, opp: 128, won: 15 },
  },
};

/* ── Types ────────────────────────────────────────────────── */
interface MetricPair { real: number; meta: number }

interface ChannelResult {
  name: string;
  filterDescription: string;
  metrics: {
    orcamento?: MetricPair;
    leads?: MetricPair;
    mql: MetricPair;
    sql: MetricPair;
    opp: MetricPair;
    won: MetricPair;
    reserva?: MetricPair;
    contrato?: MetricPair;
  };
  lastMonthWon: number;
  snapshots: { aguardandoDados: number; emContrato: number };
  ocupacaoAgenda: { agendadas: number; capacidade: number; percent: number };
  noShow: { canceladas: number; total: number; percent: number };
  dealsHistory: { date: string; total: number; byStage: Record<string, number> }[];
}

interface ResultadosMKTPData {
  month: string;
  channels: ChannelResult[];
}

export const dynamic = "force-dynamic";

/* ── Extract date from timestamp (no timezone shift — Pipedrive dates are already local) ── */
function toDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return ts.substring(0, 10);
}

/* ── Tab → date column in mktp_deals ─────────────────────── */
const TAB_DATE_COL: Record<string, string> = {
  mql: "add_time",
  sql: "qualificacao_date",
  opp: "reuniao_date",
  won: "won_time",
};

const TABS = ["mql", "sql", "opp", "won"] as const;

export async function GET() {
  try {
    const admin = createSquadSupabaseAdmin();
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

    const DEAL_COLS = "deal_id, canal, status, stage_id, max_stage_order, add_time, won_time, lost_time, qualificacao_date, reuniao_date, lost_reason";

    /* ── 1. Fetch all deals from mktp_deals for current + previous month + 90d history ── */
    const allDeals = await paginate((o, ps) =>
      admin
        .from("mktp_deals")
        .select(DEAL_COLS)
        .gte("add_time", cutoffDate)
        .range(o, o + ps - 1)
    );

    // Also fetch won deals that may have add_time before cutoff but won_time in range
    const wonDeals = await paginate((o, ps) =>
      admin
        .from("mktp_deals")
        .select(DEAL_COLS)
        .eq("status", "won")
        .gte("won_time", prevStart)
        .lt("add_time", cutoffDate)
        .range(o, o + ps - 1)
    );

    // Merge, dedup by deal_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dealMap = new Map<number, any>();
    for (const d of allDeals) dealMap.set(d.deal_id, d);
    for (const d of wonDeals) dealMap.set(d.deal_id, d);
    const deals = Array.from(dealMap.values());

    /* ── 2. Count funnel by channel for current month ──────── */
    const channelCounts: Record<string, Record<string, number>> = {};
    for (const ch of CHANNEL_ORDER) channelCounts[ch] = {};

    for (const deal of deals) {
      if (deal.lost_reason && String(deal.lost_reason).toLowerCase() === "duplicado/erro") continue;
      const group = getCanalGroup(String(deal.canal || ""));
      for (const tab of TABS) {
        const dateCol = TAB_DATE_COL[tab];
        const day = toDate(deal[dateCol]);
        if (!day || day < startDate) continue; // only current month (BRT)
        channelCounts[group][tab] = (channelCounts[group][tab] || 0) + 1;
        channelCounts["Funil Completo"][tab] = (channelCounts["Funil Completo"][tab] || 0) + 1;
      }
    }

    /* ── 3. Previous month WON ─────────────────────────────── */
    const prevWon: Record<string, number> = {};
    for (const deal of deals) {
      if (deal.status !== "won") continue;
      const wonDate = toDate(deal.won_time);
      if (!wonDate || wonDate < prevStart || wonDate > prevEnd) continue;
      const group = getCanalGroup(String(deal.canal || ""));
      prevWon[group] = (prevWon[group] || 0) + 1;
      prevWon["Funil Completo"] = (prevWon["Funil Completo"] || 0) + 1;
    }

    /* ── 3b. Reserva/Contrato acumulado no mês (coorte de deals fechados) ── */
    // Deals fechados no mês (won ou lost) que passaram por Reserva (max_stage_order >= 12)
    // ou Contrato (max_stage_order >= 13). Exclui Duplicado/Erro em JS (neq exclui NULLs).
    const RESERVA_MIN_ORDER = 12;
    const CONTRATO_MIN_ORDER = 13;

    const funnelReserva: Record<string, number> = {};
    const funnelContrato: Record<string, number> = {};
    for (const ch of CHANNEL_ORDER) { funnelReserva[ch] = 0; funnelContrato[ch] = 0; }

    for (const deal of deals) {
      if (deal.lost_reason && String(deal.lost_reason).toLowerCase() === "duplicado/erro") continue;
      // Deal must have closed in current month (won or lost)
      const closeDate = deal.status === "won" ? toDate(deal.won_time) : toDate(deal.lost_time);
      const isOpen = deal.status === "open";
      // Include open deals too (they're currently in the funnel)
      if (!isOpen && (!closeDate || closeDate < startDate)) continue;

      const mso = deal.max_stage_order || 0;
      const group = getCanalGroup(String(deal.canal || ""));

      if (mso >= RESERVA_MIN_ORDER) {
        funnelReserva[group]++;
        funnelReserva["Funil Completo"]++;
      }
      if (mso >= CONTRATO_MIN_ORDER) {
        funnelContrato[group]++;
        funnelContrato["Funil Completo"]++;
      }
    }

    /* ── 4. Meta Ads spend (max por ad_id, soma = gasto real do mês) ── */
    const metaRows = await paginate((o, ps) =>
      admin.from("mktp_meta_ads").select("ad_id, spend_month").range(o, o + ps - 1)
    );

    /* ── 4a. Orçamento do mês de mktp_orcamento ── */
    const { data: orcData } = await admin
      .from("mktp_orcamento")
      .select("orcamento_total")
      .eq("mes", monthKey)
      .maybeSingle();
    let orcamentoMeta = Number(orcData?.orcamento_total) || 0;

    // Fallback 1: soma dos budgets aprovados por empreendimento
    if (!orcamentoMeta) {
      const { data: approvedRows } = await admin
        .from("mktp_orcamento_approved")
        .select("budget_recomendado")
        .eq("mes", monthKey);
      orcamentoMeta = (approvedRows || []).reduce((s: number, r: { budget_recomendado: unknown }) => s + (Number(r.budget_recomendado) || 0), 0);
    }
    // Fallback 2: mês mais recente disponível em mktp_orcamento
    if (!orcamentoMeta) {
      const { data: prevOrc } = await admin
        .from("mktp_orcamento")
        .select("orcamento_total")
        .lt("mes", monthKey)
        .order("mes", { ascending: false })
        .limit(1)
        .maybeSingle();
      orcamentoMeta = Number(prevOrc?.orcamento_total) || 0;
    }

    /* ── 4b. Metas do mês de mktp_metas (fallback para hardcoded se vazio) ── */
    const { data: mktpMetasRows } = await admin
      .from("mktp_metas").select("tab, meta").eq("month", `${monthKey}-01`);
    // Aggregate total metas by tab (mql, sql, opp, won, reserva, contrato)
    const totalMetasByTab: Record<string, number> = {};
    for (const r of mktpMetasRows || []) {
      totalMetasByTab[r.tab] = (totalMetasByTab[r.tab] || 0) + (Number(r.meta) || 0);
    }
    // If mktp_metas has data, use it to build metas per channel
    const totalWonMeta = totalMetasByTab.won || 0;
    const hasMetasData = Object.keys(totalMetasByTab).length > 0;
    const spendByAd = new Map<string, number>();
    for (const r of metaRows) {
      const adId = r.ad_id as string;
      const spend = r.spend_month || 0;
      spendByAd.set(adId, Math.max(spendByAd.get(adId) || 0, spend));
    }
    let totalSpend = 0;
    for (const v of spendByAd.values()) totalSpend += v;

    /* ── 5. Snapshots from pipedrive_daily_snapshot (pipeline 37) ── */
    const today = now.toISOString().substring(0, 10);

    const snapshots: Record<string, { reserva: number; contrato: number; totalOpen: number }> = {};
    for (const ch of CHANNEL_ORDER) snapshots[ch] = { reserva: 0, contrato: 0, totalOpen: 0 };

    // Try today's snapshot first, fallback to most recent
    const { data: pdSnap } = await admin
      .from("pipedrive_daily_snapshot")
      .select("date, total_open, by_stage")
      .eq("pipeline_id", 37)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Always fetch per-canal open deals for sub-channel cards (Vendas Diretas, Parcerias)
    const snapshotDeals = await paginate((o, ps) =>
      admin.from("mktp_deals").select("stage_id, canal").eq("status", "open").in("stage_id", [STAGE_RESERVA, STAGE_CONTRATO]).range(o, o + ps - 1)
    );
    for (const d of snapshotDeals) {
      const group = getCanalGroup(String(d.canal || ""));
      if (d.stage_id === STAGE_RESERVA) { snapshots[group].reserva++; snapshots["Funil Completo"].reserva++; }
      if (d.stage_id === STAGE_CONTRATO) { snapshots[group].contrato++; snapshots["Funil Completo"].contrato++; }
    }

    // totalOpen: pipedrive_daily_snapshot (OK para total, atualiza 1x/dia)
    if (pdSnap) {
      snapshots["Funil Completo"].totalOpen = pdSnap.total_open || 0;
      console.log(`[mktp/resultados] Using pipedrive_daily_snapshot from ${pdSnap.date}: totalOpen=${pdSnap.total_open}`);
    }

    // Reserva/Contrato do Funil Completo: Nekt real-time (evita stale do daily_snapshot)
    try {
      const nektMktp = await queryNekt(`
        SELECT CAST(etapa AS INTEGER) as stage_id, COUNT(*) as total
        FROM nekt_silver.pipedrive_deals_readable
        WHERE status = 'open' AND pipeline_id = 37 AND CAST(etapa AS INTEGER) IN (305, 271)
        GROUP BY CAST(etapa AS INTEGER)
      `);
      for (const r of nektMktp.rows) {
        const sid = parseInt(String(r.stage_id || "0"));
        const cnt = parseInt(String(r.total || "0"));
        if (sid === 305) snapshots["Funil Completo"].reserva = cnt;
        if (sid === 271) snapshots["Funil Completo"].contrato = cnt;
      }
      console.log(`[mktp/resultados] Nekt reserva=${snapshots["Funil Completo"].reserva} contrato=${snapshots["Funil Completo"].contrato}`);
    } catch (e) {
      console.warn("[mktp/resultados] Nekt indisponível, usando mktp_deals para reserva/contrato:", e);
    }

    /* ── 5b. Ocupação agenda — deals abertos no stage Agendado (284) do pipeline 37 ── */
    const { data: mktpCloserRules } = await admin
      .from("squad_closer_rules")
      .select("email")
      .eq("setor", "MKTP");
    const MKTP_CLOSER_COUNT = (mktpCloserRules || []).length;
    const MEETINGS_PER_DAY = 16;
    const WORK_DAYS = 5;
    const totalCapacity = MKTP_CLOSER_COUNT * MEETINGS_PER_DAY * WORK_DAYS;

    const STAGE_AGENDADO_MKTP = 284;
    const agendadosMktp = await paginate((o, ps) =>
      admin.from("mktp_deals").select("canal")
        .eq("status", "open").eq("stage_id", STAGE_AGENDADO_MKTP).range(o, o + ps - 1)
    );

    const agendaByChannelMktp: Record<string, number> = { "Funil Completo": 0, "Vendas Diretas": 0, Parcerias: 0 };
    for (const d of agendadosMktp) {
      const group = getCanalGroup(String(d.canal || ""));
      agendaByChannelMktp["Funil Completo"]++;
      if (group === "Parcerias") agendaByChannelMktp["Parcerias"]++;
      else agendaByChannelMktp["Vendas Diretas"]++;
    }

    const totalAgendadas = agendaByChannelMktp["Funil Completo"];
    const agendaPct = totalCapacity > 0 ? Math.round((totalAgendadas / totalCapacity) * 1000) / 10 : 0;

    /* ── 5c. No-show (últimos 7 dias de mktp_calendar_events) ── */
    const past7 = new Date(now);
    past7.setDate(past7.getDate() - 6);
    const past7Str = past7.toISOString().substring(0, 10);

    const noShowRows = await paginate((o, ps) =>
      admin
        .from("mktp_calendar_events")
        .select("cancelou")
        .gte("dia", past7Str)
        .lte("dia", today)
        .range(o, o + ps - 1)
    );

    const noShowTotal = noShowRows.length;
    const noShowCanceladas = noShowRows.filter((e: { cancelou: boolean | null }) => e.cancelou).length;
    const noShowPct = noShowTotal > 0 ? Math.round((noShowCanceladas / noShowTotal) * 1000) / 10 : 0;

    /* ── 6. History — cumulative open deals from mktp_deals (delta approach) ── */
    // Fetch deals active within the 90d window: open, or won/lost within window
    const histDeals = await paginate((o, ps) =>
      admin
        .from("mktp_deals")
        .select("canal, add_time, max_stage_order, status, won_time, lost_time, lost_reason")
        .not("add_time", "is", null)
        .or(`status.eq.open,won_time.gte.${cutoffDate},lost_time.gte.${cutoffDate}`)
        .range(o, o + ps - 1)
    );

    // Stage thresholds: MQL>=1, SQL>=5, OPP>=9, Reserva>=12, Contrato>=13
    const STAGES = ["mql", "sql", "opp", "reserva", "contrato"] as const;
    const STAGE_MIN: Record<string, number> = { mql: 1, sql: 5, opp: 9, reserva: 12, contrato: 13 };

    // Build date array for 90d window
    const allHistDates: string[] = [];
    for (let i = 90; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      allHistDates.push(d.toISOString().substring(0, 10));
    }
    const dateIndexMap = new Map<string, number>();
    for (let i = 0; i < allHistDates.length; i++) dateIndexMap.set(allHistDates[i], i);
    const histN = allHistDates.length;

    // delta[channel][key][dateIdx]
    const histDelta: Record<string, Record<string, number[]>> = {};
    for (const ch of CHANNEL_ORDER) {
      histDelta[ch] = {};
      histDelta[ch]["total"] = new Array(histN + 1).fill(0);
      for (const s of STAGES) histDelta[ch][s] = new Array(histN + 1).fill(0);
    }

    for (const d of histDeals) {
      if (d.lost_reason && String(d.lost_reason).toLowerCase() === "duplicado/erro") continue;
      const addDay = toDate(d.add_time) || "";
      const closeDay = d.status === "won" ? toDate(d.won_time) : d.status === "lost" ? toDate(d.lost_time) : null;
      const mso = d.max_stage_order || 0;
      const group = getCanalGroup(String(d.canal || ""));

      const addIdx = dateIndexMap.get(addDay) ?? (addDay < allHistDates[0] ? 0 : -1);
      if (addIdx < 0) continue;

      let closeIdx: number | null = null;
      if (closeDay) {
        const ci = dateIndexMap.get(closeDay);
        if (ci !== undefined) closeIdx = ci;
        else if (closeDay < allHistDates[0]) continue;
      }

      const targets = [group, "Funil Completo"] as const;
      for (const ch of targets) {
        histDelta[ch]["total"][addIdx]++;
        if (closeIdx !== null) histDelta[ch]["total"][closeIdx]--;
        for (const s of STAGES) {
          if (mso >= STAGE_MIN[s]) {
            histDelta[ch][s][addIdx]++;
            if (closeIdx !== null) histDelta[ch][s][closeIdx]--;
          }
        }
      }
    }

    // Build cumulative history per channel
    const cumulativeHist: Record<string, { date: string; total: number; byStage: Record<string, number> }[]> = {};
    for (const ch of CHANNEL_ORDER) {
      const arr: { date: string; total: number; byStage: Record<string, number> }[] = [];
      const cum: Record<string, number> = { total: 0 };
      for (const s of STAGES) cum[s] = 0;
      for (let i = 0; i < histN; i++) {
        cum.total += histDelta[ch]["total"][i];
        const byStage: Record<string, number> = {};
        for (const s of STAGES) {
          cum[s] += histDelta[ch][s][i];
          byStage[s] = cum[s];
        }
        arr.push({ date: allHistDates[i], total: cum.total, byStage });
      }
      cumulativeHist[ch] = arr;
    }

    // DON'T override with snapshot — use the live mktp_deals computed total (dealsHistory).
    // The snapshot total_open from pipedrive_daily_snapshot may be stale
    // (e.g. 414 from before a sync run), causing the chart to show wrong numbers
    // vs what Pipedrive shows live. The delta-based history is authoritative.

    /* ── 7. Build metas per channel ──────────────────────────── */
    // Use mktp_metas if available, otherwise fallback to hardcoded
    const legacyMetas = MKTP_RESULTADOS_METAS[monthKey] || {};
    const metas: Record<string, ChannelMetas> = {};

    if (hasMetasData) {
      // Derive channel metas from total using hardcoded ratios
      // Hardcoded won: Funil Completo=15, Vendas Diretas=9, Parcerias=6 (2026-03) → ~60%/40% split
      const wonTotal = legacyMetas["Funil Completo"]?.won || legacyMetas["Vendas Diretas"]?.won || totalWonMeta || 15;
      const wonRatioVD = wonTotal > 0 ? ((legacyMetas["Vendas Diretas"]?.won || 9) / wonTotal) : 0.6;
      const wonRatioP = wonTotal > 0 ? ((legacyMetas["Parcerias"]?.won || 6) / wonTotal) : 0.4;

      const mqlTotal = totalMetasByTab.mql || legacyMetas["Funil Completo"]?.mql || 1707;
      const sqlTotal = totalMetasByTab.sql || legacyMetas["Funil Completo"]?.sql || 406;
      const oppTotal = totalMetasByTab.opp || legacyMetas["Funil Completo"]?.opp || 128;
      const wonFromMeta = totalMetasByTab.won || legacyMetas["Funil Completo"]?.won || 15;

      metas["Funil Completo"] = {
        mql: mqlTotal, sql: sqlTotal, opp: oppTotal, won: wonFromMeta,
        reserva: totalMetasByTab.reserva || legacyMetas["Funil Completo"]?.reserva,
        contrato: totalMetasByTab.contrato || legacyMetas["Funil Completo"]?.contrato,
      };
      metas["Vendas Diretas"] = {
        mql: Math.round(mqlTotal * wonRatioVD), sql: Math.round(sqlTotal * wonRatioVD),
        opp: Math.round(oppTotal * wonRatioVD), won: Math.round(wonFromMeta * wonRatioVD),
      };
      metas["Parcerias"] = {
        mql: Math.round(mqlTotal * wonRatioP), sql: Math.round(sqlTotal * wonRatioP),
        opp: Math.round(oppTotal * wonRatioP), won: Math.round(wonFromMeta * wonRatioP),
      };
    } else {
      // Fallback to hardcoded table
      Object.assign(metas, legacyMetas);
    }

    const channels: ChannelResult[] = CHANNEL_ORDER.map((name) => {
      const counts = channelCounts[name] || {};
      const meta = metas[name] || { mql: 0, sql: 0, opp: 0, won: 0 };
      const snap = snapshots[name];

      const metrics: ChannelResult["metrics"] = {
        mql: { real: counts.mql || 0, meta: meta.mql },
        sql: { real: counts.sql || 0, meta: meta.sql },
        opp: { real: counts.opp || 0, meta: meta.opp },
        won: { real: counts.won || 0, meta: meta.won },
      };

      if (name === "Vendas Diretas") {
        metrics.orcamento = { real: Math.round(totalSpend), meta: orcamentoMeta || meta.orcamento || 0 };
      }
      if (meta.leads != null) {
        metrics.leads = { real: counts.mql || 0, meta: meta.leads };
      }
      if (meta.reserva != null) {
        metrics.reserva = { real: funnelReserva[name] || 0, meta: meta.reserva };
      }
      if (meta.contrato != null) {
        metrics.contrato = { real: funnelContrato[name] || 0, meta: meta.contrato };
      }

      const dealsHistory = cumulativeHist[name] || [];

      return {
        name,
        filterDescription: CHANNEL_FILTERS[name],
        metrics,
        lastMonthWon: prevWon[name] || 0,
        snapshots: {
          aguardandoDados: snap.reserva || 0,
          emContrato: snap.contrato || 0,
        },
        // Parcerias não tem reuniões — zera No-Show e Ocupação Agenda
        ocupacaoAgenda: name === "Parcerias" ? { agendadas: 0, capacidade: 0, percent: 0 } : { agendadas: agendaByChannelMktp[name] ?? 0, capacidade: totalCapacity, percent: totalCapacity > 0 ? Math.round(((agendaByChannelMktp[name] ?? 0) / totalCapacity) * 1000) / 10 : 0 },
        noShow: name === "Parcerias" ? { canceladas: 0, total: 0, percent: 0 } : { canceladas: noShowCanceladas, total: noShowTotal, percent: noShowPct },
        dealsHistory,
      };
    });

    const body: ResultadosMKTPData = { month: monthKey, channels };
    return NextResponse.json(body);
  } catch (err: unknown) {
    console.error("[mktp/resultados]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
