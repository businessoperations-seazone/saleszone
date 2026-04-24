// MKTP (Marketplace) module — auto-generated from SZI equivalent
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SUPABASE_REF derivado do env SUPABASE_URL em runtime (ex: https://gamswizeexihaymfweeq.supabase.co → gamswizeexihaymfweeq)
const SUPABASE_REF = (Deno.env.get("SUPABASE_URL") || "").replace(/^https?:\/\//, "").split(".")[0];

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
  if (!res.ok) { const body = await res.text(); return { error: `${res.status} ${body}` }; }
  return { error: null };
}

async function restInsert(svcKey: string, table: string, rows: any[]): Promise<{ error: string | null; inserted: number }> {
  if (rows.length === 0) return { error: null, inserted: 0 };
  const res = await fetch(`https://${SUPABASE_REF}.supabase.co/rest/v1/${table}`, {
    method: "POST",
    headers: { "apikey": svcKey, "Authorization": `Bearer ${svcKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
  if (res.status === 201) return { error: null, inserted: rows.length };
  const body = await res.text();
  return { error: `${res.status} ${body.substring(0, 200)}`, inserted: 0 };
}

async function restUpsert(svcKey: string, table: string, rows: any[], onConflict: string): Promise<{ error: string | null; inserted: number }> {
  if (rows.length === 0) return { error: null, inserted: 0 };
  const res = await fetch(`https://${SUPABASE_REF}.supabase.co/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { "apikey": svcKey, "Authorization": `Bearer ${svcKey}`, "Content-Type": "application/json", "Prefer": `resolution=merge-duplicates` },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { error: null, inserted: rows.length };
  const body = await res.text();
  return { error: `${res.status} ${body.substring(0, 200)}`, inserted: 0 };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
// ---- Pipedrive constants ----
const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";
const BASE = `https://${PIPEDRIVE_DOMAIN}/api/v1`;
const PIPELINE_ID = 37;
const FIELD_CANAL = "93b3ada8b94bd1fc4898a25754d6bcac2713f835";
const FIELD_EMPREENDIMENTO = "6d565fd4fce66c16da078f520a685fa2fa038272";
const FIELD_QUALIFICACAO = "bc74bcc4326527cbeb331d1697d4c8812d68506e";
const FIELD_REUNIAO = "bfafc352c5c6f2edbaa41bf6d1c6daa825fc9c16";
const CANAL_MARKETING_ID = "12";

/* ── Canal-group mapping for Resultados MKTP ── */
const MKTP_CANAL_GROUPS: Record<string, string> = {
  "582": "Parcerias",    // Indicação de Corretor
  "583": "Parcerias",    // Indicação de Franquia
  "2876": "Parcerias",   // Indicação de Outros Parceiros
};

function getCanalGroup(deal: any): string {
  const canal = String(deal[FIELD_CANAL] || "");
  return MKTP_CANAL_GROUPS[canal] || "Vendas Diretas";
}
const EMPREENDIMENTO_MAP: Record<string, string> = {
  "3313": "Altavista",
  "1132": "Barra de São Miguel Spot",
  "3478": "Barra Grande Spot",
  "462": "Barra Spot",
  "2840": "Batel Spot",
  "3303": "Bonito Spot",
  "3451": "Bonito Spot II",
  "3266": "Cachoeira Beach Spot",
  "2835": "Cachoeira Spot",
  "2324": "Campeche Spot",
  "4090": "Canas Beach Spot",
  "2573": "Canasvieiras Spot",
  "692": "Canela Spot",
  "3416": "Caraguá Spot",
  "510": "Downtown",
  "1125": "Duetto",
  "4271": "Farol da Barra Spot",
  "4056": "Foz Spot",
  "3201": "Ilha do Campeche II Spot",
  "2607": "Ilha do Campeche Spot",
  "828": "Imbassaí Spot",
  "464": "Ingleses Spot",
  "3467": "Itacaré Spot",
  "466": "Japaratinga Spot",
  "3985": "Jardim dos Namorados",
  "2904": "Jurerê Beach Spot",
  "506": "Jurerê Spot",
  "3333": "Jurerê Spot II",
  "4586": "Jurerê Spot III",
  "505": "Lagoa Spot",
  "2935": "Marista 144 Spot",
  "1126": "Maxxi Garden",
  "3158": "Meireles Spot",
  "2885": "Morro das Pedras Spot",
  "1127": "Mosaico",
  "4495": "Natal Spot",
  "3182": "New Life",
  "4292": "Novo Campeche Spot",
  "4655": "Novo Campeche Spot II",
  "636": "Olímpia Spot",
  "490": "Penha Spot",
  "1124": "Pio 4",
  "3489": "Ponta das Canas Spot",
  "4109": "Ponta das Canas Spot II",
  "1128": "Reflect",
  "2795": "Rosa Norte Spot",
  "504": "Rosa Spot",
  "463": "Rosa Sul Spot",
  "1447": "Salvador Spot",
  "3298": "Santinho Spot",
  "3119": "Santo Antônio Spot",
  "3308": "Soul Guarajuba",
  "2868": "Sul da Ilha Spot",
  "1129": "T58",
  "824": "Top Club",
  "1171": "Trancoso Spot",
  "465": "Urubici Spot",
  "2526": "Urubici Spot II",
  "2415": "Vale do Ouro",
  "461": "Vistas de Anitá I",
  "637": "Vistas de Anitá II",
  "2745": "VN Ueno",
  "3309": "Zn Barra",
};
// MKTP team: single squad with 2 closers (Nevine Saratt, Willian Miranda)
const SQUADS: Array<{ id: number; closers: number; empreendimentos: string[] }> = [
  { id: 1, closers: 2, empreendimentos: Object.values(EMPREENDIMENTO_MAP) },
];
const TOTAL_CLOSERS = SQUADS.reduce((sum, sq) => sum + sq.closers, 0);
const TABS = ["mql", "sql", "opp", "won"] as const;
const ALL_TABS = ["mql", "sql", "opp", "won", "reserva", "contrato"] as const;
type Tab = typeof TABS[number];
type AllTab = typeof ALL_TABS[number];

// Stage IDs for Reserva and Contrato
const STAGE_RESERVA = 305;
const STAGE_CONTRATO = 271;

const PIPELINE_STAGES: number[] = [336, 335, 334, 347, 333, 284, 337, 274, 308, 309, 393, 305, 271];

// ---- Pipedrive API ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pipedriveGet(apiToken: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_token", apiToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const RETRY_DELAYS = [5_000, 15_000, 30_000];
  for (let attempt = 0; attempt <= 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 3) {
      console.warn(`Pipedrive 429 on ${path}, retry ${attempt + 1}/3 in ${RETRY_DELAYS[attempt] / 1000}s`);
      await sleep(RETRY_DELAYS[attempt]);
      continue;
    }
    throw new Error(`Pipedrive ${path}: ${res.status}`);
  }
  throw new Error(`Pipedrive ${path}: max retries exceeded`);
}

// ---- Deal helpers ----
function getDateField(deal: any, tab: Tab): string | null {
  switch (tab) {
    case "mql": return deal.add_time || null;
    case "sql": return deal[FIELD_QUALIFICACAO] || null;
    case "opp": return deal[FIELD_REUNIAO] || null;
    case "won": return deal.won_time || null;
  }
}

function isMarketingDeal(deal: any) {
  return String(deal[FIELD_CANAL]) === CANAL_MARKETING_ID;
}

function getEmpreendimento(deal: any) {
  const enumId = String(deal[FIELD_EMPREENDIMENTO] || "");
  return EMPREENDIMENTO_MAP[enumId] || null;
}

function getDateRange() {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start35 = new Date(now); start35.setDate(start35.getDate() - 35);
  const startDate = start35.toISOString().substring(0, 10);
  return { startDate, endDate };
}

// ---- Stream deals from API, counting all tabs ----
function countDeals(
  deals: any[], startDate: string, endDate: string,
  countsPerTab: Record<Tab, Map<string, number>>,
) {
  let mkt = 0;
  for (const deal of deals) {
    // Filter to MKTP pipeline only (/deals endpoint returns ALL pipelines)
    if (deal.pipeline_id !== PIPELINE_ID) continue;
    if (!isMarketingDeal(deal)) continue;
    if (deal.lost_reason === "Duplicado/Erro") continue;
    mkt++;
    const emp = getEmpreendimento(deal);
    if (!emp) continue;
    for (const tab of TABS) {
      const dateStr = getDateField(deal, tab);
      if (!dateStr) continue;
      const day = dateStr.substring(0, 10);
      if (day < startDate || day > endDate) continue;
      const key = `${day}|${emp}`;
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
      const [date, empreendimento] = key.split("|");
      return { date, tab, empreendimento, count, source, synced_at: new Date().toISOString() };
    });

    // Delete only rows from THIS source (idempotent)
    const del = await restDelete(svcKey, "mktp_daily_counts", [
      ["tab", `eq.${tab}`], ["source", `eq.${source}`], ["date", `gte.${startDate}`], ["date", `lte.${endDate}`],
    ]);
    if (del.error) console.error(`  ${tab}: delete error=${del.error}`);

    let totalInserted = 0;
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const ins = await restInsert(svcKey, "mktp_daily_counts", batch);
        if (ins.error) console.error(`  ${tab}: insert error=${ins.error}`);
        else totalInserted += ins.inserted;
      }
    }
    console.log(`  ${tab}: ${rows.length} rows (source=${source})`);
    result[tab] = totalInserted;
  }
  return result;
}

// ---- Count deals in specific stages (snapshot for today) ----
function countDealsByStage(
  deals: any[],
  stageCounts: Record<"reserva" | "contrato", Map<string, number>>,
) {
  const today = new Date().toISOString().substring(0, 10);
  for (const deal of deals) {
    if (!isMarketingDeal(deal)) continue;
    const emp = getEmpreendimento(deal);
    if (!emp) continue;
    const stageId = deal.stage_id;
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
    // Delete previous snapshot data for this tab
    const del = await restDelete(svcKey, "mktp_daily_counts", [["tab", `eq.${tab}`]]);
    if (del.error) console.error(`  ${tab}: delete error=${del.error}`);
    const rows = Array.from(stageCounts[tab].entries()).map(([key, count]) => {
      const [date, empreendimento] = key.split("|");
      return { date, tab, empreendimento, count, synced_at: new Date().toISOString() };
    });
    if (rows.length > 0) {
      const ins = await restInsert(svcKey, "mktp_daily_counts", rows);
      if (ins.error) console.error(`  ${tab}: insert error=${ins.error}`);
    }
    console.log(`  ${tab}: ${rows.length} rows`);
  }
}

// ---- Mode: daily-open (pipeline endpoint, replaces counts) ----
async function syncDailyOpen(apiToken: string, supabase: any, svcKey: string) {
  const { startDate, endDate } = getDateRange();
  console.log(`syncDailyOpen: fetching pipeline ${PIPELINE_ID} open deals...`);

  const countsPerTab: Record<Tab, Map<string, number>> = {
    mql: new Map(), sql: new Map(), opp: new Map(), won: new Map(),
  };
  const stageCounts: Record<"reserva" | "contrato", Map<string, number>> = {
    reserva: new Map(), contrato: new Map(),
  };
  let start = 0;
  let total = 0;
  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start),
    });
    if (!res.data || res.data.length === 0) break;
    total += res.data.length;
    countDeals(res.data, startDate, endDate, countsPerTab);
    countDealsByStage(res.data, stageCounts);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  const reservaTotal = Array.from(stageCounts.reserva.values()).reduce((a, b) => a + b, 0);
  const contratoTotal = Array.from(stageCounts.contrato.values()).reduce((a, b) => a + b, 0);
  console.log(`  Open deals: ${total}, reserva=${reservaTotal}, contrato=${contratoTotal}`);
  // Write main counts first, then stage counts (so stage counts aren't overwritten)
  const mainResult = await writeDailyCounts(svcKey, countsPerTab, startDate, endDate, "open");
  await writeStageCounts(svcKey, stageCounts);
  return { ...mainResult, reserva: reservaTotal, contrato: contratoTotal };
}

// ---- Mode: daily-status (uses stage_id filter, merges with existing) ----
// For lost deals: sorts by add_time DESC and stops when deals are older than cutoff
async function syncDailyByStatus(apiToken: string, supabase: any, svcKey: string, status: string) {
  const { startDate, endDate } = getDateRange();
  // Cutoff: stop scanning when add_time is older than 90 days (generous buffer over 35-day window)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  console.log(`syncDailyByStatus: ${status} via stage_id, cutoff=${cutoffStr}`);

  const countsPerTab: Record<Tab, Map<string, number>> = {
    mql: new Map(), sql: new Map(), opp: new Map(), won: new Map(),
  };
  let totalDeals = 0;
  let totalMkt = 0;
  let skippedStages = 0;
  // Deduplicate: /deals endpoint ignores stage_id param (same as pipeline_id),
  // so each stage query returns ALL deals of that status, causing 14x duplication.
  const seenDealIds = new Set<number>();

  for (const stageId of PIPELINE_STAGES) {
    let start = 0;
    let stoppedEarly = false;
    while (true) {
      const res = await pipedriveGet(apiToken, "/deals", {
        status,
        stage_id: String(stageId),
        sort: "add_time DESC",
        limit: "500",
        start: String(start),
      });
      if (!res.data || res.data.length === 0) break;

      // Filter out deals already seen from previous stage queries
      const newDeals = res.data.filter((d: any) => {
        if (seenDealIds.has(d.id)) return false;
        seenDealIds.add(d.id);
        return true;
      });

      totalDeals += newDeals.length;
      totalMkt += countDeals(newDeals, startDate, endDate, countsPerTab);

      // Check if the oldest deal in this page is before cutoff
      const oldestAddTime = res.data[res.data.length - 1]?.add_time?.substring(0, 10) || "";
      if (oldestAddTime && oldestAddTime < cutoffStr) {
        stoppedEarly = true;
        break;
      }

      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
    }
    if (stoppedEarly) skippedStages++;
  }
  console.log(`  ${status}: ${totalDeals} unique deals (${seenDealIds.size} seen), ${totalMkt} marketing, ${skippedStages} stages stopped early`);
  return writeDailyCounts(svcKey, countsPerTab, startDate, endDate, status);
}

// ---- Mode: alignment ----
async function syncAlignment(apiToken: string, svcKey: string) {
  console.log(`syncAlignment: fetching pipeline ${PIPELINE_ID} open deals...`);
  const deals: any[] = [];
  let start = 0;
  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start),
    });
    if (!res.data || res.data.length === 0) break;
    deals.push(...res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }

  const userMap = new Map<number, string>();
  let uStart = 0;
  while (true) {
    const usersRes = await pipedriveGet(apiToken, "/users", { limit: "500", start: String(uStart) });
    for (const u of usersRes.data || []) userMap.set(Number(u.id), u.name);
    if (!usersRes.additional_data?.pagination?.more_items_in_collection) break;
    uStart += 500;
  }
  const counts = new Map<string, number>();
  const dealRows: Array<{deal_id: number; title: string; empreendimento: string; owner_name: string; synced_at: string}> = [];
  for (const deal of deals) {
    const emp = getEmpreendimento(deal);
    if (!emp) continue;
    // Pipeline endpoint returns user_id as integer (not object)
    const ownerId = typeof deal.user_id === "object" ? deal.user_id?.id : deal.user_id;
    if (!ownerId) continue;
    const ownerName = userMap.get(Number(ownerId)) || String(ownerId);
    const key = `${emp}|${ownerName}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    dealRows.push({
      deal_id: deal.id,
      title: deal.title || `Deal #${deal.id}`,
      empreendimento: emp,
      owner_name: ownerName,
      synced_at: new Date().toISOString(),
    });
  }

  // Write aggregated counts
  await restDelete(svcKey, "mktp_alignment", [["empreendimento", "not.is.null"]]);
  const rows = Array.from(counts.entries()).map(([key, count]) => {
    const [empreendimento, owner_name] = key.split("|");
    return { empreendimento, owner_name, count, synced_at: new Date().toISOString() };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const ins = await restInsert(svcKey, "mktp_alignment", batch);
      if (ins.error) console.error("Alignment insert error:", ins.error);
    }
  }

  // Write individual deal records
  await restDelete(svcKey, "mktp_alignment_deals", [["empreendimento", "not.is.null"]]);
  if (dealRows.length > 0) {
    for (let i = 0; i < dealRows.length; i += 500) {
      const batch = dealRows.slice(i, i + 500);
      const ins = await restInsert(svcKey, "mktp_alignment_deals", batch);
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
  console.log("syncMetas: calculating from nekt_meta26_metas + mktp_daily_counts");
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
  // MKTP uses same meta columns as SZI (shared Pipedrive instance)
  const wonMetaTotal = (Number(nektMeta.won_szi_meta_pago) || 0) + (Number(nektMeta.won_szi_meta_direto) || 0);
  const wonPerCloser = TOTAL_CLOSERS > 0 ? wonMetaTotal / TOTAL_CLOSERS : 0;

  const start90 = new Date(now); start90.setDate(start90.getDate() - 90);
  const startDate = start90.toISOString().substring(0, 10);
  const endDate = now.toISOString().substring(0, 10);

  const counts90d: Record<Tab, number> = { mql: 0, sql: 0, opp: 0, won: 0 };
  for (const tab of TABS) {
    const { data: dailyRows } = await supabase
      .from("mktp_daily_counts").select("count").eq("tab", tab).gte("date", startDate).lte("date", endDate);
    if (dailyRows) counts90d[tab] = dailyRows.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
    console.log(`  90d ${tab}: ${counts90d[tab]}`);
  }

  const ratioOppWon = counts90d.won > 0 ? counts90d.opp / counts90d.won : 0;
  const ratioSqlOpp = counts90d.opp > 0 ? counts90d.sql / counts90d.opp : 0;
  const ratioMqlSql = counts90d.sql > 0 ? counts90d.mql / counts90d.sql : 0;
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
      metaRows.push({ month: monthStart, squad_id: sq.id, tab, meta: metas[tab], synced_at: new Date().toISOString() });
    }
  }

  await supabase.from("mktp_metas").upsert(metaRows, { onConflict: "month,squad_id,tab" });
  await supabase.from("mktp_ratios").upsert(
    { month: monthStart, ratios, counts_90d: counts90d, synced_at: new Date().toISOString() },
    { onConflict: "month" },
  );

  console.log(`syncMetas: ${metaRows.length} rows, total_won_meta=${wonMetaTotal}`);
  return { squadMetas: metaRows.length, ratios };
}

// ---- Mode: backfill-monthly-* (Pipedrive → mktp_monthly_counts, 12 months) ----
// Split into 3 separate calls to stay within 150MB memory:
//   backfill-monthly-clear  → empties table
//   backfill-monthly-open   → open deals (pipeline endpoint)
//   backfill-monthly-won    → won deals (stage_id loop)
//   backfill-monthly-lost   → lost deals (stage_id loop with cutoff)
// Uses RPC add_monthly_counts for additive upsert (count += new).

async function backfillMonthlyClear(supabase: any) {
  const { error } = await supabase.from("mktp_monthly_counts").delete().neq("month", "");
  if (error) throw new Error(`Clear error: ${error.message}`);
  console.log("backfill-monthly-clear: table emptied");
  return { cleared: true };
}

const STAGE_ORDER: Record<number, number> = {
  336: 1, 335: 2, 334: 3, 347: 4, 333: 5, 284: 6, 337: 7, 274: 8, 308: 9, 309: 10, 393: 11, 305: 12, 271: 13,
};
const MQL_MIN_ORDER = 2;  // Contatados
const SQL_MIN_ORDER = 4;  // Qualificado
const OPP_MIN_ORDER = 8;  // Reunião Realizada

// ---- Flow API: find max stage a deal ever reached ----
async function getMaxStageReached(apiToken: string, dealId: number, currentOrder: number): Promise<number> {
  if (currentOrder >= OPP_MIN_ORDER) return currentOrder; // Already at OPP+, skip flow
  let max = currentOrder;
  let s = 0;
  try {
    while (true) {
      const res = await pipedriveGet(apiToken, `/deals/${dealId}/flow`, { limit: "100", start: String(s) });
      if (!res.data) break;
      for (const e of res.data) {
        if (e.object === "dealChange" && e.data?.field_key === "stage_id") {
          for (const v of [e.data.old_value, e.data.new_value]) {
            const order = STAGE_ORDER[parseInt(v)] || 0;
            if (order > max) max = order;
          }
        }
      }
      if (max >= OPP_MIN_ORDER) break; // Found OPP+, early exit
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      s += 100;
    }
  } catch (err) { console.error(`flow error deal ${dealId}:`, err); }
  return max;
}

// Count deal into monthly map based on max stage reached
function countDealByStage(deal: any, maxOrder: number, monthly: Map<string, number>, startDate: string, endDate: string) {
  const addTime = deal.add_time;
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

// ---- Backfill open+won deals (stage_id based, no flow needed) ----
async function backfillOpenWon(apiToken: string, supabase: any) {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start365 = new Date(now); start365.setDate(start365.getDate() - 365);
  const startDate = start365.toISOString().substring(0, 10);
  console.log(`backfillOpenWon: ${startDate} → ${endDate}`);

  const monthly = new Map<string, number>();
  let totalOpen = 0, totalWon = 0;

  // Open deals — stage_id is reliable for active deals (forward progression)
  let s = 0;
  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, { limit: "500", start: String(s) });
    if (!res.data || res.data.length === 0) break;
    for (const deal of res.data) {
      if (deal.pipeline_id !== PIPELINE_ID) continue;
      if (!isMarketingDeal(deal)) continue;
      if (!getEmpreendimento(deal)) continue;
      totalOpen++;
      const currentOrder = STAGE_ORDER[deal.stage_id] || 0;
      countDealByStage(deal, currentOrder, monthly, startDate, endDate);
    }
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    s += 500;
  }

  // Won deals — all at Contrato (order 13), no flow needed
  const seenWon = new Set<number>();
  for (const stageId of PIPELINE_STAGES) {
    let ws = 0;
    while (true) {
      const res = await pipedriveGet(apiToken, "/deals", {
        status: "won", stage_id: String(stageId), sort: "add_time DESC", limit: "500", start: String(ws),
      });
      if (!res.data || res.data.length === 0) break;
      for (const deal of res.data) {
        if (seenWon.has(deal.id)) continue;
        seenWon.add(deal.id);
        if (deal.pipeline_id !== PIPELINE_ID) continue;
        if (!isMarketingDeal(deal)) continue;
        if (!getEmpreendimento(deal)) continue;
        totalWon++;
        countDealByStage(deal, 13, monthly, startDate, endDate); // Won = passed all stages (MKTP has 13 stages)
      }
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      ws += 500;
    }
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

// ---- Backfill lost deals with flow API (batched, parallel flow calls) ----
async function backfillLostWithFlow(apiToken: string, supabase: any, startFrom: number = 0) {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start365 = new Date(now); start365.setDate(start365.getDate() - 365);
  const startDate = start365.toISOString().substring(0, 10);
  const BATCH_LIMIT = 5000; // API-returned deals per invocation
  const FLOW_CONCURRENCY = 10; // parallel flow API calls

  console.log(`backfillLostWithFlow(start=${startFrom}): ${startDate} → ${endDate}`);

  const monthly = new Map<string, number>();
  const seenDealIds = new Set<number>();
  let mktDeals = 0, flowCalls = 0;
  let apiStart = startFrom;
  let dealsScanned = 0;
  let reachedEnd = false;
  let reachedCutoff = false;

  while (dealsScanned < BATCH_LIMIT) {
    const res = await pipedriveGet(apiToken, "/deals", {
      status: "lost", sort: "add_time DESC", limit: "500", start: String(apiStart),
    });
    if (!res.data || res.data.length === 0) { reachedEnd = true; break; }

    // Collect marketing deals that need flow
    const dealsNeedingFlow: { deal: any; currentOrder: number }[] = [];
    for (const deal of res.data) {
      if (seenDealIds.has(deal.id)) continue;
      seenDealIds.add(deal.id);
      dealsScanned++;
      if (deal.pipeline_id !== PIPELINE_ID) continue;
      if (!isMarketingDeal(deal)) continue;
      if (!getEmpreendimento(deal)) continue;
      const addTime = deal.add_time;
      if (!addTime) continue;
      const day = addTime.substring(0, 10);
      if (day < startDate || day > endDate) continue;
      mktDeals++;
      const currentOrder = STAGE_ORDER[deal.stage_id] || 0;
      dealsNeedingFlow.push({ deal, currentOrder });
    }

    // Fetch flows in parallel batches
    for (let i = 0; i < dealsNeedingFlow.length; i += FLOW_CONCURRENCY) {
      const chunk = dealsNeedingFlow.slice(i, i + FLOW_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(({ deal, currentOrder }) => getMaxStageReached(apiToken, deal.id, currentOrder))
      );
      flowCalls += chunk.length;
      for (let j = 0; j < chunk.length; j++) {
        countDealByStage(chunk[j].deal, results[j], monthly, startDate, endDate);
      }
    }

    // Cutoff: stop when deals are older than our window
    const oldest = res.data[res.data.length - 1]?.add_time?.substring(0, 10) || "";
    if (oldest && oldest < startDate) { reachedCutoff = true; break; }
    if (!res.additional_data?.pagination?.more_items_in_collection) { reachedEnd = true; break; }
    apiStart += 500;
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

  const done = reachedEnd || reachedCutoff;
  const nextStart = done ? null : apiStart;
  console.log(`backfillLostWithFlow: scanned=${dealsScanned} mkt=${mktDeals} flow=${flowCalls} rows=${rows.length} done=${done}`);
  return { dealsScanned, mktDeals, flowCalls, monthlyRows: rows.length, nextStart, done };
}

// ---- Mode: monthly-rollup (stage-based counting from Pipedrive for current + prev month) ----
async function syncMonthlyRollup(apiToken: string, supabase: any) {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const startDate = `${prevMonth}-01`;
  const endDate = now.toISOString().substring(0, 10);

  console.log(`syncMonthlyRollup (stage-based): ${startDate} → ${endDate}`);

  const monthly = new Map<string, number>();

  function countDeal(deal: any) {
    if (deal.pipeline_id !== PIPELINE_ID) return;
    if (!isMarketingDeal(deal)) return;
    const emp = getEmpreendimento(deal);
    if (!emp) return;
    const addTime = deal.add_time;
    if (!addTime) return;
    const day = addTime.substring(0, 10);
    if (day < startDate || day > endDate) return;
    const month = day.substring(0, 7);
    const stageOrder = STAGE_ORDER[deal.stage_id] || 0;
    const hasQualDate = !!deal[FIELD_QUALIFICACAO];
    const hasReunDate = !!deal[FIELD_REUNIAO];

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

  // Scan open deals
  let totalDeals = 0;
  let start = 0;
  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start),
    });
    if (!res.data || res.data.length === 0) break;
    totalDeals += res.data.length;
    for (const deal of res.data) countDeal(deal);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }

  // Scan won + lost deals (deduped)
  const seenDealIds = new Set<number>();
  for (const dealStatus of ["won", "lost"] as const) {
    for (const stageId of PIPELINE_STAGES) {
      let s = 0;
      let stoppedEarly = false;
      while (true) {
        const res = await pipedriveGet(apiToken, "/deals", {
          status: dealStatus, stage_id: String(stageId),
          sort: "add_time DESC", limit: "500", start: String(s),
        });
        if (!res.data || res.data.length === 0) break;
        for (const deal of res.data) {
          if (seenDealIds.has(deal.id)) continue;
          seenDealIds.add(deal.id);
          countDeal(deal);
        }
        if (dealStatus === "lost") {
          const oldest = res.data[res.data.length - 1]?.add_time?.substring(0, 10) || "";
          if (oldest && oldest < startDate) { stoppedEarly = true; break; }
        }
        if (!res.additional_data?.pagination?.more_items_in_collection) break;
        s += 500;
      }
      if (dealStatus === "lost" && stoppedEarly) break;
    }
  }
  totalDeals += seenDealIds.size;

  // Upsert (replace) for current + prev month
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, empreendimento, tab] = key.split("|");
    return { month, empreendimento, tab, count, synced_at: new Date().toISOString() };
  });

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("mktp_monthly_counts")
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

    // Auth handled by Supabase gateway (--no-verify-jwt not set)

    // Get Pipedrive token from Vault
    const { data: tokenData } = await supabase.rpc("vault_read_secret", { secret_name: "PIPEDRIVE_API_TOKEN" });
    const apiToken = tokenData?.trim();
    if (!apiToken) throw new Error("PIPEDRIVE_API_TOKEN not found in vault");

    // Parse mode
    let mode = "daily-open";
    let body: any = {};
    try {
      body = await req.json();
      if (body?.mode) mode = body.mode;
    } catch {}
    console.log(`sync-mktp-dashboard mode=${mode}`);

    let result;
    switch (mode) {
      case "daily-open":
        // Open deals from pipeline endpoint (replaces counts)
        result = await syncDailyOpen(apiToken, supabase, svcKey);
        break;
      case "daily-won":
        // Won deals via stage_id filter (merges with existing)
        result = await syncDailyByStatus(apiToken, supabase, svcKey, "won");
        break;
      case "daily-lost":
        // Lost deals via stage_id filter (merges with existing)
        result = await syncDailyByStatus(apiToken, supabase, svcKey, "lost");
        break;
      case "alignment":
        result = { rows: await syncAlignment(apiToken, svcKey) };
        break;
      case "metas":
        result = await syncMetas(supabase);
        break;
      case "monthly-rollup":
        result = await syncMonthlyRollup(apiToken, supabase);
        break;
      case "backfill-monthly-clear":
        result = await backfillMonthlyClear(supabase);
        break;
      case "backfill-open-won":
        result = await backfillOpenWon(apiToken, supabase);
        break;
      case "backfill-lost-flows": {
        const startFrom = body?.start || 0;
        result = await backfillLostWithFlow(apiToken, supabase, startFrom);
        break;
      }
      case "debug-stages": {
        // Debug: scan a sample of deals and report stage_id distribution
        const stageDistOpen: Record<string, number> = {};
        const stageDistWon: Record<string, number> = {};
        const stageDistLost: Record<string, number> = {};
        let sampleOpen = 0, sampleWon = 0, sampleLost = 0;
        let mktOpen = 0, mktWon = 0, mktLost = 0;

        // Open deals
        let s = 0;
        while (true) {
          const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, { limit: "500", start: String(s) });
          if (!res.data || res.data.length === 0) break;
          for (const d of res.data) {
            if (d.pipeline_id !== PIPELINE_ID) continue;
            sampleOpen++;
            if (isMarketingDeal(d) && getEmpreendimento(d)) {
              mktOpen++;
              const sid = String(d.stage_id);
              stageDistOpen[sid] = (stageDistOpen[sid] || 0) + 1;
            }
          }
          if (!res.additional_data?.pagination?.more_items_in_collection) break;
          s += 500;
        }

        // Won deals (first 2000)
        const seenW = new Set<number>();
        for (const stageId of PIPELINE_STAGES) {
          let ws = 0;
          while (true) {
            const res = await pipedriveGet(apiToken, "/deals", { status: "won", stage_id: String(stageId), sort: "add_time DESC", limit: "500", start: String(ws) });
            if (!res.data || res.data.length === 0) break;
            for (const d of res.data) {
              if (seenW.has(d.id)) continue;
              seenW.add(d.id);
              if (d.pipeline_id !== PIPELINE_ID) continue;
              sampleWon++;
              if (isMarketingDeal(d) && getEmpreendimento(d)) {
                mktWon++;
                const sid = String(d.stage_id);
                stageDistWon[sid] = (stageDistWon[sid] || 0) + 1;
              }
            }
            if (!res.additional_data?.pagination?.more_items_in_collection) break;
            ws += 500;
          }
        }

        // Lost deals (first 5000, sorted by add_time DESC)
        const seenL = new Set<number>();
        for (const stageId of PIPELINE_STAGES) {
          let ls = 0;
          while (true) {
            const res = await pipedriveGet(apiToken, "/deals", { status: "lost", stage_id: String(stageId), sort: "add_time DESC", limit: "500", start: String(ls) });
            if (!res.data || res.data.length === 0) break;
            for (const d of res.data) {
              if (seenL.has(d.id)) continue;
              seenL.add(d.id);
              if (d.pipeline_id !== PIPELINE_ID) continue;
              sampleLost++;
              if (isMarketingDeal(d) && getEmpreendimento(d)) {
                mktLost++;
                const sid = String(d.stage_id);
                stageDistLost[sid] = (stageDistLost[sid] || 0) + 1;
              }
            }
            if (seenL.size >= 5000) break;
            if (!res.additional_data?.pagination?.more_items_in_collection) break;
            ls += 500;
          }
          if (seenL.size >= 5000) break;
        }

        result = {
          open: { total: sampleOpen, marketing: mktOpen, stages: stageDistOpen },
          won: { total: sampleWon, marketing: mktWon, stages: stageDistWon },
          lost: { total: sampleLost, marketing: mktLost, stages: stageDistLost },
        };
        break;
      }
      case "all": {
        // Full sync: open + won + alignment + metas (lost runs separately due to volume)
        const daily = await syncDailyOpen(apiToken, supabase);
        const won = await syncDailyByStatus(apiToken, supabase, "won");
        const alignment = await syncAlignment(apiToken, supabase);
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
    console.log(`sync-mktp-dashboard completed in ${elapsed}ms`);
    return new Response(JSON.stringify({ success: true, mode, result, elapsed_ms: elapsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-mktp-dashboard fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
