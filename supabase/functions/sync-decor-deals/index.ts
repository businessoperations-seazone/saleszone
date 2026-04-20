// Decor module — syncs pipeline 44 deals into decor_deals
// Stages are auto-discovered from Pipedrive on startup (no hardcoded IDs needed).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ---- Pipedrive constants ----
const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";
const BASE = `https://${PIPEDRIVE_DOMAIN}/api/v1`;
const PIPELINE_ID = 44;
const FIELD_CANAL = "93b3ada8b94bd1fc4898a25754d6bcac2713f835";
const FIELD_EMPREENDIMENTO = "6d565fd4fce66c16da078f520a685fa2fa038272";
const FIELD_QUALIFICACAO = "bc74bcc4326527cbeb331d1697d4c8812d68506e";
const FIELD_REUNIAO = "bfafc352c5c6f2edbaa41bf6d1c6daa825fc9c16";
const FIELD_RD_SOURCE = "ff53f6910138fa1d8969b686acb4b1336d50c9bd";
const FIELD_PRESELLER = "34a7f4f5f78e8a8d4751ddfb3cfcfb224d8ff908";

const OPP_MIN_ORDER = 9; // stage_order >= 9 = OPP (Reunião/OPP)

// Stages discovered from Pipedrive on first use; auto-populated by ensureStages()
// Stage names for pipeline 44 (Decor):
// 1=FUP Parceiro, 2=Lead in, 3=Contatados, 4=Qualificação, 5=Qualificado,
// 6=Aguardando data, 7=Agendado, 8=No Show/Reagendamento, 9=Reunião/OPP,
// 10=FUP, 11=Negociação, 12=Fila de espera, 13=Reservas, 14=Contrato
let PIPELINE_STAGES: number[] = [];
let STAGE_ORDER: Record<number, number> = {};
let MAX_STAGE_ORDER = 14;

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

// Fetch and cache pipeline 44 stages from Pipedrive
async function ensureStages(apiToken: string) {
  if (PIPELINE_STAGES.length > 0) return;
  const res = await pipedriveGet(apiToken, "/stages", { pipeline_id: String(PIPELINE_ID) });
  const stages = ((res.data || []) as any[]).sort((a, b) => a.order_nr - b.order_nr);
  PIPELINE_STAGES = stages.map((s) => Number(s.id));
  for (let i = 0; i < stages.length; i++) {
    STAGE_ORDER[stages[i].id] = i + 1;
  }
  MAX_STAGE_ORDER = stages.length;
  console.log(`Stages loaded for pipeline ${PIPELINE_ID}: ${JSON.stringify(STAGE_ORDER)}`);
}

// ---- Deal helpers ----
function dealToRow(deal: any, maxStageOrder: number | null, flowFetched: boolean) {
  const stageOrder = STAGE_ORDER[deal.stage_id] || 0;
  return {
    deal_id: deal.id,
    title: deal.title || `Deal #${deal.id}`,
    stage_id: deal.stage_id,
    status: deal.status,
    user_id: typeof deal.user_id === "object" ? deal.user_id?.id : deal.user_id,
    owner_name: typeof deal.user_id === "object" ? deal.user_id?.name : null,
    add_time: deal.add_time || null,
    won_time: deal.won_time || null,
    lost_time: deal.lost_time || null,
    update_time: deal.update_time || null,
    canal: String(deal[FIELD_CANAL] || ""),
    empreendimento_id: String(deal[FIELD_EMPREENDIMENTO] || ""),
    empreendimento: null, // Decor doesn't filter by empreendimento
    qualificacao_date: deal[FIELD_QUALIFICACAO] || null,
    reuniao_date: deal[FIELD_REUNIAO] || null,
    lost_reason: deal.lost_reason || null,
    rd_source: deal[FIELD_RD_SOURCE] || null,
    preseller_name: typeof deal[FIELD_PRESELLER] === "object" ? deal[FIELD_PRESELLER]?.name : null,
    stage_order: stageOrder,
    max_stage_order: maxStageOrder ?? stageOrder,
    last_activity_date: deal.last_activity_date || null,
    next_activity_date: deal.next_activity_date || null,
    flow_fetched: flowFetched,
    synced_at: new Date().toISOString(),
  };
}

// ---- Batch upsert ----
async function upsertBatch(supabase: any, rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from("decor_deals").upsert(batch, { onConflict: "deal_id" });
    if (error) console.error(`Upsert error:`, error.message);
  }
}

async function updateFlowBatch(supabase: any, rows: Array<{ deal_id: number; max_stage_order: number }>) {
  const now = new Date().toISOString();
  for (const row of rows) {
    const { error } = await supabase
      .from("decor_deals")
      .update({ max_stage_order: row.max_stage_order, flow_fetched: true, synced_at: now })
      .eq("deal_id", row.deal_id);
    if (error) console.error(`Update error deal ${row.deal_id}:`, error.message);
  }
}

// ---- Flow API: find max stage reached ----
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

// ---- Stale cleanup ----
async function fetchStaleIds(supabase: any, currentPdIds: Set<number>): Promise<number[]> {
  const staleIds: number[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("decor_deals")
      .select("deal_id")
      .eq("status", "open")
      .range(offset, offset + 999);
    if (error) { console.error("Stale cleanup query error:", error.message); break; }
    if (!data || data.length === 0) break;
    for (const d of data) {
      if (!currentPdIds.has(d.deal_id)) staleIds.push(d.deal_id);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return staleIds;
}

// ---- Mode: deals-open ----
async function syncDealsOpen(apiToken: string, supabase: any) {
  await ensureStages(apiToken);
  console.log(`syncDealsOpen: pipeline ${PIPELINE_ID}...`);

  // /pipelines/{id}/deals returns user_id as integer — fetch all users for name resolution
  const userMap = new Map<number, string>();
  let uStart = 0;
  while (true) {
    const usersRes = await pipedriveGet(apiToken, "/users", { limit: "500", start: String(uStart) });
    for (const u of usersRes.data || []) userMap.set(Number(u.id), u.name);
    if (!usersRes.additional_data?.pagination?.more_items_in_collection) break;
    uStart += 500;
  }
  console.log(`  Users loaded: ${userMap.size}`);

  const rows: any[] = [];
  let start = 0;
  let total = 0;

  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start), everyone: "1",
    });
    if (!res.data || res.data.length === 0) break;
    total += res.data.length;

    for (const deal of res.data) {
      if (deal.pipeline_id !== PIPELINE_ID) continue;
      const userId = typeof deal.user_id === "object" ? deal.user_id?.id : deal.user_id;
      const resolvedName = userId
        ? (userMap.get(Number(userId)) ?? (typeof deal.user_id === "object" ? deal.user_id?.name : null))
        : null;
      deal.user_id = { id: userId, name: resolvedName };
      const stageOrder = STAGE_ORDER[deal.stage_id] || 0;
      rows.push(dealToRow(deal, stageOrder, true));
    }

    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }

  console.log(`  Open deals fetched: ${total}, rows: ${rows.length}`);
  await upsertBatch(supabase, rows);

  // Stale cleanup
  const currentPdIds = new Set(rows.map((r: any) => r.deal_id));
  const staleIds = currentPdIds.size > 0 ? await fetchStaleIds(supabase, currentPdIds) : [];
  if (staleIds.length > 0) {
    await supabase
      .from("decor_deals")
      .update({ status: "lost", synced_at: new Date().toISOString() })
      .in("deal_id", staleIds);
    console.log(`  Stale cleanup: ${staleIds.length} deals marked lost`);
  }

  return { totalFetched: total, upserted: rows.length, staleMarked: staleIds.length };
}

// ---- Mode: deals-won ----
async function syncDealsWon(apiToken: string, supabase: any) {
  await ensureStages(apiToken);
  console.log(`syncDealsWon: pipeline ${PIPELINE_ID}...`);
  const seenDealIds = new Set<number>();
  const rows: any[] = [];
  let totalFetched = 0;

  for (const stageId of PIPELINE_STAGES) {
    let start = 0;
    while (true) {
      const res = await pipedriveGet(apiToken, "/deals", {
        status: "won", stage_id: String(stageId), limit: "500", start: String(start),
      });
      if (!res.data || res.data.length === 0) break;
      totalFetched += res.data.length;
      for (const deal of res.data) {
        if (deal.pipeline_id !== PIPELINE_ID) continue;
        if (seenDealIds.has(deal.id)) continue;
        seenDealIds.add(deal.id);
        rows.push(dealToRow(deal, MAX_STAGE_ORDER, true));
      }
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
    }
  }

  console.log(`  Won fetched: ${totalFetched}, unique: ${seenDealIds.size}, rows: ${rows.length}`);
  await upsertBatch(supabase, rows);
  return { totalFetched, unique: seenDealIds.size, upserted: rows.length };
}

// ---- Mode: deals-lost ----
async function syncDealsLost(
  apiToken: string,
  supabase: any,
  cutoffDays: number,
  stageOffsets: Record<string, number>,
) {
  await ensureStages(apiToken);
  let cutoffStr = "";
  if (cutoffDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cutoffDays);
    cutoffStr = cutoff.toISOString().substring(0, 10);
  }
  console.log(`syncDealsLost: cutoff=${cutoffStr || "NONE"}`);

  const seenDealIds = new Set<number>();
  const rows: any[] = [];
  let totalFetched = 0;
  const completedStages: number[] = [];
  const nextOffsets: Record<string, number> = { ...stageOffsets };
  let hitCap = false;

  for (const stageId of PIPELINE_STAGES) {
    const key = String(stageId);
    if (nextOffsets[key] === -1) { completedStages.push(stageId); continue; }

    let start = nextOffsets[key] || 0;
    let stageDone = false;

    while (true) {
      const res = await pipedriveGet(apiToken, "/deals", {
        status: "lost", stage_id: key, sort: "add_time DESC", limit: "500", start: String(start),
      });
      if (!res.data || res.data.length === 0) { stageDone = true; break; }

      for (const deal of res.data) {
        if (deal.pipeline_id !== PIPELINE_ID) continue;
        if (seenDealIds.has(deal.id)) continue;
        seenDealIds.add(deal.id);
        rows.push(dealToRow(deal, STAGE_ORDER[deal.stage_id] || 0, false));
      }

      totalFetched += res.data.length;

      if (cutoffStr) {
        const oldest = res.data[res.data.length - 1]?.add_time?.substring(0, 10) || "";
        if (oldest && oldest < cutoffStr) { stageDone = true; break; }
      }

      if (!res.additional_data?.pagination?.more_items_in_collection) { stageDone = true; break; }
      start += 500;
      if (rows.length >= 5000) { hitCap = true; break; }
    }

    if (stageDone) {
      nextOffsets[key] = -1;
      completedStages.push(stageId);
    } else {
      nextOffsets[key] = start;
    }
    if (hitCap) break;
  }

  console.log(`  Lost: scanned ${seenDealIds.size}, rows ${rows.length}, stages ${completedStages.length}/${PIPELINE_STAGES.length}`);
  await upsertBatch(supabase, rows);

  const allDone = completedStages.length === PIPELINE_STAGES.length;
  return {
    dealsScanned: seenDealIds.size,
    upserted: rows.length,
    completedStages: completedStages.length,
    totalStages: PIPELINE_STAGES.length,
    done: allDone,
    stage_offsets: allDone ? null : nextOffsets,
  };
}

// ---- Mode: deals-flow ----
async function syncDealsFlow(apiToken: string, supabase: any) {
  await ensureStages(apiToken);
  console.log(`syncDealsFlow: pipeline ${PIPELINE_ID}...`);

  const { data: deals, error: queryErr } = await supabase
    .from("decor_deals")
    .select("deal_id, stage_order")
    .eq("flow_fetched", false)
    .eq("status", "lost")
    .limit(500);

  if (queryErr) return { processed: 0, remaining: 0, done: true, error: queryErr.message };
  if (!deals || deals.length === 0) return { processed: 0, remaining: 0, done: true };

  console.log(`  Found ${deals.length} deals needing flow analysis`);
  const skipFlow = deals.filter((d: any) => d.stage_order >= OPP_MIN_ORDER);
  const needFlow = deals.filter((d: any) => d.stage_order < OPP_MIN_ORDER);

  if (skipFlow.length > 0) {
    await updateFlowBatch(supabase, skipFlow.map((d: any) => ({ deal_id: d.deal_id, max_stage_order: d.stage_order })));
  }

  const CONCURRENCY = 20;
  let processed = 0;
  for (let i = 0; i < needFlow.length; i += CONCURRENCY) {
    const chunk = needFlow.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (deal: any) => ({
        deal_id: deal.deal_id,
        max_stage_order: await getMaxStageReached(apiToken, deal.deal_id, deal.stage_order),
      }))
    );
    await updateFlowBatch(supabase, results);
    processed += results.length;
  }

  const { count: remaining } = await supabase
    .from("decor_deals")
    .select("deal_id", { count: "exact", head: true })
    .eq("flow_fetched", false)
    .eq("status", "lost");

  return { processed: processed + skipFlow.length, remaining: remaining || 0, done: (remaining || 0) === 0 };
}

// ---- Deno.serve handler ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenData, error: tokenErr } = await supabase.rpc("vault_read_secret", {
      secret_name: "PIPEDRIVE_API_TOKEN",
    });
    if (tokenErr || !tokenData) throw new Error(`Vault error: ${tokenErr?.message}`);
    const apiToken = tokenData;

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "deals-open";
    console.log(`sync-decor-deals: mode=${mode}`);

    let result: any;

    switch (mode) {
      case "deals-open":
        result = await syncDealsOpen(apiToken, supabase);
        break;
      case "deals-won":
        result = await syncDealsWon(apiToken, supabase);
        break;
      case "deals-lost": {
        const cutoffDays = body.cutoff_days ?? 365;
        result = await syncDealsLost(apiToken, supabase, cutoffDays, body.stage_offsets || {});
        break;
      }
      case "deals-flow":
        result = await syncDealsFlow(apiToken, supabase);
        break;
      case "inspect-stages": {
        await ensureStages(apiToken);
        const stagesRes = await pipedriveGet(apiToken, "/stages", { pipeline_id: String(PIPELINE_ID) });
        const stages = ((stagesRes.data || []) as any[])
          .sort((a, b) => a.order_nr - b.order_nr)
          .map((s) => ({ id: s.id, name: s.name, order_nr: s.order_nr, deals_count: s.deals_count }));
        result = { pipeline_id: PIPELINE_ID, stages, stage_order: STAGE_ORDER };
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown mode: ${mode}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const elapsed = Date.now() - t0;
    console.log(`sync-decor-deals: mode=${mode} done in ${elapsed}ms`);
    return new Response(
      JSON.stringify({ success: true, mode, result, elapsed_ms: elapsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("sync-decor-deals error:", err);
    return new Response(
      JSON.stringify({ error: err.message, elapsed_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
