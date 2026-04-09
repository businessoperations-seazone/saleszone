import { put } from "@vercel/blob"

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
  status: "aguardando" | "ok" | "sem_pipedrive" | "sem_mia" | "fora_sla"
  pipedrive_deal_id?: number
  mia_link?: string
  checked_at?: string
  notified?: boolean       // evita Slack duplicado
  form_values?: string[]   // todas as respostas do formulário Meta (para verificação SLA)
  form_fields?: { name: string; value: string }[]  // pares pergunta+resposta (para exibição)
  sla_ok?: boolean         // resultado da verificação SLA (undefined = não verificado)
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
