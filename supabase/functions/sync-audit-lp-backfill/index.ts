// sync-audit-lp-backfill
// Popula audit-lp/{data}.json no bucket saleszone-audit a partir de deals Pipedrive
// sincronizados no Nekt silver (rd_source='Webhook - Pipedrive').
//
// Workaround enquanto o webhook do WordPress aponta pro Vercel Blob antigo (inacessível).
// Dedup por pipedrive_deal_id contra blobs existentes — re-rodar é idempotente.
//
// Invocação:
//   POST { days_back?: number = 3 } — default 3 dias de lookback
//
// Fonte: Nekt silver pipedrive_deals_readable JOIN pipedrive_v2_persons_scd2
// Destino: Supabase Storage saleszone-audit/audit-lp/{YYYY-MM-DD}.json

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const BUCKET = "saleszone-audit";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();
const SERVICE_ROLE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
  .trim()
  .replace(/^['"]|['"]$/g, "");

async function getNektApiKey(): Promise<string> {
  // Lê do vault (mesmo padrão dos outros edge functions)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vault_read_secret`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ secret_name: "NEKT_API_KEY" }),
  });
  if (!res.ok) throw new Error(`vault NEKT_API_KEY: ${res.status} ${await res.text()}`);
  const key = await res.json();
  if (!key || typeof key !== "string") throw new Error("NEKT_API_KEY empty");
  return key;
}

async function queryNekt(sql: string, apiKey: string): Promise<Record<string, string | null>[]> {
  const res = await fetch("https://api.nekt.ai/api/v1/sql-query/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ sql, mode: "csv" }),
  });
  if (!res.ok) throw new Error(`Nekt ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j.state && j.state !== "SUCCEEDED") throw new Error(`Nekt ${j.state}: ${j.state_change_reason}`);
  const url = j.presigned_urls?.[0] || j.presigned_url;
  if (!url) throw new Error("Nekt: no presigned_url");
  const csv = await (await fetch(url)).text();
  return parseCSV(csv);
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCSV(csv: string): Record<string, string | null>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ""));
  return lines.slice(1).map(l => {
    const vals = parseCSVLine(l);
    const row: Record<string, string | null> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "") || null; });
    return row;
  });
}

// Formato Nekt: `[{label=work, value=foo@bar.com, primary=true}, ...]` (não é JSON)
function extractPrimary(raw: string | null): string {
  if (!raw) return "";
  const primary = raw.match(/value=([^,}]+),\s*primary=true/);
  if (primary) return primary[1].trim();
  const first = raw.match(/value=([^,}]+)/);
  return first ? first[1].trim() : "";
}

function bucketDate(utcStr: string | null): string | null {
  if (!utcStr) return null;
  const d = new Date(utcStr.replace(" UTC", "Z").replace(" ", "T"));
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10);
}

function verticalFromPipeline(pipelineId: string | null): string {
  if (pipelineId === "14") return "Serviços";
  if (pipelineId === "44") return "Spots";
  if (pipelineId === "28") return "Investimentos";
  return "Outros";
}

function getStorageClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function readExisting(path: string): Promise<any[]> {
  const { data, error } = await getStorageClient().storage.from(BUCKET).download(path);
  if (error || !data) return [];
  try {
    const j = JSON.parse(await data.text());
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

async function putBlob(path: string, data: unknown) {
  const body = JSON.stringify(data);
  const { error } = await getStorageClient().storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType: "application/json",
  });
  if (error) throw new Error(`PUT ${path}: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const started = Date.now();

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL/SERVICE_ROLE_KEY missing");

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const daysBack = Math.max(1, Math.min(90, parseInt(String(body.days_back || 3))));
    console.log(`sync-audit-lp-backfill: days_back=${daysBack}`);

    const nektKey = await getNektApiKey();
    const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);

    const sql = `
      SELECT d.id as deal_id, d.pipeline_id, d.canal, d.rd_source,
             d.titulo as name, d.negocio_criado_em as created_at,
             d.motivo_da_perda, d.status,
             p.name as person_name, p.emails as emails_raw, p.phones as phones_raw
      FROM nekt_silver.pipedrive_deals_readable d
      LEFT JOIN (
        SELECT id, name, emails, phones,
               ROW_NUMBER() OVER (PARTITION BY id ORDER BY _nekt_sync_at DESC) as rn
        FROM nekt_silver.pipedrive_v2_persons_scd2
      ) p ON CAST(d.pessoa_de_contato AS BIGINT) = p.id AND p.rn = 1
      WHERE LOWER(d.rd_source) LIKE '%webhook%'
        AND d.negocio_criado_em >= TIMESTAMP '${cutoff}'
      ORDER BY d.negocio_criado_em ASC
    `;
    const rows = await queryNekt(sql, nektKey);
    console.log(`  retrieved ${rows.length} deals`);

    // Agrupa por data BRT
    const byDate = new Map<string, any[]>();
    let skipped = 0;
    for (const r of rows) {
      const date = bucketDate(r.created_at);
      if (!date) { skipped++; continue; }

      const email = extractPrimary(r.emails_raw);
      const phone = extractPrimary(r.phones_raw);

      const record = {
        id: `nekt-${r.deal_id}`,
        source: "nekt-backfill",
        form_id: "",
        form_name: "",
        page_slug: "",
        page_url: "",
        name: r.person_name || r.name || "",
        email,
        phone,
        vertical: verticalFromPipeline(r.pipeline_id),
        created_at: r.created_at
          ? new Date(r.created_at.replace(" UTC", "Z").replace(" ", "T")).toISOString()
          : new Date().toISOString(),
        status: r.motivo_da_perda === "Duplicado/Erro" ? "descartado" : "ok",
        pipedrive_deal_id: parseInt(String(r.deal_id)) || undefined,
        recovered_from_pipedrive: true,
        form_fields: [
          { name: "canal", value: r.canal || "" },
          { name: "pipeline_id", value: r.pipeline_id || "" },
          { name: "rd_source", value: r.rd_source || "" },
          { name: "deal_status", value: r.status || "" },
        ].filter(f => f.value),
      };

      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(record);
    }

    // Merge com existentes (dedup por pipedrive_deal_id) + upload
    let uploadedFiles = 0;
    let totalAdded = 0;
    for (const [date, records] of [...byDate.entries()].sort()) {
      const existing = await readExisting(`audit-lp/${date}.json`);
      const existingIds = new Set(
        existing.map((l: any) => l.pipedrive_deal_id).filter(Boolean)
      );
      const toAdd = records.filter(r => !existingIds.has(r.pipedrive_deal_id));
      if (toAdd.length === 0) continue;
      const merged = [...existing, ...toAdd];
      await putBlob(`audit-lp/${date}.json`, merged);
      uploadedFiles++;
      totalAdded += toAdd.length;
    }

    const result = {
      success: true,
      days_back: daysBack,
      cutoff,
      total_fetched: rows.length,
      skipped_no_date: skipped,
      files_written: uploadedFiles,
      leads_added: totalAdded,
      elapsed_ms: Date.now() - started,
    };
    console.log(`  done: ${JSON.stringify(result)}`);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("sync-audit-lp-backfill error:", err);
    return new Response(JSON.stringify({ success: false, error: err, elapsed_ms: Date.now() - started }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
