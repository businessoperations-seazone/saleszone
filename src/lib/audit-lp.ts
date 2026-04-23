import { putBlob, fetchBlobJson } from "@/lib/blob"
import { MiaErrorInfo } from "@/lib/audit-mql"

// Lead vindo de Landing Page WordPress via Elementor Forms → webhook saleszone
// Fluxo paralelo: Elementor dispara 2 webhooks simultâneos
//   (1) n8n → cria Pessoa+Deal no Pipedrive + envia MIA
//   (2) saleszone (/api/growth/audit-lp/webhook) → grava em blob para auditoria

export interface LpLeadRecord {
  id: string
  source: "elementor"
  form_id: string            // ID do form no Elementor (ou slug)
  form_name: string          // Nome do form (definido no Elementor)
  page_slug: string          // Slug da LP (ex: "novos-proprietarios")
  page_url: string           // URL completa da LP de origem
  name: string
  email: string
  phone: string
  vertical: string           // Investimentos | Serviços | Marketplace | Hóspedes | Outros
  created_at: string         // ISO

  // UTMs e dados de mídia
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  rd_event?: string

  // Todos os campos do form (para exibição + debug)
  form_fields?: { name: string; value: string }[]

  // Estado do audit
  status: "aguardando" | "ok" | "sem_pipedrive" | "sem_mia" | "descartado"
  pipedrive_deal_id?: number
  pipedrive_person_id?: number
  mia_link?: string
  mia_error?: MiaErrorInfo   // reusa o mesmo shape do audit-mql
  checked_at?: string
  notified?: boolean         // evita Slack duplicado

  // Flag de origem no recovery: true = audit foi backfilled via Pipedrive
  recovered_from_pipedrive?: boolean
}

// ─── Mapeamento form → vertical ───────────────────────────────────────────────
// Preencher à medida que identificarmos os form_name reais de cada LP.
// Enquanto estiver sem mapeamento: extractLpVertical retorna "Outros".
//
// COMO PREENCHER:
//   1. Fazer 1 cadastro de teste em cada LP.
//   2. Conferir no blob audit-lp/{data}.json o `form_name` recebido.
//   3. Adicionar entrada aqui: form_name (minúsculo, sem acento) → vertical.
//
// Pode usar também o page_slug como fallback (ex: "novos-proprietarios" → Investimentos).
const FORM_NAME_VERTICAL_MAP: Record<string, string> = {
  // Exemplos (ajustar após inspeção real):
  // "formulario novos proprietarios": "Investimentos",
  // "form captacao servicos":         "Serviços",
  // "form marketplace":               "Marketplace",
  // "form hospedes":                  "Hóspedes",
}

const PAGE_SLUG_VERTICAL_MAP: Record<string, string> = {
  "novos-proprietarios": "Investimentos",
  "servicos":            "Serviços",
  "marketplace":         "Marketplace",
  "hospedes":            "Hóspedes",
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function extractLpVertical(formName: string, pageSlug: string): string {
  const byForm = FORM_NAME_VERTICAL_MAP[normalizeKey(formName || "")]
  if (byForm) return byForm
  const bySlug = PAGE_SLUG_VERTICAL_MAP[normalizeKey(pageSlug || "")]
  if (bySlug) return bySlug
  return "Outros"
}

// ─── Storage (Supabase Storage via @/lib/blob) ────────────────────────────────

export function lpDateKey(date?: Date): string {
  const d = date || new Date()
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000) // BRT = UTC-3
  return brt.toISOString().slice(0, 10)
}

export async function readLpLeads(key: string): Promise<LpLeadRecord[]> {
  const d = await fetchBlobJson<LpLeadRecord[]>(`audit-lp/${key}.json`)
  return d ?? []
}

export async function writeLpLeads(key: string, leads: LpLeadRecord[]) {
  await putBlob(`audit-lp/${key}.json`, leads)
}

// Dedup: mesmo email+phone no mesmo dia é tratado como o mesmo lead
function lpDedupKey(r: Pick<LpLeadRecord, "email" | "phone">): string {
  const e = (r.email || "").trim().toLowerCase()
  const p = (r.phone || "").replace(/\D/g, "").slice(-11) // últimos 11 dígitos (DDD+9+8dig)
  return `${e}|${p}`
}

// Append com verificação de dedup e retry contra sobrescrita concorrente
export async function appendLpLeadSafe(key: string, record: LpLeadRecord, retries = 4): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 150 * attempt))

    const existing = await readLpLeads(key)
    if (existing.some(l => lpDedupKey(l) === lpDedupKey(record))) return false

    await writeLpLeads(key, [...existing, record])
    await new Promise(r => setTimeout(r, 100))

    const after = await readLpLeads(key)
    if (after.some(l => l.id === record.id)) return true
  }
  return false
}

// Locks são reutilizados de @/lib/audit-mql via acquireLock / releaseLock,
// com caminhos distintos: audit-lp/locks/{key}/{id}.lock
