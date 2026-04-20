import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin, hasServiceRole } from "@/lib/squad/supabase";
import { createClient } from "@supabase/supabase-js";
import { SQUADS, EXTRA_EMPREENDIMENTOS } from "@/lib/constants";
import { paginate } from "@/lib/paginate";
import type { FunilData, FunilSquad, FunilEmpreendimento } from "@/lib/types";

export const dynamic = "force-dynamic";

function rate(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 10000) / 10000 : 0;
}

function cost(spend: number, den: number): number {
  return den > 0 ? Math.round((spend / den) * 100) / 100 : 0;
}

interface EventoCoorte {
  oppEvento: number;
  reservaEvento: number;
  contratoEvento: number;
  wonEvento: number;
}

function buildFunil(
  emp: string,
  impressions: number,
  clicks: number,
  leads: number,
  mql: number,
  sql: number,
  opp: number,
  won: number,
  reserva: number,
  contrato: number,
  eventos: EventoCoorte,
  spend: number,
): FunilEmpreendimento {
  return {
    emp,
    impressions,
    clicks,
    leads,
    mql,
    sql,
    opp,
    won,
    reserva,
    contrato,
    oppEvento: eventos.oppEvento,
    reservaEvento: eventos.reservaEvento,
    contratoEvento: eventos.contratoEvento,
    wonEvento: eventos.wonEvento,
    spend: Math.round(spend * 100) / 100,
    cpl: cost(spend, leads),
    cmql: cost(spend, mql),
    csql: cost(spend, sql),
    copp: cost(spend, opp),
    cpw: cost(spend, won),
    ctr: rate(clicks, impressions),
    clickToLead: rate(leads, clicks),
    leadToMql: rate(mql, leads),
    mqlToSql: rate(sql, mql),
    sqlToOpp: rate(opp, sql),
    // Conversões OPP→Reserva→Contrato→WON usam coorte de deals fechados no mês
    oppToReserva: rate(eventos.reservaEvento, eventos.oppEvento),
    reservaToContrato: rate(eventos.contratoEvento, eventos.reservaEvento),
    contratoToWon: rate(eventos.wonEvento, eventos.contratoEvento),
    oppToWon: rate(eventos.wonEvento, eventos.oppEvento),
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
  const eventos: EventoCoorte = {
    oppEvento: rows.reduce((s, r) => s + r.oppEvento, 0),
    reservaEvento: rows.reduce((s, r) => s + r.reservaEvento, 0),
    contratoEvento: rows.reduce((s, r) => s + r.contratoEvento, 0),
    wonEvento: rows.reduce((s, r) => s + r.wonEvento, 0),
  };
  return buildFunil(label, impressions, clicks, leads, mql, sql, opp, won, reserva, contrato, eventos, spend);
}

export async function GET(req: NextRequest) {
  try {
    const admin = createSquadSupabaseAdmin();
    const monthParam = req.nextUrl.searchParams.get("month");
    const filterParam = req.nextUrl.searchParams.get("filter"); // "paid" or null
    const paidOnly = filterParam === "paid";
    const now = new Date();
    const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const startDate = `${month}-01`;
    const [yearStr, monthStr] = month.split("-");
    const mesNum = Number(monthStr);
    const mesFim = mesNum === 12
      ? `${Number(yearStr) + 1}-01-01`
      : `${yearStr}-${String(mesNum + 1).padStart(2, "0")}-01`;

    // Queries paralelas
    const [metaRes, countsRes, stageSnapshotRes, dealsRes, baserowLeadsRes, paidLeadsDeals, paidSqlDeals, paidOppDeals, paidWonDeals, metasRes, allLeadsDeals, allSqlDeals, allOppDeals, allWonDeals] = await Promise.all([
      // Meta Ads — spend_month/leads_month
      supabase
        .from("squad_meta_ads")
        .select("ad_id, empreendimento, impressions, clicks, leads_month, spend_month")
        .gte("snapshot_date", startDate),
      // MQL/SQL/OPP/WON do mês (eventos acumulados)
      supabase
        .from("squad_daily_counts")
        .select("tab, empreendimento, count")
        .in("tab", ["mql", "sql", "opp", "won"])
        .gte("date", startDate),
      // Reserva/Contrato snapshot (sem filtro de data — estado atual dos stages)
      supabase
        .from("squad_daily_counts")
        .select("tab, empreendimento, count")
        .in("tab", ["reserva", "contrato"]),
      // Deals fechados no mês (won + lost) — para conversões OPP→Reserva→Contrato→WON
      // Mesma coorte: todos os deals que fecharam no mês, contados por max_stage_order
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, max_stage_order, status, lost_reason")
          .in("status", ["won", "lost"])
          .or(`won_time.gte.${startDate},lost_time.gte.${startDate}`)
          .range(o, o + ps - 1),
      ),
      // Baserow leads — formulários preenchidos no mês (fonte real de Leads)
      // Usa service_role porque baserow_leads tem RLS sem policy para anon
      (() => {
        const admin = createSquadSupabaseAdmin();
        return paginate((o, ps) =>
          admin
            .from("baserow_leads")
            .select("nome_empreendimento")
            .gte("data_criacao_ads", startDate)
            .lt("data_criacao_ads", mesFim)
            .range(o, o + ps - 1),
        );
      })(),
      // Mídia Paga — Leads/MQL + Reserva/Contrato acumulados (rd_source contendo "pag")
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, canal, lost_reason, max_stage_order, status, add_time")
          .ilike("rd_source", "%pag%")
          .or(`status.eq.open,won_time.gte.${startDate},lost_time.gte.${startDate},add_time.gte.${startDate}`)
          .range(o, o + ps - 1),
      ),
      // Mídia Paga — SQL por qualificacao_date
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, lost_reason")
          .ilike("rd_source", "%pag%")
          .gte("qualificacao_date", startDate)
          .range(o, o + ps - 1),
      ),
      // Mídia Paga — OPP por reuniao_date
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, lost_reason")
          .ilike("rd_source", "%pag%")
          .gte("reuniao_date", startDate)
          .range(o, o + ps - 1),
      ),
      // Mídia Paga — WON por won_time
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, lost_reason")
          .ilike("rd_source", "%pag%")
          .gte("won_time", startDate)
          .range(o, o + ps - 1),
      ),
      // Metas do mês (squad_metas table)
      supabase
        .from("squad_metas")
        .select("squad_id, tab, meta")
        .eq("month", `${month}-01`),
      // Todos — Leads/MQL por add_time + Reserva/Contrato acumulados (todos os canais)
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, canal, lost_reason, max_stage_order, status, add_time")
          .or(`status.eq.open,won_time.gte.${startDate},lost_time.gte.${startDate},add_time.gte.${startDate}`)
          .range(o, o + ps - 1),
      ),
      // Todos — SQL por qualificacao_date
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, lost_reason")
          .gte("qualificacao_date", startDate)
          .range(o, o + ps - 1),
      ),
      // Todos — OPP por reuniao_date
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, lost_reason")
          .gte("reuniao_date", startDate)
          .range(o, o + ps - 1),
      ),
      // Todos — WON por won_time
      paginate((o, ps) =>
        admin
          .from("squad_deals")
          .select("empreendimento, lost_reason")
          .gte("won_time", startDate)
          .range(o, o + ps - 1),
      ),
    ]);

    if (metaRes.error) throw new Error(`Meta Ads query error: ${metaRes.error.message}`);
    if (countsRes.error) throw new Error(`Daily counts query error: ${countsRes.error.message}`);
    if (stageSnapshotRes.error) throw new Error(`Stage snapshot query error: ${stageSnapshotRes.error.message}`);
    if (metasRes.error) console.warn(`Metas query warning: ${metasRes.error.message}`);

    // Agregar Meta Ads: max spend_month/leads_month por ad
    const adMax = new Map<string, { empreendimento: string; impressions: number; clicks: number; leads_month: number; spend_month: number }>();
    for (const row of metaRes.data || []) {
      const cur = adMax.get(row.ad_id);
      if (!cur || (Number(row.spend_month) || 0) > cur.spend_month) {
        adMax.set(row.ad_id, {
          empreendimento: row.empreendimento,
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
          leads_month: row.leads_month || 0,
          spend_month: Number(row.spend_month) || 0,
        });
      }
    }
    const metaMap = new Map<string, { impressions: number; clicks: number; leads: number; spend: number }>();
    for (const ad of adMax.values()) {
      const cur = metaMap.get(ad.empreendimento) || { impressions: 0, clicks: 0, leads: 0, spend: 0 };
      cur.impressions += ad.impressions;
      cur.clicks += ad.clicks;
      cur.leads += ad.leads_month;
      cur.spend += ad.spend_month;
      metaMap.set(ad.empreendimento, cur);
    }

    // Agregar Pipedrive counts por tab/empreendimento (MQL/SQL/OPP/WON — eventos do mês)
    const countsMap = new Map<string, Record<string, number>>();
    for (const row of countsRes.data || []) {
      const key = row.empreendimento;
      if (!countsMap.has(key)) countsMap.set(key, { mql: 0, sql: 0, opp: 0, won: 0 });
      const cur = countsMap.get(key)!;
      cur[row.tab] = (cur[row.tab] || 0) + (row.count || 0);
    }

    // Agregar snapshot reserva/contrato (estado atual)
    const snapshotMap = new Map<string, { reserva: number; contrato: number }>();
    for (const row of stageSnapshotRes.data || []) {
      const key = row.empreendimento;
      if (!snapshotMap.has(key)) snapshotMap.set(key, { reserva: 0, contrato: 0 });
      const cur = snapshotMap.get(key)!;
      cur[row.tab as "reserva" | "contrato"] = (cur[row.tab as "reserva" | "contrato"] || 0) + (row.count || 0);
    }

    // Agregar Baserow leads por empreendimento (formulários preenchidos no mês)
    const baserowLeadsMap = new Map<string, number>();
    for (const row of baserowLeadsRes) {
      const emp = row.nome_empreendimento;
      if (!emp) continue;
      baserowLeadsMap.set(emp, (baserowLeadsMap.get(emp) || 0) + 1);
    }

    // Agregar deals pagos (rd_source contendo "pag") — cada etapa por sua data
    const paidLeadsMap = new Map<string, number>();
    const paidMqlMap = new Map<string, number>();
    const paidSqlMap = new Map<string, number>();
    const paidOppMap = new Map<string, number>();
    const paidWonMap = new Map<string, number>();
    const paidReservaMap = new Map<string, number>();
    const paidContratoMap = new Map<string, number>();
    for (const d of paidLeadsDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const key = d.empreendimento || "__sem_emp__";
      // Reserva/Contrato acumulados — deals SEM empreendimento contam no total
      if (d.empreendimento) {
        const mso = d.max_stage_order ?? 0;
        if (mso >= 13) paidReservaMap.set(key, (paidReservaMap.get(key) || 0) + 1);
        if (mso >= 14) paidContratoMap.set(key, (paidContratoMap.get(key) || 0) + 1);
      } else {
        // Deals sem empreendimento: acumulam no total Geral
        const mso = d.max_stage_order ?? 0;
        if (mso >= 13) paidReservaMap.set("__geral__", (paidReservaMap.get("__geral__") || 0) + 1);
        if (mso >= 14) paidContratoMap.set("__geral__", (paidContratoMap.get("__geral__") || 0) + 1);
      }
      // Leads/MQL só contam deals criados no mês (add_time >= startDate)
      if (d.add_time && d.add_time >= startDate) {
        paidLeadsMap.set(key, (paidLeadsMap.get(key) || 0) + 1);
        paidMqlMap.set(key, (paidMqlMap.get(key) || 0) + 1);
      }
    }
    for (const d of paidSqlDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const key = d.empreendimento || "__sem_emp__";
      paidSqlMap.set(key, (paidSqlMap.get(key) || 0) + 1);
    }
    for (const d of paidOppDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const key = d.empreendimento || "__sem_emp__";
      paidOppMap.set(key, (paidOppMap.get(key) || 0) + 1);
    }
    for (const d of paidWonDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const key = d.empreendimento || "__sem_emp__";
      paidWonMap.set(key, (paidWonMap.get(key) || 0) + 1);
    }

    // Agregar eventos por stage — deals fechados no mês (mesma coorte)
    // OPP = max_stage_order >= 9, Reserva = >= 13, Contrato = >= 14, WON = status won
    // Exclui Duplicado/Erro em JS (neq no Supabase exclui NULLs, removendo WONs)
    // Inclui deals SEM empreendimento (key = "__sem_emp__") para contar na conversão total
    const eventoMap = new Map<string, { oppEvento: number; reservaEvento: number; contratoEvento: number; wonEvento: number }>();
    for (const d of dealsRes) {
      const emp = d.empreendimento || "__sem_emp__";
      if (d.lost_reason === "Duplicado/Erro") continue;
      if (!eventoMap.has(emp)) eventoMap.set(emp, { oppEvento: 0, reservaEvento: 0, contratoEvento: 0, wonEvento: 0 });
      const cur = eventoMap.get(emp)!;
      if (d.max_stage_order >= 9) cur.oppEvento++;
      if (d.max_stage_order >= 13) cur.reservaEvento++;
      if (d.max_stage_order >= 14) cur.contratoEvento++;
      if (d.status === "won") cur.wonEvento++;
    }

    // Agregar deals por etapa — modo "Todos" (cada etapa usa sua data específica)
    const allLeadsMap = new Map<string, number>();
    const allMqlMap = new Map<string, number>();
    const allSqlMap = new Map<string, number>();
    const allOppMap = new Map<string, number>();
    const allWonMap = new Map<string, number>();
    const allReservaMap = new Map<string, number>();
    const allContratoMap = new Map<string, number>();
    for (const d of allLeadsDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const key = d.empreendimento || "__sem_emp__";
      // Reserva/Contrato acumulados — deals SEM empreendimento contam no total
      if (d.empreendimento) {
        const mso = d.max_stage_order ?? 0;
        if (mso >= 13) allReservaMap.set(key, (allReservaMap.get(key) || 0) + 1);
        if (mso >= 14) allContratoMap.set(key, (allContratoMap.get(key) || 0) + 1);
      } else {
        // Deals sem empreendimento: acumulam no total Geral
        const mso = d.max_stage_order ?? 0;
        if (mso >= 13) allReservaMap.set("__geral__", (allReservaMap.get("__geral__") || 0) + 1);
        if (mso >= 14) allContratoMap.set("__geral__", (allContratoMap.get("__geral__") || 0) + 1);
      }
      // Leads/MQL só contam deals criados no mês (add_time >= startDate)
      if (d.add_time && d.add_time >= startDate) {
        allLeadsMap.set(key, (allLeadsMap.get(key) || 0) + 1);
        allMqlMap.set(key, (allMqlMap.get(key) || 0) + 1);
      }
    }
    for (const d of allSqlDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const key = d.empreendimento || "__sem_emp__";
      allSqlMap.set(key, (allSqlMap.get(key) || 0) + 1);
    }
    for (const d of allOppDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const key = d.empreendimento || "__sem_emp__";
      allOppMap.set(key, (allOppMap.get(key) || 0) + 1);
    }
    for (const d of allWonDeals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const key = d.empreendimento || "__sem_emp__";
      allWonMap.set(key, (allWonMap.get(key) || 0) + 1);
    }

    // Build por squad
    const squads: FunilSquad[] = SQUADS.map((sq) => {
      const empRows: FunilEmpreendimento[] = sq.empreendimentos.map((emp) => {
        const meta = metaMap.get(emp) || { impressions: 0, clicks: 0, leads: 0, spend: 0 };
        const counts = countsMap.get(emp) || { mql: 0, sql: 0, opp: 0, won: 0 };
        const snapshot = snapshotMap.get(emp) || { reserva: 0, contrato: 0 };
        const ev = eventoMap.get(emp) || { oppEvento: 0, reservaEvento: 0, contratoEvento: 0, wonEvento: 0 };

        let leads: number, mql: number, sql: number, opp: number, won: number;
        let reserva: number, contrato: number;
        let eventos: EventoCoorte;

        if (paidOnly) {
          // Mídia Paga: rd_source contendo "pag", cada etapa pela data correta
          leads = paidLeadsMap.get(emp) || 0;
          mql = paidMqlMap.get(emp) || 0;
          sql = paidSqlMap.get(emp) || 0;
          opp = paidOppMap.get(emp) || 0;
          won = paidWonMap.get(emp) || 0;
          reserva = paidReservaMap.get(emp) || 0;
          contrato = paidContratoMap.get(emp) || 0;
          eventos = ev;
        } else if (hasServiceRole()) {
          // Todos: cada etapa pela data correta de squad_deals (requer service role)
          leads = allLeadsMap.get(emp) || 0;
          mql = allMqlMap.get(emp) || 0;
          sql = allSqlMap.get(emp) || 0;
          opp = allOppMap.get(emp) || 0;
          won = allWonMap.get(emp) || 0;
          reserva = allReservaMap.get(emp) || 0;
          contrato = allContratoMap.get(emp) || 0;
          eventos = ev;
        } else {
          // Fallback sem service role: squad_daily_counts + baserow/meta ads
          const baserowLeads = baserowLeadsMap.get(emp) || 0;
          leads = Math.max(baserowLeads > 0 ? baserowLeads : meta.leads, counts.mql);
          mql = counts.mql;
          sql = counts.sql;
          opp = counts.opp;
          won = counts.won;
          reserva = snapshot.reserva;
          contrato = snapshot.contrato;
          eventos = ev;
        }

        return buildFunil(emp, meta.impressions, meta.clicks, leads, mql, sql, opp, won, reserva, contrato, eventos, meta.spend);
      });

      return {
        id: sq.id,
        name: sq.name,
        empreendimentos: empRows,
        totals: sumFunil(empRows, sq.name),
      };
    });

    // Build extra empreendimento rows (not in any squad, but counted in grand total)
    const extraRows: FunilEmpreendimento[] = EXTRA_EMPREENDIMENTOS.map((emp) => {
      const meta = metaMap.get(emp) || { impressions: 0, clicks: 0, leads: 0, spend: 0 };
      const counts = countsMap.get(emp) || { mql: 0, sql: 0, opp: 0, won: 0 };
      const snapshot = snapshotMap.get(emp) || { reserva: 0, contrato: 0 };
      const ev = eventoMap.get(emp) || { oppEvento: 0, reservaEvento: 0, contratoEvento: 0, wonEvento: 0 };

      let leads: number, mql: number, sql: number, opp: number, won: number;
      let reserva: number, contrato: number;
      let eventos: EventoCoorte;

      if (paidOnly) {
        const baserowLeads = baserowLeadsMap.get(emp) || 0;
        const paidMql = paidMqlMap.get(emp) || 0;
        const paidSql = paidSqlMap.get(emp) || 0;
        const paidOpp = paidOppMap.get(emp) || 0;
        const paidWon = paidWonMap.get(emp) || 0;
        const leadsBase = baserowLeads > 0 ? baserowLeads : meta.leads;
        leads = Math.max(leadsBase, paidMql);
        mql = paidMql;
        sql = paidSql;
        opp = paidOpp;
        won = paidWon;
        const ratio = counts.mql > 0 ? paidMql / counts.mql : 0;
        reserva = Math.round(snapshot.reserva * ratio);
        contrato = Math.round(snapshot.contrato * ratio);
        eventos = {
          oppEvento: Math.round(ev.oppEvento * ratio),
          reservaEvento: Math.round(ev.reservaEvento * ratio),
          contratoEvento: Math.round(ev.contratoEvento * ratio),
          wonEvento: Math.round(ev.wonEvento * ratio),
        };
      } else {
        const baserowLeads = baserowLeadsMap.get(emp) || 0;
        leads = Math.max(baserowLeads > 0 ? baserowLeads : meta.leads, counts.mql);
        mql = counts.mql;
        sql = counts.sql;
        opp = counts.opp;
        won = counts.won;
        reserva = snapshot.reserva;
        contrato = snapshot.contrato;
        eventos = ev;
      }

      return buildFunil(emp, meta.impressions, meta.clicks, leads, mql, sql, opp, won, reserva, contrato, eventos, meta.spend);
    });

    const allEmps = [...squads.flatMap((sq) => sq.empreendimentos), ...extraRows];
    const grand = sumFunil(allEmps, "Total");

    // Sobrescrever grand com totais reais de squad_deals (só quando service role disponível)
    if (hasServiceRole()) {
      const maps = paidOnly
        ? { leads: paidLeadsMap, mql: paidMqlMap, sql: paidSqlMap, opp: paidOppMap, won: paidWonMap, reserva: paidReservaMap, contrato: paidContratoMap }
        : { leads: allLeadsMap, mql: allMqlMap, sql: allSqlMap, opp: allOppMap, won: allWonMap, reserva: allReservaMap, contrato: allContratoMap };
      for (const key of ["leads", "mql", "sql", "opp", "won", "reserva", "contrato"] as const) {
        let total = 0;
        for (const [, v] of maps[key]) total += v;
        (grand as unknown as Record<string, number>)[key] = total;
      }
    }

    // Build metas object from nekt_meta26_metas (service role - RLS blocks anon)
    const numSquads = SQUADS.length;
    const metasObj: Record<string, Record<string, number>> = Object.fromEntries(SQUADS.map(sq => [sq.name, {}]));
    const ratios = { mql_sql: 4.12, sql_opp: 3.47, opp_won: 6.01 };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[funil] Missing env vars: NEXT_PUBLIC_SUPABASE_URL=" + !!supabaseUrl + " SUPABASE_SERVICE_ROLE_KEY=" + !!serviceRoleKey);
    } else {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      const monthNum = String(month.split("-")[1]).padStart(2, "0");
      const { data: nektRow, error: nektError } = await supabaseAdmin
        .from("nekt_meta26_metas")
        .select("data, won_szi_meta_pago, won_szi_meta_direto, mql_meta_szi, sql_meta_szi, opp_meta_szi")
        .like("data", `%/${monthNum}/%`)
        .limit(1)
        .single();

      if (nektError) {
        console.error("[funil] nekt_meta26_metas query error:", nektError);
      } else if (nektRow) {
        const wonTotal = (Number(nektRow.won_szi_meta_pago) || 0) + (Number(nektRow.won_szi_meta_direto) || 0);
        const mql = Number(nektRow.mql_meta_szi) || Math.round(wonTotal * ratios.mql_sql * ratios.sql_opp);
        const sql = Number(nektRow.sql_meta_szi) || Math.round(wonTotal * ratios.opp_won);
        const opp = Number(nektRow.opp_meta_szi) || Math.round(wonTotal);
        for (const sq of SQUADS) {
          metasObj[sq.name] = {
            mql: Math.round(mql / numSquads),
            sql: Math.round(sql / numSquads),
            opp: Math.round(opp / numSquads),
            won: Math.round(wonTotal / numSquads),
          };
        }
      }
    }

    const result: FunilData = { month, squads, grand, metas: metasObj };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Funil error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
