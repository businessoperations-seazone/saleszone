import { putBlob, fetchBlobJson } from "@/lib/blob"

export interface AuditCTWPPLead {
  deal_id: number
  deal_title: string
  owner_name: string
  stage_name: string
  deal_created_at: string
  morada_conversation_url: string
  morada_conversation_id: string
  tem_problema: boolean
  temperatura: string
  tag: string
  resumo: string
  problemas: string
  recomendacao: string
}

export interface AuditCTWPPDay {
  date: string       // YYYY-MM-DD ou "all-open"
  ran_at: string
  total_leads: number
  leads: AuditCTWPPLead[]
}

// ─── Stage map SZI (pipeline 28) ─────────────────────────────────────────────

export const SZI_STAGES: Record<number, string> = {
  186: "Contatados",
  338: "Qualificação",
  346: "Qualificado",
  339: "Aguardando data",
  187: "Agendado",
  340: "No Show/Reagendamento",
  208: "Reunião Realizada/OPP",
  312: "FUP",
  313: "Negociação",
  311: "Fila de espera",
  191: "Reservas",
  192: "Contrato",
  392: "FUP Parceiro",
}

// ─── Blob helpers (Supabase Storage via @/lib/blob) ───────────────────────────

export function dateKeyBRT(date?: Date): string {
  const d = date || new Date()
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().slice(0, 10)
}

export async function readAuditCTWPP(key: string): Promise<AuditCTWPPDay | null> {
  return await fetchBlobJson<AuditCTWPPDay>(`audit-ctwpp/${key}.json`)
}

export async function writeAuditCTWPP(key: string, data: AuditCTWPPDay) {
  await putBlob(`audit-ctwpp/${key}.json`, data)
}
