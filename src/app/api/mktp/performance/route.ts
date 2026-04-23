// MKTP (Marketplace) module
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getModuleConfig } from "@/lib/modules";
import type { PerformanceData, PerformancePersonRow, PerformancePresellerRow, PerformanceSquadSummary, PerformanceEmpBreakdown, PerformanceEmpRow } from "@/lib/types";
import { getMktpCanalName } from "@/lib/mktp-utils";

const mc = getModuleConfig("mktp");
const V_COLS = mc.closers;

export const dynamic = "force-dynamic";

function rate(n: number, d: number): number {
  if (d < 5) return 0; // minimum 5 deals for meaningful conversion
  return Math.round((n / d) * 1000) / 10;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface DealRow {
  deal_id: number;
  owner_name: string;
  preseller_name: string | null;
  empreendimento: string | null;
  canal: string | null;
  status: string;
  max_stage_order: number;
  lost_reason: string | null;
  is_marketing: boolean;
  add_time: string;
  won_time: string | null;
  lost_time: string | null;
}

interface PresalesRow {
  deal_id: number;
  preseller_name: string;
  transbordo_at: string;
  first_action_at: string | null;
  response_time_minutes: number | null;
}

async function fetchDeals(cutoff: string | null): Promise<DealRow[]> {
  const PAGE = 1000;
  const all: DealRow[] = [];
  let offset = 0;
  while (true) {
    let query = supabase
      .from("mktp_deals")
      .select("deal_id, owner_name, preseller_name, empreendimento, canal, status, max_stage_order, lost_reason, add_time, won_time, lost_time");
    if (cutoff) {
      query = query.or(`status.eq.open,won_time.gte.${cutoff},lost_time.gte.${cutoff},add_time.gte.${cutoff}`);
    }
    query = query.range(offset, offset + PAGE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error (mktp_deals): ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as DealRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchPresalesRows(cutoff: string | null): Promise<PresalesRow[]> {
  const PAGE = 1000;
  const all: PresalesRow[] = [];
  let offset = 0;
  while (true) {
    let query = supabase
      .from("mktp_presales_response")
      .select("deal_id, preseller_name, transbordo_at, first_action_at, response_time_minutes");
    if (cutoff) query = query.gte("transbordo_at", cutoff);
    query = query.range(offset, offset + PAGE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error (mktp_presales_response): ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as PresalesRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "90", 10);

    let cutoff: string | null = null;
    if (days > 0) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      cutoff = d.toISOString();
    }

    const rollingWindow = days > 0 ? days : 90;

    const tsCutoff = new Date();
    tsCutoff.setMonth(tsCutoff.getMonth() - 12);
    tsCutoff.setDate(tsCutoff.getDate() - rollingWindow);
    const tsCutoffStr = tsCutoff.toISOString();
    const fetchCutoff = cutoff && cutoff < tsCutoffStr ? cutoff : tsCutoffStr;

    const [allDealsRows, presalesRows] = await Promise.all([
      fetchDeals(fetchCutoff),
      fetchPresalesRows(cutoff),
    ]);

    const allDeals = allDealsRows.filter((d) => {
      if (!d.empreendimento) return false;
      if (d.lost_reason === "Duplicado/Erro") return false;
      return true;
    });

    const deals = cutoff ? allDeals.filter((d) => {
      if (d.status === "open") return true;
      const closeTime = d.won_time || d.lost_time || d.add_time;
      return closeTime >= cutoff;
    }) : allDeals;

    const dealMap = new Map<number, DealRow>();
    for (const d of allDeals) {
      dealMap.set(d.deal_id, d);
    }

    function buildByEmp(dealList: DealRow[]): PerformanceEmpBreakdown[] {
      const canalMap = new Map<string, DealRow[]>();
      for (const d of dealList) {
        const canal = getMktpCanalName(d.canal);
        if (!canalMap.has(canal)) canalMap.set(canal, []);
        canalMap.get(canal)!.push(d);
      }
      const result: PerformanceEmpBreakdown[] = [];
      for (const [emp, empDeals] of canalMap) {
        const f = countFunnel(empDeals);
        result.push({
          emp,
          ...f,
          mqlToSql: rate(f.sql, f.mql),
          sqlToOpp: rate(f.opp, f.sql),
          oppToWon: rate(f.won, f.opp),
          mqlToWon: rate(f.won, f.mql),
        });
      }
      return result.sort((a, b) => b.mql - a.mql);
    }

    function countFunnel(dealList: DealRow[]) {
      // MKTP pipeline (37): MQL=Contatados (2), SQL=Qualificado (4), OPP=Reunião Realizada (8).
      let mql = 0, sql = 0, opp = 0, won = 0;
      for (const d of dealList) {
        if (d.max_stage_order >= 2) mql++;
        if (d.max_stage_order >= 4) sql++;
        if (d.max_stage_order >= 8) opp++;
        if (d.status === "won") won++;
      }
      return { mql, sql, opp, won };
    }

    // --- CLOSERS ---
    const closerMap = new Map<string, DealRow[]>();
    for (const d of deals) {
      if (!V_COLS.includes(d.owner_name)) continue;
      if (!closerMap.has(d.owner_name)) closerMap.set(d.owner_name, []);
      closerMap.get(d.owner_name)!.push(d);
    }

    const allClosers: PerformancePersonRow[] = [];
    for (const name of V_COLS) {
      const closerDeals = closerMap.get(name) || [];
      const funnel = countFunnel(closerDeals);
      let squadId = 1;
      for (const [sid, indices] of Object.entries(mc.squadCloserMap)) {
        if (indices.includes(V_COLS.indexOf(name))) {
          squadId = Number(sid);
          break;
        }
      }
      allClosers.push({
        name,
        role: "closer",
        squadId,
        ...funnel,
        mqlToSql: rate(funnel.sql, funnel.mql),
        sqlToOpp: rate(funnel.opp, funnel.sql),
        oppToWon: rate(funnel.won, funnel.opp),
        mqlToWon: rate(funnel.won, funnel.mql),
        byEmp: buildByEmp(closerDeals),
      });
    }

    // --- TIME SERIES ---
    const closerAllDealsMap = new Map<string, DealRow[]>();
    for (const d of allDeals) {
      if (!V_COLS.includes(d.owner_name)) continue;
      if (!closerAllDealsMap.has(d.owner_name)) closerAllDealsMap.set(d.owner_name, []);
      closerAllDealsMap.get(d.owner_name)!.push(d);
    }

    const now = new Date();
    const monthPoints: { month: string; end: Date; start: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      if (i === 0) {
        end.setTime(now.getTime());
      }
      const start = new Date(end);
      start.setDate(start.getDate() - rollingWindow);
      const y = end.getFullYear();
      const m = String(end.getMonth() + 1).padStart(2, "0");
      monthPoints.push({ month: `${y}-${m}`, end, start });
    }

    const allCloserDeals: DealRow[] = [];
    for (const closer of allClosers) {
      const cDeals = closerAllDealsMap.get(closer.name) || [];
      allCloserDeals.push(...cDeals);
      closer.timeSeries = monthPoints.map(({ month, end, start }) => {
        const startIso = start.toISOString();
        const endIso = end.toISOString();
        const windowDeals = cDeals.filter((d) => d.add_time >= startIso && d.add_time <= endIso);
        const f = countFunnel(windowDeals);
        return { month, opp: f.opp, won: f.won, oppToWon: rate(f.won, f.opp) };
      });
    }

    const consolidatedTimeSeries = monthPoints.map(({ month, end, start }) => {
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const windowDeals = allCloserDeals.filter((d) => d.add_time >= startIso && d.add_time <= endIso);
      const f = countFunnel(windowDeals);
      return { month, opp: f.opp, won: f.won, oppToWon: rate(f.won, f.opp) };
    });

    // --- CANAIS (grouped by canal instead of empreendimento) ---
    const allDealCanals = new Set<string>();
    for (const d of deals) {
      allDealCanals.add(getMktpCanalName(d.canal));
    }

    const closerDealsByCanal = new Map<string, DealRow[]>();
    for (const d of deals) {
      if (!V_COLS.includes(d.owner_name)) continue;
      const canal = getMktpCanalName(d.canal);
      if (!closerDealsByCanal.has(canal)) closerDealsByCanal.set(canal, []);
      closerDealsByCanal.get(canal)!.push(d);
    }

    const allCloserDealsByCanal = new Map<string, DealRow[]>();
    for (const d of allCloserDeals) {
      const canal = getMktpCanalName(d.canal);
      if (!allCloserDealsByCanal.has(canal)) allCloserDealsByCanal.set(canal, []);
      allCloserDealsByCanal.get(canal)!.push(d);
    }

    const allEmps: PerformanceEmpRow[] = [];
    const allCanalNames = new Set([...closerDealsByCanal.keys(), ...allCloserDealsByCanal.keys()]);
    for (const canal of allCanalNames) {
      const periodDeals = closerDealsByCanal.get(canal) || [];
      const f = countFunnel(periodDeals);
      const tsDeals = allCloserDealsByCanal.get(canal) || [];

      allEmps.push({
        emp: canal,
        squadId: 1,
        opp: f.opp,
        won: f.won,
        oppToWon: rate(f.won, f.opp),
        timeSeries: monthPoints.map(({ month, end, start }) => {
          const startIso = start.toISOString();
          const endIso = end.toISOString();
          const windowDeals = tsDeals.filter((d) => d.add_time >= startIso && d.add_time <= endIso);
          const wf = countFunnel(windowDeals);
          return { month, opp: wf.opp, won: wf.won, oppToWon: rate(wf.won, wf.opp) };
        }),
      });
    }
    allEmps.sort((a, b) => b.opp - a.opp);

    // --- PRE-SELLERS ---
    const CALL_TYPES = new Set(["call", "chamada_atendida_api4com", "chamada_nao_atendida_api4c"]);
    const MSG_TYPES = new Set(["mensagem", "email", "whatsapp_chat", "mensagem_respondida", "mensagem_nao_respondida",
      "szi___primeiro_contato", "szi___follow_up_contato", "szi___feedback", "szi___mensagem_parceiro", "szi___falta_info", "szi___pre_proposta"]);
    const MEETING_TYPES = new Set(["reuniao", "meeting", "no_show", "reuniao_apresentacao_contr", "reuniao_avaliacao"]);

    type ActCounts = { total: number; ligacoes: number; mensagens: number; reunioes: number };
    const pvActivityCounts = new Map<string, ActCounts>();
    try {
      const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (srvKey) {
        const srvClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, srvKey);
        const { data: tokenData } = await srvClient.rpc("vault_read_secret", { secret_name: "PIPEDRIVE_API_TOKEN" });
        const pipToken = typeof tokenData === "string" ? tokenData : "";
        if (pipToken) {
          const { data: pvConfig } = await srvClient.from("config_pre_vendedores").select("user_id, user_name").eq("pipeline_id", mc.pipelineId);
          const startDate = cutoff ? new Date(cutoff).toISOString().substring(0, 10) : "2020-01-01";
          const endDate = new Date().toISOString().substring(0, 10);

          const pvFetches = (pvConfig || []).map(async (pv: { user_id: number; user_name: string }) => {
            const counts: ActCounts = { total: 0, ligacoes: 0, mensagens: 0, reunioes: 0 };
            let start = 0;
            while (true) {
              const url = `https://seazone-fd92b9.pipedrive.com/api/v1/activities?api_token=${pipToken}&user_id=${pv.user_id}&done=1&start_date=${startDate}&end_date=${endDate}&limit=500&start=${start}`;
              const res = await fetch(url);
              const data = await res.json();
              const items = data?.data || [];
              for (const act of items) {
                counts.total++;
                const key = act.key_string || act.type || "";
                if (CALL_TYPES.has(key)) counts.ligacoes++;
                else if (MSG_TYPES.has(key)) counts.mensagens++;
                else if (MEETING_TYPES.has(key)) counts.reunioes++;
              }
              if (!data?.additional_data?.pagination?.more_items_in_collection) break;
              start += 500;
            }
            pvActivityCounts.set(norm(pv.user_name), counts);
          });
          await Promise.all(pvFetches);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch PV activities from Pipedrive:", e);
    }

    const presellerPresalesMap = new Map<string, PresalesRow[]>();
    for (const row of presalesRows) {
      const key = norm(row.preseller_name);
      if (!presellerPresalesMap.has(key)) presellerPresalesMap.set(key, []);
      presellerPresalesMap.get(key)!.push(row);
    }

    const allPresellers: PerformancePresellerRow[] = [];
    for (const sq of mc.squads) {
      const pvName = sq.preVenda;
      const pvNorm = norm(pvName);

      const pvFunnelDeals = deals.filter((d) => d.preseller_name && norm(d.preseller_name) === pvNorm);
      const funnel = countFunnel(pvFunnelDeals);

      const pvPresalesDeals = presellerPresalesMap.get(pvNorm) || [];
      const dealsWithAction = pvPresalesDeals.filter((d) => d.first_action_at != null);
      const responseTimes = dealsWithAction
        .map((d) => d.response_time_minutes)
        .filter((m): m is number => m != null && m >= 0);

      allPresellers.push({
        name: pvName,
        role: "preseller",
        squadId: sq.id,
        ...funnel,
        mqlToSql: rate(funnel.sql, funnel.mql),
        sqlToOpp: rate(funnel.opp, funnel.sql),
        oppToWon: rate(funnel.won, funnel.opp),
        mqlToWon: rate(funnel.won, funnel.mql),
        dealsReceived: funnel.mql,
        dealsWithAction: pvActivityCounts.get(pvNorm)?.total ?? dealsWithAction.length,
        actLigacoes: pvActivityCounts.get(pvNorm)?.ligacoes ?? 0,
        actMensagens: pvActivityCounts.get(pvNorm)?.mensagens ?? 0,
        actReunioes: pvActivityCounts.get(pvNorm)?.reunioes ?? 0,
        avgResponseMin: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0,
        medianResponseMin: Math.round(median(responseTimes)),
        byEmp: buildByEmp(pvFunnelDeals),
      });
    }

    // Marketing (MIA) — deals owned by MIA/Automacao
    const MIA_OWNERS = new Set(["morada - mia", "automacao"].map((s) => s.toLowerCase()));
    for (const sq of mc.squads) {
      const miaDeals = deals.filter((d) => d.owner_name && MIA_OWNERS.has(d.owner_name.toLowerCase()));
      const funnel = countFunnel(miaDeals);
      allPresellers.push({
        name: "MIA",
        role: "marketing",
        squadId: sq.id,
        ...funnel,
        mqlToSql: rate(funnel.sql, funnel.mql),
        sqlToOpp: rate(funnel.opp, funnel.sql),
        oppToWon: rate(funnel.won, funnel.opp),
        mqlToWon: rate(funnel.won, funnel.mql),
        dealsReceived: funnel.mql,
        dealsWithAction: 0,
        actLigacoes: 0,
        actMensagens: 0,
        actReunioes: 0,
        avgResponseMin: 0,
        medianResponseMin: 0,
        byEmp: buildByEmp(miaDeals),
      });
    }

    const allMarketing: PerformancePersonRow[] = [];

    // --- SQUAD SUMMARIES --- (MKTP has 1 squad, all deals)
    const squads: PerformanceSquadSummary[] = mc.squads.map((sq) => {
      const sqClosers = allClosers.filter((c) => c.squadId === sq.id);
      const sqPreseller = allPresellers.find((p) => p.squadId === sq.id && p.role === "preseller")!;
      const sqMia = allPresellers.find((p) => p.squadId === sq.id && p.role === "marketing")!;

      const sqFunnel = countFunnel(deals);

      return {
        id: sq.id,
        name: sq.name,
        closers: sqClosers,
        preseller: sqPreseller,
        marketing: sqMia,
        totals: {
          ...sqFunnel,
          mqlToSql: rate(sqFunnel.sql, sqFunnel.mql),
          sqlToOpp: rate(sqFunnel.opp, sqFunnel.sql),
          oppToWon: rate(sqFunnel.won, sqFunnel.opp),
          mqlToWon: rate(sqFunnel.won, sqFunnel.mql),
        },
      };
    });

    const grandFunnel = countFunnel(deals);

    const result: PerformanceData = {
      squads,
      allClosers,
      allPresellers,
      allMarketing,
      allEmps,
      grandTotals: {
        ...grandFunnel,
        mqlToSql: rate(grandFunnel.sql, grandFunnel.mql),
        sqlToOpp: rate(grandFunnel.opp, grandFunnel.sql),
        oppToWon: rate(grandFunnel.won, grandFunnel.opp),
        mqlToWon: rate(grandFunnel.won, grandFunnel.mql),
      },
      consolidatedTimeSeries,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("MKTP Performance error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
