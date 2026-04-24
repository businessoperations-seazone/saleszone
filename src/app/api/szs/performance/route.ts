// SZS (Serviços) module
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getModuleConfig } from "@/lib/modules";
import { getSquadIdFromCanalId, getCanalGroupFromId, getSquadIdFromCanalGroup } from "@/lib/szs-utils";
import type { PerformanceData, PerformancePersonRow, PerformancePresellerRow, PerformanceSquadSummary, PerformanceEmpBreakdown, PerformanceEmpRow } from "@/lib/types";

const mc = getModuleConfig("szs");
const V_COLS = mc.closers;

export const dynamic = "force-dynamic";

function rate(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
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
      .from("szs_deals")
      .select("deal_id, owner_name, preseller_name, empreendimento, canal, status, max_stage_order, lost_reason, is_marketing, add_time, won_time, lost_time");
    if (cutoff) {
      query = query.or(`status.eq.open,won_time.gte.${cutoff},lost_time.gte.${cutoff},add_time.gte.${cutoff}`);
    }
    query = query.range(offset, offset + PAGE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error (szs_deals): ${error.message}`);
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
      .from("szs_presales_response")
      .select("deal_id, preseller_name, transbordo_at, first_action_at, response_time_minutes");
    if (cutoff) query = query.gte("transbordo_at", cutoff);
    query = query.range(offset, offset + PAGE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error (szs_presales_response): ${error.message}`);
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

    // SZS: don't filter by !empreendimento — SZS deals have null empreendimento by design
    const allDeals = allDealsRows.filter((d) => {
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
        const canalGroup = getCanalGroupFromId(d.canal || "");
        if (!canalMap.has(canalGroup)) canalMap.set(canalGroup, []);
        canalMap.get(canalGroup)!.push(d);
      }
      const result: PerformanceEmpBreakdown[] = [];
      for (const [canalGroup, canalDeals] of canalMap) {
        const f = countFunnel(canalDeals);
        result.push({
          emp: canalGroup,
          ...f,
          mqlToSql: rate(f.sql, f.mql),
          sqlToOpp: rate(f.opp, f.sql),
          oppToWon: rate(f.won, f.opp),
          mqlToWon: rate(f.won, f.mql),
        });
      }
      return result.sort((a, b) => b.mql - a.mql);
    }

    // Pipeline 14 stages: Lead in(1) → Contatados(2) → Qualificação(3) → Qualificado(4)
    // → Ag.data(5) → Agendado(6) → No Show(7) → Reunião Realizada(8) → FUP(9)
    // → Negociação(10) → Ag.Dados(11) → Contrato(12)
    // OPP_MIN_ORDER = 9 (FUP) in sync — matches the SZS pipeline definition
    function countFunnel(dealList: DealRow[]) {
      let mql = 0, sql = 0, opp = 0, won = 0;
      for (const d of dealList) {
        if (d.max_stage_order >= 1) mql++;  // MQL = all deals (Lead in)
        if (d.max_stage_order >= 4) sql++;  // SQL = Qualificado (stage 4)
        if (d.max_stage_order >= 8) opp++;  // OPP = Reunião Realizada (stage 8) — igual SZI
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

    // --- CANALS (sub-rows by canal group instead of empreendimento) ---
    const closerDealsByCanal = new Map<string, DealRow[]>();
    for (const d of deals) {
      if (!V_COLS.includes(d.owner_name)) continue;
      const canalGroup = getCanalGroupFromId(d.canal || "");
      if (!closerDealsByCanal.has(canalGroup)) closerDealsByCanal.set(canalGroup, []);
      closerDealsByCanal.get(canalGroup)!.push(d);
    }

    const allCloserDealsByCanal = new Map<string, DealRow[]>();
    for (const d of allCloserDeals) {
      const canalGroup = getCanalGroupFromId(d.canal || "");
      if (!allCloserDealsByCanal.has(canalGroup)) allCloserDealsByCanal.set(canalGroup, []);
      allCloserDealsByCanal.get(canalGroup)!.push(d);
    }

    const allEmps: PerformanceEmpRow[] = [];
    const allCanalGroups = new Set([...closerDealsByCanal.keys(), ...allCloserDealsByCanal.keys()]);
    for (const canalGroup of allCanalGroups) {
      const periodDeals = closerDealsByCanal.get(canalGroup) || [];
      const f = countFunnel(periodDeals);
      const tsDeals = allCloserDealsByCanal.get(canalGroup) || [];

      allEmps.push({
        emp: canalGroup,
        squadId: getSquadIdFromCanalGroup(canalGroup),
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

    // SZS: iterate over ALL configured presellers (not just squad.preVenda)
    const allPresellers: PerformancePresellerRow[] = [];
    for (const pvName of mc.presellers) {
      const pvNorm = norm(pvName);

      const pvFunnelDeals = deals.filter((d) => d.preseller_name && norm(d.preseller_name) === pvNorm);
      const funnel = countFunnel(pvFunnelDeals);

      const pvPresalesDeals = presellerPresalesMap.get(pvNorm) || [];
      const dealsWithAction = pvPresalesDeals.filter((d) => d.first_action_at != null);
      const responseTimes = dealsWithAction
        .map((d) => d.response_time_minutes)
        .filter((m): m is number => m != null && m >= 0);

      // Map preseller to squad via preVenda match (fallback: squad 1)
      const pvSquad = mc.squads.find((s) => norm(s.preVenda) === pvNorm);
      const pvSquadId = pvSquad?.id ?? 1;

      allPresellers.push({
        name: pvName,
        role: "preseller",
        squadId: pvSquadId,
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

    // Marketing (MIA) — for SZS, deals owned by MIA/Automacao, grouped by canal → squad
    const MIA_OWNERS = new Set(["morada - mia", "automacao"]);
    for (const sq of mc.squads) {
      const canalIds = sq.canalIds || [];
      const allCanalIds = mc.squads.flatMap((s) => s.canalIds || []);
      const miaDeals = deals.filter((d) => {
        if (!d.owner_name || !MIA_OWNERS.has(norm(d.owner_name))) return false;
        const canal = Number(d.canal);
        if (canalIds.length > 0) return canalIds.includes(canal);
        return !allCanalIds.includes(canal); // fallback squad
      });
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

    // --- SQUAD SUMMARIES ---
    const squads: PerformanceSquadSummary[] = mc.squads.map((sq) => {
      const sqClosers = allClosers.filter((c) => c.squadId === sq.id);
      const sqPreseller = allPresellers.find((p) => p.squadId === sq.id && p.role === "preseller")!;
      const sqMia = allPresellers.find((p) => p.squadId === sq.id && p.role === "marketing")!;

      // SZS: filter deals by canal IDs (squads are canal-based)
      const canalIds = sq.canalIds || [];
      const sqDeals = canalIds.length > 0
        ? deals.filter((d) => canalIds.includes(Number(d.canal)))
        : deals.filter((d) => {
            // Fallback squad: deals not in any other squad's canal list
            const allIds = mc.squads.flatMap((s) => s.canalIds || []);
            return !allIds.includes(Number(d.canal));
          });
      const sqFunnel = countFunnel(sqDeals);

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
    console.error("SZS Performance error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
