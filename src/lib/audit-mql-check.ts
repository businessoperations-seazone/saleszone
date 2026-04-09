import { LeadRecord, readLeads, writeLeads } from "@/lib/audit-mql"
import { readData, SlaRow, SlaData } from "@/lib/sla-mql-blob"

const PIPEDRIVE_TOKEN  = process.env.PIPEDRIVE_API_TOKEN        || ""
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN   || "seazone"
const MIA_FIELD_KEY    = process.env.PIPEDRIVE_MORADA_FIELD_KEY || "3dda4dab1781dcfd8839a5fd6c0b7d5e7acfbcfc"
const SLACK_WEBHOOK    = process.env.SLACK_WEBHOOK_AUDIT_MQL    || ""

const FIVE_MINUTES = 5 * 60 * 1000
const FOUR_HOURS   = 4 * 60 * 60 * 1000

// ─── Pipedrive ────────────────────────────────────────────────────────────────

async function pdFetch(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return null
  return res.json()
}

async function findPerson(email: string, phone: string): Promise<number | null> {
  if (email) {
    const data = await pdFetch(
      `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search` +
      `?term=${encodeURIComponent(email)}&fields=email&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`
    )
    const id = data?.data?.items?.[0]?.item?.id as number | undefined
    if (id) return id
  }
  if (phone) {
    const clean = phone.replace(/\D/g, "")
    const data1 = await pdFetch(
      `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search` +
      `?term=${encodeURIComponent(clean)}&fields=phone&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`
    )
    const id1 = data1?.data?.items?.[0]?.item?.id as number | undefined
    if (id1) return id1
    // Fallback sem código de país
    if (clean.startsWith("55") && clean.length === 13) {
      const sem55 = clean.slice(2)
      const data2 = await pdFetch(
        `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search` +
        `?term=${encodeURIComponent(sem55)}&fields=phone&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`
      )
      const id2 = data2?.data?.items?.[0]?.item?.id as number | undefined
      if (id2) return id2
    }
  }
  return null
}

async function getLatestDeal(personId: number): Promise<{ deal_id: number; mia_link: string | null } | null> {
  const data = await pdFetch(
    `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/${personId}/deals` +
    `?sort=add_time+DESC&limit=1&api_token=${PIPEDRIVE_TOKEN}`
  )
  const deal = data?.data?.[0]
  if (!deal) return null
  return { deal_id: deal.id as number, mia_link: (deal[MIA_FIELD_KEY] as string) || null }
}

// ─── Notificação Slack ────────────────────────────────────────────────────────

async function notify(lead: LeadRecord, problem: "sem_pipedrive" | "sem_mia") {
  if (!SLACK_WEBHOOK || lead.notified) return
  const time = new Date(lead.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
  const dealLink = lead.pipedrive_deal_id
    ? `<https://seazone-fd92b9.pipedrive.com/deal/${lead.pipedrive_deal_id}|#${lead.pipedrive_deal_id}>`
    : null

  const text =
    problem === "sem_pipedrive"
      ? `🚨 *Lead sem deal no Pipedrive* — ${time}\n` +
        `*Nome:* ${lead.name || "—"}  |  *Vertical:* ${lead.vertical || "—"}\n` +
        `*Email:* ${lead.email || "—"}  |  *Tel:* ${lead.phone || "—"}\n` +
        `*Campanha:* ${lead.campaign_name || "—"}\n` +
        `*LeadGen ID:* \`${lead.leadgen_id}\`\nO lead chegou pelo Meta Ads mas não foi encontrado no Pipedrive após 2 minutos.`
      : `⚠️ *Lead sem atendimento MIA* — ${time}\n` +
        `*Nome:* ${lead.name || "—"}  |  *Vertical:* ${lead.vertical || "—"}\n` +
        `*Deal:* ${dealLink || "—"}  |  *Campanha:* ${lead.campaign_name || "—"}\n` +
        `O deal existe no Pipedrive mas o campo *Link da Conversa* não foi preenchido pela Morada IA.`

  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
}

// ─── Verificação SLA ──────────────────────────────────────────────────────────

function slaVertical(auditVertical: string): string | null {
  if (auditVertical === "Investimentos") return "SZI"
  if (auditVertical === "Serviços")      return "Serviços"
  if (auditVertical === "Marketplace")   return "Marketplace"
  return null
}

function formsKey(auditVertical: string): string | null {
  if (auditVertical === "Investimentos") return "SZI"
  if (auditVertical === "Serviços")      return "Serviços"
  if (auditVertical === "Marketplace")   return "Marketplace"
  return null
}

// Normaliza texto para comparação (remove acentos, pontuação, espaços)
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
}

// Valores que a Meta API envia para o campo "Qual a disponibilidade do imóvel para locação?"
// são diferentes dos rótulos exibidos no formulário e armazenados no SLA.
// Este mapa converte o valor recebido da Meta para o rótulo canônico do SLA.
const META_VALUE_MAP: Record<string, string> = {
  "Está disponível para alugar":  "Disponível imediatamente",
  "Já está alugando anual":        "Alugado com contrato anual",
  "Está em reforma":               "Em reforma / preparação",
  "Moro no imóvel":                "Não está disponível",
  "Ja é locado por temporada":     "Já opera por temporada",
}

function canonical(val: string): string {
  return META_VALUE_MAP[val] ?? val
}

// Mapeia form_fields do lead às perguntas SLA por índice de pergunta
// Retorna Map<questionIndex, valor[]> — cada pergunta tem seus próprios valores
function mapFieldsToQuestions(
  fields: { name: string; value: string }[],
  questions: { pergunta: string; opcoes: string[] }[]
): Map<number, string[]> {
  const result = new Map<number, string[]>()
  const standardFields = new Set(["full_name", "first_name", "last_name", "email", "phone_number", "phone"])

  const customFields = fields.filter(f => !standardFields.has(f.name))
  const unmatched: number[] = []  // índices dos campos que não foram atribuídos

  for (let ci = 0; ci < customFields.length; ci++) {
    const field = customFields[ci]
    const value = canonical(field.value)
    const normName = norm(field.name)

    // Tenta match por nome do campo ≈ texto da pergunta
    let idx = questions.findIndex(q => norm(q.pergunta) === normName)

    // Fallback 1: valor canônico pertence às opções de exatamente uma pergunta
    if (idx === -1) {
      const candidates = questions
        .map((q, i) => ({ i, match: q.opcoes.includes(value) }))
        .filter(c => c.match)
      if (candidates.length === 1) idx = candidates[0].i
    }

    if (idx >= 0) {
      const existing = result.get(idx) || []
      existing.push(value)
      result.set(idx, existing)
    } else {
      unmatched.push(ci)  // não atribuído — candidato para fallback posicional
    }
  }

  // Fallback 2 (posicional): campos não atribuídos → perguntas ainda sem resposta, em ordem
  // Pressuposto: Meta envia campos na mesma ordem das perguntas SLA (comportamento padrão)
  // Resolve valores ambíguos como "Sim"/"Não" que aparecem em múltiplas perguntas
  if (unmatched.length > 0) {
    const unanswered = questions.map((_, i) => i).filter(i => !result.has(i))
    for (let k = 0; k < Math.min(unmatched.length, unanswered.length); k++) {
      const value = canonical(customFields[unmatched[k]].value)
      const existing = result.get(unanswered[k]) || []
      existing.push(value)
      result.set(unanswered[k], existing)
    }
  }

  return result
}

// Fallback para leads legados com apenas form_values (array flat sem nomes de campo)
// Atribui cada valor à pergunta SLA que o contém como opção única
function mapValuesToQuestions(
  values: string[],
  questions: { pergunta: string; opcoes: string[] }[]
): Map<number, string[]> {
  const result = new Map<number, string[]>()
  for (const val of new Set(values)) {
    const value = canonical(val)
    const candidates = questions
      .map((q, i) => ({ i, match: q.opcoes.includes(value) }))
      .filter(c => c.match)
    if (candidates.length === 1) {
      const existing = result.get(candidates[0].i) || []
      existing.push(value)
      result.set(candidates[0].i, existing)
    }
  }
  return result
}

export function checkSla(lead: LeadRecord, slaData: SlaData): boolean {
  const v = slaVertical(lead.vertical)
  if (!v) return true                          // vertical sem SLA (Hóspedes, etc.) = não verificar

  const fk = formsKey(lead.vertical)
  if (!fk) return true
  const questions = slaData.forms[fk]
  if (!questions?.length) return true

  const activeRows = slaData.rows.filter(r => r.vertical === v && r.status)
  if (!activeRows.length) return true          // sem rows ativas = não verificar

  let valuesByQ: Map<number, string[]>
  if (lead.form_fields?.length) {
    valuesByQ = mapFieldsToQuestions(lead.form_fields, questions)
  } else if (lead.form_values?.length) {
    // Leads legados: usa form_values com detecção por valor único
    valuesByQ = mapValuesToQuestions(lead.form_values, questions)
  } else {
    return true  // sem dados do formulário = não verificar
  }

  // SLA categories mapeiam sequencialmente: Q0 → mql_intencoes, Q1 → mql_faixas, Q2 → mql_pagamentos
  return activeRows.some(row => {
    const categories = [row.mql_intencoes, row.mql_faixas, row.mql_pagamentos]
    return categories.every((accepted, qIdx) => {
      if (accepted.length === 0) return true        // sem restrição
      const answers = valuesByQ.get(qIdx) || []
      if (answers.length === 0) return true          // sem resposta para esta pergunta = não falhar
      return answers.some(a => accepted.includes(a))
    })
  })
}

// ─── runCheck (usado pelo check/route.ts e summary/route.ts) ─────────────────

export async function runCheck(key: string): Promise<{ checked: number; resolved: number }> {
  const leads = await readLeads(key)
  if (leads.length === 0) return { checked: 0, resolved: 0 }

  const now = Date.now()
  const pending = leads.filter(l => {
    // Aguardando: checa após 5 min (webhook já esperou 7min, GH Actions é o fallback)
    if (l.status === "aguardando" && now - new Date(l.created_at).getTime() > FIVE_MINUTES) return true
    // Sem MIA: re-checa por até 4h desde a criação (janela fixa — não renova a cada check)
    if (l.status === "sem_mia" && now - new Date(l.created_at).getTime() < FOUR_HOURS) return true
    return false
  })

  if (pending.length === 0) return { checked: 0, resolved: 0 }

  // Carrega SLA uma vez para todos os leads
  const slaData = await readData().catch(() => null)

  let resolved = 0
  for (const lead of pending) {
    lead.checked_at = new Date().toISOString()

    // Verificação SLA ANTES de buscar Pipedrive — lead fora do SLA não deveria
    // estar no Pipe, então não faz sentido alertar "sem deal" para ele
    if (slaData) {
      lead.sla_ok = checkSla(lead, slaData)
    }
    if (lead.sla_ok === false) {
      lead.status = "fora_sla"
      lead.notified = true
      continue
    }

    const personId = await findPerson(lead.email, lead.phone)
    if (!personId) {
      lead.status = "sem_pipedrive"
      await notify(lead, "sem_pipedrive")
      lead.notified = true
    } else {
      const deal = await getLatestDeal(personId)
      if (!deal) {
        lead.status = "sem_pipedrive"
        await notify(lead, "sem_pipedrive")
        lead.notified = true
      } else {
        lead.pipedrive_deal_id = deal.deal_id
        if (!deal.mia_link) {
          lead.status = "sem_mia"
          await notify(lead, "sem_mia")
          lead.notified = true
        } else {
          lead.mia_link = deal.mia_link
          lead.status = "ok"
          lead.notified = true
          resolved++
        }
      }
    }
  }

  const pendingMap = new Map(pending.map(l => [l.id, l]))
  await writeLeads(key, leads.map(l => pendingMap.get(l.id) || l))

  return { checked: pending.length, resolved }
}

// Re-avalia SLA de TODOS os leads de um dia (corrige retroativos)
export async function recheckSla(key: string): Promise<{ total: number; fixed: number }> {
  const leads = await readLeads(key)
  if (leads.length === 0) return { total: 0, fixed: 0 }

  const slaData = await readData().catch(() => null)
  if (!slaData) return { total: leads.length, fixed: 0 }

  let fixed = 0
  for (const lead of leads) {
    const wasOk = lead.sla_ok
    lead.sla_ok = checkSla(lead, slaData)

    // Lead que estava ok/sem_pipedrive mas na verdade é fora_sla
    if (lead.sla_ok === false && wasOk !== false) {
      lead.status = "fora_sla"
      lead.notified = true
      fixed++
    }
  }

  if (fixed > 0) await writeLeads(key, leads)
  return { total: leads.length, fixed }
}
