import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let DB_SCHEMA = "public";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ---- Pipedrive constants (kept for deals-flow mode) ----
const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";
const BASE = `https://${PIPEDRIVE_DOMAIN}/api/v1`;
const PIPELINE_ID = 28;
const CANAL_MARKETING_ID = "12";

const PIPELINE_STAGES = [392, 184, 186, 338, 346, 339, 187, 340, 208, 312, 313, 311, 191, 192];

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

const OPP_MIN_ORDER = 9;

// ---- Nekt Data API helpers ----
async function queryNekt(nektApiKey: string, sql: string): Promise<Record<string, string | null>[]> {
  const queryRes = await fetch("https://api.nekt.ai/api/v1/sql-query/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": nektApiKey,
    },
    body: JSON.stringify({ sql, mode: "csv" }),
  });

  if (!queryRes.ok) {
    const body = await queryRes.text();
    throw new Error(`Nekt API error (${queryRes.status}): ${body}`);
  }

  const queryData = await queryRes.json();

  let presignedUrl: string | undefined;
  if (queryData.presigned_url) {
    presignedUrl = queryData.presigned_url;
  } else if (queryData.presigned_urls && Array.isArray(queryData.presigned_urls) && queryData.presigned_urls.length > 0) {
    presignedUrl = queryData.presigned_urls[0];
  } else if (queryData.url) {
    presignedUrl = queryData.url;
  }

  if (!presignedUrl) {
    throw new Error(`Nekt API: no presigned_url in response — ${JSON.stringify(queryData)}`);
  }

  const csvRes = await fetch(presignedUrl);
  if (!csvRes.ok) throw new Error(`Failed to download CSV: ${csvRes.status}`);
  const csvText = await csvRes.text();

  return parseCSV(csvText);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csv: string): Record<string, string | null>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const columns = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string | null> = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const val = (values[i] ?? "").trim();
      row[col] = val === "" || val === "null" || val === "NULL" ? null : val;
    }
    return row;
  });
}

// ---- Pipedrive API (kept for deals-flow mode) ----
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
function nektDealToRow(deal: Record<string, string | null>, maxStageOrder: number | null, flowFetched: boolean) {
  const stageId = parseInt(deal.etapa || "0");
  const stageOrder = STAGE_ORDER[stageId] || 0;
  return {
    deal_id: parseInt(deal.id || "0"),
    title: deal.title || `Deal #${deal.id}`,
    stage_id: stageId,
    status: deal.status || "open",
    user_id: parseInt(deal.owner_id || "0"),
    owner_name: deal.owner_name || null,
    add_time: deal.deal_created || null,
    won_time: deal.won_time || null,
    lost_time: deal.lost_time || null,
    update_time: deal.atualizado_em || null,
    canal: deal.canal || null,
    empreendimento_id: null,
    empreendimento: deal.empreendimento || null,
    qualificacao_date: deal.data_de_qualificacao || null,
    reuniao_date: deal.data_da_reuniao || null,
    lost_reason: deal.motivo_da_perda || null,
    rd_source: deal.rd_source || null,
    preseller_name: deal.preseller_name || null,
    stage_order: stageOrder,
    max_stage_order: maxStageOrder ?? stageOrder,
    last_activity_date: deal.data_da_ultima_atividade || null,
    next_activity_date: deal.proxima_atividade_em || null,
    stage_change_date: deal.ultima_alteracao_de_etapa || null,
    tipo_de_venda: deal.tipo_de_venda || null,
    flow_fetched: flowFetched,
    synced_at: new Date().toISOString(),
  };
}

// ---- Nekt SQL builder ----
function buildDealsSQL(status: string, cutoffDate?: string): string {
  let where = `WHERE d.pipeline_id = 28 AND d.status = '${status}'`;
  if (cutoffDate) {
    where += ` AND d.deal_created >= TIMESTAMP '${cutoffDate}'`;
  }
  // Use ROW_NUMBER to pick latest SCD2 record per user (avoids row multiplication)
  return `
SELECT d.id, d.title, d.etapa, d.status, d.owner_id, u.name as owner_name,
       d.deal_created, d.won_time, d.lost_time, d.atualizado_em,
       d.canal, d.empreendimento, d.data_de_qualificacao, d.data_da_reuniao,
       d.motivo_da_perda, d.rd_source, d.data_da_ultima_atividade, d.proxima_atividade_em,
       d.ultima_alteracao_de_etapa, d.tipo_de_venda, d.pre_vendedor_a, pu.name as preseller_name
FROM nekt_silver.pipedrive_deals_readable d
LEFT JOIN (SELECT id, name, ROW_NUMBER() OVER (PARTITION BY id ORDER BY _nekt_sync_at DESC) as rn FROM nekt_silver.pipedrive_v2_users_scd2) u ON d.owner_id = u.id AND u.rn = 1
LEFT JOIN (SELECT id, name, ROW_NUMBER() OVER (PARTITION BY id ORDER BY _nekt_sync_at DESC) as rn FROM nekt_silver.pipedrive_v2_users_scd2) pu ON d.pre_vendedor_a = pu.id AND pu.rn = 1
${where}
  `.trim();
}

// ---- Batch upsert helper ----
async function upsertBatch(supabase: any, rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from("squad_deals").upsert(batch, { onConflict: "deal_id" });
    if (error) console.error(`Upsert error:`, error.message);
  }
}

// ---- Batch update helper (partial update, doesn't reset other columns) ----
async function updateFlowBatch(supabase: any, rows: Array<{ deal_id: number; max_stage_order: number }>) {
  const now = new Date().toISOString();
  for (const row of rows) {
    const { error } = await supabase
      .from("squad_deals")
      .update({ max_stage_order: row.max_stage_order, flow_fetched: true, synced_at: now })
      .eq("deal_id", row.deal_id);
    if (error) console.error(`Update error deal ${row.deal_id}:`, error.message);
  }
}

// ---- Flow API: find max stage a deal ever reached ----
async function getMaxStageReached(apiToken: string, dealId: number, currentOrder: number): Promise<number> {
  if (currentOrder >= OPP_MIN_ORDER) return currentOrder;
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
      if (max >= OPP_MIN_ORDER) break;
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      s += 100;
    }
  } catch (err) {
    console.error(`flow error deal ${dealId}:`, err);
  }
  return max;
}

async function getVaultSecret(supabase: any, name: string): Promise<string | null> {
  const { data, error } = await supabase.schema("public").rpc("vault_read_secret", { secret_name: name });
  if (error) { console.error(`Vault read ${name}:`, error.message); return null; }
  return data || null;
}

// ---- Mode: deals-open (Nekt API) ----
async function syncDealsOpen(nektApiKey: string, supabase: any) {
  console.log(`syncDealsOpen: fetching pipeline 28 open deals from Nekt...`);

  const sql = buildDealsSQL("open");
  const nektRows = await queryNekt(nektApiKey, sql);
  console.log(`  Nekt returned ${nektRows.length} open deals`);

  // Deduplicate by deal id (SCD2 joins can produce duplicates)
  const dedupMap = new Map<number, any>();
  for (const deal of nektRows) {
    const dealId = parseInt(deal.id || "0");
    if (dealId === 0) continue;
    const stageOrder = STAGE_ORDER[parseInt(deal.etapa || "0")] || 0;
    dedupMap.set(dealId, nektDealToRow(deal, stageOrder, true));
  }
  const rows = [...dedupMap.values()];

  console.log(`  Open deals rows to upsert: ${rows.length} (deduped from ${nektRows.length})`);
  await upsertBatch(supabase, rows);

  // Mark stale deals: deals with status='open' in DB that are no longer open in Nekt
  const openDealIds = new Set(rows.map((r) => r.deal_id));
  let staleOffset = 0;
  let staleCount = 0;
  const now = new Date().toISOString();

  while (true) {
    const { data: dbOpen, error } = await supabase
      .from("squad_deals")
      .select("deal_id")
      .eq("status", "open")
      .range(staleOffset, staleOffset + 999);

    if (error) { console.error("Stale check error:", error.message); break; }
    if (!dbOpen || dbOpen.length === 0) break;

    const staleIds = dbOpen
      .filter((d: any) => !openDealIds.has(d.deal_id))
      .map((d: any) => d.deal_id);

    if (staleIds.length > 0) {
      for (let i = 0; i < staleIds.length; i += 100) {
        const batch = staleIds.slice(i, i + 100);
        const { error: updErr } = await supabase
          .from("squad_deals")
          .update({ status: "lost", synced_at: now })
          .in("deal_id", batch);
        if (updErr) console.error("Stale update error:", updErr.message);
      }
      staleCount += staleIds.length;
    }

    if (dbOpen.length < 1000) break;
    staleOffset += 1000;
  }

  if (staleCount > 0) console.log(`  Marked ${staleCount} stale deals as lost`);

  // Enrich with activity dates from Pipedrive (Nekt doesn't populate these)
  const apiToken = await getVaultSecret(supabase, "PIPEDRIVE_API_TOKEN");
  if (apiToken) {
    console.log("  Enriching activity dates from Pipedrive...");
    const activityMap = new Map<number, { last: string | null; next: string | null }>();
    let start = 0;
    while (true) {
      const url = `${BASE}/pipelines/${PIPELINE_ID}/deals?limit=500&start=${start}&api_token=${apiToken}`;
      const res = await fetch(url);
      if (!res.ok) { console.error(`  Pipedrive ${res.status}`); break; }
      const json = await res.json();
      const deals = json.data || [];
      if (deals.length === 0) break;
      for (const d of deals) {
        activityMap.set(d.id, { last: d.last_activity_date || null, next: d.next_activity_date || null });
      }
      if (!json.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
    }
    // Batch update: 20 concurrent updates at a time
    const entries = [...activityMap.entries()];
    let enriched = 0;
    for (let i = 0; i < entries.length; i += 20) {
      const batch = entries.slice(i, i + 20);
      const results = await Promise.all(batch.map(([dealId, dates]) =>
        supabase.from("squad_deals").update({
          last_activity_date: dates.last,
          next_activity_date: dates.next,
        }).eq("deal_id", dealId)
      ));
      enriched += results.filter(r => !r.error).length;
    }
    console.log(`  Enriched ${enriched}/${activityMap.size} deals with activity dates`);
  }

  return { totalFetched: nektRows.length, upserted: rows.length, staleCleaned: staleCount };
}

// ---- Mode: deals-won (Nekt API) ----
async function syncDealsWon(nektApiKey: string, supabase: any) {
  console.log(`syncDealsWon: fetching won deals from Nekt...`);

  const sql = buildDealsSQL("won");
  const nektRows = await queryNekt(nektApiKey, sql);
  console.log(`  Nekt returned ${nektRows.length} won deals`);

  // Deduplicate by deal id (SCD2 joins can produce duplicates)
  const dedupMap = new Map<number, any>();
  for (const deal of nektRows) {
    const dealId = parseInt(deal.id || "0");
    if (dealId === 0) continue;
    dedupMap.set(dealId, nektDealToRow(deal, 14, true));
  }
  const rows = [...dedupMap.values()];

  console.log(`  Won deals rows to upsert: ${rows.length} (deduped from ${nektRows.length})`);
  await upsertBatch(supabase, rows);
  return { totalFetched: nektRows.length, upserted: rows.length };
}

// ---- Mode: deals-lost (Nekt API) ----
async function syncDealsLost(nektApiKey: string, supabase: any, cutoffDays: number) {
  let cutoffStr = "";
  if (cutoffDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cutoffDays);
    cutoffStr = cutoff.toISOString().substring(0, 10);
  }
  console.log(`syncDealsLost: fetching lost deals from Nekt, cutoff=${cutoffStr || "NONE"}`);

  const sql = buildDealsSQL("lost", cutoffStr || undefined);
  const nektRows = await queryNekt(nektApiKey, sql);
  console.log(`  Nekt returned ${nektRows.length} lost deals`);

  // Deduplicate by deal id (SCD2 joins can produce duplicates)
  const dedupMap = new Map<number, any>();
  for (const deal of nektRows) {
    const dealId = parseInt(deal.id || "0");
    if (dealId === 0) continue;
    const stageOrder = STAGE_ORDER[parseInt(deal.etapa || "0")] || 0;
    dedupMap.set(dealId, nektDealToRow(deal, stageOrder, false));
  }
  const rows = [...dedupMap.values()];

  console.log(`  Lost deals rows to upsert: ${rows.length} (deduped from ${nektRows.length})`);
  await upsertBatch(supabase, rows);

  return {
    dealsScanned: nektRows.length,
    upserted: rows.length,
    done: true,
  };
}

// ---- Mode: deals-flow (KEPT ON PIPEDRIVE API) ----
async function syncDealsFlow(apiToken: string, supabase: any) {
  console.log(`syncDealsFlow: fetching deals needing flow analysis...`);

  // Query deals that need flow: flow_fetched=false, status=lost, marketing, with empreendimento
  // Note: canal is now text "Marketing" from Nekt (not "12")
  // Check both values for compatibility during transition
  const { data: dealsMarketing, error: queryErr1 } = await supabase
    .from("squad_deals")
    .select("deal_id, stage_order, canal, empreendimento")
    .eq("flow_fetched", false)
    .eq("status", "lost")
    .eq("canal", "Marketing")
    .not("empreendimento", "is", null)
    .limit(500);

  const { data: dealsLegacy, error: queryErr2 } = await supabase
    .from("squad_deals")
    .select("deal_id, stage_order, canal, empreendimento")
    .eq("flow_fetched", false)
    .eq("status", "lost")
    .eq("canal", CANAL_MARKETING_ID)
    .not("empreendimento", "is", null)
    .limit(500);

  if (queryErr1) console.error("Query error (Marketing):", queryErr1.message);
  if (queryErr2) console.error("Query error (12):", queryErr2.message);

  // Merge and deduplicate
  const seenIds = new Set<number>();
  const deals: any[] = [];
  for (const d of [...(dealsMarketing || []), ...(dealsLegacy || [])]) {
    if (!seenIds.has(d.deal_id)) {
      seenIds.add(d.deal_id);
      deals.push(d);
    }
  }

  if (deals.length === 0) {
    console.log("  No deals need flow analysis");
    return { processed: 0, remaining: 0, done: true };
  }

  console.log(`  Found ${deals.length} deals needing flow analysis`);

  // Separate deals that already have stage_order >= OPP_MIN_ORDER (skip flow)
  const skipFlow: any[] = [];
  const needFlow: any[] = [];

  for (const deal of deals) {
    if (deal.stage_order >= OPP_MIN_ORDER) {
      skipFlow.push(deal);
    } else {
      needFlow.push(deal);
    }
  }

  // Batch update deals that can skip flow (use UPDATE, not upsert, to preserve other columns)
  if (skipFlow.length > 0) {
    await updateFlowBatch(supabase, skipFlow.map((d: any) => ({
      deal_id: d.deal_id,
      max_stage_order: d.stage_order,
    })));
    console.log(`  Skipped flow for ${skipFlow.length} deals (already OPP+)`);
  }

  // Process deals that need flow API with concurrency=20
  let processed = 0;
  const CONCURRENCY = 20;

  for (let i = 0; i < needFlow.length; i += CONCURRENCY) {
    const chunk = needFlow.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (deal: any) => {
        const maxOrder = await getMaxStageReached(apiToken, deal.deal_id, deal.stage_order);
        return { deal_id: deal.deal_id, max_stage_order: maxOrder };
      })
    );
    await updateFlowBatch(supabase, results);
    processed += results.length;
  }

  console.log(`  Flow processed: ${processed}, skipped: ${skipFlow.length}`);

  // Check if there are more deals remaining (both canal values)
  const { count: remaining1 } = await supabase
    .from("squad_deals")
    .select("deal_id", { count: "exact", head: true })
    .eq("flow_fetched", false)
    .eq("status", "lost")
    .eq("canal", "Marketing")
    .not("empreendimento", "is", null);

  const { count: remaining2 } = await supabase
    .from("squad_deals")
    .select("deal_id", { count: "exact", head: true })
    .eq("flow_fetched", false)
    .eq("status", "lost")
    .eq("canal", CANAL_MARKETING_ID)
    .not("empreendimento", "is", null);

  const remaining = (remaining1 || 0) + (remaining2 || 0);

  return {
    processed: processed + skipFlow.length,
    remaining,
    done: remaining === 0,
  };
}

// ---- Mode: backfill-stage-entries (Nekt deal_flow) ----
// Uses nekt_trusted.pipedrive_v2_consolidated_deal_flow to get LAST entry date per deal into
// stage 191 (reserva) and 192 (contrato). Single Nekt query + bulk updates.
async function syncBackfillStageEntries(nektApiKey: string, supabase: any) {
  console.log(`syncBackfillStageEntries: querying Nekt for stage entries into 191/192...`);

  const sql = `
    SELECT CAST(item_id AS varchar) AS deal_id,
           new_value AS stage,
           MAX(log_time) AS entered_at
    FROM nekt_trusted.pipedrive_v2_consolidated_deal_flow
    WHERE field_key = 'stage_id' AND new_value IN ('191', '192')
    GROUP BY item_id, new_value
  `;
  const rows = await queryNekt(nektApiKey, sql);
  console.log(`  Nekt returned ${rows.length} stage-entry events`);

  // Build per-deal map
  const dealMap = new Map<number, { reserva: string | null; contrato: string | null }>();
  for (const r of rows) {
    const dealId = parseInt(r.deal_id || "0");
    if (!dealId) continue;
    let entry = dealMap.get(dealId);
    if (!entry) { entry = { reserva: null, contrato: null }; dealMap.set(dealId, entry); }
    const ts = r.entered_at || null;
    if (r.stage === "191") entry.reserva = ts;
    else if (r.stage === "192") entry.contrato = ts;
  }

  console.log(`  Unique deals with stage entries: ${dealMap.size}`);

  // Bulk update in batches of 500 via RPC or upsert
  const updates = [...dealMap.entries()].map(([deal_id, v]) => ({
    deal_id,
    reserva_entered_at: v.reserva,
    contrato_entered_at: v.contrato,
  }));

  let processed = 0;
  let failed = 0;
  const CONCURRENCY = 50;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (u) => {
      const patch: Record<string, string | null> = {};
      if (u.reserva_entered_at) patch.reserva_entered_at = u.reserva_entered_at;
      if (u.contrato_entered_at) patch.contrato_entered_at = u.contrato_entered_at;
      if (Object.keys(patch).length === 0) return { ok: false };
      const { error } = await supabase.from("squad_deals").update(patch).eq("deal_id", u.deal_id);
      return { ok: !error, err: error?.message };
    }));
    for (const r of results) { if (r.ok) processed++; else failed++; }
  }

  console.log(`  Updated ${processed}, failed ${failed}`);
  return { processed, failed, total_events: rows.length, unique_deals: dealMap.size, done: true };
}

// ---- Deno.serve handler ----
Deno.serve(async (req) => {
  // DB_SCHEMA injected
  try {
    const __body = await req.clone().json().catch(() => ({}));
    DB_SCHEMA = __body?.__schema || "public";
  } catch { DB_SCHEMA = "public"; }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const t0 = Date.now();

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: DB_SCHEMA } });

    // Parse mode from request body
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "deals-open";
    console.log(`sync-squad-deals: mode=${mode}`);

    let result: any;

    switch (mode) {
      case "deals-open":
      case "deals-won":
      case "deals-lost": {
        // These modes use Nekt API
        const { data: nektKey, error: nektErr } = await supabase.schema("public").rpc("vault_read_secret", {
          secret_name: "NEKT_API_KEY",
        });
        if (nektErr || !nektKey) throw new Error(`Vault error (NEKT_API_KEY): ${nektErr?.message}`);

        if (mode === "deals-open") {
          result = await syncDealsOpen(nektKey, supabase);
        } else if (mode === "deals-won") {
          result = await syncDealsWon(nektKey, supabase);
        } else {
          const cutoffDays = body.cutoff_days ?? 365;
          result = await syncDealsLost(nektKey, supabase, cutoffDays);
        }
        break;
      }
      case "deals-flow": {
        // This mode still uses Pipedrive API
        const { data: tokenData, error: tokenErr } = await supabase.schema("public").rpc("vault_read_secret", {
          secret_name: "PIPEDRIVE_API_TOKEN",
        });
        if (tokenErr || !tokenData) throw new Error(`Vault error: ${tokenErr?.message}`);
        result = await syncDealsFlow(tokenData, supabase);
        break;
      }
      case "backfill-stage-entries": {
        const { data: nektKey, error: nektErr } = await supabase.schema("public").rpc("vault_read_secret", {
          secret_name: "NEKT_API_KEY",
        });
        if (nektErr || !nektKey) throw new Error(`Vault error (NEKT_API_KEY): ${nektErr?.message}`);
        result = await syncBackfillStageEntries(nektKey, supabase);
        break;
      }
      case "inspect-fields": {
        // Debug mode: still uses Pipedrive API
        const { data: tokenData, error: tokenErr } = await supabase.schema("public").rpc("vault_read_secret", {
          secret_name: "PIPEDRIVE_API_TOKEN",
        });
        if (tokenErr || !tokenData) throw new Error(`Vault error: ${tokenErr?.message}`);
        const search = (body.search || "source").toLowerCase();
        const fieldsRes = await pipedriveGet(tokenData, "/dealFields", { limit: "500", start: "0" });
        const fields = (fieldsRes.data || [])
          .filter((f: any) => (f.name || "").toLowerCase().includes(search))
          .map((f: any) => ({ key: f.key, name: f.name, field_type: f.field_type, options: f.options?.slice(0, 10) }));
        result = { fields };
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown mode: ${mode}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const elapsed = Date.now() - t0;
    console.log(`sync-squad-deals: mode=${mode} done in ${elapsed}ms`);

    return new Response(
      JSON.stringify({ success: true, mode, result, elapsed_ms: elapsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("sync-squad-deals error:", err);
    return new Response(
      JSON.stringify({ error: err.message, elapsed_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
