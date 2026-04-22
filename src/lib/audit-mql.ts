import { put, del } from "@vercel/blob"

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

const BLOB_STORE_URL = process.env.BLOB_URL || ""

export function dateKey(date?: Date): string {
  const d = date || new Date()
  // BRT = UTC-3
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().slice(0, 10)
}

export async function readLeads(key: string): Promise<LeadRecord[]> {
  if (!BLOB_STORE_URL) return []
  const token = process.env.BLOB_READ_WRITE_TOKEN || ""
  try {
    const res = await fetch(`${BLOB_STORE_URL}/audit-mql/${key}.json`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function writeLeads(key: string, leads: LeadRecord[]) {
  await put(`audit-mql/${key}.json`, JSON.stringify(leads), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
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

// ─── Lock atômico via Vercel Blob ─────────────────────────────────────────────
// Usa `allowOverwrite: false` como CAS real — o put só sucede se o path ainda
// não existir no Blob Store. Primeira tentativa vence, concorrentes recebem erro
// e skipam o envio Slack. Sem TTL automático no Blob: orphan locks (crash após
// acquire e antes do release) prendem o lead, mas o merge monotônico de
// `notified=true` em runCheck garante que não duplica de qualquer forma.

export async function acquireLock(lockPath: string): Promise<boolean> {
  try {
    await put(lockPath, new Date().toISOString(), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return true
  } catch {
    // Já existe (ou erro de rede) → outro processo tem o lock
    return false
  }
}

export async function releaseLock(lockPath: string): Promise<void> {
  // @vercel/blob v2+ aceita pathname relativo em `del` — não depende mais de BLOB_URL.
  // Antes: `if (!BLOB_URL) return` silenciava o release sempre que a env não estava
  // populada (ex: preview deploys), deixando locks órfãos presos até TTL externo.
  // Agora: release sempre tenta rodar e loga erro se falhar, em vez de engolir em silêncio.
  await del(lockPath, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }).catch(err => {
    console.error("[audit-mql] releaseLock failed:", { lockPath, err })
    // Merge monotônico em runCheck + revalidação dentro do lock protegem contra
    // duplicata mesmo que o lock fique órfão temporariamente.
  })
}
