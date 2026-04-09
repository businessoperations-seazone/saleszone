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
  const time = new Date(lead.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
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

function checkSlaRow(row: SlaRow, valSet: Set<string>): boolean {
  const ok = (accepted: string[]) => accepted.length === 0 || accepted.some(v => valSet.has(v))
  return ok(row.mql_intencoes) && ok(row.mql_faixas) && ok(row.mql_pagamentos)
}

function checkSla(lead: LeadRecord, slaData: SlaData): boolean {
  if (!lead.form_values?.length) return true  // sem dados do formulário = não verificar
  const v = slaVertical(lead.vertical)
  if (!v) return true                          // vertical sem SLA (Hóspedes, etc.) = não verificar

  const activeRows = slaData.rows.filter(r => r.vertical === v && r.status)
  if (!activeRows.length) return true          // sem rows ativas = não verificar

  const valSet = new Set(lead.form_values)
  return activeRows.some(row => checkSlaRow(row, valSet))
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

        // Verificação SLA (quando há dados do formulário e SLA configurado)
        if (slaData) {
          lead.sla_ok = checkSla(lead, slaData)
        }

        if (!deal.mia_link) {
          lead.status = "sem_mia"
          await notify(lead, "sem_mia")
          lead.notified = true
        } else {
          lead.mia_link = deal.mia_link
          lead.notified = true
          // Lead com MIA mas fora do SLA: marca como fora_sla (não conta como resolved)
          if (lead.sla_ok === false) {
            lead.status = "fora_sla"
          } else {
            lead.status = "ok"
            resolved++
          }
        }
      }
    }
  }

  const pendingMap = new Map(pending.map(l => [l.id, l]))
  await writeLeads(key, leads.map(l => pendingMap.get(l.id) || l))

  return { checked: pending.length, resolved }
}
