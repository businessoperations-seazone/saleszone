// SZS (Serviços) module — uses Nekt API as data source
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const SUPABASE_REF = (Deno.env.get("SUPABASE_URL") || "").replace(/^https?:\/\//, "").split(".")[0];

// ---- REST API helpers (replaces Supabase JS client for DB writes — silent failure bug in Deno) ----
// params uses array of [key, value] pairs to support duplicate keys (e.g. date=gte&date=lte)
async function restDelete(svcKey: string, table: string, params: [string, string][]): Promise<{ error: string | null }> {
  const url = new URL(`https://${SUPABASE_REF}.supabase.co/rest/v1/${table}`);
  for (const [k, v] of params) {
    url.searchParams.append(k, v);
  }
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { "apikey": svcKey, "Authorization": `Bearer ${svcKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { error: `${res.status} ${body}` };
  }
  return { error: null };
}

async function restInsert(svcKey: string, table: string, rows: any[]): Promise<{ error: string | null; inserted: number }> {
  const res = await fetch(`https://${SUPABASE_REF}.supabase.co/rest/v1/${table}`, {
    method: "POST",
    headers: { "apikey": svcKey, "Authorization": `Bearer ${svcKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
  if (res.status === 201) return { error: null, inserted: rows.length };
  const body = await res.text();
  return { error: `${res.status} ${body.substring(0, 200)}`, inserted: 0 };
}

// ---- Nekt API helpers ----
async function queryNekt(sql: string, nektApiKey: string): Promise<Record<string, string | null>[]> {
  const res = await fetch("https://api.nekt.ai/api/v1/sql-query/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": nektApiKey },
    body: JSON.stringify({ sql, mode: "csv" }),
  });
  if (!res.ok) throw new Error(`Nekt API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const url = data.presigned_url || data.presigned_urls?.[0];
  if (!url) throw new Error("Nekt: no presigned_url");
  const csvRes = await fetch(url);
  const csvText = await csvRes.text();
  return parseCSV(csvText);
}

function parseCSV(csv: string): Record<string, string | null>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string | null> = {};
    for (let i = 0; i < headers.length; i++) {
      const val = (values[i] ?? "").trim();
      row[headers[i]] = val === "" || val === "null" ? null : val;
    }
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---- Constants ----
const PIPELINE_ID = 14;


// Canal group mapping: maps Nekt canal NAME to display group
const CANAL_GROUPS: Record<string, string> = {
  "Marketing": "Marketing",
  "Indicação de Corretor": "Ind. Corretor",
  "Indicaçao de Franquia": "Ind. Franquia",  // note: typo in source data (missing ~)
  "Indicação de Franquia": "Ind. Franquia",  // handle both spellings
  "Indicação de outros Parceiros (exceto corretor e franquia)": "Ind. Outros Parceiros",
  "Expansão": "Expansão",
  "Spot Seazone": "Spots",
  "Colaborador Seazone (para compra de Spot)": "Spots",
  "Colaborador Seazone (para Compra De Spot)": "Spots",
  "Mônica": "Mônica",
  "Cliente SZN": "Outros",
  "Indicação de Clientes": "Outros",
  "Indicação de Colaborador": "Outros",
  "Prospecção Ativa": "Outros",
  "Prospecção ativa - IA": "Outros",
  "Indicação de Embaixador": "Outros",
  "Indicação de Hóspede": "Outros",
  "Portais de imóveis": "Outros",
  "Marketing POC": "Outros",
  "Eventos": "Outros",
};
// Any canal not in this map -> "Outros"

// SZS team: single squad with 5 closers
// Note: empreendimentos list is empty — SZS uses dynamic cities from Nekt, not a fixed list
const SQUADS: Array<{ id: number; closers: number; empreendimentos: string[] }> = [
  { id: 1, closers: 5, empreendimentos: [] },
];
const TOTAL_CLOSERS = SQUADS.reduce((sum, sq) => sum + sq.closers, 0);
const TABS = ["mql", "sql", "opp", "won"] as const;
const ALL_TABS = ["mql", "sql", "opp", "won", "reserva", "contrato"] as const;
type Tab = typeof TABS[number];
type AllTab = typeof ALL_TABS[number];

// Stage IDs for Aguardando Dados and Contrato
// SZS uses "Aguardando Dados" (stage 152) instead of "Reserva"
const STAGE_RESERVA = 152;  // "Aguardando Dados"
const STAGE_CONTRATO = 76;  // "Contrato"

const PIPELINE_STAGES: number[] = [70, 71, 72, 345, 341, 73, 342, 151, 74, 75, 152, 76];

const STAGE_ORDER: Record<number, number> = {
  70: 1, 71: 2, 72: 3, 345: 4, 341: 5, 73: 6, 342: 7, 151: 8, 74: 9, 75: 10, 152: 11, 76: 12,
};
const MQL_MIN_ORDER = 2;  // Contatados
const SQL_MIN_ORDER = 4;  // Qualificado
const OPP_MIN_ORDER = 8;  // Reunião Realizada

// ---- Nekt Deal type ----
type NektDeal = Record<string, string | null>;

// ---- Deal helpers (Nekt row format) ----
function getDateField(deal: NektDeal, tab: Tab): string | null {
  switch (tab) {
    case "mql": return deal.negocio_criado_em || null;
    case "sql": return deal.data_de_qualificacao || null;
    case "opp": return deal.data_da_reuniao || null;
    case "won": return deal.ganho_em || null;
  }
}

function getCanalGroup(deal: NektDeal): string {
  const canal = String(deal.canal || "");
  return CANAL_GROUPS[canal] || "Outros";
}

function getCidade(deal: NektDeal): string {
  const cidade = deal.cidade_onde_fica_o_imovel;
  if (!cidade || cidade === "-") return "Sem cidade";
  return cidade.trim();
}


function getBairro(deal: NektDeal): string {
  const val = deal.bairro_do_imovel;
  if (!val || val.trim() === "" || val === "-") return "Sem bairro";
  return val.trim().split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function getDateRange() {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start35 = new Date(now); start35.setDate(start35.getDate() - 35);
  const startDate = start35.toISOString().substring(0, 10);
  return { startDate, endDate };
}

// ---- Count deals across all tabs ----
function countDeals(
  deals: NektDeal[], startDate: string, endDate: string,
  countsPerTab: Record<Tab, Map<string, number>>,
) {
  let mkt = 0;
  for (const deal of deals) {
    if (deal.motivo_da_perda === "Duplicado/Erro") continue;
    mkt++;
    const canalGroup = getCanalGroup(deal);
    const emp = getCidade(deal);
    const bairro = getBairro(deal);
    if (!emp) continue;
    for (const tab of TABS) {
      const dateStr = getDateField(deal, tab);
      if (!dateStr) continue;
      const day = dateStr.substring(0, 10);
      if (day < startDate || day > endDate) continue;
      const key = `${day}|${canalGroup}|${emp}|${bairro}`;
      countsPerTab[tab].set(key, (countsPerTab[tab].get(key) || 0) + 1);
    }
  }
  return mkt;
}

// ---- Write counts to DB ----
async function writeDailyCounts(svcKey: string, countsPerTab: Record<Tab, Map<string, number>>, startDate: string, endDate: string, source: string) {
  const result: Record<string, number> = {};
  for (const tab of TABS) {
    const final = countsPerTab[tab];

    const rows = Array.from(final.entries()).map(([key, count]) => {
      const [date, canal_group, empreendimento, bairro] = key.split("|");
      return { date, tab, canal_group, empreendimento, bairro, count, source, synced_at: new Date().toISOString() };
    });

    // Delete only rows from THIS source (idempotent)
    const del = await restDelete(svcKey, "szs_daily_counts", [
      ["tab", `eq.${tab}`], ["source", `eq.${source}`], ["date", `gte.${startDate}`], ["date", `lte.${endDate}`],
    ]);
    if (del.error) console.error(`  ${tab}: delete error=${del.error}`);

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const ins = await restInsert(svcKey, "szs_daily_counts", batch);
        if (ins.error) console.error(`  ${tab}: insert error=${ins.error}`);
      }
    }
    console.log(`  ${tab}: ${rows.length} rows (source=${source})`);
    result[tab] = rows.length;
  }
  return result;
}

// ---- Count deals in specific stages (snapshot for today) ----
function countDealsByStage(
  deals: NektDeal[],
  stageCounts: Record<"reserva" | "contrato", Map<string, number>>,
) {
  const today = new Date().toISOString().substring(0, 10);
  for (const deal of deals) {
    const canalGroup = getCanalGroup(deal);
    const emp = getCidade(deal);
    const bairro = getBairro(deal);
    if (!emp) continue;
    const stageId = parseInt(deal.etapa || "0");
    if (stageId === STAGE_RESERVA) {
      const key = `${today}|${canalGroup}|${emp}|${bairro}`;
      stageCounts.reserva.set(key, (stageCounts.reserva.get(key) || 0) + 1);
    } else if (stageId === STAGE_CONTRATO) {
      const key = `${today}|${canalGroup}|${emp}|${bairro}`;
      stageCounts.contrato.set(key, (stageCounts.contrato.get(key) || 0) + 1);
    }
  }
}

async function writeStageCounts(svcKey: string, stageCounts: Record<"reserva" | "contrato", Map<string, number>>) {
  const today = new Date().toISOString().substring(0, 10);
  for (const tab of ["reserva", "contrato"] as const) {
    // Delete previous snapshot data for this tab
    const del = await restDelete(svcKey, "szs_daily_counts", [["tab", `eq.${tab}`]]);
    if (del.error) console.error(`  Delete error ${tab}:`, del.error);
    const rows = Array.from(stageCounts[tab].entries()).map(([key, count]) => {
      const [date, canal_group, empreendimento, bairro] = key.split("|");
      return { date, tab, canal_group, empreendimento, bairro, count, synced_at: new Date().toISOString() };
    });
    if (rows.length > 0) {
      const ins = await restInsert(svcKey, "szs_daily_counts", rows);
      if (ins.error) console.error(`  Insert error ${tab}:`, ins.error);
    }
    console.log(`  ${tab}: ${rows.length} rows`);
  }
}

// ---- Nekt SQL column list for deals ----
const NEKT_DEAL_COLUMNS = `id, pipeline_id, status, etapa, canal, empreendimento,
    cidade_onde_fica_o_imovel, bairro_do_imovel, negocio_criado_em, ganho_em, data_de_perda,
    data_de_qualificacao, data_da_reuniao, owner_id, deal_owner_name, motivo_da_perda, titulo`;

// ---- Mode: daily-open (Nekt query, replaces counts) ----
async function syncDailyOpen(nektApiKey: string, supabase: any, svcKey: string) {
  const { startDate, endDate } = getDateRange();
  console.log(`syncDailyOpen: querying Nekt for open deals in pipeline ${PIPELINE_ID}...`);

  const sql = `
    SELECT ${NEKT_DEAL_COLUMNS}
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'open'
  `;
  const deals = await queryNekt(sql, nektApiKey);
  console.log(`syncDailyOpen: fetched ${deals.length} deals from Nekt`);

  const countsPerTab: Record<Tab, Map<string, number>> = {
    mql: new Map(), sql: new Map(), opp: new Map(), won: new Map(),
  };
  const stageCounts: Record<"reserva" | "contrato", Map<string, number>> = {
    reserva: new Map(), contrato: new Map(),
  };

  const mkt = countDeals(deals, startDate, endDate, countsPerTab);
  countDealsByStage(deals, stageCounts);

  const reservaTotal = Array.from(stageCounts.reserva.values()).reduce((a, b) => a + b, 0);
  const contratoTotal = Array.from(stageCounts.contrato.values()).reduce((a, b) => a + b, 0);
  console.log(`  Open deals: ${deals.length}, counted=${mkt}, reserva=${reservaTotal}, contrato=${contratoTotal}`);

  // Write main counts first, then stage counts (so stage counts aren't overwritten)
  const mainResult = await writeDailyCounts(svcKey, countsPerTab, startDate, endDate, "open");
  await writeStageCounts(svcKey, stageCounts);
  return { ...mainResult, reserva: reservaTotal, contrato: contratoTotal };
}

// ---- Mode: daily-won / daily-lost (Nekt query) ----
async function syncDailyByStatus(nektApiKey: string, supabase: any, svcKey: string, status: string) {
  const { startDate, endDate } = getDateRange();
  // Cutoff: won=365d, lost=90d (generous buffer over 35-day window)
  const cutoffDays = status === "lost" ? 90 : 365;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - cutoffDays);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  console.log(`syncDailyByStatus: ${status} from Nekt, cutoff=${cutoffStr}`);

  const dateFilter = status === "won"
    ? `AND ganho_em >= TIMESTAMP '${cutoffStr}'`
    : `AND data_de_perda >= TIMESTAMP '${cutoffStr}'`;

  const sql = `
    SELECT ${NEKT_DEAL_COLUMNS}
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = '${status}'
    ${dateFilter}
  `;
  const deals = await queryNekt(sql, nektApiKey);

  const countsPerTab: Record<Tab, Map<string, number>> = {
    mql: new Map(), sql: new Map(), opp: new Map(), won: new Map(),
  };

  const mkt = countDeals(deals, startDate, endDate, countsPerTab);
  console.log(`  ${status}: ${deals.length} deals, ${mkt} counted`);
  return writeDailyCounts(svcKey, countsPerTab, startDate, endDate, status);
}

// ---- Mode: alignment (Nekt query — no Pipedrive API needed) ----
async function syncAlignment(nektApiKey: string, svcKey: string) {
  console.log(`syncAlignment: querying Nekt for open deals + owner names...`);

  const sql = `
    SELECT id, pipeline_id, canal, cidade_do_imovel, bairro_do_imovel,
           owner_id, deal_owner_name, titulo
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'open'
  `;
  const deals = await queryNekt(sql, nektApiKey);

  const counts = new Map<string, number>();
  const dealRows: Array<{deal_id: number; title: string; empreendimento: string; owner_name: string; synced_at: string}> = [];
  for (const deal of deals) {
    const emp = getCidade(deal);
    if (!emp) continue;
    const ownerName = deal.deal_owner_name || deal.owner_id || "Unknown";
    const key = `${emp}|${ownerName}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    dealRows.push({
      deal_id: parseInt(deal.id || "0"),
      title: deal.titulo || `Deal #${deal.id}`,
      empreendimento: emp,
      owner_name: String(ownerName),
      synced_at: new Date().toISOString(),
    });
  }

  // Write aggregated counts
  await restDelete(svcKey, "szs_alignment", [["empreendimento", "not.is.null"]]);
  const rows = Array.from(counts.entries()).map(([key, count]) => {
    const [empreendimento, owner_name] = key.split("|");
    return { empreendimento, owner_name, count, synced_at: new Date().toISOString() };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const ins = await restInsert(svcKey, "szs_alignment", batch);
      if (ins.error) console.error("Alignment insert error:", ins.error);
    }
  }

  // Write individual deal records
  await restDelete(svcKey, "szs_alignment_deals", [["empreendimento", "not.is.null"]]);
  if (dealRows.length > 0) {
    for (let i = 0; i < dealRows.length; i += 500) {
      const batch = dealRows.slice(i, i + 500);
      const ins = await restInsert(svcKey, "szs_alignment_deals", batch);
      if (ins.error) console.error("Alignment deals insert error:", ins.error);
    }
  }

  console.log(`syncAlignment: ${rows.length} rows, ${dealRows.length} deals (${deals.length} total)`);
  return rows.length;
}

// ---- Mode: metas (DB only) ----
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

async function syncMetas(supabase: any) {
  console.log("syncMetas: calculating from nekt_meta26_metas + szs_daily_counts");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const totalDays = daysInMonth(year, month);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  const metaDateStr = `01/${String(month).padStart(2, "0")}/${year}`;
  const { data: nektMeta, error: nektErr } = await supabase
    .from("nekt_meta26_metas")
    .select("won_szi_meta_pago, won_szi_meta_direto")
    .eq("data", metaDateStr)
    .single();
  if (nektErr || !nektMeta) throw new Error(`nekt_meta26_metas not found for ${metaDateStr}: ${nektErr?.message}`);
  // SZS uses same meta columns as SZI (shared Pipedrive instance)
  const wonMetaTotal = (Number(nektMeta.won_szi_meta_pago) || 0) + (Number(nektMeta.won_szi_meta_direto) || 0);
  const wonPerCloser = TOTAL_CLOSERS > 0 ? wonMetaTotal / TOTAL_CLOSERS : 0;

  const start90 = new Date(now); start90.setDate(start90.getDate() - 90);
  const startDate = start90.toISOString().substring(0, 10);
  const endDate = now.toISOString().substring(0, 10);

  const counts90d: Record<Tab, number> = { mql: 0, sql: 0, opp: 0, won: 0 };
  for (const tab of TABS) {
    const { data: dailyRows } = await supabase
      .from("szs_daily_counts").select("count").eq("tab", tab).gte("date", startDate).lte("date", endDate);
    if (dailyRows) counts90d[tab] = dailyRows.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
    console.log(`  90d ${tab}: ${counts90d[tab]}`);
  }

  const ratioOppWon = counts90d.opp > 0 ? counts90d.won / counts90d.opp : 0;
  const ratioSqlOpp = counts90d.sql > 0 ? counts90d.opp / counts90d.sql : 0;
  const ratioMqlSql = counts90d.mql > 0 ? counts90d.sql / counts90d.mql : 0;
  const ratios = { opp_won: ratioOppWon, sql_opp: ratioSqlOpp, mql_sql: ratioMqlSql };

  const metaRows: any[] = [];
  for (const sq of SQUADS) {
    const wonMetaSquad = wonPerCloser * sq.closers;
    const metas = {
      won: (day / totalDays) * wonMetaSquad,
      opp: (day / totalDays) * ratioOppWon * wonMetaSquad,
      sql: (day / totalDays) * ratioSqlOpp * ratioOppWon * wonMetaSquad,
      mql: (day / totalDays) * ratioMqlSql * ratioSqlOpp * ratioOppWon * wonMetaSquad,
    };
    for (const tab of TABS) {
      metaRows.push({ month: monthStart, squad_id: sq.id, tab, meta: Math.round(metas[tab]), synced_at: new Date().toISOString() });
    }
  }

  await supabase.from("szs_metas").upsert(metaRows, { onConflict: "month,squad_id,tab" });
  await supabase.from("szs_ratios").upsert(
    { month: monthStart, ratios, counts_90d: counts90d, synced_at: new Date().toISOString() },
    { onConflict: "month" },
  );

  // Save daily snapshot to szs_ratios_daily (global + per-canal_group)
  const CANAL_ID_MAP: Record<string, number> = {
    "Marketing": 1,
    "Ind. Corretor": 2, "Ind. Franquia": 2, "Ind. Outros Parceiros": 2, "Parceiros": 2,
    "Expansão": 3, "Spots": 4, "Mônica": 5, "Outros": 6,
  };
  const canalCounts90d: Record<number, Record<Tab, number>> = {};
  for (const cId of Object.values(CANAL_ID_MAP)) {
    canalCounts90d[cId] = { mql: 0, sql: 0, opp: 0, won: 0 };
  }
  for (const tab of TABS) {
    const { data: canalRows } = await supabase
      .from("szs_daily_counts").select("count, canal_group").eq("tab", tab).gte("date", startDate).lte("date", endDate);
    if (canalRows) {
      for (const r of canalRows) {
        const cId = CANAL_ID_MAP[r.canal_group];
        if (cId && canalCounts90d[cId]) canalCounts90d[cId][tab] += r.count || 0;
      }
    }
  }

  const today = endDate;
  const dailyRows = [
    { date: today, squad_id: 0, ratios, counts_90d: counts90d, synced_at: new Date().toISOString() },
  ];
  // Deduplicate by squad_id (CANAL_ID_MAP has multiple keys mapping to same id)
  const seenSquadIds = new Set<number>();
  for (const cId of Object.values(CANAL_ID_MAP)) {
    if (seenSquadIds.has(cId)) continue;
    seenSquadIds.add(cId);
    const cc = canalCounts90d[cId];
    dailyRows.push({
      date: today,
      squad_id: cId,
      ratios: {
        opp_won: cc.opp > 0 ? cc.won / cc.opp : 0,
        sql_opp: cc.sql > 0 ? cc.opp / cc.sql : 0,
        mql_sql: cc.mql > 0 ? cc.sql / cc.mql : 0,
      },
      counts_90d: cc,
      synced_at: new Date().toISOString(),
    });
  }
  const { error: dailyErr } = await supabase
    .from("szs_ratios_daily")
    .upsert(dailyRows, { onConflict: "date,squad_id" });
  if (dailyErr) console.error("szs_ratios_daily upsert error:", dailyErr.message);
  else console.log(`  szs_ratios_daily: ${dailyRows.length} rows for ${today}`);

  console.log(`syncMetas: ${metaRows.length} rows, total_won_meta=${wonMetaTotal}`);
  return { squadMetas: metaRows.length, ratios };
}

// ---- Mode: backfill-monthly-clear ----
async function backfillMonthlyClear(supabase: any) {
  const { error } = await supabase.from("szs_monthly_counts").delete().neq("month", "");
  if (error) throw new Error(`Clear error: ${error.message}`);
  console.log("backfill-monthly-clear: table emptied");
  return { cleared: true };
}

// Count deal into monthly map based on max stage reached
function countDealByStage(deal: NektDeal, maxOrder: number, monthly: Map<string, number>, startDate: string, endDate: string) {
  if (deal.motivo_da_perda === "Duplicado/Erro") return;
  const addTime = deal.negocio_criado_em;
  if (!addTime) return;
  const day = addTime.substring(0, 10);
  if (day < startDate || day > endDate) return;
  const emp = getCidade(deal);
  const bairro = getBairro(deal);
  if (!emp) return;
  const canalGroup = getCanalGroup(deal);
  const month = day.substring(0, 7);

  if (maxOrder >= MQL_MIN_ORDER) {
    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|mql`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|mql`) || 0) + 1);
  }
  if (maxOrder >= SQL_MIN_ORDER) {
    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|sql`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|sql`) || 0) + 1);
  }
  if (maxOrder >= OPP_MIN_ORDER) {
    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|opp`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|opp`) || 0) + 1);
  }
  if (deal.status === "won") {
    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|won`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|won`) || 0) + 1);
  }
}

// ---- Backfill open+won deals (Nekt, stage_id based) ----
async function backfillOpenWon(nektApiKey: string, supabase: any) {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start365 = new Date(now); start365.setDate(start365.getDate() - 365);
  const startDate = start365.toISOString().substring(0, 10);
  console.log(`backfillOpenWon: ${startDate} -> ${endDate}`);

  const monthly = new Map<string, number>();

  // Open deals — etapa is reliable for active deals
  const openSql = `
    SELECT ${NEKT_DEAL_COLUMNS}
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'open'
  `;
  const openDeals = await queryNekt(openSql, nektApiKey);
  let totalOpen = 0;
  for (const deal of openDeals) {
    totalOpen++;
    const currentOrder = STAGE_ORDER[parseInt(deal.etapa || "0")] || 0;
    countDealByStage(deal, currentOrder, monthly, startDate, endDate);
  }

  // Won deals — all at Contrato (order 12)
  const wonSql = `
    SELECT ${NEKT_DEAL_COLUMNS}
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'won'
      AND negocio_criado_em >= TIMESTAMP '${startDate}'
  `;
  const wonDeals = await queryNekt(wonSql, nektApiKey);
  let totalWon = 0;
  for (const deal of wonDeals) {
    totalWon++;
    countDealByStage(deal, 12, monthly, startDate, endDate); // Won = passed all stages (SZS has 12 stages)
  }

  // Upsert (additive)
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, canal_group, empreendimento, bairro, tab] = key.split("|");
    return { month, canal_group, empreendimento, bairro, tab, count };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await supabase.rpc("add_monthly_counts", { rows: batch });
      if (error) console.error(`backfillOpenWon RPC error:`, error.message);
    }
  }

  console.log(`backfillOpenWon: open=${totalOpen} won=${totalWon} rows=${rows.length}`);
  return { totalOpen, totalWon, monthlyRows: rows.length };
}

// ---- Backfill lost deals (Nekt has all data, no flow API needed) ----
async function backfillLostWithFlow(nektApiKey: string, supabase: any, _startFrom: number = 0) {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start365 = new Date(now); start365.setDate(start365.getDate() - 365);
  const startDate = start365.toISOString().substring(0, 10);

  console.log(`backfillLostWithFlow: ${startDate} -> ${endDate}`);

  const sql = `
    SELECT ${NEKT_DEAL_COLUMNS}
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'lost'
      AND negocio_criado_em >= TIMESTAMP '${startDate}'
  `;
  const deals = await queryNekt(sql, nektApiKey);

  const monthly = new Map<string, number>();
  let mktDeals = 0;

  for (const deal of deals) {
    mktDeals++;
    // For lost deals, use current etapa as max stage (Nekt has the stage where deal was lost)
    const currentOrder = STAGE_ORDER[parseInt(deal.etapa || "0")] || 0;
    countDealByStage(deal, currentOrder, monthly, startDate, endDate);
  }

  // Upsert (additive)
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, canal_group, empreendimento, bairro, tab] = key.split("|");
    return { month, canal_group, empreendimento, bairro, tab, count };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await supabase.rpc("add_monthly_counts", { rows: batch });
      if (error) console.error(`backfillLost RPC error:`, error.message);
    }
  }

  console.log(`backfillLostWithFlow: deals=${deals.length} mkt=${mktDeals} rows=${rows.length}`);
  return { dealsScanned: deals.length, mktDeals, flowCalls: 0, monthlyRows: rows.length, nextStart: null, done: true };
}

// ---- Mode: monthly-rollup (stage-based counting for current + prev month, via Nekt) ----
async function syncMonthlyRollup(nektApiKey: string, supabase: any) {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const startDate = `${prevMonth}-01`;
  const endDate = now.toISOString().substring(0, 10);

  console.log(`syncMonthlyRollup (stage-based): ${startDate} -> ${endDate}`);

  const monthly = new Map<string, number>();

  // Fetch all deals (open, won, lost) from Nekt for this period
  const sql = `
    SELECT ${NEKT_DEAL_COLUMNS}
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID}
      AND negocio_criado_em >= TIMESTAMP '${startDate}'
  `;
  const deals = await queryNekt(sql, nektApiKey);
  let totalDeals = 0;

  for (const deal of deals) {
    if (deal.motivo_da_perda === "Duplicado/Erro") continue;
    const addTime = deal.negocio_criado_em;
    if (!addTime) continue;
    const day = addTime.substring(0, 10);
    if (day < startDate || day > endDate) continue;
    totalDeals++;
    const canalGroup = getCanalGroup(deal);
    const emp = getCidade(deal);
    const bairro = getBairro(deal);
    if (!emp) continue;
    const month = day.substring(0, 7);
    const stageOrder = STAGE_ORDER[parseInt(deal.etapa || "0")] || 0;
    const hasQualDate = !!deal.data_de_qualificacao;
    const hasReunDate = !!deal.data_da_reuniao;

    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|mql`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|mql`) || 0) + 1);
    if (stageOrder >= SQL_MIN_ORDER || hasQualDate) {
      monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|sql`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|sql`) || 0) + 1);
    }
    if (stageOrder >= OPP_MIN_ORDER || hasReunDate) {
      monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|opp`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|opp`) || 0) + 1);
    }
    if (deal.status === "won") {
      monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|won`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|won`) || 0) + 1);
    }
  }

  // Upsert (replace) for current + prev month
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, canal_group, empreendimento, bairro, tab] = key.split("|");
    return { month, canal_group, empreendimento, bairro, tab, count, synced_at: new Date().toISOString() };
  });

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("szs_monthly_counts")
      .upsert(rows, { onConflict: "month,empreendimento,tab" });
    if (upsertErr) console.error(`monthly-rollup upsert error:`, upsertErr.message);
  }

  console.log(`syncMonthlyRollup: ${totalDeals} deals -> ${rows.length} monthly rows`);
  return { months: [prevMonth, curMonth], totalDeals, totalRows: rows.length };
}

// ---- Mode: snapshot (Nekt query) ----
async function syncSnapshot(nektApiKey: string, supabase: any) {
  const today = new Date().toISOString().substring(0, 10);
  console.log(`syncSnapshot: querying Nekt for open deals snapshot...`);

  const sql = `
    SELECT id, pipeline_id, status, etapa, canal, motivo_da_perda
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'open'
  `;
  const deals = await queryNekt(sql, nektApiKey);

  const snapCounts: Record<string, { total: number; mql: number; sql: number; opp: number; won: number; ag_dados: number; contrato: number }> = {};
  let snapTotal = 0;

  for (const deal of deals) {
    if (deal.motivo_da_perda === "Duplicado/Erro") continue;
    const cg = getCanalGroup(deal);
    if (!snapCounts[cg]) snapCounts[cg] = { total: 0, mql: 0, sql: 0, opp: 0, won: 0, ag_dados: 0, contrato: 0 };
    const c = snapCounts[cg];
    const so = STAGE_ORDER[parseInt(deal.etapa || "0")] || 0;
    c.total++;
    c.mql++;
    if (so >= SQL_MIN_ORDER) c.sql++;
    if (so >= OPP_MIN_ORDER) c.opp++;
    if (so === 11) c.ag_dados++;
    if (so === 12) c.contrato++;
    snapTotal++;
  }

  // Upsert rows
  const snapRows = Object.entries(snapCounts).map(([canal_group, c]) => ({
    date: today, canal_group, total_open: c.total, mql: c.mql, sql_count: c.sql,
    opp: c.opp, won: c.won, ag_dados: c.ag_dados, contrato: c.contrato,
    synced_at: new Date().toISOString(),
  }));
  if (snapRows.length > 0) {
    const { error: snapErr } = await supabase.from("szs_open_snapshots").upsert(snapRows, { onConflict: "date,canal_group" });
    if (snapErr) console.error("Snapshot upsert error:", snapErr.message);
  }
  return { date: today, groups: snapRows.length, total: snapTotal };
}

// ---- Handler ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const startTime = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get Nekt API key from Vault
    const { data: nektKeyData } = await supabase.rpc("vault_read_secret", { secret_name: "NEKT_API_KEY" });
    const nektApiKey = nektKeyData?.trim();
    if (!nektApiKey) throw new Error("NEKT_API_KEY not found in vault");

    // Parse mode
    let mode = "daily-open";
    let body: any = {};
    try {
      body = await req.json();
      if (body?.mode) mode = body.mode;
    } catch {}
    console.log(`sync-szs-dashboard mode=${mode}`);

    let result;
    switch (mode) {
      case "daily-open":
        result = await syncDailyOpen(nektApiKey, supabase, svcKey);
        break;
      case "daily-won":
        result = await syncDailyByStatus(nektApiKey, supabase, svcKey, "won");
        break;
      case "daily-lost":
        result = await syncDailyByStatus(nektApiKey, supabase, svcKey, "lost");
        break;
      case "alignment":
        result = { rows: await syncAlignment(nektApiKey, svcKey) };
        break;
      case "metas":
        result = await syncMetas(supabase);
        break;
      case "monthly-rollup":
        result = await syncMonthlyRollup(nektApiKey, supabase);
        break;
      case "backfill-monthly-clear":
        result = await backfillMonthlyClear(supabase);
        break;
      case "backfill-open-won":
        result = await backfillOpenWon(nektApiKey, supabase);
        break;
      case "backfill-lost-flows": {
        const startFrom = body?.start || 0;
        result = await backfillLostWithFlow(nektApiKey, supabase, startFrom);
        break;
      }
      case "snapshot":
        result = await syncSnapshot(nektApiKey, supabase);
        break;
      case "all": {
        // Full sync: open + won + alignment + metas (lost runs separately due to volume)
        const daily = await syncDailyOpen(nektApiKey, supabase, svcKey);
        const won = await syncDailyByStatus(nektApiKey, supabase, svcKey, "won");
        const alignment = await syncAlignment(nektApiKey, svcKey);
        const metas = await syncMetas(supabase);
        result = { daily, won, alignment, metas };
        break;
      }
      default:
        return new Response(JSON.stringify({ success: false, error: `Unknown mode: ${mode}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const elapsed = Date.now() - startTime;
    console.log(`sync-szs-dashboard completed in ${elapsed}ms`);
    return new Response(JSON.stringify({ success: true, mode, result, elapsed_ms: elapsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-szs-dashboard fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
