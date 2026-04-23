import { putBlob, fetchBlobJson, casAcquireBlob, deleteBlob } from "@/lib/blob"

export interface MiaErrorInfo {
  motivo_parsed: string        // label humano ex "Número de telefone inválido"
  raw_code?: string            // código interno ex "invalid_phone"
  transferido_para?: string    // ex "Jeniffer Correa"
  n8n_url?: string
  fetched_at: string           // ISO
}

export interface LeadRecord {
  id: string
  leadgen_id: string
  form_id: string
  ad_id: string
  page_id: string
  name: string
  email: string
  phone: string
  campaign_name: string
  vertical: string
  created_at: string       // ISO
  status: "aguardando" | "ok" | "sem_pipedrive" | "sem_mia" | "fora_sla" | "descartado"
  pipedrive_deal_id?: number
  mia_link?: string
  checked_at?: string
  notified?: boolean       // evita Slack duplicado
  form_values?: string[]   // todas as respostas do formulário Meta (para verificação SLA)
  form_fields?: { name: string; value: string }[]  // pares pergunta+resposta (para exibição)
  sla_ok?: boolean         // resultado da verificação SLA (undefined = não verificado)
  in_baserow?: boolean     // true = chegou no Baserow, false = não chegou, undefined = ainda não verificado
  nekt_status?: "ok" | "nao_encontrado"  // verificação Nekt às 7h BRT do dia seguinte
  mia_error?: MiaErrorInfo  // erro capturado da Note do Pipedrive quando status=sem_mia
}

export function extractVertical(campaignName: string): string {
  const n = campaignName.toUpperCase()
  if (n.includes("[SI]") || n.includes("[SZI]") || n.includes("INVESTIMENTO")) return "Investimentos"
  if (n.includes("[SS]") || n.includes("[SZS]") || n.includes("SERVI"))        return "Serviços"
  if (n.includes("[MKTPLACE]") || n.includes("[MKT]") || n.includes("MARKETPLACE")) return "Marketplace"
  if (n.includes("[SH]") || n.includes("HOSPEDE") || n.includes("HÓSPEDE"))    return "Hóspedes"
  return "Outros"
}

export function dateKey(date?: Date): string {
  const d = date || new Date()
  // BRT = UTC-3
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().slice(0, 10)
}

export async function readLeads(key: string): Promise<LeadRecord[]> {
  const d = await fetchBlobJson<LeadRecord[]>(`audit-mql/${key}.json`)
  return d ?? []
}

export async function writeLeads(key: string, leads: LeadRecord[]) {
  await putBlob(`audit-mql/${key}.json`, leads)
}

// Append seguro contra race condition: read → dedup → write → verify → retry
export async function appendLeadSafe(key: string, record: LeadRecord, retries = 4): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 150 * attempt))

    const existing = await readLeads(key)
    if (existing.some(l => l.leadgen_id === record.leadgen_id)) return false // já existe

    await writeLeads(key, [...existing, record])

    // Verifica se a escrita sobreviveu (pode ter sido sobrescrita por outro request simultâneo)
    await new Promise(r => setTimeout(r, 100))
    const after = await readLeads(key)
    if (after.some(l => l.leadgen_id === record.leadgen_id)) return true

    // Foi sobrescrita — tenta de novo
  }
  return false
}

// ─── Lock atômico via Supabase Storage ────────────────────────────────────────
// casAcquireBlob usa upsert:false → upload só sucede se o path ainda não existir.
// Primeira tentativa vence, concorrentes recebem erro e skipam o envio Slack.
// Orphan locks (crash entre acquire e release) prendem o lead, mas o merge
// monotônico de `notified=true` em runCheck garante que não duplica.

export async function acquireLock(lockPath: string): Promise<boolean> {
  return await casAcquireBlob(lockPath, new Date().toISOString())
}

export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await deleteBlob(lockPath)
  } catch (err) {
    console.error("[audit-mql] releaseLock failed:", { lockPath, err })
    // Merge monotônico em runCheck protege contra duplicata mesmo com lock órfão.
  }
}
