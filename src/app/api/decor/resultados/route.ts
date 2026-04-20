import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { paginate } from "@/lib/paginate";

/* ── Channel definitions ──────────────────────────────────────── */
const CHANNEL_ORDER = ["Geral", "Vendas Diretas", "Parcerias"] as const;
type DecorChannel = (typeof CHANNEL_ORDER)[number];

const CHANNEL_FILTERS: Record<DecorChannel, string> = {
  Geral: "Todos os canais combinados",
  "Vendas Diretas": "Todos os canais exceto parcerias",
  Parcerias: "Indicação Corretor + Franquia + Outros Parceiros (582, 583, 2876)",
};

const PARCERIA_CANAL_IDS = new Set(["582", "583", "2876"]);

function getCanalGroup(canalId: string): "Vendas Diretas" | "Parcerias" {
  return PARCERIA_CANAL_IDS.has(canalId) ? "Parcerias" : "Vendas Diretas";
}

/* ── Stage thresholds (pipeline 44 — 14 stages) ──────────────── */
// MQL=add_time, SQL=qualificacao_date, OPP=reuniao_date, WON=won_time
// Reservas = max_stage_order >= 13, Contrato = max_stage_order >= 14
const OPP_MIN_ORDER = 9;
const RESERVA_MIN_ORDER = 13;
const CONTRATO_MIN_ORDER = 14;

/* ── Metas ────────────────────────────────────────────────────── */
interface ChannelMetas {
  mql: number;
  sql: number;
  opp: number;
  won: number;
}

const DECOR_METAS: Record<string, Record<string, ChannelMetas>> = {
  "2026-04": {
    Geral: { mql: 1708, sql: 553, opp: 143, won: 15 },
    "Vendas Diretas": { mql: 1677, sql: 530, opp: 126, won: 9 },
    Parcerias: { mql: 31, sql: 23, opp: 17, won: 6 },
  },
};

/* ── Types ────────────────────────────────────────────────────── */
interface MetricPair { real: number; meta: number }

interface ChannelResult {
  name: string;
  filterDescription: string;
  metrics: {
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

interface ResultadosDecorData { month: string; channels: ChannelResult[] }

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Pipedrive fallback (when decor_deals is empty) ──────────── */
const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";
const PIPELINE_ID = 44;
const FIELD_CANAL = "93b3ada8b94bd1fc4898a25754d6bcac2713f835";

async function pipeFetch(token: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://${PIPEDRIVE_DOMAIN}/api/v1${path}`);
  url.searchParams.set("api_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Pipedrive ${path}: ${res.status}`);
  return res.json();
}

async function fallbackFromPipedrive(
  token: string,
  monthStart: string,
  prevStart: string,
  prevEnd: string,
): Promise<{
  openByGroup: Record<DecorChannel, number>;
  wonByGroup: Record<DecorChannel, number>;
  prevWonByGroup: Record<DecorChannel, number>;
}> {
  const zero = (): Record<DecorChannel, number> => ({ Geral: 0, "Vendas Diretas": 0, Parcerias: 0 });
  const openByGroup = zero();
  const wonByGroup = zero();
  const prevWonByGroup = zero();

  // Open deals
  let start = 0;
  while (true) {
    const res = await pipeFetch(token, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start), everyone: "1",
    });
    if (!res.data || res.data.length === 0) break;
    for (const deal of res.data) {
      if (deal.pipeline_id !== PIPELINE_ID) continue;
      const group = getCanalGroup(String(deal[FIELD_CANAL] || ""));
      openByGroup[group]++;
      openByGroup.Geral++;
    }
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }

  // Won deals (current + prev month)
  start = 0;
  let pagesWithoutMatch = 0;
  while (pagesWithoutMatch < 3) {
    const res = await pipeFetch(token, "/deals", {
      status: "won", limit: "500", start: String(start), everyone: "1",
    });
    if (!res.data || res.data.length === 0) break;
    let pageHadMatch = false;
    for (const deal of res.data) {
      if (deal.pipeline_id !== PIPELINE_ID) continue;
      const wonTime = deal.won_time?.substring(0, 10) || "";
      const group = getCanalGroup(String(deal[FIELD_CANAL] || ""));
      if (wonTime >= monthStart) {
        wonByGroup[group]++; wonByGroup.Geral++; pageHadMatch = true;
      } else if (wonTime >= prevStart && wonTime <= prevEnd) {
        prevWonByGroup[group]++; prevWonByGroup.Geral++; pageHadMatch = true;
      }
    }
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
    pagesWithoutMatch = pageHadMatch ? 0 : pagesWithoutMatch + 1;
  }

  return { openByGroup, wonByGroup, prevWonByGroup };
}

/* ── Main handler ─────────────────────────────────────────────── */
export async function GET() {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const monthStart = `${monthKey}-01`;

    const prevDate = new Date(year, month - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevStart = `${prevKey}-01`;
    const prevEnd = `${prevKey}-${new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate()}`;

    const cutoff90 = new Date(now);
    cutoff90.setDate(cutoff90.getDate() - 90);
    const cutoffDate = cutoff90.toISOString().substring(0, 10);

    /* ── Check if decor_deals has any data ─────────────────────── */
    const { count: dealCount } = await admin
      .from("decor_deals")
      .select("deal_id", { count: "exact", head: true });

    const hasDBData = (dealCount || 0) > 0;

    const channelCounts: Record<DecorChannel, Record<string, number>> = {
      Geral: {}, "Vendas Diretas": {}, Parcerias: {},
    };
    const prevWonMap: Record<DecorChannel, number> = { Geral: 0, "Vendas Diretas": 0, Parcerias: 0 };
    const funnelReserva: Record<DecorChannel, number> = { Geral: 0, "Vendas Diretas": 0, Parcerias: 0 };
    const funnelContrato: Record<DecorChannel, number> = { Geral: 0, "Vendas Diretas": 0, Parcerias: 0 };
    const snapshots: Record<DecorChannel, { reserva: number; contrato: number }> = {
      Geral: { reserva: 0, contrato: 0 },
      "Vendas Diretas": { reserva: 0, contrato: 0 },
      Parcerias: { reserva: 0, contrato: 0 },
    };
    const cumulativeHist: Record<DecorChannel, { date: string; total: number; byStage: Record<string, number> }[]> = {
      Geral: [], "Vendas Diretas": [], Parcerias: [],
    };

    if (hasDBData) {
      /* ── DB path: read from decor_deals ──────────────────────── */
      const DEAL_COLS = "canal, status, stage_id, max_stage_order, add_time, won_time, lost_time, qualificacao_date, reuniao_date, lost_reason";

      const allDeals = await paginate((o, ps) =>
        admin.from("decor_deals").select(DEAL_COLS).gte("add_time", cutoffDate).range(o, o + ps - 1)
      );
      const wonDeals = await paginate((o, ps) =>
        admin.from("decor_deals").select(DEAL_COLS)
          .eq("status", "won").gte("won_time", prevStart).lt("add_time", cutoffDate).range(o, o + ps - 1)
      );

      const dealMap = new Map<string, any>();
      for (const d of allDeals) dealMap.set(`${d.canal}|${d.add_time}|${d.status}|${d.stage_id}`, d);
      for (const d of wonDeals) dealMap.set(`${d.canal}|${d.add_time}|${d.status}|${d.stage_id}`, d);
      const deals = Array.from(dealMap.values());

      const TABS = ["mql", "sql", "opp", "won"] as const;
      const TAB_DATE_COL: Record<string, string> = {
        mql: "add_time", sql: "qualificacao_date", opp: "reuniao_date", won: "won_time",
      };

      for (const deal of deals) {
        const group = getCanalGroup(String(deal.canal || ""));
        for (const tab of TABS) {
          const dateVal = deal[TAB_DATE_COL[tab]];
          if (!dateVal) continue;
          if (dateVal.substring(0, 10) < monthStart) continue;
          channelCounts[group][tab] = (channelCounts[group][tab] || 0) + 1;
          channelCounts.Geral[tab] = (channelCounts.Geral[tab] || 0) + 1;
        }

        // Previous month WON
        if (deal.status === "won") {
          const wonDate = deal.won_time?.substring(0, 10);
          if (wonDate && wonDate >= prevStart && wonDate <= prevEnd) {
            prevWonMap[group]++;
            prevWonMap.Geral++;
          }
        }

        // Funnel Reserva/Contrato cohort (open + closed this month)
        if (deal.lost_reason === "Duplicado/Erro") continue;
        const closeDate = deal.status === "won" ? deal.won_time?.substring(0, 10) : deal.lost_time?.substring(0, 10);
        if (deal.status !== "open" && (!closeDate || closeDate < monthStart)) continue;
        const mso = deal.max_stage_order || 0;
        if (mso >= RESERVA_MIN_ORDER) { funnelReserva[group]++; funnelReserva.Geral++; }
        if (mso >= CONTRATO_MIN_ORDER) { funnelContrato[group]++; funnelContrato.Geral++; }
      }

      // Snapshots: open deals currently in Reservas or Contrato stage
      const openDeals = await paginate((o, ps) =>
        admin.from("decor_deals").select("canal, max_stage_order")
          .eq("status", "open").gte("max_stage_order", RESERVA_MIN_ORDER).range(o, o + ps - 1)
      );
      for (const d of openDeals) {
        const group = getCanalGroup(String(d.canal || ""));
        const mso = d.max_stage_order || 0;
        if (mso >= RESERVA_MIN_ORDER) { snapshots[group].reserva++; snapshots.Geral.reserva++; }
        if (mso >= CONTRATO_MIN_ORDER) { snapshots[group].contrato++; snapshots.Geral.contrato++; }
      }

      // History: cumulative open deals last 90 days
      const histDeals = await paginate((o, ps) =>
        admin.from("decor_deals").select("canal, add_time, max_stage_order")
          .eq("status", "open").not("add_time", "is", null).range(o, o + ps - 1)
      );

      type DailyEntry = { total: number; mql: number; sql: number; opp: number };
      const dailyByGroup: Record<DecorChannel, Map<string, DailyEntry>> = {
        Geral: new Map(), "Vendas Diretas": new Map(), Parcerias: new Map(),
      };
      const baseline: Record<DecorChannel, DailyEntry> = {
        Geral: { total: 0, mql: 0, sql: 0, opp: 0 },
        "Vendas Diretas": { total: 0, mql: 0, sql: 0, opp: 0 },
        Parcerias: { total: 0, mql: 0, sql: 0, opp: 0 },
      };
      const STAGE_THRESHOLDS = { mql: 1, sql: 5, opp: OPP_MIN_ORDER } as const;

      for (const d of histDeals) {
        const day = d.add_time.substring(0, 10);
        const group = getCanalGroup(String(d.canal || ""));
        const mso = d.max_stage_order || 0;
        const targets: DecorChannel[] = [group, "Geral"];
        if (day < cutoffDate) {
          for (const ch of targets) {
            baseline[ch].total++;
            if (mso >= STAGE_THRESHOLDS.mql) baseline[ch].mql++;
            if (mso >= STAGE_THRESHOLDS.sql) baseline[ch].sql++;
            if (mso >= STAGE_THRESHOLDS.opp) baseline[ch].opp++;
          }
        } else {
          for (const ch of targets) {
            const map = dailyByGroup[ch];
            if (!map.has(day)) map.set(day, { total: 0, mql: 0, sql: 0, opp: 0 });
            const e = map.get(day)!;
            e.total++;
            if (mso >= STAGE_THRESHOLDS.mql) e.mql++;
            if (mso >= STAGE_THRESHOLDS.sql) e.sql++;
            if (mso >= STAGE_THRESHOLDS.opp) e.opp++;
          }
        }
      }

      for (const ch of CHANNEL_ORDER) {
        const dates = Array.from(dailyByGroup[ch].keys()).sort();
        const cum = { ...baseline[ch] };
        for (const date of dates) {
          const e = dailyByGroup[ch].get(date)!;
          cum.total += e.total; cum.mql += e.mql; cum.sql += e.sql; cum.opp += e.opp;
          cumulativeHist[ch].push({ date, total: cum.total, byStage: { mql: cum.mql, sql: cum.sql, opp: cum.opp } });
        }
      }
    } else {
      /* ── Fallback: read from Pipedrive directly ──────────────── */
      const { data: tokenData } = await admin.rpc("vault_read_secret", { secret_name: "PIPEDRIVE_API_TOKEN" });
      const token = typeof tokenData === "string" ? tokenData : "";
      if (!token) throw new Error("PIPEDRIVE_API_TOKEN not found in vault");

      const { openByGroup, wonByGroup, prevWonByGroup } = await fallbackFromPipedrive(
        token, monthStart, prevStart, prevEnd,
      );

      for (const ch of CHANNEL_ORDER) {
        channelCounts[ch].mql = openByGroup[ch] + wonByGroup[ch];
        channelCounts[ch].won = wonByGroup[ch];
        prevWonMap[ch] = prevWonByGroup[ch];
      }
    }

    /* ── Build response ───────────────────────────────────────── */
    const metas = DECOR_METAS[monthKey] || {};

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

      if (hasDBData) {
        metrics.reserva = { real: funnelReserva[name] || 0, meta: 0 };
        metrics.contrato = { real: funnelContrato[name] || 0, meta: 0 };
      }

      return {
        name,
        filterDescription: CHANNEL_FILTERS[name],
        metrics,
        lastMonthWon: prevWonMap[name] || 0,
        snapshots: snap ? { aguardandoDados: snap.reserva, emContrato: snap.contrato } : { aguardandoDados: 0, emContrato: 0 },
        ocupacaoAgenda: { agendadas: 0, capacidade: 0, percent: 0 },
        noShow: { canceladas: 0, total: 0, percent: 0 },
        dealsHistory: cumulativeHist[name] || [],
      };
    });

    return NextResponse.json({ month: monthKey, channels, source: hasDBData ? "db" : "pipedrive" });
  } catch (err: unknown) {
    console.error("[decor/resultados]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
