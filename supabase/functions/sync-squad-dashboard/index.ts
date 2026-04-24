import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

// ---- Constants ----
const SUPABASE_REF = (Deno.env.get("SUPABASE_URL") || "").replace(/^https?:\/\//, "").split(".")[0];
const PIPELINE_ID = 28;
const STAGE_RESERVA = 191;
const STAGE_CONTRATO = 192;
const PIPELINE_STAGES: number[] = [392, 184, 186, 338, 346, 339, 187, 340, 208, 312, 313, 311, 191, 192];
const STAGE_ORDER: Record<number, number> = {
  392: 1,  // FUP Parceiro
  184: 2,  // Lead in
  186: 3,  // Contatados
  338: 4,  // Qualificação
  346: 5,  // Qualificado
  339: 6,  // Aguardando data
  187: 7,  // Agendado
  340: 8,  // No Show/Em reagendamento
  208: 9,  // Reunião Realizada/OPP
  312: 10, // FUP
  313: 11, // Negociação
  311: 12, // Fila de espera
  191: 13, // Reservas
  192: 14, // Contrato
};
const MQL_MIN_ORDER = 2;  // Lead in
const SQL_MIN_ORDER = 5;  // Qualificado
const OPP_MIN_ORDER = 9;  // Reunião Realizada/OPP

const SQUADS = [
  { id: 1, closers: 1, empreendimentos: ["Ponta das Canas Spot II", "Marista 144 Spot", "Jurerê Spot II", "Jurerê Spot III", "Vistas de Anitá II"] },
  { id: 2, closers: 1, empreendimentos: ["Natal Spot", "Novo Campeche Spot II", "Caraguá Spot"] },
  { id: 3, closers: 1, empreendimentos: ["Itacaré Spot", "Bonito Spot II", "Barra Grande Spot"] },
];
const TOTAL_CLOSERS = SQUADS.reduce((sum, sq) => sum + sq.closers, 0);
// Empreendimentos fora dos squads ativos mas presentes no pipeline 28 Marketing
// NOTA: Mantenha em sincronia com src/lib/constants.ts (Deno não importa de src/)
const EXTRA_EMPREENDIMENTOS = [
  "Bonito Spot",
  "Santinho Spot",
  "Japaratinga Spot",
  "Imbassaí Spot",
  "Trancoso Spot",
  "Morro das Pedras Spot",
  "Meireles Spot",
];
const ALL_EMPREENDIMENTOS = [...SQUADS.flatMap(sq => sq.empreendimentos), ...EXTRA_EMPREENDIMENTOS];
const TABS = ["mql", "sql", "opp", "won"] as const;
const ALL_TABS = ["mql", "sql", "opp", "won", "reserva", "contrato"] as const;
type Tab = typeof TABS[number];
type AllTab = typeof ALL_TABS[number];

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

// ---- Deal helpers (Nekt row format) ----
type NektDeal = Record<string, string | null>;

function isMarketingDeal(deal: NektDeal): boolean {
  return deal.canal === "Marketing";
}

function getEmpreendimento(deal: NektDeal): string | null {
  const empRaw = deal.empreendimento || null;
  if (!empRaw) return null;
  const empLower = empRaw.toLowerCase();
  const found = ALL_EMPREENDIMENTOS.find(e => e.toLowerCase() === empLower);
  return found || null;
}

function getDateField(deal: NektDeal, tab: Tab): string | null {
  switch (tab) {
    case "mql": return deal.deal_created || null;
    case "sql": return deal.data_de_qualificacao || null;
    case "opp": return deal.data_da_reuniao || null;
    case "won": return deal.won_time || null;
  }
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
  let mkt = 0, mktNoEmp = 0, dateFiltered = 0;
  for (const deal of deals) {
    if (!isMarketingDeal(deal)) continue;
    if (deal.motivo_da_perda === "Duplicado/Erro") continue;
    mkt++;
    const emp = getEmpreendimento(deal);
    if (!emp) { mktNoEmp++; continue; }
    let countForThis = 0;
    for (const tab of TABS) {
      const dateStr = getDateField(deal, tab);
      if (!dateStr) continue;
      const day = dateStr.substring(0, 10);
      if (day < startDate || day > endDate) continue;
      countForThis++;
      const key = `${day}|${emp}`;
      countsPerTab[tab].set(key, (countsPerTab[tab].get(key) || 0) + 1);
    }
    if (countForThis === 0) dateFiltered++;
  }
  console.log(`  countDeals: mkt=${mkt} mkt_no_emp=${mktNoEmp} date_filtered=${dateFiltered} Map sizes: mql=${countsPerTab.mql.size} sql=${countsPerTab.sql.size} opp=${countsPerTab.opp.size} won=${countsPerTab.won.size}`);
  return mkt;
}

// ---- REST API helpers (replaces Supabase JS client for DB writes — JS client silently fails in Deno) ----
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
  if (res.status === 201) {
    return { error: null, inserted: rows.length };
  }
  const body = await res.text();
  return { error: `${res.status} ${body.substring(0, 200)}`, inserted: 0 };
}

// ---- Write counts to DB (REST API — Supabase JS client silently fails in Deno Edge Functions) ----
async function writeDailyCounts(svcKey: string, countsPerTab: Record<Tab, Map<string, number>>, startDate: string, endDate: string, source: string) {
  const result: Record<string, number> = {};
  for (const tab of TABS) {
    const final = countsPerTab[tab];

    const rows = Array.from(final.entries()).map(([key, count]) => {
      const [date, empreendimento] = key.split("|");
      return { date, tab, empreendimento, count, source, synced_at: new Date().toISOString() };
    });

    // Delete only rows from THIS source (idempotent)
    const del = await restDelete(svcKey, "squad_daily_counts", [
      ["tab", `eq.${tab}`], ["source", `eq.${source}`], ["date", `gte.${startDate}`], ["date", `lte.${endDate}`],
    ]);
    if (del.error) {
      console.error(`  ${tab}: delete error=${del.error}`);
    }

    let totalInserted = 0;
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const ins = await restInsert(svcKey, "squad_daily_counts", batch);
        if (ins.error) {
          console.error(`  ${tab}: insert error=${ins.error}`);
        } else {
          totalInserted += ins.inserted;
        }
      }
    }
    result[tab] = totalInserted;
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
    if (!isMarketingDeal(deal)) continue;
    if (deal.motivo_da_perda === "Duplicado/Erro") continue;
    const emp = getEmpreendimento(deal);
    if (!emp) continue;
    const stageId = parseInt(deal.stage || "0");
    if (stageId === STAGE_RESERVA) {
      const key = `${today}|${emp}`;
      stageCounts.reserva.set(key, (stageCounts.reserva.get(key) || 0) + 1);
    } else if (stageId === STAGE_CONTRATO) {
      const key = `${today}|${emp}`;
      stageCounts.contrato.set(key, (stageCounts.contrato.get(key) || 0) + 1);
    }
  }
}

async function writeStageCounts(svcKey: string, stageCounts: Record<"reserva" | "contrato", Map<string, number>>) {
  const today = new Date().toISOString().substring(0, 10);
  for (const tab of ["reserva", "contrato"] as const) {
    // Delete previous snapshot data for this tab (no source filter — replaces all)
    const del = await restDelete(svcKey, "squad_daily_counts", [["tab", `eq.${tab}`]]);
    if (del.error) console.error(`Delete error ${tab}:`, del.error);
    const rows = Array.from(stageCounts[tab].entries()).map(([key, count]) => {
      const [date, empreendimento] = key.split("|");
      return { date, tab, empreendimento, count, synced_at: new Date().toISOString() };
    });
    if (rows.length > 0) {
      const ins = await restInsert(svcKey, "squad_daily_counts", rows);
      if (ins.error) {
        console.error(`Insert error ${tab}: ${ins.error}`);
      } else {
        console.log(`  ${tab}: ${ins.inserted} rows inserted`);
      }
    }
    console.log(`  ${tab}: ${rows.length} rows`);
  }
}

// ---- Mode: daily-open ----
async function syncDailyOpen(nektApiKey: string, supabase: any, svcKey: string) {
  const { startDate, endDate } = getDateRange();
  console.log(`syncDailyOpen: startDate=${startDate} endDate=${endDate}`);
  console.log(`syncDailyOpen: querying Nekt for open deals in pipeline ${PIPELINE_ID}...`);

  const sql = `
    SELECT id, pipeline_id, status, stage, canal, empreendimento,
           deal_created, won_time, lost_time,
           data_de_qualificacao, data_da_reuniao, owner_id, motivo_da_perda
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'open'
  `;
  const deals = await queryNekt(sql, nektApiKey);
  console.log(`syncDailyOpen: fetched ${deals.length} deals from Nekt`);
  // Debug: show first 3 deals
  for (let i = 0; i < Math.min(3, deals.length); i++) {
    console.log(`  Deal ${i}: canal=${deals[i].canal} emp=${deals[i].empreendimento} mql_date=${deals[i].deal_created}`);
  }

  const countsPerTab: Record<Tab, Map<string, number>> = {
    mql: new Map(), sql: new Map(), opp: new Map(), won: new Map(),
  };
  const stageCounts: Record<"reserva" | "contrato", Map<string, number>> = {
    reserva: new Map(), contrato: new Map(),
  };

  const mkt = countDeals(deals, startDate, endDate, countsPerTab);
  countDealsByStage(deals, stageCounts);

  // Debug: log Map entries
  for (const tab of TABS) {
    const entries = Array.from(countsPerTab[tab].entries());
    console.log(`  ${tab} Map: ${entries.length} entries, sum=${entries.reduce((s,[,v])=>s+v,0)}`);
    if (entries.length > 0 && entries.length <= 10) {
      entries.forEach(([k, v]) => console.log(`    ${k}: ${v}`));
    }
  }

  const reservaTotal = Array.from(stageCounts.reserva.values()).reduce((a, b) => a + b, 0);
  const contratoTotal = Array.from(stageCounts.contrato.values()).reduce((a, b) => a + b, 0);
  console.log(`  Open deals: ${deals.length}, marketing=${mkt}, reserva=${reservaTotal}, contrato=${contratoTotal}`);

  const mainResult = await writeDailyCounts(svcKey, countsPerTab, startDate, endDate, "open");
  await writeStageCounts(svcKey, stageCounts);
  return { ...mainResult, reserva: reservaTotal, contrato: contratoTotal };
}

// ---- Mode: daily-won / daily-lost ----
async function syncDailyByStatus(nektApiKey: string, supabase: any, svcKey: string, status: string) {
  const { startDate, endDate } = getDateRange();
  const cutoffDays = status === "lost" ? 90 : 365;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - cutoffDays);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  console.log(`syncDailyByStatus: ${status} from Nekt, cutoff=${cutoffStr}`);

  const dateFilter = status === "won"
    ? `AND won_time >= TIMESTAMP '${cutoffStr}'`
    : `AND lost_time >= TIMESTAMP '${cutoffStr}'`;

  const sql = `
    SELECT id, pipeline_id, status, stage, canal, empreendimento,
           deal_created, won_time, lost_time,
           data_de_qualificacao, data_da_reuniao, owner_id, motivo_da_perda
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = '${status}'
    ${dateFilter}
  `;
  const deals = await queryNekt(sql, nektApiKey);

  const countsPerTab: Record<Tab, Map<string, number>> = {
    mql: new Map(), sql: new Map(), opp: new Map(), won: new Map(),
  };

  const mkt = countDeals(deals, startDate, endDate, countsPerTab);
  console.log(`  ${status}: ${deals.length} deals, ${mkt} marketing`);
  return writeDailyCounts(svcKey, countsPerTab, startDate, endDate, status);
}

// ---- Mode: alignment ----
async function syncAlignment(nektApiKey: string, svcKey: string) {
  console.log(`syncAlignment: querying Nekt for open deals + users...`);

  const sql = `
    SELECT d.id, d.pipeline_id, d.canal, d.empreendimento, d.owner_id,
           d.title, u.name AS owner_name
    FROM nekt_silver.pipedrive_deals_readable d
    LEFT JOIN nekt_silver.pipedrive_v2_users_scd2 u ON d.owner_id = u.id
    WHERE d.pipeline_id = ${PIPELINE_ID} AND d.status = 'open'
  `;
  const deals = await queryNekt(sql, nektApiKey);

  const counts = new Map<string, number>();
  const dealRows: Array<{deal_id: number; title: string; empreendimento: string; owner_name: string; synced_at: string}> = [];
  const seenDealIds = new Set<number>();

  for (const deal of deals) {
    const emp = getEmpreendimento(deal);
    if (!emp) continue;
    const dealId = parseInt(deal.id || "0");
    if (seenDealIds.has(dealId)) continue; // SCD2 join can produce duplicates
    seenDealIds.add(dealId);
    const ownerName = deal.owner_name || deal.owner_id || "Unknown";
    const key = `${emp}|${ownerName}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    dealRows.push({
      deal_id: dealId,
      title: deal.title || `Deal #${deal.id}`,
      empreendimento: emp,
      owner_name: ownerName,
      synced_at: new Date().toISOString(),
    });
  }

  // Write aggregated counts (REST API)
  await restDelete(svcKey, "squad_alignment", [["empreendimento", "not.is.null"]]);
  const rows = Array.from(counts.entries()).map(([key, count]) => {
    const [empreendimento, owner_name] = key.split("|");
    return { empreendimento, owner_name, count, synced_at: new Date().toISOString() };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const ins = await restInsert(svcKey, "squad_alignment", batch);
      if (ins.error) console.error("Alignment insert error:", ins.error);
    }
  }

  // Write individual deal records (REST API)
  await restDelete(svcKey, "squad_alignment_deals", [["empreendimento", "not.is.null"]]);
  if (dealRows.length > 0) {
    for (let i = 0; i < dealRows.length; i += 500) {
      const batch = dealRows.slice(i, i + 500);
      const ins = await restInsert(svcKey, "squad_alignment_deals", batch);
      if (ins.error) console.error("Alignment deals insert error:", ins.error);
    }
  }

  console.log(`syncAlignment: ${rows.length} rows, ${dealRows.length} deals (${deals.length} total)`);
  return rows.length;
}

// ---- Mode: metas (DB only — unchanged) ----
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

async function syncMetas(supabase: any) {
  console.log("syncMetas: calculating from nekt_meta26_metas + squad_daily_counts");
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
  const wonMetaTotal = (Number(nektMeta.won_szi_meta_pago) || 0) + (Number(nektMeta.won_szi_meta_direto) || 0);
  const wonPerCloser = wonMetaTotal / TOTAL_CLOSERS;

  const start90 = new Date(now); start90.setDate(start90.getDate() - 90);
  const startDate = start90.toISOString().substring(0, 10);
  const endDate = now.toISOString().substring(0, 10);

  const counts90d: Record<Tab, number> = { mql: 0, sql: 0, opp: 0, won: 0 };
  for (const tab of TABS) {
    const { data: dailyRows } = await supabase
      .from("squad_daily_counts").select("count").eq("tab", tab).gte("date", startDate).lte("date", endDate);
    if (dailyRows) counts90d[tab] = dailyRows.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
    console.log(`  90d ${tab}: ${counts90d[tab]}`);
  }

  const ratioOppWon = counts90d.won > 0 ? counts90d.opp / counts90d.won : 0;
  const ratioSqlOpp = counts90d.opp > 0 ? counts90d.sql / counts90d.opp : 0;
  const ratioMqlSql = counts90d.sql > 0 ? counts90d.mql / counts90d.sql : 0;
  const ratios = { opp_won: ratioOppWon, sql_opp: ratioSqlOpp, mql_sql: ratioMqlSql };

  // Calculate per-squad 90d counts and ratios
  const squadCounts90d: Record<number, Record<Tab, number>> = {};
  const squadRatios: Record<number, { mql_sql: number; sql_opp: number; opp_won: number }> = {};
  for (const sq of SQUADS) {
    const sc: Record<Tab, number> = { mql: 0, sql: 0, opp: 0, won: 0 };
    for (const tab of TABS) {
      const { data: sqRows } = await supabase
        .from("squad_daily_counts").select("count, empreendimento").eq("tab", tab).gte("date", startDate).lte("date", endDate);
      if (sqRows) {
        sc[tab] = sqRows
          .filter((r: any) => sq.empreendimentos.includes(r.empreendimento))
          .reduce((sum: number, r: any) => sum + (r.count || 0), 0);
      }
    }
    squadCounts90d[sq.id] = sc;
    squadRatios[sq.id] = {
      opp_won: sc.won > 0 ? sc.opp / sc.won : 0,
      sql_opp: sc.opp > 0 ? sc.sql / sc.opp : 0,
      mql_sql: sc.sql > 0 ? sc.mql / sc.sql : 0,
    };
    console.log(`  Squad ${sq.id} 90d: mql=${sc.mql} sql=${sc.sql} opp=${sc.opp} won=${sc.won}`);
  }

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
      metaRows.push({ month: monthStart, squad_id: sq.id, tab, meta: metas[tab], synced_at: new Date().toISOString() });
    }
  }

  await supabase.from("squad_metas").upsert(metaRows, { onConflict: "month,squad_id,tab" });
  await supabase.from("squad_ratios").upsert(
    { month: monthStart, ratios, counts_90d: counts90d, synced_at: new Date().toISOString() },
    { onConflict: "month" },
  );

  // Save daily snapshot to squad_ratios_daily (global + per-squad)
  const today = endDate;
  const dailyRows = [
    { date: today, squad_id: 0, ratios, counts_90d: counts90d, synced_at: new Date().toISOString() },
    ...SQUADS.map(sq => ({
      date: today,
      squad_id: sq.id,
      ratios: squadRatios[sq.id],
      counts_90d: squadCounts90d[sq.id],
      synced_at: new Date().toISOString(),
    })),
  ];
  const { error: dailyErr } = await supabase
    .from("squad_ratios_daily")
    .upsert(dailyRows, { onConflict: "date,squad_id" });
  if (dailyErr) console.error("squad_ratios_daily upsert error:", dailyErr.message);
  else console.log(`  squad_ratios_daily: ${dailyRows.length} rows for ${today}`);

  console.log(`syncMetas: ${metaRows.length} rows, total_won_meta=${wonMetaTotal}`);
  return { squadMetas: metaRows.length, ratios };
}

// ---- Mode: backfill-monthly-clear ----
async function backfillMonthlyClear(supabase: any) {
  const { error } = await supabase.from("squad_monthly_counts").delete().neq("month", "");
  if (error) throw new Error(`Clear error: ${error.message}`);
  console.log("backfill-monthly-clear: table emptied");
  return { cleared: true };
}

// Count deal into monthly map based on max stage reached
function countDealByStage(deal: NektDeal, maxOrder: number, monthly: Map<string, number>, startDate: string, endDate: string) {
  if (deal.motivo_da_perda === "Duplicado/Erro") return;
  const addTime = deal.deal_created;
  if (!addTime) return;
  const day = addTime.substring(0, 10);
  if (day < startDate || day > endDate) return;
  const emp = getEmpreendimento(deal);
  if (!emp) return;
  const month = day.substring(0, 7);

  if (maxOrder >= MQL_MIN_ORDER) {
    monthly.set(`${month}|${emp}|mql`, (monthly.get(`${month}|${emp}|mql`) || 0) + 1);
  }
  if (maxOrder >= SQL_MIN_ORDER) {
    monthly.set(`${month}|${emp}|sql`, (monthly.get(`${month}|${emp}|sql`) || 0) + 1);
  }
  if (maxOrder >= OPP_MIN_ORDER) {
    monthly.set(`${month}|${emp}|opp`, (monthly.get(`${month}|${emp}|opp`) || 0) + 1);
  }
  if (deal.status === "won") {
    monthly.set(`${month}|${emp}|won`, (monthly.get(`${month}|${emp}|won`) || 0) + 1);
  }
}

// ---- Backfill open+won deals ----
async function backfillOpenWon(nektApiKey: string, supabase: any) {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start365 = new Date(now); start365.setDate(start365.getDate() - 365);
  const startDate = start365.toISOString().substring(0, 10);
  console.log(`backfillOpenWon: ${startDate} → ${endDate}`);

  const monthly = new Map<string, number>();

  // Open deals — stage (stage) is reliable for active deals
  const openSql = `
    SELECT id, pipeline_id, status, stage, canal, empreendimento,
           deal_created, won_time, data_de_qualificacao, data_da_reuniao, motivo_da_perda
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'open' AND canal = 'Marketing'
  `;
  const openDeals = await queryNekt(openSql, nektApiKey);
  let totalOpen = 0;
  for (const deal of openDeals) {
    if (!getEmpreendimento(deal)) continue;
    totalOpen++;
    const currentOrder = STAGE_ORDER[parseInt(deal.stage || "0")] || 0;
    countDealByStage(deal, currentOrder, monthly, startDate, endDate);
  }

  // Won deals — all at Contrato (order 14)
  const wonSql = `
    SELECT id, pipeline_id, status, stage, canal, empreendimento,
           deal_created, won_time, data_de_qualificacao, data_da_reuniao, motivo_da_perda
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'won' AND canal = 'Marketing'
      AND deal_created >= TIMESTAMP '${startDate}'
  `;
  const wonDeals = await queryNekt(wonSql, nektApiKey);
  let totalWon = 0;
  for (const deal of wonDeals) {
    if (!getEmpreendimento(deal)) continue;
    totalWon++;
    countDealByStage(deal, 14, monthly, startDate, endDate);
  }

  // Upsert (additive)
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, empreendimento, tab] = key.split("|");
    return { month, empreendimento, tab, count };
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

  console.log(`backfillLostWithFlow: ${startDate} → ${endDate}`);

  const sql = `
    SELECT id, pipeline_id, status, stage, canal, empreendimento,
           deal_created, won_time, data_de_qualificacao, data_da_reuniao, motivo_da_perda
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND status = 'lost' AND canal = 'Marketing'
      AND deal_created >= TIMESTAMP '${startDate}'
  `;
  const deals = await queryNekt(sql, nektApiKey);

  const monthly = new Map<string, number>();
  let mktDeals = 0;

  for (const deal of deals) {
    if (!getEmpreendimento(deal)) continue;
    mktDeals++;
    // For lost deals, use current stage as max stage (Nekt has the stage where deal was lost)
    const currentOrder = STAGE_ORDER[parseInt(deal.stage || "0")] || 0;
    countDealByStage(deal, currentOrder, monthly, startDate, endDate);
  }

  // Upsert (additive)
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, empreendimento, tab] = key.split("|");
    return { month, empreendimento, tab, count };
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

// ---- Mode: monthly-rollup (stage-based counting for current + prev month) ----
async function syncMonthlyRollup(nektApiKey: string, supabase: any) {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const startDate = `${prevMonth}-01`;
  const endDate = now.toISOString().substring(0, 10);

  console.log(`syncMonthlyRollup (stage-based): ${startDate} → ${endDate}`);

  const monthly = new Map<string, number>();

  // Fetch all deals (open, won, lost) from Nekt for this period
  const sql = `
    SELECT id, pipeline_id, status, stage, canal, empreendimento,
           deal_created, won_time, data_de_qualificacao, data_da_reuniao, motivo_da_perda
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = ${PIPELINE_ID} AND canal = 'Marketing'
      AND deal_created >= TIMESTAMP '${startDate}'
  `;
  const deals = await queryNekt(sql, nektApiKey);
  let totalDeals = 0;

  for (const deal of deals) {
    const emp = getEmpreendimento(deal);
    if (!emp) continue;
    const addTime = deal.deal_created;
    if (!addTime) continue;
    const day = addTime.substring(0, 10);
    if (day < startDate || day > endDate) continue;
    totalDeals++;
    const month = day.substring(0, 7);
    const stageOrder = STAGE_ORDER[parseInt(deal.stage || "0")] || 0;
    const hasQualDate = !!deal.data_de_qualificacao;
    const hasReunDate = !!deal.data_da_reuniao;

    monthly.set(`${month}|${emp}|mql`, (monthly.get(`${month}|${emp}|mql`) || 0) + 1);
    if (stageOrder >= SQL_MIN_ORDER || hasQualDate) {
      monthly.set(`${month}|${emp}|sql`, (monthly.get(`${month}|${emp}|sql`) || 0) + 1);
    }
    if (stageOrder >= OPP_MIN_ORDER || hasReunDate) {
      monthly.set(`${month}|${emp}|opp`, (monthly.get(`${month}|${emp}|opp`) || 0) + 1);
    }
    if (deal.status === "won") {
      monthly.set(`${month}|${emp}|won`, (monthly.get(`${month}|${emp}|won`) || 0) + 1);
    }
  }

  // Upsert (replace) for current + prev month
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, empreendimento, tab] = key.split("|");
    return { month, empreendimento, tab, count, synced_at: new Date().toISOString() };
  });

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("squad_monthly_counts")
      .upsert(rows, { onConflict: "month,empreendimento,tab" });
    if (upsertErr) console.error(`monthly-rollup upsert error:`, upsertErr.message);
  }

  console.log(`syncMonthlyRollup: ${totalDeals} deals → ${rows.length} monthly rows`);
  return { months: [prevMonth, curMonth], totalDeals, totalRows: rows.length };
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
    console.log(`sync-squad-dashboard mode=${mode}`);

    const debugMode = body?.debug === true;
    let result;
    switch (mode) {
      case "daily-open":
        const openResult = await syncDailyOpen(nektApiKey, supabase, svcKey);
        if (debugMode) {
          // Return debug info instead of writing to DB
          return new Response(JSON.stringify({ success: true, mode, debug: openResult }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = openResult;
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
      case "all": {
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
    console.log(`sync-squad-dashboard completed in ${elapsed}ms`);
    return new Response(JSON.stringify({ success: true, mode, result, elapsed_ms: elapsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-squad-dashboard fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
