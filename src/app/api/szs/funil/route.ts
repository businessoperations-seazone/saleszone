// SZS (Serviços) module — funil by 3 squads: Marketing, Parceiros, Expansão
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { getModuleConfig } from "@/lib/modules";
import type { FunilData, FunilSquad, FunilEmpreendimento } from "@/lib/types";
import { getCidadeGroup, SZS_METAS_WON_BY_SQUAD } from "@/lib/szs-utils";

export const dynamic = "force-dynamic";

const mc = getModuleConfig("szs");

function rate(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 10000) / 10000 : 0;
}

function cost(spend: number, den: number): number {
  return den > 0 ? Math.round((spend / den) * 100) / 100 : 0;
}

function buildFunil(
  emp: string, impressions: number, clicks: number, leads: number,
  mql: number, sql: number, opp: number, won: number,
  reserva: number, contrato: number, spend: number,
): FunilEmpreendimento {
  const rAcum = reserva + contrato + won;
  const cAcum = contrato + won;
  return {
    emp, impressions, clicks, leads, mql, sql, opp, won, reserva, contrato,
    oppEvento: opp, reservaEvento: rAcum, contratoEvento: cAcum, wonEvento: won,
    spend: Math.round(spend * 100) / 100,
    cpl: cost(spend, leads), cmql: cost(spend, mql), csql: cost(spend, sql),
    copp: cost(spend, opp), cpw: cost(spend, won),
    ctr: rate(clicks, impressions), clickToLead: rate(leads, clicks),
    leadToMql: rate(mql, leads), mqlToSql: rate(sql, mql), sqlToOpp: rate(opp, sql),
    oppToReserva: rate(rAcum, opp), reservaToContrato: rate(cAcum, rAcum),
    contratoToWon: rate(won, cAcum), oppToWon: rate(won, opp),
  };
}

function sumFunil(rows: FunilEmpreendimento[], label: string): FunilEmpreendimento {
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const leads = rows.reduce((s, r) => s + r.leads, 0);
  const mql = rows.reduce((s, r) => s + r.mql, 0);
  const sql = rows.reduce((s, r) => s + r.sql, 0);
  const opp = rows.reduce((s, r) => s + r.opp, 0);
  const won = rows.reduce((s, r) => s + r.won, 0);
  const reserva = rows.reduce((s, r) => s + r.reserva, 0);
  const contrato = rows.reduce((s, r) => s + r.contrato, 0);
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  return buildFunil(label, impressions, clicks, leads, mql, sql, opp, won, reserva, contrato, spend);
}

async function fetchAll(query: any): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// canal (numeric) → squad ID mapping (from szs_deals.canal column)
const CANAL_NUM_TO_SQUAD: Record<string, number> = {
  "12": 1,   // Marketing
  "582": 2,  // Ind. Corretor
  "583": 2,  // Ind. Franquia
  "1748": 3, // Expansão
  "3189": 3, // Spots
  "4551": 3, // Monica
};
// canal (numeric) → canal_group label for display
const CANAL_NUM_TO_GROUP: Record<string, string> = {
  "12": "Marketing",
  "582": "Ind. Corretor",
  "583": "Ind. Franquia",
  "1748": "Expansão",
  "3189": "Spots",
  "4551": "Monica",
};
// canal_group label → squad ID (countsByCanal is keyed by translated label)
const CANAL_GROUP_TO_SQUAD: Record<string, number> = {
  Marketing: 1,
  "Ind. Corretor": 2,
  "Ind. Franquia": 2,
  Expansão: 3,
  Spots: 3,
  Monica: 3,
  Outros: 3,
};
const DEFAULT_GROUP = "Outros";

export async function GET(req: NextRequest) {
  try {
    const monthParam = req.nextUrl.searchParams.get("month");
    const filterParam = req.nextUrl.searchParams.get("filter");
    const paidOnly = filterParam === "paid";
    const now = new Date();
    const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const startDate = `${month}-01`;

    const [yearStr, monthStr] = month.split("-");
    const mesFim = `${yearStr}-${String(Number(monthStr) + 1).padStart(2, "0")}-01`;
    const admin = createSquadSupabaseAdmin();

    const [allDealsRes, paidDealsRes, baserowLeadsRes] = await Promise.all([
      // All deals for bridge cidade→canal (no canal filter for complete attribution)
      fetchAll(admin.from("szs_deals").select("empreendimento, canal, max_stage_order, status, lost_reason").gte("add_time", startDate)),
      // Paid deals (canal=12, paid source) for funnel metrics
      fetchAll(admin.from("szs_deals").select("canal, max_stage_order, status, lost_reason").eq("canal", "12").ilike("rd_source", "%pag%").gte("add_time", startDate)),
      // All form fills from baserow (leads, not qualified). Graceful fallback se a tabela ausente (staging).
      fetchAll(admin.from("baserow_szs_leads").select("cidade").gte("data_criacao_ads", startDate).lt("data_criacao_ads", mesFim))
        .catch((err) => { console.warn("[szs/funil] baserow_szs_leads indisponível:", err?.message); return []; }),
    ]);

    // Count MQL/SQL/OPP/WON from szs_deals directly (not szs_daily_counts — avoids aggregation gap)
    const mqlDeals = fetchAll(admin.from("szs_deals").select("canal, lost_reason").gte("add_time", startDate));
    const sqlDeals = fetchAll(admin.from("szs_deals").select("canal, lost_reason").gte("qualificacao_date", startDate));
    const oppDeals = fetchAll(admin.from("szs_deals").select("canal, lost_reason").gte("reuniao_date", startDate));
    const wonDeals = fetchAll(admin.from("szs_deals").select("canal, lost_reason").gte("won_time", startDate));
    const [mqlDealsRes, sqlDealsRes, oppDealsRes, wonDealsRes] = await Promise.all([mqlDeals, sqlDeals, oppDeals, wonDeals]);

    // Reserva/Contrato: deals que ENTRARAM na etapa Aguardando Dados (152) / Contrato (76)
    // no mês via reserva_entered_at / contrato_entered_at (Nekt consolidated_deal_flow).
    const [reservaMesRes, contratoMesRes] = await Promise.all([
      fetchAll(admin.from("szs_deals").select("canal, lost_reason").gte("reserva_entered_at", startDate)),
      fetchAll(admin.from("szs_deals").select("canal, lost_reason").gte("contrato_entered_at", startDate)),
    ]);

    // Build counts by canal_group from szs_deals
    const countsByCanal = new Map<string, { mql: number; sql: number; opp: number; won: number; reserva: number; contrato: number }>();
    function addToCanal(canal: string, mql = 0, sql = 0, opp = 0, won = 0, reserva = 0, contrato = 0) {
      const g = canal || DEFAULT_GROUP;
      if (!countsByCanal.has(g)) countsByCanal.set(g, { mql: 0, sql: 0, opp: 0, won: 0, reserva: 0, contrato: 0 });
      const c = countsByCanal.get(g)!;
      c.mql += mql; c.sql += sql; c.opp += opp; c.won += won; c.reserva += reserva; c.contrato += contrato;
    }
    for (const d of mqlDealsRes) { if (d.lost_reason !== "Duplicado/Erro") addToCanal(CANAL_NUM_TO_GROUP[d.canal] || DEFAULT_GROUP, 1, 0, 0, 0, 0, 0); }
    for (const d of sqlDealsRes) { if (d.lost_reason !== "Duplicado/Erro") addToCanal(CANAL_NUM_TO_GROUP[d.canal] || DEFAULT_GROUP, 0, 1, 0, 0, 0, 0); }
    for (const d of oppDealsRes) { if (d.lost_reason !== "Duplicado/Erro") addToCanal(CANAL_NUM_TO_GROUP[d.canal] || DEFAULT_GROUP, 0, 0, 1, 0, 0, 0); }
    for (const d of wonDealsRes) { if (d.lost_reason !== "Duplicado/Erro") addToCanal(CANAL_NUM_TO_GROUP[d.canal] || DEFAULT_GROUP, 0, 0, 0, 1, 0, 0); }
    for (const d of reservaMesRes) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      addToCanal(CANAL_NUM_TO_GROUP[d.canal] || DEFAULT_GROUP, 0, 0, 0, 0, 1, 0);
    }
    for (const d of contratoMesRes) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      addToCanal(CANAL_NUM_TO_GROUP[d.canal] || DEFAULT_GROUP, 0, 0, 0, 0, 0, 1);
    }

    // Bridge: primary canal per cidade (canal with most qualified deals from that cidade)
    const cidadeCanalCount = new Map<string, Map<string, number>>();
    for (const d of allDealsRes) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const cidade = getCidadeGroup(d.empreendimento);
      if (!cidadeCanalCount.has(cidade)) cidadeCanalCount.set(cidade, new Map());
      const canalGroup = CANAL_NUM_TO_GROUP[d.canal] || DEFAULT_GROUP;
      cidadeCanalCount.get(cidade)!.set(canalGroup, (cidadeCanalCount.get(cidade)!.get(canalGroup) || 0) + 1);
    }
    const cidadeToCanal = new Map<string, string>();
    for (const [cidade, canalCounts] of cidadeCanalCount) {
      let topCanal = DEFAULT_GROUP;
      let topCount = 0;
      for (const [canal, count] of canalCounts) {
        if (count > topCount) { topCount = count; topCanal = canal; }
      }
      cidadeToCanal.set(cidade, topCanal);
    }

    // Leads per canal from baserow (ALL form fills, not qualified)
    const leadsPerCanal = new Map<string, number>();
    for (const row of baserowLeadsRes) {
      if (!row.cidade) continue;
      const cidade = getCidadeGroup(row.cidade);
      const canal = cidadeToCanal.get(cidade) || DEFAULT_GROUP;
      leadsPerCanal.set(canal, (leadsPerCanal.get(canal) || 0) + 1);
    }

    // Build counts by squadId|canalGroup from countsByCanal
    const squadCanalCounts = new Map<string, { mql: number; sql: number; opp: number; won: number; reserva: number; contrato: number }>();
    for (const [canalGroup, counts] of countsByCanal.entries()) {
      const squadId = CANAL_GROUP_TO_SQUAD[canalGroup] ?? 3;
      const gKey = `${squadId}|${canalGroup}`;
      squadCanalCounts.set(gKey, counts);
    }

    // Paid deals by canal
    const paidCountsMap = new Map<string, { mql: number; sql: number; opp: number; won: number }>();
    for (const d of paidDealsRes) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const canal = d.canal === "12" ? "Marketing" : DEFAULT_GROUP;
      if (!paidCountsMap.has(canal)) paidCountsMap.set(canal, { mql: 0, sql: 0, opp: 0, won: 0 });
      const cur = paidCountsMap.get(canal)!;
      cur.mql++;
      // SZS pipeline (14): SQL=Qualificado (order 4), OPP=Reunião Realizada (order 8).
      if (d.max_stage_order >= 4) cur.sql++;
      if (d.max_stage_order >= 8) cur.opp++;
      if (d.status === "won") cur.won++;
    }

    // Build squads from mc.squads (3 squads: Marketing, Parceiros, Expansão)
    const squads: FunilSquad[] = mc.squads.map((sq) => {
      const canalEntries: Array<{ canal: string; counts: { mql: number; sql: number; opp: number; won: number; reserva: number; contrato: number } }> = [];
      for (const [gKey, counts] of squadCanalCounts.entries()) {
        if (!gKey.startsWith(`${sq.id}|`)) continue;
        canalEntries.push({ canal: gKey.split("|")[1], counts });
      }

      const totalGroupMql = canalEntries.reduce((s, c) => s + (c.counts.mql || 0), 0);

      const empRows: FunilEmpreendimento[] = canalEntries.map(({ canal, counts }) => {
        const mqlShare = totalGroupMql > 0 ? (counts.mql || 0) / totalGroupMql : (canalEntries.length > 0 ? 1 / canalEntries.length : 0);
        const paid = paidCountsMap.get(canal) || { mql: 0, sql: 0, opp: 0, won: 0 };

        let mql: number, sql: number, opp: number, won: number, reserva: number, contrato: number;

        let leads: number;

        if (paidOnly) {
          const marketingLeads = leadsPerCanal.get("Marketing") || 0;
          leads = Math.max(marketingLeads, Math.round(paid.mql * mqlShare));
          mql = Math.round(paid.mql * mqlShare); sql = Math.round(paid.sql * mqlShare);
          opp = Math.round(paid.opp * mqlShare); won = Math.round(paid.won * mqlShare);
          reserva = 0; contrato = 0;
        } else {
          // leads from baserow per canal (all form fills) >= MQL (only qualified)
          const canalLeads = leadsPerCanal.get(canal) || 0;
          leads = Math.max(canalLeads, counts.mql || 0);
          mql = counts.mql || 0; sql = counts.sql || 0; opp = counts.opp || 0; won = counts.won || 0;
          reserva = counts.reserva || 0; contrato = counts.contrato || 0;
        }

        return buildFunil(canal, 0, 0, leads, mql, sql, opp, won, reserva, contrato, 0);
      });

      empRows.sort((a, b) => (b.mql + b.sql + b.opp + b.won) - (a.mql + a.sql + a.opp + a.won));

      return {
        id: sq.id,
        name: sq.name,
        marketing: sq.marketing,
        preVenda: sq.preVenda,
        venda: sq.venda,
        empreendimentos: empRows,
        totals: sumFunil(empRows, sq.name),
      };
    });

    const monthMetas = SZS_METAS_WON_BY_SQUAD[month] || {};
    const nonEmptySquads = squads.filter((sq) => sq.empreendimentos.length > 0 || (monthMetas[sq.id] || 0) > 0);

    const allEmps = nonEmptySquads.flatMap((sq) => sq.empreendimentos);
    const grand = sumFunil(allEmps, "Total");

    // Metas by squad name (matches squad.name: Marketing/Parceiros/Expansão)
    const metasObj: Record<string, Record<string, number>> = {};
    metasObj["Total"] = { won: 0 };
    for (const sq of nonEmptySquads) {
      metasObj[sq.name] = { won: monthMetas[sq.id] || 0 };
      metasObj["Total"].won += monthMetas[sq.id] || 0;
    }

    const result: FunilData = { month, squads: nonEmptySquads, grand, metas: metasObj };
    return NextResponse.json(result);
  } catch (error) {
    console.error("SZS Funil error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}