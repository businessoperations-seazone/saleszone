import { queryNekt } from "./nekt"
import {
  dateKeyBRT,
  readAuditCTWPP,
  writeAuditCTWPP,
  SZI_STAGES,
  type AuditCTWPPLead,
} from "./audit-ctwpp"

// ─── Prompt ───────────────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = `Voce e um auditor especialista em conversas de vendas imobiliarias da Seazone.

CONTEXTO DO NEGOCIO SEAZONE:
A Seazone vende cotas imobiliarias no modelo SPE: o comprador vira socio/dono do imovel. Os empreendimentos sao chamados SPOT (ex: Caraguatuba Spot, Natal Spot, Jurere Spot). Leads chegam via anuncios Click to WhatsApp no Meta Ads e sao abordados pela IA chamada MIA (plataforma Morada.ai). O objetivo da MIA e qualificar o lead e agendar uma reuniao com um vendedor/especialista humano.
- Horario comercial: segunda a sexta, 09h00 as 18h00. NAO ha atendimento no sabado nem domingo.
- Se a MIA oferece horarios em sabado ou domingo, isso e um PROBLEMA (agenda inexistente em fim de semana).
- Data de hoje: {data_hoje} ({dia_semana_hoje}).
- CALENDARIO DOS PROXIMOS 30 DIAS (use como referencia exata para verificar dias da semana):
{calendario}
- REGRA DIAS DA SEMANA: Para verificar se um dia ofertado e correto, consulte APENAS o calendario acima. NUNCA calcule por conta propria. Se o calendario confirma que o dia e correto, NAO e problema.

ATORES NA CONVERSA:
- "mia" ou "ai" = a IA Morada fazendo a abordagem
- "mia_message_template" = mensagem automatica da MIA
- "user" = o lead (potencial investidor) OU um vendedor humano
- Mensagens de vendedor humano tem tom profissional: "conforme conversamos", "te mando os materiais", "aqui e [nome] da Seazone"

INSTRUCOES DE ANALISE:
1. Leia a conversa COMPLETA com atencao ao contexto e aos timestamps
2. Se um vendedor humano assumiu o lead, considere isso no contexto
3. Referencias a contatos externos (ligacoes, WhatsApp) indicam relacionamento fora da MIA
4. Avalie o nivel de ENGAJAMENTO do lead ao longo de toda a conversa

REGRA CRITICA — CONSERVADORISMO:
Este audit vai direto para o time comercial. NAO aponte problemas a menos que voce tenha CERTEZA ABSOLUTA.
- Na DUVIDA, classifique como "sem_problema". E melhor deixar passar um problema do que acusar injustamente.
- So registre como problema algo que seja INEQUIVOCO e CLARO na conversa.
- Comportamentos normais da MIA (oferecer horarios, fazer perguntas de qualificacao, enviar mensagens de follow-up) NAO sao problemas.
- Se o lead simplesmente nao respondeu, isso NAO e problema nosso.

TIPOS DE PROBLEMA (so registre se for INEQUIVOCO):
- Falha de agendamento: IA confirmou horario inexistente, loop de reagendamento
- Loop/repeticao: IA enviou a mesma mensagem varias vezes sem avanco
- Informacao incorreta: MIA deu dados CLARAMENTE errados sobre preco, prazo, condicoes
- Nao entendeu o lead: MIA ignorou pergunta direta CLARA ou respondeu completamente fora de contexto
- Contradicao de agenda (GRAVE): MIA oferece datas/horarios, lead escolhe um, e depois a MIA diz que aquele horario nao esta disponivel
- Pre-vendedor demorando para responder: MAIS DE 1H dentro do horario comercial (09h-18h). Fora do horario: prazo começa as 09h do dia util seguinte, aceitavel ate 2H
- Pre-vendedor passando informacoes claramente incorretas

ESTATISTICAS DA CONVERSA:
- Mensagens enviadas pela IA: {msgs_ia}
- Mensagens enviadas pelo Lead: {msgs_lead}

CRITERIOS DE TEMPERATURA — baseie-se nas estatisticas acima como ponto de partida objetivo:
- Quente: Lead enviou 7 ou mais mensagens
- Morno: Lead enviou entre 3 e 6 mensagens
- Frio: Lead enviou 0, 1 ou 2 mensagens
- Indefinido: Impossivel contar mensagens do lead (conversa corrompida ou sem mensagens)

DADOS DO LEAD (notas e atividades do CRM):
{contexto_crm}

CONVERSA DA MIA:
{conversa}

Retorne APENAS o JSON abaixo, sem texto adicional:
{
  "tem_problema": true ou false,
  "resumo": "1 frase curta (max 15 palavras) descrevendo o que aconteceu.",
  "problemas": "Descricao completa e objetiva do que aconteceu na conversa.",
  "temperatura": "Quente | Morno | Frio | Indefinido",
  "tag": "Se tem_problema=true: Insistencia | Nao entendeu | Loop/Repeticao | Falha de agenda | Contradicao de agenda | Info incorreta | Demora atendimento | Sem conversa. Se falso, string vazia.",
  "recomendacao": "Acao sugerida para o time comercial."
}`

// ─── Internal types ───────────────────────────────────────────────────────────

interface PipedriveLead {
  deal_id: number
  deal_title: string
  owner_name: string
  stage_name: string
  deal_created_at: string
  morada_conversation_url: string
  morada_conversation_id: string
}

interface MetabaseMessage {
  conversa_id: string
  role: string
  content: string
  created_at: string
}

// ─── Fetch leads ──────────────────────────────────────────────────────────────

async function fetchCTWPPLeads(
  fieldKey: string,
  options: { mode: "daily"; date: string } | { mode: "all_open" },
): Promise<PipedriveLead[]> {
  // 1. Nekt — deal IDs filtrados por rd_source + pipeline SZI
  const dateFilter = options.mode === "daily"
    ? `AND DATE(negocio_criado_em) = DATE '${options.date}'`
    : `AND status = 'open'`

  const result = await queryNekt(`
    SELECT id, negocio_criado_em
    FROM nekt_silver.pipedrive_deals_readable
    WHERE pipeline_id = 28
      AND rd_source = 'Click To WhatsApp'
      ${dateFilter}
  `)

  const dealIds = result.rows.map(r => Number(r.id)).filter(id => id > 0)
  if (!dealIds.length) return []

  // 2. Pipedrive — detalhes + URL da Morada (lotes de 5)
  const token  = process.env.PIPEDRIVE_API_TOKEN
  const domain = process.env.PIPEDRIVE_COMPANY_DOMAIN || "seazone"
  const stageMap = await fetchPipelineStages(domain, token!)
  const leads: PipedriveLead[] = []

  for (let i = 0; i < dealIds.length; i += 5) {
    const batch = dealIds.slice(i, i + 5)
    const results = await Promise.all(batch.map(async dealId => {
      try {
        const res = await fetch(
          `https://${domain}.pipedrive.com/api/v1/deals/${dealId}?api_token=${token}`,
          { cache: "no-store" }
        )
        if (!res.ok) return null
        const data = await res.json()
        const deal = data.data as Record<string, unknown>
        if (!deal) return null

        const moradaUrl = (deal[fieldKey] as string) || ""
        const parts     = moradaUrl.replace(/\/$/, "").split("/")
        const moradaId  = parts[parts.length - 1] || ""
        const stageId   = deal.stage_id as number

        return {
          deal_id:                 deal.id as number,
          deal_title:              (deal.title as string) || "",
          owner_name:              ((deal.owner_id as Record<string, unknown>)?.name as string) || "",
          stage_name:              stageMap[stageId] || `Stage ${stageId}`,
          deal_created_at:         (deal.add_time as string) || "",
          morada_conversation_url: moradaUrl,
          morada_conversation_id:  moradaId,
        } as PipedriveLead
      } catch { return null }
    }))
    leads.push(...results.filter((r): r is PipedriveLead => r !== null))
  }

  return leads
}

// ─── Helpers (Pipedrive context, Metabase, AI) ────────────────────────────────

async function fetchDealContext(dealId: number): Promise<string> {
  const token  = process.env.PIPEDRIVE_API_TOKEN
  const domain = process.env.PIPEDRIVE_COMPANY_DOMAIN || "seazone"
  const base   = `https://${domain}.pipedrive.com/api/v1`
  let context  = ""

  try {
    const [rNotes, rActs] = await Promise.all([
      fetch(`${base}/deals/${dealId}/notes?api_token=${token}&limit=10`, { cache: "no-store" }),
      fetch(`${base}/deals/${dealId}/activities?api_token=${token}&limit=10`, { cache: "no-store" }),
    ])
    const notes = ((await rNotes.json()).data || []) as Record<string, unknown>[]
    const acts  = ((await rActs.json()).data  || []) as Record<string, unknown>[]

    const noteLines = notes
      .map(n => ((n.content as string) || "").replace(/<br\s*\/?>/gi, " ").trim())
      .filter(Boolean)
    const actLines = acts.map(a => {
      const subj = (a.subject as string) || ""
      const note = ((a.note as string) || "").replace(/<br>/gi, " ").slice(0, 200)
      return `- [${a.done ? "feita" : "pendente"}] ${subj}: ${note}`.trim()
    })

    if (noteLines.length) context += "NOTAS DO CRM:\n" + noteLines.map(n => "- " + n.slice(0, 300)).join("\n") + "\n"
    if (actLines.length)  context += "ATIVIDADES DO CRM:\n" + actLines.join("\n") + "\n"
  } catch { /* ignora */ }

  return context
}

async function fetchMetabaseMessages(conversationId: string): Promise<MetabaseMessage[]> {
  const url        = process.env.METABASE_URL
  const token      = process.env.METABASE_SESSION_TOKEN
  const questionId = process.env.METABASE_QUESTION_ID

  if (!url || !token || !questionId || !conversationId) return []

  try {
    const res = await fetch(`${url}/api/card/${questionId}/query/json`, {
      method:  "POST",
      headers: { "X-Metabase-Session": token, "Content-Type": "application/json" },
      body:    JSON.stringify({
        parameters: [{
          type:   "id",
          target: ["dimension", ["template-tag", "id_conversa"]],
          value:  [conversationId],
        }],
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return []

    const rows = (await res.json()) as Record<string, unknown>[]
    return (rows || []).map(row => ({
      conversa_id: String(row.conversa_id || ""),
      role:        String(row.actor       || ""),
      content:     String(row.conteudo    || ""),
      created_at:  String(row.enviada_em  || ""),
    }))
  } catch { return [] }
}

function formatConversation(messages: MetabaseMessage[]): string {
  if (!messages.length) return "(sem mensagens)"
  return messages.map(m => {
    const role = ["mia", "ai", "mia_message_template"].includes(m.role) ? "IA" : "Lead"
    return `[${m.created_at}] ${role}: ${m.content.trim()}`
  }).join("\n")
}

function normalizeTag(raw: string): string {
  const map: Record<string, string> = {
    "insistencia": "Insistência",   "insistência": "Insistência",
    "nao entendeu": "Não entendeu", "não entendeu": "Não entendeu",
    "loop/repeticao": "Loop/Repetição", "loop/repetição": "Loop/Repetição",
    "falha de agenda": "Falha de agenda",
    "contradicao de agenda": "Contradição de agenda", "contradição de agenda": "Contradição de agenda",
    "info incorreta": "Info incorreta",
    "demora atendimento": "Demora atendimento",
    "sem conversa": "Sem conversa",
  }
  const lower = raw.toLowerCase().trim()
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key) || key.includes(lower)) return val
  }
  return "Não entendeu"
}

function countMessages(messages: MetabaseMessage[]): { ia: number; lead: number } {
  let ia = 0, lead = 0
  for (const m of messages) {
    if (["mia", "ai", "mia_message_template"].includes(m.role)) ia++
    else lead++
  }
  return { ia, lead }
}

async function fetchPipelineStages(domain: string, token: string): Promise<Record<number, string>> {
  try {
    const res = await fetch(
      `https://${domain}.pipedrive.com/api/v1/stages?pipeline_id=28&api_token=${token}`,
      { cache: "no-store" }
    )
    if (!res.ok) return { ...SZI_STAGES }
    const data = await res.json()
    const map: Record<number, string> = { ...SZI_STAGES }
    for (const s of (data.data || [])) map[s.id as number] = s.name as string
    return map
  } catch {
    return { ...SZI_STAGES }
  }
}

function buildCalendar(dateStr: string): string {
  const DAYS = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"]
  const lines: string[] = []
  const base = new Date(dateStr + "T12:00:00Z")
  for (let i = 1; i <= 30; i++) {
    const d = new Date(base.getTime() + i * 86_400_000)
    const yyyy = d.getUTCFullYear()
    const mm   = String(d.getUTCMonth() + 1).padStart(2, "0")
    const dd   = String(d.getUTCDate()).padStart(2, "0")
    lines.push(`  ${dd}/${mm}/${yyyy} = ${DAYS[d.getUTCDay()]}`)
  }
  return lines.join("\n")
}

async function analyzeWithAI(
  conversation: string,
  contextCrm: string,
  dateStr: string,
  msgs: { ia: number; lead: number },
) {
  const DAYS = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"]
  const d    = new Date(dateStr + "T12:00:00Z")
  const prompt = ANALYSIS_PROMPT
    .replace("{contexto_crm}",      contextCrm || "(sem dados de CRM)")
    .replace("{conversa}",          conversation)
    .replace("{data_hoje}",         dateStr)
    .replace("{dia_semana_hoje}",   DAYS[d.getUTCDay()])
    .replace("{calendario}",        buildCalendar(dateStr))
    .replace("{msgs_ia}",           String(msgs.ia))
    .replace("{msgs_lead}",         String(msgs.lead))

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      model:       "anthropic/claude-sonnet-4-5",
      messages:    [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(90_000),
  })

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`)
  const data  = await res.json()
  const raw   = (data.choices?.[0]?.message?.content || "") as string
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON in AI response")

  const parsed      = JSON.parse(match[0])
  const temProblema = parsed.tem_problema === true || parsed.tem_problema === "true"
  const problemas   = parsed.problemas || ""

  return {
    tem_problema: temProblema,
    temperatura:  parsed.temperatura  || "Indefinido",
    tag:          temProblema ? normalizeTag(parsed.tag || "") : "",
    resumo:       parsed.resumo || problemas.split(/[.!?]/)[0]?.trim() || "",
    problemas,
    recomendacao: parsed.recomendacao || "",
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export type RunMode = "daily" | "all_open"

export async function runAuditCTWPP(
  options: { mode: "daily"; date: string } | { mode: "all_open" }
): Promise<object> {
  const fieldKey = process.env.PIPEDRIVE_MORADA_FIELD_KEY || ""
  const blobKey  = options.mode === "daily" ? options.date : dateKeyBRT()

  let leads: Awaited<ReturnType<typeof fetchCTWPPLeads>>
  try {
    leads = await fetchCTWPPLeads(fieldKey, options)
  } catch (e) {
    throw new Error(`Fetch CTWPP leads: ${e}`)
  }

  if (!leads.length) {
    await writeAuditCTWPP(blobKey, { date: blobKey, ran_at: new Date().toISOString(), total_leads: 0, leads: [] })
    return { ok: true, date: blobKey, total: 0, leads_com_problema: 0 }
  }

  const auditLeads: AuditCTWPPLead[] = []
  const today = dateKeyBRT()

  for (let i = 0; i < leads.length; i += 5) {
    const batch   = leads.slice(i, i + 5)
    const results = await Promise.all(batch.map(async lead => {
      const contextCrm = await fetchDealContext(lead.deal_id)

      if (!lead.morada_conversation_id) return null

      const messages = await fetchMetabaseMessages(lead.morada_conversation_id)
      const filtered = messages.filter(m => m.conversa_id === lead.morada_conversation_id)

      if (!filtered.length) return null

      try {
        const msgCounts = countMessages(filtered)
        const analysis  = await analyzeWithAI(formatConversation(filtered.slice(-100)), contextCrm, today, msgCounts)
        return { ...lead, ...analysis } as AuditCTWPPLead
      } catch {
        return { ...lead, tem_problema: false, temperatura: "Indefinido", tag: "",
          resumo: "Erro ao analisar conversa.", problemas: "Erro ao analisar conversa.",
          recomendacao: "Revisar manualmente." } as AuditCTWPPLead
      }
    }))
    auditLeads.push(...results.filter((r): r is AuditCTWPPLead => r !== null))
  }

  const day = { date: blobKey, ran_at: new Date().toISOString(), total_leads: leads.length, leads: auditLeads }
  await writeAuditCTWPP(blobKey, day)

  const comProblema = auditLeads.filter(l => l.tem_problema).length
  return { ok: true, date: blobKey, total: leads.length, leads_com_problema: comProblema }
}

export { dateKeyBRT }
