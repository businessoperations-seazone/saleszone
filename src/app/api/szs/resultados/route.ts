import { NextRequest, NextResponse } from "next/server";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { paginate } from "@/lib/paginate";
import { getCidadeGroup, getSquadMetasFromNekt } from "@/lib/szs-utils";
import { getModuleConfig } from "@/lib/modules";
import { queryNekt } from "@/lib/nekt";

/* ── Macro-channel mapping ────────────────────────────────── */
const MACRO_CHANNELS: Record<string, string> = {
  Marketing: "Vendas Diretas",
  "Mônica": "Vendas Diretas",
  Spots: "Expansão",      // Spots vai para Expansão (não Vendas Diretas)
  Outros: "Vendas Diretas",
  Parceiros: "Parceiros",
  "Ind. Corretor": "Parceiros",
  "Ind. Franquia": "Parceiros",
  "Ind. Outros Parceiros": "Parceiros",
  "Expansão": "Expansão",
};

/* ── Canal group → macro channels (for counts aggregation) ── */
const CANAL_PARCEIROS = new Set(["Parceiros", "Ind. Corretor", "Ind. Franquia", "Ind. Outros Parceiros"]);
const CANAL_SPOTS = new Set(["Spots"]);
const CANAL_EXPANSAO = new Set(["Expansão"]);

function getChannelTabs(canalGroup: string): string[] {
  if (CANAL_PARCEIROS.has(canalGroup)) return ["Geral", "Parceiros"];
  if (CANAL_SPOTS.has(canalGroup))     return ["Geral", "Expansão"]; // Spots → Expansão (não Vendas Diretas)
  if (CANAL_EXPANSAO.has(canalGroup))  return ["Geral", "Expansão"];
  return ["Geral", "Vendas Diretas"];
}

/* ── Canal ID → group (for szs_deals which stores raw IDs) ── */
const CANAL_ID_TO_GROUP: Record<string, string> = {
  "12": "Marketing",
  "582": "Ind. Corretor",
  "583": "Ind. Franquia",
  "2876": "Ind. Outros Parceiros",
  "1748": "Expansão",
  "3189": "Spots",
  "4551": "Mônica",
};
function getCanalGroup(canalId: string): string {
  return CANAL_ID_TO_GROUP[canalId] || "Outros";
}

const CHANNEL_ORDER = ["Geral", "Vendas Diretas", "Parceiros", "Expansão"] as const;


const CHANNEL_FILTERS: Record<string, string> = {
  Geral: "Todos os canais\nExclui: Duplicado/Erro",
  "Vendas Diretas": "Inclui: Marketing, Mônica, Ind. Colaborador, Eventos, Ind. Clientes, Outros\nExclui: Expansão, Spots, Ind. Corretor, Ind. Franquia, Duplicado/Erro",
  Parceiros: "Inclui: Ind. Corretor, Ind. Franquia, Ind. Outros Parceiros\nExclui: Duplicado/Erro",
  "Expansão": "Inclui: Expansão, Spots\nExclui: Duplicado/Erro",
};

interface ChannelMetas {
  orcamento?: number;
  leads?: number;
  mql: number;
  sql: number;
  opp: number;
  won: number;
  agDados?: number;
  contrato?: number;
}

const SZS_RESULTADOS_METAS: Record<string, Record<string, ChannelMetas>> = {
  "2026-03": {
    Geral: { mql: 3143, sql: 1291, opp: 696, won: 266, agDados: 314, contrato: 314 },
    "Vendas Diretas": { orcamento: 76500, leads: 2500, mql: 1639, sql: 674, opp: 328, won: 98 },
    Parceiros: { mql: 249, sql: 154, opp: 140, won: 73 },
    "Expansão": { mql: 1832, sql: 566, opp: 216, won: 95 },
  },
  "2026-04": {
    Geral: { mql: 3521, sql: 1446, opp: 780, won: 298 },
    "Vendas Diretas": { mql: 1739, sql: 715, opp: 348, won: 104 },
    Parceiros: { mql: 256, sql: 158, opp: 144, won: 75 },
    "Expansão": { mql: 1967, sql: 608, opp: 232, won: 102 },
  },
};

/* ── Email → channel tabs (espelho do sync-szs-calendar, que usa emails hardcoded) ──
 * squad_closer_rules pode não ter todos os emails do calendário SZS.
 * Este mapa é a fonte de verdade para sub-canal; squad_closer_rules serve só de fallback.  */
const SZS_EMAIL_CHANNEL_MAP: Record<string, string[]> = {
  "gabriela.lemos@seazone.com.br":  ["Geral", "Vendas Diretas"],
  "gabriela.branco@seazone.com.br": ["Geral", "Parceiros"],
  "giovanna.araujo@seazone.com.br": ["Geral", "Expansão"],
};

const mc = getModuleConfig("szs");

/* ── Build email→tabs map: hardcoded primeiro, fallback por squad_closer_rules ── */
function closerNorm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function buildEmailChannelMap(rules: { email: string }[]): Record<string, string[]> {
  // Começa com o mapa hardcoded (garante VD/Parceiros/Expansão corretos)
  const map: Record<string, string[]> = { ...SZS_EMAIL_CHANNEL_MAP };
  // Adiciona emails de squad_closer_rules que não estão no mapa hardcoded
  for (const r of rules) {
    if (map[r.email]) continue; // já mapeado
    const prefix = r.email.split("@")[0].replace(".", " ");
    const pn = closerNorm(prefix);
    const matchedConfig = mc.closers.find((c) => {
      const cn = closerNorm(c);
      return cn.includes(pn) || pn.includes(cn.split(" ")[0]);
    });
    if (!matchedConfig) continue;
    const tabs = mc.closers.includes(matchedConfig)
      ? (matchedConfig === "Gabriela Branco" ? ["Geral", "Parceiros"]
        : matchedConfig === "Giovanna Zanchetta" ? ["Geral", "Expansão"]
        : ["Geral", "Vendas Diretas"])
      : ["Geral"];
    map[r.email] = tabs;
  }
  return map;
}

const MEETINGS_PER_DAY = 16;
const WORK_DAYS_PER_WEEK = 5;

const STAGE_AG_DADOS = 11;   // stage_id 152 → stage_order 11
const STAGE_CONTRATO = 12;   // stage_id 76  → stage_order 12

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
  };
  lastMonthWon: number;
  snapshots: {
    aguardandoDados: number; emContrato: number; totalOpen: number;
    agDadosAccum?: number; contratoAccum?: number;
    agDadosMeta?: number; contratoMeta?: number;
  };
  ocupacaoAgenda: { agendadas: number; capacidade: number; percent: number; closers: string[]; meetingsPerDay: number; workDays: number };
  noShow: { canceladas: number; total: number; percent: number };
  dealsHistory: { date: string; total: number; openTotal: number; byStage: Record<string, number> }[];
}

interface ResultadosSZSData {
  month: string;
  channels: ChannelResult[];
  diagnostic?: {
    source: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const cityParam = request.nextUrl.searchParams.get("city");
    const cityFilter: string | null =
      cityParam === "sao-paulo" ? "São Paulo"
        : cityParam === "salvador" ? "Salvador"
          : cityParam === "florianopolis" ? "Florianópolis"
            : cityParam === "outros" ? "Outros"
              : null;

    const admin = createSquadSupabaseAdmin();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const startDate = `${monthKey}-01`;

    // ── Fetch active closer emails from squad_closer_rules (same logic as szs/ociosidade) ──
    const { data: closerRules } = await admin
      .from("squad_closer_rules")
      .select("email")
      .in("setor", ["SZS", "Expansao"]);
    const closerEmailChannelMap = buildEmailChannelMap(closerRules || []);
    const activeCloserEmails = Object.keys(closerEmailChannelMap);
    // Build per-channel closer counts for capacity calculation
    const channelCloserCount: Record<string, number> = { Geral: 0, "Vendas Diretas": 0, Parceiros: 0, "Expansão": 0 };
    for (const tabs of Object.values(closerEmailChannelMap)) {
      for (const tab of tabs) channelCloserCount[tab] = (channelCloserCount[tab] || 0) + 1;
    }

    const prevDate = new Date(year, month - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevStart = `${prevKey}-01`;
    const prevEnd = `${prevKey}-${new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate()}`;

    const cutoff90 = new Date(now);
    cutoff90.setDate(cutoff90.getDate() - 90);
    const cutoffDate = cutoff90.toISOString().substring(0, 10);

    // MQL/SQL/OPP/WON/Reserva/Contrato de szs_daily_counts (fonte única, todos os canais)
    // szs_deals é incompleto (exclui Parceiros e Expansão), então sempre usa daily_counts
    const allCounts = await paginate((o, ps) =>
      admin.from("szs_daily_counts").select("date, tab, canal_group, empreendimento, count")
        .gte("date", startDate).in("tab", ["mql", "sql", "opp", "won", "reserva", "contrato"]).range(o, o + ps - 1)
    );
    console.log(`[szs-resultados] szs_daily_counts: ${allCounts.length} rows for month`);

    const channelCounts: Record<string, Record<string, number>> = {};
    for (const ch of CHANNEL_ORDER) channelCounts[ch] = {};

    for (const r of allCounts) {
      if (cityFilter && getCidadeGroup(r.empreendimento || "") !== cityFilter) continue;
      const tabs = getChannelTabs(r.canal_group || "Outros");
      for (const tab of tabs) {
        channelCounts[tab][r.tab] = (channelCounts[tab][r.tab] || 0) + (r.count || 0);
      }
    }

    // Last month WON from szs_deals (more complete than daily_counts)
    const prevWonRows = await paginate((o, ps) =>
      admin.from("szs_deals").select("canal, lost_reason, empreendimento").eq("status", "won").gte("won_time", prevStart).lt("won_time", startDate).range(o, o + ps - 1)
    );
    const prevWon: Record<string, number> = {};
    for (const ch of CHANNEL_ORDER) prevWon[ch] = 0;
    for (const d of prevWonRows) {
      if (d.lost_reason && String(d.lost_reason).toLowerCase() === "duplicado/erro") continue;
      if (cityFilter && getCidadeGroup(d.empreendimento || "") !== cityFilter) continue;
      const canalGroup = getCanalGroup(String(d.canal || ""));
      const tabs = getChannelTabs(canalGroup);
      for (const tab of tabs) prevWon[tab] = (prevWon[tab] || 0) + 1;
    }

    const metaRows = await paginate((o, ps) =>
      admin.from("szs_meta_ads").select("ad_id, spend_month").gte("snapshot_date", startDate).range(o, o + ps - 1)
    );

    // ── Orçamento do mês de szs_orcamento ──
    const { data: orcData } = await admin
      .from("szs_orcamento")
      .select("orcamento_total")
      .eq("mes", monthKey)
      .maybeSingle();
    let orcamentoMeta = Number(orcData?.orcamento_total) || 0;

    // Fallback 1: soma dos budgets aprovados por empreendimento
    if (!orcamentoMeta) {
      const { data: approvedRows } = await admin
        .from("szs_orcamento_approved")
        .select("budget_recomendado")
        .eq("mes", monthKey);
      orcamentoMeta = (approvedRows || []).reduce((s: number, r: { budget_recomendado: unknown }) => s + (Number(r.budget_recomendado) || 0), 0);
    }
    // Fallback 2: mês mais recente disponível em szs_orcamento
    if (!orcamentoMeta) {
      const { data: prevOrc } = await admin
        .from("szs_orcamento")
        .select("orcamento_total")
        .lt("mes", monthKey)
        .order("mes", { ascending: false })
        .limit(1)
        .maybeSingle();
      orcamentoMeta = Number(prevOrc?.orcamento_total) || 0;
    }
    // Dedup: max spend_month per ad_id (multiple snapshots in the month)
    const adSpend = new Map<string, number>();
    for (const r of metaRows) {
      const spend = Number(r.spend_month) || 0;
      const cur = adSpend.get(r.ad_id) || 0;
      if (spend > cur) adSpend.set(r.ad_id, spend);
    }
    let totalSpend = 0;
    for (const v of adSpend.values()) totalSpend += v;

    // Snapshots from pipedrive_daily_snapshot (pipeline 14)
    const todayStr = now.toISOString().substring(0, 10);

    const snapshots: Record<string, { agDados: number; contrato: number; totalOpen: number }> = {};
    for (const ch of CHANNEL_ORDER) snapshots[ch] = { agDados: 0, contrato: 0, totalOpen: 0 };

    // Busca snapshot mais recente (não só de hoje — sync pode não ter rodado)
    const { data: pdSnap } = await admin
      .from("pipedrive_daily_snapshot")
      .select("date, total_open, by_stage")
      .eq("pipeline_id", 14)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Ag.Dados (stage 152) e Em Contrato (stage 76) por sub-canal via Nekt + owner_name
    // Canal pode estar null para muitos deals → classificação por canal é instável.
    // Owner_name (quem é responsável pelo deal) é a fonte correta para separar
    // VD (Gabi Lemos) / Parceiros (Gabi Branco) / Expansão (Giovanna Araujo).
    // Geral = total de todos os deals, independente do owner.
    // Ag.Dados (stage 152) e Em Contrato (stage 76) via Nekt
    {
      try {
        const nektSnaps = await queryNekt(`
          SELECT etapa, canal, deal_owner_name
          FROM nekt_silver.pipedrive_deals_readable
          WHERE status = 'open' AND pipeline_id = 14 AND CAST(etapa AS INTEGER) IN (152, 76)
        `);


        for (const ch of CHANNEL_ORDER) {
          snapshots[ch].agDados = 0;
          snapshots[ch].contrato = 0;
        }

        // Ambos os stages: classificar por canal do Nekt
        // ATENÇÃO: Nekt retorna nomes completos, não abreviações
        // Ex: "Indicação de Corretor" (não "Ind. Corretor"), "Indicaçao de Franquia" (typo sem acento)
        const NEKT_CANAL_NAME_TO_GROUP: Record<string, string> = {
          // VD
          "Marketing": "Marketing",
          "Mônica": "Mônica",
          "Monica": "Mônica",
          // Parceiros — nomes completos conforme Nekt
          "Parceiros": "Parceiros",
          "Indicação de Corretor": "Ind. Corretor",
          "Indicacao de Corretor": "Ind. Corretor",
          "Ind. Corretor": "Ind. Corretor",
          "Indicação de Franquia": "Ind. Franquia",
          "Indicaçao de Franquia": "Ind. Franquia",
          "Indicacao de Franquia": "Ind. Franquia",
          "Ind. Franquia": "Ind. Franquia",
          "Indicação de Outros Parceiros": "Ind. Outros Parceiros",
          "Ind. Outros Parceiros": "Ind. Outros Parceiros",
          // Expansão
          "Expansão": "Expansão",
          "Expansao": "Expansão",
          "Expansion": "Expansão",
          "Spots": "Spots",
        };


        for (const row of nektSnaps.rows) {
          const stageId = parseInt(String(row.etapa || "0"));
          const canalName = String(row.canal || "");
          const canalGroup = NEKT_CANAL_NAME_TO_GROUP[canalName] || "Outros";
          const tabs = getChannelTabs(canalGroup);
          for (const tab of tabs) {
            if (stageId === 152) snapshots[tab].agDados++;
            if (stageId === 76) snapshots[tab].contrato++;
          }
        }

        // Geral = total real (todos os deals)
        snapshots.Geral.agDados = nektSnaps.rows.filter(r => parseInt(String(r.etapa || "0")) === 152).length;
        snapshots.Geral.contrato = nektSnaps.rows.filter(r => parseInt(String(r.etapa || "0")) === 76).length;
        console.log(`[szs-resultados] ag/contrato: Geral=${snapshots.Geral.agDados}/${snapshots.Geral.contrato}, VD=${snapshots["Vendas Diretas"].agDados}/${snapshots["Vendas Diretas"].contrato}, Parc=${snapshots.Parceiros.agDados}/${snapshots.Parceiros.contrato}, Exp=${snapshots["Expansão"].agDados}/${snapshots["Expansão"].contrato}`);
      } catch (e) {
        console.warn("[szs-resultados] Nekt indisponível para ag/contrato, usando szs_open_snapshots:", e);
        const { data: latestRow } = await admin.from("szs_open_snapshots").select("date").order("date", { ascending: false }).limit(1).maybeSingle();
        const snapDate = latestRow?.date || todayStr;
        const { data: openSnaps } = await admin.from("szs_open_snapshots").select("canal_group, ag_dados, contrato").eq("date", snapDate);
        for (const s of openSnaps || []) {
          const tabs = getChannelTabs(s.canal_group || "");
          for (const tab of tabs) {
            snapshots[tab].agDados += s.ag_dados || 0;
            snapshots[tab].contrato += s.contrato || 0;
          }
        }
      }
    }

    // Total open: pipedrive_daily_snapshot (mais confiável) > szs_open_snapshots > delta approach
    if (pdSnap) {
      snapshots.Geral.totalOpen = pdSnap.total_open || 0;
      console.log(`[szs-resultados] Using pipedrive_daily_snapshot from ${pdSnap.date}: totalOpen=${pdSnap.total_open}`);
    } else {
      const snapRows = await paginate((o, ps) =>
        admin.from("szs_open_snapshots").select("*").eq("date", todayStr).range(o, o + ps - 1)
      );
      if (snapRows.length > 0) {
        for (const s of snapRows) {
          snapshots.Geral.totalOpen += s.total_open || 0;
        }
        console.log(`[szs-resultados] Using szs_open_snapshots (today): totalOpen=${snapshots.Geral.totalOpen}`);
      } else {
        console.warn("[szs-resultados] No pipedrive_daily_snapshot or szs_open_snapshots — chart will show delta-computed total (may be inaccurate)");
      }
    }

    // Build chart history from szs_deals (last 28 days) using delta/prefix-sum
    const cutoff28 = new Date(now);
    cutoff28.setDate(cutoff28.getDate() - 28);
    const cutoff28Str = cutoff28.toISOString().substring(0, 10);

    const histDeals = await paginate((o, ps) =>
      admin
        .from("szs_deals")
        .select("canal, max_stage_order, stage_order, status, lost_reason, add_time, won_time, lost_time, empreendimento")
        .or(`status.eq.open,won_time.gte.${cutoff28Str},lost_time.gte.${cutoff28Str}`)
        .range(o, o + ps - 1),
    );

    // Build date array for last 28 days
    const allHistDates: string[] = [];
    for (let i = 28; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      allHistDates.push(d.toISOString().substring(0, 10));
    }
    const dateIndexMap = new Map<string, number>();
    for (let i = 0; i < allHistDates.length; i++) dateIndexMap.set(allHistDates[i], i);
    const histN = allHistDates.length;

    // Stage thresholds for SZS
    const HIST_STAGES_SZS = ["mql", "sql", "opp"] as const;
    const HIST_STAGE_MIN_SZS: Record<string, number> = { mql: 1, sql: 4, opp: 9 };

    // delta[channel][stage][dateIdx]
    const histDelta: Record<string, Record<string, number[]>> = {};
    for (const ch of CHANNEL_ORDER) {
      histDelta[ch] = {};
      for (const s of HIST_STAGES_SZS) histDelta[ch][s] = new Array(histN + 1).fill(0);
      histDelta[ch]["total"] = new Array(histN + 1).fill(0);
    }

    for (const d of histDeals) {
      if (d.lost_reason && String(d.lost_reason).toLowerCase() === "duplicado/erro") continue;
      if (cityFilter && getCidadeGroup(d.empreendimento || "") !== cityFilter) continue;
      const canalGroup = getCanalGroup(String(d.canal || ""));
      const mso = d.max_stage_order || d.stage_order || 0;
      const addDay = d.add_time?.substring(0, 10) || "";
      const closeDay = d.status === "won" ? d.won_time?.substring(0, 10) : d.status === "lost" ? d.lost_time?.substring(0, 10) : null;

      let addIdx = dateIndexMap.get(addDay) ?? (addDay < allHistDates[0] ? 0 : -1);
      if (addIdx < 0) continue;

      let closeIdx: number | null = null;
      if (closeDay) {
        const ci = dateIndexMap.get(closeDay);
        if (ci !== undefined) closeIdx = ci;
        else if (closeDay < allHistDates[0]) continue;
      }

      const targets = getChannelTabs(canalGroup);
      for (const ch of targets) {
        if (!histDelta[ch]) continue;
        histDelta[ch]["total"][addIdx]++;
        if (closeIdx !== null) histDelta[ch]["total"][closeIdx]--;
        for (const s of HIST_STAGES_SZS) {
          if (mso >= HIST_STAGE_MIN_SZS[s]) {
            histDelta[ch][s][addIdx]++;
            if (closeIdx !== null) histDelta[ch][s][closeIdx]--;
          }
        }
      }
    }

    // Build cumulative per channel
    const snapHistMap: Record<string, { date: string; total: number; openTotal: number; byStage: Record<string, number> }[]> = {};
    for (const ch of CHANNEL_ORDER) {
      const arr: { date: string; total: number; openTotal: number; byStage: Record<string, number> }[] = [];
      const cum: Record<string, number> = { total: 0 };
      for (const s of HIST_STAGES_SZS) cum[s] = 0;
      for (let i = 0; i < histN; i++) {
        cum["total"] += histDelta[ch]["total"][i];
        const byStage: Record<string, number> = {};
        for (const s of HIST_STAGES_SZS) {
          cum[s] += histDelta[ch][s][i];
          byStage[s] = cum[s];
        }
        arr.push({ date: allHistDates[i], total: cum["total"], openTotal: cum["total"], byStage });
      }
      snapHistMap[ch] = arr;
    }

    // DON'T override with snapshot — use the live szs_deals computed total (snapHistMap).
    // The snapshot total_open from pipedrive_daily_snapshot may be stale,
    // causing the chart to show wrong numbers. The delta-based history is authoritative.

    // Accumulated: deals that reached Ag.Dados (>=11) and Contrato (>=12) this month
    // Count deals that were active in March (won/lost/open) and reached these stages
    // 3 queries: open with mso>=11, won in March with mso>=11, lost in March with mso>=11
    const [accumOpen, accumWon, accumLost] = await Promise.all([
      paginate((o, ps) =>
        admin.from("szs_deals").select("canal, max_stage_order, stage_order, lost_reason, empreendimento")
          .eq("status", "open").range(o, o + ps - 1)
      ),
      paginate((o, ps) =>
        admin.from("szs_deals").select("canal, max_stage_order, stage_order, lost_reason, empreendimento")
          .eq("status", "won").gte("won_time", startDate).range(o, o + ps - 1)
      ),
      paginate((o, ps) =>
        admin.from("szs_deals").select("canal, max_stage_order, stage_order, lost_reason, empreendimento")
          .eq("status", "lost").gte("lost_time", startDate).range(o, o + ps - 1)
      ),
    ]);
    const accumData: Record<string, { agDados: number; contrato: number }> = {};
    for (const ch of CHANNEL_ORDER) accumData[ch] = { agDados: 0, contrato: 0 };
    for (const d of [...accumOpen, ...accumWon, ...accumLost]) {
      if (d.lost_reason && String(d.lost_reason).toLowerCase() === "duplicado/erro") continue;
      if (cityFilter && getCidadeGroup(d.empreendimento || "") !== cityFilter) continue;
      const mso = d.max_stage_order || d.stage_order || 0;
      const canalGroup = getCanalGroup(String(d.canal || ""));
      const tabs = getChannelTabs(canalGroup);
      for (const tab of tabs) {
        if (mso >= 11) accumData[tab].agDados++;
        if (mso >= 12) accumData[tab].contrato++;
      }
    }

    // Ocupação agenda — duas fontes:
    //   Geral: deals abertos na etapa Agendado (stage_id 73, pipeline 14) via Nekt — cobre todos os canais
    //   VD / Parceiros / Expansão: reuniões agendadas nos próximos 7 dias do closer específico (szs_calendar_events)
    const today = now.toISOString().substring(0, 10);
    const next7 = new Date(now);
    next7.setDate(next7.getDate() + 6);
    const next7Str = next7.toISOString().substring(0, 10);
    const agendaByChannel: Record<string, number> = { Geral: 0, "Vendas Diretas": 0, Parceiros: 0, "Expansão": 0 };

    // Geral: funil Pipedrive (Nekt) — todos os canais, stage Agendado
    try {
      const nektResult = await queryNekt(`
        SELECT 1 FROM nekt_silver.pipedrive_deals_readable
        WHERE status = 'open' AND pipeline_id = 14 AND CAST(etapa AS INTEGER) = 73
      `);
      agendaByChannel["Geral"] = nektResult.rows.length;
      console.log(`[szs/agendados] Nekt Geral: ${agendaByChannel["Geral"]} deals no stage Agendado`);
    } catch (e) {
      console.warn("[szs/resultados] Nekt indisponível para agendados Geral, usando szs_deals:", e);
      const fallback = await paginate((o, ps) =>
        admin.from("szs_deals").select("canal")
          .eq("status", "open").eq("stage_order", 6).range(o, o + ps - 1)
      );
      agendaByChannel["Geral"] = fallback.length;
    }

    // VD / Parceiros / Expansão: calendário do closer específico (próximos 7 dias, não canceladas)
    // ATENÇÃO: NÃO usar .eq("cancelou", false) — exclui NULLs (armadilha Supabase). Filtrar em JS.
    const calendarAgendRows = activeCloserEmails.length > 0
      ? await paginate((o, ps) =>
          admin.from("szs_calendar_events")
            .select("closer_email, cancelou, empreendimento")
            .in("closer_email", activeCloserEmails)
            .gte("dia", today).lte("dia", next7Str)
            .range(o, o + ps - 1)
        )
      : [];
    for (const ev of calendarAgendRows) {
      if (ev.cancelou) continue; // NULL = não cancelada, conta; true = cancelada, ignora
      if (cityFilter && getCidadeGroup(ev.empreendimento || "") !== cityFilter) continue;
      const tabs = closerEmailChannelMap[ev.closer_email] || [];
      for (const tab of tabs) {
        if (tab === "Geral") continue; // Geral vem do funil, não do calendário
        agendaByChannel[tab] = (agendaByChannel[tab] || 0) + 1;
      }
    }

    // No-show: cancelled meetings in last 7 days vs total
    const past7 = new Date(now);
    past7.setDate(past7.getDate() - 6);
    const past7Str = past7.toISOString().substring(0, 10);
    const noShowRows = activeCloserEmails.length > 0
      ? await paginate((o, ps) =>
          admin.from("szs_calendar_events")
            .select("closer_email, cancelou, empreendimento")
            .in("closer_email", activeCloserEmails)
            .gte("dia", past7Str).lte("dia", today)
            .range(o, o + ps - 1)
        )
      : [];
    const noShowData: Record<string, { canceladas: number; total: number }> = {};
    for (const ch of CHANNEL_ORDER) noShowData[ch] = { canceladas: 0, total: 0 };
    for (const ev of noShowRows) {
      if (cityFilter && getCidadeGroup(ev.empreendimento || "") !== cityFilter) continue;
      const tabs = closerEmailChannelMap[ev.closer_email] || [];
      for (const tab of tabs) {
        noShowData[tab].total++;
        if (ev.cancelou) noShowData[tab].canceladas++;
      }
    }


    let metas = SZS_RESULTADOS_METAS[monthKey] || {};
    if (cityFilter) {
      const metaDateStr = `01/${String(month + 1).padStart(2, "0")}/${year}`;
      const { data: nektRow } = await admin.from("nekt_meta26_metas").select("*").eq("data", metaDateStr).single();
      if (nektRow) {
        const totalMetas = getSquadMetasFromNekt(nektRow as Record<string, unknown>, null);
        const cityMetas = getSquadMetasFromNekt(nektRow as Record<string, unknown>, cityFilter);
        const totalWon = Object.values(totalMetas).reduce((s, v) => s + v, 0);
        const cityWon = Object.values(cityMetas).reduce((s, v) => s + v, 0);
        const ratio = totalWon > 0 ? cityWon / totalWon : 0;
        const scaled: Record<string, ChannelMetas> = {};
        for (const [ch, m] of Object.entries(metas)) {
          scaled[ch] = {
            orcamento: m.orcamento ? Math.round(m.orcamento * ratio) : undefined,
            leads: m.leads ? Math.round(m.leads * ratio) : undefined,
            mql: Math.round(m.mql * ratio), sql: Math.round(m.sql * ratio),
            opp: Math.round(m.opp * ratio), won: Math.round(m.won * ratio),
            agDados: m.agDados ? Math.round(m.agDados * ratio) : undefined,
            contrato: m.contrato ? Math.round(m.contrato * ratio) : undefined,
          };
        }
        metas = scaled;
      }
    }

    const channels: ChannelResult[] = CHANNEL_ORDER.map((name) => {
      const counts = channelCounts[name] || {};
      const meta = metas[name] || { mql: 0, sql: 0, opp: 0, won: 0 };
      const snap = snapshots[name];
      const nClosers = channelCloserCount[name] || 0;
      const capacity = nClosers * MEETINGS_PER_DAY * WORK_DAYS_PER_WEEK;
      const closers = Object.entries(closerEmailChannelMap)
        .filter(([, tabs]) => tabs.includes(name))
        .map(([email]) => email.split("@")[0].replace(".", " "));

      const metrics: ChannelResult["metrics"] = {
        mql: { real: counts.mql || 0, meta: meta.mql },
        sql: { real: counts.sql || 0, meta: meta.sql },
        opp: { real: counts.opp || 0, meta: meta.opp },
        won: { real: counts.won || 0, meta: meta.won },
      };
      if (name === "Vendas Diretas") metrics.orcamento = { real: Math.round(totalSpend), meta: orcamentoMeta || meta.orcamento || 0 };
      if (meta.leads != null) metrics.leads = { real: counts.mql || 0, meta: meta.leads };

      // Charts use delta-computed history from szs_deals
      const dealsHistory = snapHistMap[name] || [];

      return {
        name,
        filterDescription: CHANNEL_FILTERS[name],
        metrics,
        lastMonthWon: prevWon[name] || 0,
        snapshots: name === "Geral"
          ? {
              aguardandoDados: snap.agDados,
              emContrato: snap.contrato,
              totalOpen: snap.totalOpen,
              agDadosAccum: accumData[name].agDados,
              contratoAccum: accumData[name].contrato,
              agDadosMeta: meta.agDados,
              contratoMeta: meta.contrato,
            }
          : {
              aguardandoDados: snap.agDados,
              emContrato: snap.contrato,
              totalOpen: snap.totalOpen,
            },
        ocupacaoAgenda: {
          agendadas: agendaByChannel[name] ?? 0,
          capacidade: capacity,
          percent: capacity > 0 ? Math.round(((agendaByChannel[name] ?? 0) / capacity) * 1000) / 10 : 0,
          closers,
          meetingsPerDay: MEETINGS_PER_DAY,
          workDays: WORK_DAYS_PER_WEEK,
        },
        noShow: {
          canceladas: noShowData[name].canceladas,
          total: noShowData[name].total,
          percent: noShowData[name].total > 0 ? Math.round((noShowData[name].canceladas / noShowData[name].total) * 1000) / 10 : 0,
        },
        dealsHistory,
      };
    });

    const body: ResultadosSZSData = {
      month: monthKey,
      channels,
      diagnostic: { source: "szs_daily_counts" },
    };
    return NextResponse.json(body);
  } catch (err: unknown) {
    console.error("[szs/resultados]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
