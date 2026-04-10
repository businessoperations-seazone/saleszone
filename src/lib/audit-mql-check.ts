import { LeadRecord, readLeads, writeLeads } from "@/lib/audit-mql"
import { readData, SlaRow, SlaData } from "@/lib/sla-mql-blob"
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase"

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

// Quando extractVertical não identifica a vertical pelo nome da campanha (ex: "Itacaré Spot"),
// tenta inferir pelo conteúdo do formulário — opções com >10 chars são distintivas por vertical
function inferVerticalFromAnswers(lead: LeadRecord, slaData: SlaData): string | null {
  const normVals = new Set<string>()
  if (lead.form_fields?.length) {
    for (const f of lead.form_fields) normVals.add(norm(canonical(f.value)))
  }
  if (lead.form_values?.length) {
    for (const v of lead.form_values) normVals.add(norm(canonical(v)))
  }
  if (normVals.size === 0) return null

  for (const fk of Object.keys(slaData.forms)) {
    const questions = slaData.forms[fk]
    const distinctive = questions.flatMap(q => q.opcoes).filter(o => o.length > 10)
    if (distinctive.some(o => normVals.has(norm(o)))) return fk
  }
  return null
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

    // Fallback 1: valor canônico pertence às opções de exatamente uma pergunta (norm = case-insensitive)
    if (idx === -1) {
      const normVal = norm(value)
      const candidates = questions
        .map((q, i) => ({ i, match: q.opcoes.some(o => norm(o) === normVal) }))
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
  // Resolve valores ambíguos como "Sim"/"Não" que aparecem em múltiplas perguntas.
  // Restrição: só atribui se o valor pertencer às opções da pergunta alvo — impede que
  // campos extras do formulário (ex: "Empreendimento", "Você é corretor?") poluam perguntas
  // SLA que não foram respondidas (o que causaria falsos "fora_sla").
  if (unmatched.length > 0) {
    const unanswered = questions.map((_, i) => i).filter(i => !result.has(i))
    let ui = 0
    for (let k = 0; k < unmatched.length && ui < unanswered.length; k++) {
      const value   = canonical(customFields[unmatched[k]].value)
      const normVal = norm(value)
      const qIdx    = unanswered[ui]
      if (questions[qIdx].opcoes.some(o => norm(o) === normVal)) {
        const existing = result.get(qIdx) || []
        existing.push(value)
        result.set(qIdx, existing)
        ui++
      }
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
    const normVal = norm(value)
    const candidates = questions
      .map((q, i) => ({ i, match: q.opcoes.some(o => norm(o) === normVal) }))
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
  // ── Passo 1: determinar quais rows SLA verificar ──────────────────────────────

  // Prioridade: campo "Empreendimento" do formulário → row direta por nome.
  // É o cruzamento mais confiável: evita depender de marcadores na campanha
  // (que podem faltar, ex: "Itacaré Spot") e de fallbacks posicionais.
  let targetRows: SlaRow[] = []
  let vertical: string | null = null

  const empField = lead.form_fields?.find(f => norm(f.name).includes("empreendimento"))
  if (empField) {
    const row = slaData.rows.find(r => norm(r.nome) === norm(empField.value))
    if (row) {
      if (!row.status) return true          // empreendimento inativo = não verificar
      targetRows = [row]
      vertical   = row.vertical
    }
  }

  // Fallback: detecta vertical pelo nome da campanha ou pelas respostas do formulário
  if (!vertical) {
    vertical = slaVertical(lead.vertical)
    if (!vertical) vertical = inferVerticalFromAnswers(lead, slaData)
    if (!vertical) return true              // vertical desconhecida = não verificar

    targetRows = slaData.rows.filter(r => r.vertical === vertical && r.status)
    if (!targetRows.length) return true     // sem rows ativas = não verificar
  }

  // ── Passo 2: mapear respostas do formulário às perguntas SLA ─────────────────

  const questions = slaData.forms[vertical]
  if (!questions?.length) return true

  let valuesByQ: Map<number, string[]>
  if (lead.form_fields?.length) {
    valuesByQ = mapFieldsToQuestions(lead.form_fields, questions)
  } else if (lead.form_values?.length) {
    valuesByQ = mapValuesToQuestions(lead.form_values, questions)
  } else {
    return true                             // sem dados do formulário = não verificar
  }

  // ── Passo 3: checar contra os critérios SLA ───────────────────────────────────
  // Q0 → mql_intencoes, Q1 → mql_faixas, Q2 → mql_pagamentos
  return targetRows.some(row => {
    const categories = [row.mql_intencoes, row.mql_faixas, row.mql_pagamentos]
    return categories.every((accepted, qIdx) => {
      if (accepted.length === 0) return true        // sem restrição
      const answers = valuesByQ.get(qIdx) || []
      if (answers.length === 0) return true          // sem resposta para esta pergunta = não falhar
      return answers.some(a => accepted.some(acc => norm(acc) === norm(a)))
    })
  })
}

// ─── Baserow enrichment ───────────────────────────────────────────────────────
// Consulta a API do Baserow diretamente para verificar se leads chegaram.
// Cada vertical tem sua tabela no Baserow com campo de Lead Ads ID.
// Leads criados antes desse momento não são verificados no Baserow.
const BASEROW_START = "2026-04-10T12:00:00.000Z" // 09:00 BRT de 10/04/2026
const BASEROW_API = "https://api-baserow.seazone.com.br"
const BASEROW_TABLES: Record<string, { tableId: number; field: string }> = {
  Investimentos: { tableId: 1208, field: "Lead Ads ID" },
  Marketplace:   { tableId: 1330, field: "Lead Ads Id" },
  "Serviços":    { tableId: 1337, field: "leadgen_id" },
}

let _baserowToken: string | null = null

async function getBaserowToken(): Promise<string | null> {
  if (_baserowToken) return _baserowToken
  try {
    const admin = createSquadSupabaseAdmin()
    const { data } = await admin.rpc("vault_read_secret", { secret_name: "BASEROW_TOKEN" })
    if (data) _baserowToken = data
    return data || null
  } catch { return null }
}

export async function enrichBaserow(leads: LeadRecord[]): Promise<boolean> {
  const now = Date.now()
  const TWO_MIN = 2 * 60 * 1000
  const toCheck = leads.filter(l => {
    if (l.status === "descartado") return false
    if (l.created_at < BASEROW_START) return false
    if (!BASEROW_TABLES[l.vertical]) return false
    const age = now - new Date(l.created_at).getTime()
    if (age < TWO_MIN) return false
    if (l.in_baserow === undefined) return true
    // Rechecka false durante o dia todo — BASEROW_START já limita ao dia de hoje
    if (l.in_baserow === false) return true
    return false
  })
  if (!toCheck.length) return false

  const token = await getBaserowToken()
  if (!token) return false

  try {
    const byVertical = new Map<string, LeadRecord[]>()
    for (const lead of toCheck) {
      const v = lead.vertical
      if (!byVertical.has(v)) byVertical.set(v, [])
      byVertical.get(v)!.push(lead)
    }

    let changed = false
    for (const [vertical, vLeads] of byVertical) {
      const cfg = BASEROW_TABLES[vertical]
      if (!cfg) continue
      const ids = vLeads.map(l => l.leadgen_id).filter(Boolean)
      if (!ids.length) continue

      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const url = `${BASEROW_API}/api/database/rows/table/${cfg.tableId}/?user_field_names=true&size=1&filter__${encodeURIComponent(cfg.field)}__equal=${id}`
            const res = await fetch(url, {
              headers: { Authorization: `Token ${token}` },
              cache: "no-store",
            })
            if (!res.ok) return { id, found: false }
            const data = await res.json()
            return { id, found: (data.count || 0) > 0 }
          } catch { return { id, found: false } }
        })
      )

      const foundSet = new Set(results.filter(r => r.found).map(r => r.id))
      for (const lead of vLeads) {
        if (lead.leadgen_id) {
          lead.in_baserow = foundSet.has(lead.leadgen_id)
          changed = true
        }
      }
    }
    return changed
  } catch {
    return false
  }
}

// ─── runCheck (usado pelo check/route.ts e summary/route.ts) ─────────────────

export async function runCheck(key: string): Promise<{ checked: number; resolved: number }> {
  const leads = await readLeads(key)
  if (leads.length === 0) return { checked: 0, resolved: 0 }

  const now = Date.now()
  const pending = leads.filter(l => {
    if (l.status === "descartado") return false
    // Aguardando: checa após 5 min (webhook já esperou 7min, GH Actions é o fallback)
    if (l.status === "aguardando" && now - new Date(l.created_at).getTime() > FIVE_MINUTES) return true
    // Sem MIA: re-checa por até 4h desde a criação (janela fixa — não renova a cada check)
    if (l.status === "sem_mia" && now - new Date(l.created_at).getTime() < FOUR_HOURS) return true
    // Sem Pipedrive: re-checa por até 4h — Pipedrive tem lag de indexação, deal pode aparecer depois
    if (l.status === "sem_pipedrive" && now - new Date(l.created_at).getTime() < FOUR_HOURS) return true
    return false
  })

  if (pending.length === 0) return { checked: 0, resolved: 0 }

  // Mais recentes primeiro — garante que leads novos não ficam bloqueados por backlog antigo
  pending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const batch = pending.slice(0, 30)

  // Carrega SLA uma vez para todos os leads
  const slaData = await readData().catch(() => null)

  let resolved = 0
  for (const lead of batch) {
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

  const pendingMap = new Map(batch.map(l => [l.id, l]))
  const updatedLeads = leads.map(l => pendingMap.get(l.id) || l)

  // Enriquece Baserow só para a data de hoje — não toca em histórico
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (key === today) await enrichBaserow(updatedLeads)

  await writeLeads(key, updatedLeads)

  return { checked: batch.length, resolved }
}

type RecheckChange = {
  id: string; name: string; vertical: string; status_before: string; status_after: string
  sla_before: boolean | undefined; sla_after: boolean
}

// Re-avalia SLA de TODOS os leads de um dia (corrige retroativos)
// dry=true → apenas calcula, não grava (preview seguro)
export async function recheckSla(
  key: string, dry = false
): Promise<{ total: number; fixed: number; changes: RecheckChange[] }> {
  const leads = await readLeads(key)
  if (leads.length === 0) return { total: 0, fixed: 0, changes: [] }

  const slaData = await readData().catch(() => null)
  if (!slaData) return { total: leads.length, fixed: 0, changes: [] }

  let fixed = 0
  const changes: RecheckChange[] = []

  for (const lead of leads) {
    if (lead.status === "descartado") continue
    const wasOk     = lead.sla_ok
    const wasFora   = lead.status === "fora_sla"
    lead.sla_ok = checkSla(lead, slaData)

    // Lead classificado incorretamente como fora_sla → agora passa o SLA
    // Reset para aguardando: runCheck vai re-verificar no Pipedrive
    if (lead.sla_ok === true && wasFora) {
      changes.push({ id: lead.id, name: lead.name, vertical: lead.vertical,
        status_before: "fora_sla", status_after: "aguardando",
        sla_before: wasOk, sla_after: true })
      if (!dry) {
        lead.status = "aguardando"
        // notified permanece true — evita re-disparar alertas Slack para leads antigos
      }
      fixed++
    }

    // Lead que estava ok/aguardando/sem_pipedrive mas na verdade é fora_sla
    else if (lead.sla_ok === false && wasOk !== false && !wasFora) {
      changes.push({ id: lead.id, name: lead.name, vertical: lead.vertical,
        status_before: lead.status, status_after: "fora_sla",
        sla_before: wasOk, sla_after: false })
      if (!dry) {
        lead.status   = "fora_sla"
        lead.notified = true
      }
      fixed++
    }
  }

  if (!dry && fixed > 0) await writeLeads(key, leads)
  return { total: leads.length, fixed, changes }
}
