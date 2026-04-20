import { LeadRecord, MiaErrorInfo, acquireLock, readLeads, releaseLock, writeLeads } from "@/lib/audit-mql"
import { readData, SlaRow, SlaData } from "@/lib/sla-mql-blob"
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase"

const PIPEDRIVE_TOKEN  = process.env.PIPEDRIVE_API_TOKEN        || ""
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN   || "seazone"
const MIA_FIELD_KEY    = process.env.PIPEDRIVE_MORADA_FIELD_KEY || "3dda4dab1781dcfd8839a5fd6c0b7d5e7acfbcfc"
const SLACK_WEBHOOK    = process.env.SLACK_WEBHOOK_AUDIT_MQL    || ""

const FIVE_MINUTES      = 5  * 60 * 1000
const FOUR_HOURS        = 4  * 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

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

// ─── Erro da MIA — Pipedrive Notes ────────────────────────────────────────────
// Quando a MIA falha em enviar mensagem, um fluxo n8n grava uma Note no deal
// com o motivo (400 Invalid phone number, não-WhatsApp, etc), quem atendeu como
// fallback humano e link da execução n8n. Aqui buscamos essa Note para
// enriquecer o card do audit-mql e evitar que o usuário entre no Pipedrive.

function parseMiaMotivo(raw: string): { label: string; code?: string } {
  const s = raw.replace(/\s+/g, " ").trim()
  if (/invalid phone number/i.test(s))              return { label: "Número de telefone inválido",     code: "invalid_phone" }
  if (/not.*whatsapp|not on whatsapp|no whatsapp/i.test(s)) return { label: "Número não está no WhatsApp",      code: "not_on_whatsapp" }
  if (/timeout|timed out/i.test(s))                 return { label: "Timeout na conexão com a MIA",    code: "timeout" }
  if (/\b(401|403)\b|unauthor|forbidden/i.test(s))  return { label: "Erro de autenticação no envio",   code: "auth_error" }
  if (/\b(5\d\d)\b|internal server error/i.test(s)) return { label: "Erro interno do servidor MIA",    code: "server_error" }
  if (/phonenumber/i.test(s))                       return { label: "Problema com o número de telefone", code: "phone_issue" }
  // Fallback: primeiros 120 chars do motivo bruto, sem JSON cru feio
  const clean = s.replace(/["\[\]{}\\]/g, "").replace(/code: custom/gi, "").replace(/path: phoneNumber/gi, "").trim()
  return { label: clean.slice(0, 120) || "Erro desconhecido" }
}

function parseMiaErrorNote(content: string): MiaErrorInfo | null {
  // Notes do Pipedrive vêm como HTML. Tira tags e normaliza entidades básicas.
  const plain = content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")

  if (!/Falha no envio de mensagem pra MIA/i.test(plain)) return null

  const motivoMatch = plain.match(/Motivo:\s*([\s\S]*?)(?=\n\s*(?:Status|Atividade|n8n):|$)/i)
  const statusMatch = plain.match(/Status:\s*([^\n]+)/i)
  const n8nMatch    = plain.match(/(https?:\/\/workflows\.seazone\.com\.br\/\S+)/i)

  const rawMotivo = motivoMatch?.[1]?.trim() || ""
  const { label, code } = parseMiaMotivo(rawMotivo)

  const rawStatus = statusMatch?.[1]?.trim() || ""
  const transferido = rawStatus.replace(/^Transferido para\s+/i, "").trim() || undefined

  return {
    motivo_parsed: label,
    raw_code: code,
    transferido_para: transferido,
    n8n_url: n8nMatch?.[1],
    fetched_at: new Date().toISOString(),
  }
}

async function fetchMiaErrorFromPipedrive(dealId: number): Promise<MiaErrorInfo | null> {
  if (!PIPEDRIVE_TOKEN || !dealId) return null
  const url = `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/deals/${dealId}/notes` +
    `?sort=add_time%20DESC&limit=10&api_token=${PIPEDRIVE_TOKEN}`
  try {
    const data = await pdFetch(url)
    const notes = (data?.data || []) as { content?: string }[]
    for (const n of notes) {
      const parsed = parseMiaErrorNote(n.content || "")
      if (parsed) return parsed
    }
    return null
  } catch {
    return null
  }
}

// ─── Notificação Slack ────────────────────────────────────────────────────────

async function notify(lead: LeadRecord, key: string, problem: "sem_pipedrive" | "sem_mia") {
  if (!SLACK_WEBHOOK || lead.notified) return

  // Lock atômico via Blob `allowOverwrite: false`. Garante que mesmo com 3 callers
  // concorrentes (webhook delayedCheck + recovery cron + GH Actions) só um envia.
  // Anteriormente o padrão read → mark notified → write → send Slack tinha janela
  // de ~100-500ms entre read e write que permitia 2 processos enviarem duplicado.
  const lockPath = `audit-mql/locks/${key}/${lead.id}.lock`
  const got = await acquireLock(lockPath)
  if (!got) {
    console.log(`[audit-mql-notify] lock held lead=${lead.id} problem=${problem} — skip duplicate send`)
    return
  }

  try {
    // Dentro do lock: revalida contra o estado mais recente do Blob. Cobre o caso
    // de outro processo já ter notificado e liberado o lock antes de chegarmos aqui.
    const fresh = await readLeads(key).catch(() => [])
    const target = fresh.find(l => l.id === lead.id)
    if (target?.notified) {
      console.log(`[audit-mql-notify] already notified lead=${lead.id} — skip`)
      return
    }

    // Marca notified ANTES do Slack. O merge monotônico em runCheck garante que
    // um write paralelo não reverte `notified: true` para `false` depois.
    if (target) {
      target.notified = true
      await writeLeads(key, fresh).catch(() => {})
    }

    const time = new Date(lead.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    const dealLink = lead.pipedrive_deal_id
      ? `<https://seazone-fd92b9.pipedrive.com/deal/${lead.pipedrive_deal_id}|#${lead.pipedrive_deal_id}>`
      : null

    // Linha extra no Slack quando temos motivo parseado do erro MIA
    const miaErrorLine = (problem === "sem_mia" && lead.mia_error)
      ? `*Erro MIA:* ${lead.mia_error.motivo_parsed}` +
        (lead.mia_error.transferido_para ? `  |  *Transferido para:* ${lead.mia_error.transferido_para}` : "") +
        "\n"
      : ""

    const text =
      problem === "sem_pipedrive"
        ? `<@U09TS4BLYRY> 🚨 *Lead sem deal no Pipedrive* — ${time}\n` +
          `*Nome:* ${lead.name || "—"}  |  *Vertical:* ${lead.vertical || "—"}\n` +
          `*Email:* ${lead.email || "—"}  |  *Tel:* ${lead.phone || "—"}\n` +
          `*Campanha:* ${lead.campaign_name || "—"}\n` +
          `*LeadGen ID:* \`${lead.leadgen_id}\`\nO lead chegou pelo Meta Ads mas não foi encontrado no Pipedrive após 2 minutos.`
        : `<@U09TS4BLYRY> ⚠️ *Lead sem atendimento MIA* — ${time}\n` +
          `*Nome:* ${lead.name || "—"}  |  *Vertical:* ${lead.vertical || "—"}\n` +
          `*Deal:* ${dealLink || "—"}  |  *Campanha:* ${lead.campaign_name || "—"}\n` +
          miaErrorLine +
          `O deal existe no Pipedrive mas o campo *Link da Conversa* não foi preenchido pela Morada IA.`

    const res = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(err => { console.error("[audit-mql-notify] Slack error:", err); return null })

    if (res && res.ok) {
      console.log(`[audit-mql-notify] sent slack lead=${lead.id} problem=${problem} vertical=${lead.vertical} ts=${Date.now()}`)
    } else if (res) {
      console.error(`[audit-mql-notify] Slack non-OK status=${res.status} lead=${lead.id}`)
    }
  } finally {
    await releaseLock(lockPath)
  }
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
  if (META_VALUE_MAP[val]) return META_VALUE_MAP[val]
  // Fallback: norm-based lookup para variações de acento/typo
  const normVal = norm(val)
  for (const [k, v] of Object.entries(META_VALUE_MAP)) {
    if (norm(k) === normVal) return v
  }
  return val
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
export const BASEROW_START = "2026-04-10T12:00:00.000Z" // 09:00 BRT de 10/04/2026
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
  try {
    const leads = await readLeads(key)
    if (leads.length === 0) return { checked: 0, resolved: 0 }

    const now = Date.now()
    const pending = leads.filter(l => {
      if (l.status === "descartado") return false
      // Aguardando: checa após 5 min (webhook já esperou 7min, GH Actions é o fallback)
      if (l.status === "aguardando" && now - new Date(l.created_at).getTime() > FIVE_MINUTES) return true
      // Erro em qualquer nível (Pipedrive, MIA, Baserow): re-checa a cada 4h por até 24h
      const hasUnresolvedProblem =
        l.status === "sem_pipedrive" ||
        l.status === "sem_mia" ||
        (l.in_baserow === false && l.created_at >= BASEROW_START)
      if (hasUnresolvedProblem) {
        const age = now - new Date(l.created_at).getTime()
        if (age > TWENTY_FOUR_HOURS) return false
        if (!l.checked_at) return true
        return now - new Date(l.checked_at).getTime() >= FOUR_HOURS
      }
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

      // Lead já OK: problema pendente é só Baserow — enrichBaserow (após o loop) resolve
      if (lead.status === "ok") continue

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
        await notify(lead, key, "sem_pipedrive")
        lead.notified = true
      } else {
        const deal = await getLatestDeal(personId)
        if (!deal) {
          lead.status = "sem_pipedrive"
          await notify(lead, key, "sem_pipedrive")
          lead.notified = true
        } else {
          lead.pipedrive_deal_id = deal.deal_id
          if (!deal.mia_link) {
            lead.status = "sem_mia"
            // Pre-fetch do erro MIA da Note do Pipedrive. Assim o card já mostra
            // motivo parseado sem o usuário precisar entrar no Pipedrive.
            // Busca só quando mia_error ainda não foi capturado ou é antigo (>1h).
            const miaErrorStale =
              !lead.mia_error ||
              (Date.now() - new Date(lead.mia_error.fetched_at).getTime() > 60 * 60 * 1000)
            if (miaErrorStale) {
              const err = await fetchMiaErrorFromPipedrive(deal.deal_id)
              if (err) lead.mia_error = err
            }
            await notify(lead, key, "sem_mia")
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

    // Enriquece Baserow só para a data de hoje — não toca em histórico.
    // Baserow enrichment pode atualizar leads fora do `batch` — fazemos aqui
    // em cima de `leads` (snapshot inicial) e depois o merge fresco incorpora.
    const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (key === today) {
      const merged = leads.map(l => pendingMap.get(l.id) || l)
      await enrichBaserow(merged)
      // Propaga mudanças do enrichBaserow (mutação in-place) de volta pra pendingMap
      for (const l of merged) if (pendingMap.has(l.id)) pendingMap.set(l.id, l)
      // Adiciona leads fora do batch que foram alterados pelo enrichBaserow
      for (const l of merged) if (!pendingMap.has(l.id) && l.in_baserow !== undefined) pendingMap.set(l.id, l)
    }

    // ─── Merge fresco (monotônico em notified) ──────────────────────────────
    // Entre o readLeads inicial (linha 388) e aqui passaram segundos de I/O
    // (Pipedrive + Baserow + SLA). Outro caller do runCheck pode ter escrito
    // notified=true no blob. Se fizéssemos write direto do snapshot antigo,
    // reverteríamos notified para false e causaríamos duplicata de Slack.
    // Solução: relê fresh e aplica merge monotônico — notified=true nunca volta.
    const fresh = await readLeads(key).catch(() => leads)
    const freshMap = new Map(fresh.map(l => [l.id, l]))
    const finalLeads: LeadRecord[] = []

    // Começa do fresh (inclui leads novos que chegaram por webhook enquanto processávamos)
    for (const f of fresh) {
      const processed = pendingMap.get(f.id)
      if (!processed) {
        finalLeads.push(f)
        continue
      }
      finalLeads.push({
        ...processed,
        // Monotônico: se fresh já disse notified=true, mantém true
        notified: f.notified === true ? true : processed.notified,
      })
    }
    // Adiciona leads do pendingMap que sumiram do fresh (edge case raro: delete concorrente)
    for (const [id, p] of pendingMap) {
      if (!freshMap.has(id)) finalLeads.push(p)
    }

    await writeLeads(key, finalLeads)

    return { checked: batch.length, resolved }
  } catch (err) {
    console.error(`[audit-mql-check] runCheck(${key}) error:`, err)
    // Notifica erro ao Slack
    if (SLACK_WEBHOOK) {
      await fetch(SLACK_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `<@U09TS4BLYRY> ❌ *Erro no Audit MQL* — ${key}\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``,
        }),
      }).catch(e => console.error("[audit-mql-check] Slack error notification failed:", e))
    }
    return { checked: 0, resolved: 0 }
  }
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
    // fora_sla é status final — não re-avalia quando o SLA muda para mais leniente
    if (lead.status === "fora_sla") continue

    const wasOk   = lead.sla_ok
    lead.sla_ok   = checkSla(lead, slaData)

    // Lead que estava ok/aguardando/sem_pipedrive mas agora falha no SLA (mais restritivo)
    if (lead.sla_ok === false && wasOk !== false) {
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
