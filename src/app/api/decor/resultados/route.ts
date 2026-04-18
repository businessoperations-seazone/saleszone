import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";
const PIPELINE_ID = 44;
const FIELD_CANAL = "93b3ada8b94bd1fc4898a25754d6bcac2713f835";

const CHANNEL_ORDER = ["Geral", "Vendas Diretas", "Parcerias"] as const;
type DecorChannel = (typeof CHANNEL_ORDER)[number];

const CHANNEL_FILTERS: Record<DecorChannel, string> = {
  Geral: "Todos os canais combinados",
  "Vendas Diretas": "Todos os canais exceto parcerias",
  Parcerias: "Indicação Corretor + Franquia + Outros Parceiros",
};

const PARCERIA_CANAL_IDS = new Set(["582", "583", "2876"]);

function getCanalGroup(canalId: string): "Vendas Diretas" | "Parcerias" {
  return PARCERIA_CANAL_IDS.has(canalId) ? "Parcerias" : "Vendas Diretas";
}

/* ── Metas (hardcoded por mês) ───────────────────────────────── */
interface ChannelMetas {
  mql: number;
  sql: number;
  opp: number;
  won: number;
}

const DECOR_METAS: Record<string, Record<string, ChannelMetas>> = {
  "2026-03": {
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
  };
  lastMonthWon: number;
  snapshots: { aguardandoDados: number; emContrato: number };
  ocupacaoAgenda: { agendadas: number; capacidade: number; percent: number };
  noShow: { canceladas: number; total: number; percent: number };
  dealsHistory: { date: string; total: number; byStage: Record<string, number> }[];
}

interface ResultadosDecorData {
  month: string;
  channels: ChannelResult[];
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function pipeFetch(token: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://${PIPEDRIVE_DOMAIN}/api/v1${path}`);
  url.searchParams.set("api_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Pipedrive ${path}: ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const srvClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: tokenData } = await srvClient.rpc("vault_read_secret", { secret_name: "PIPEDRIVE_API_TOKEN" });
    const token = typeof tokenData === "string" ? tokenData : "";
    if (!token) throw new Error("PIPEDRIVE_API_TOKEN not found in vault");

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const monthStart = `${monthKey}-01`;

    const prevDate = new Date(year, month - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevStart = `${prevKey}-01`;
    const prevEnd = `${prevKey}-${new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate()}`;

    /* ── 1. Open deals from pipeline 44 ───────────────────────── */
    const openByGroup: Record<DecorChannel, number> = { Geral: 0, "Vendas Diretas": 0, Parcerias: 0 };
    let start = 0;
    while (true) {
      const res = await pipeFetch(token, `/pipelines/${PIPELINE_ID}/deals`, {
        limit: "500", start: String(start), everyone: "1",
      });
      if (!res.data || res.data.length === 0) break;
      for (const deal of res.data) {
        if (deal.pipeline_id !== PIPELINE_ID) continue;
        const canalId = String(deal[FIELD_CANAL] || "");
        const group = getCanalGroup(canalId);
        openByGroup[group]++;
        openByGroup.Geral++;
      }
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
    }

    /* ── 2. Won deals — current month ─────────────────────────── */
    const wonByGroup: Record<DecorChannel, number> = { Geral: 0, "Vendas Diretas": 0, Parcerias: 0 };
    const prevWonByGroup: Record<DecorChannel, number> = { Geral: 0, "Vendas Diretas": 0, Parcerias: 0 };
    start = 0;
    // Walk won deals; stop when won_time is far before monthStart (deals sorted by id desc)
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
        const canalId = String(deal[FIELD_CANAL] || "");
        const group = getCanalGroup(canalId);

        if (wonTime >= monthStart) {
          wonByGroup[group]++;
          wonByGroup.Geral++;
          pageHadMatch = true;
        } else if (wonTime >= prevStart && wonTime <= prevEnd) {
          prevWonByGroup[group]++;
          prevWonByGroup.Geral++;
          pageHadMatch = true;
        }
      }
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
      pagesWithoutMatch = pageHadMatch ? 0 : pagesWithoutMatch + 1;
    }

    /* ── 3. Build channels ────────────────────────────────────── */
    const metas = DECOR_METAS[monthKey] || {};

    const channels: ChannelResult[] = CHANNEL_ORDER.map((name) => {
      const meta = metas[name] || { mql: 0, sql: 0, opp: 0, won: 0 };
      const open = openByGroup[name];
      const won = wonByGroup[name];

      return {
        name,
        filterDescription: CHANNEL_FILTERS[name],
        metrics: {
          mql: { real: open + won, meta: meta.mql },
          sql: { real: 0, meta: meta.sql },
          opp: { real: 0, meta: meta.opp },
          won: { real: won, meta: meta.won },
        },
        lastMonthWon: prevWonByGroup[name],
        snapshots: { aguardandoDados: 0, emContrato: 0 },
        ocupacaoAgenda: { agendadas: 0, capacidade: 0, percent: 0 },
        noShow: { canceladas: 0, total: 0, percent: 0 },
        dealsHistory: [],
      };
    });

    const body: ResultadosDecorData = { month: monthKey, channels };
    return NextResponse.json(body);
  } catch (err: unknown) {
    console.error("[decor/resultados]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
