import { NextRequest, NextResponse } from "next/server"
import { LeadRecord, dateKey, readLeads, writeLeads } from "@/lib/audit-mql"
import { checkSla, enrichBaserow, BASEROW_START } from "@/lib/audit-mql-check"
import { readData } from "@/lib/sla-mql-blob"
import { MOCK_LEADS } from "@/lib/audit-mql-mock"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const PIPEDRIVE_TOKEN  = process.env.PIPEDRIVE_API_TOKEN        || ""
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN   || "seazone"
const MIA_FIELD_KEY    = process.env.PIPEDRIVE_MORADA_FIELD_KEY || "3dda4dab1781dcfd8839a5fd6c0b7d5e7acfbcfc"
const SLACK_WEBHOOK    = process.env.SLACK_WEBHOOK_AUDIT_MQL    || ""

const TWO_MINUTES       = 2  * 60 * 1000
const FOUR_HOURS        = 4  * 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

// ─── Pipedrive ────────────────────────────────────────────────────────────────

async function pipedriveFetch(url: string) {
  return fetch(url, { cache: "no-store" })
}

async function findPerson(email: string, phone: string): Promise<number | null> {
  if (email) {
    const res = await pipedriveFetch(
      `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search` +
      `?term=${encodeURIComponent(email)}&fields=email&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`
    )
    if (res.ok) {
      const data = await res.json()
      const id = data.data?.items?.[0]?.item?.id as number | undefined
      if (id) return id
    }
  }
  if (phone) {
    const clean = phone.replace(/\D/g, "")
    const res = await pipedriveFetch(
      `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search` +
      `?term=${encodeURIComponent(clean)}&fields=phone&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`
    )
    if (res.ok) {
      const data = await res.json()
      const id = data.data?.items?.[0]?.item?.id as number | undefined
      if (id) return id
    }
    // Fallback: sem código de país
    if (clean.startsWith("55") && clean.length === 13) {
      const sem55 = clean.slice(2)
      const res2 = await pipedriveFetch(
        `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search` +
        `?term=${encodeURIComponent(sem55)}&fields=phone&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`
      )
      if (res2.ok) {
        const data2 = await res2.json()
        const id = data2.data?.items?.[0]?.item?.id as number | undefined
        if (id) return id
      }
    }
  }
  return null
}

async function getLatestDeal(personId: number): Promise<{ deal_id: number; mia_link: string | null } | null> {
  const res = await pipedriveFetch(
    `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/${personId}/deals` +
    `?sort=add_time+DESC&limit=1&api_token=${PIPEDRIVE_TOKEN}`
  )
  if (!res.ok) return null
  const data = await res.json()
  const deal = data.data?.[0]
  if (!deal) return null
  return { deal_id: deal.id as number, mia_link: (deal[MIA_FIELD_KEY] as string) || null }
}

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

async function checkPending(leads: LeadRecord[]): Promise<{ leads: LeadRecord[]; changed: boolean }> {
  const now = Date.now()
  const pending = leads.filter(l => {
    if (l.status === "descartado") return false
    if (l.status === "aguardando" && now - new Date(l.created_at).getTime() > TWO_MINUTES) return true
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
  if (pending.length === 0) return { leads, changed: false }
  // Mais recentes primeiro, limite de segurança para evitar timeout
  pending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const batch = pending.slice(0, 20)

  const slaData = await readData().catch(() => null)

  for (const lead of batch) {
    lead.checked_at = new Date().toISOString()

    // Lead já OK: problema pendente é só Baserow — enrichBaserow resolve
    if (lead.status === "ok") continue

    // SLA antes do Pipedrive — lead fora do SLA não deveria estar no Pipe
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
    } else {
      const deal = await getLatestDeal(personId)
      if (!deal) {
        lead.status = "sem_pipedrive"
      } else {
        lead.pipedrive_deal_id = deal.deal_id
        if (!deal.mia_link) {
          lead.status = "sem_mia"
        } else {
          lead.status   = "ok"
          lead.mia_link = deal.mia_link
          lead.notified = true
        }
      }
    }
  }

  const pendingMap = new Map(batch.map(l => [l.id, l]))
  return { leads: leads.map(l => pendingMap.get(l.id) || l), changed: true }
}

// ─── Recheck manual de um lead ───────────────────────────────────────────────

async function recheckOne(lead: LeadRecord): Promise<void> {
  lead.checked_at = new Date().toISOString()

  const personId = await findPerson(lead.email, lead.phone)
  if (!personId) {
    lead.status = "sem_pipedrive"
    lead.pipedrive_deal_id = undefined
    lead.mia_link = undefined
    return
  }

  const deal = await getLatestDeal(personId)
  if (!deal) {
    lead.status = "sem_pipedrive"
    lead.pipedrive_deal_id = undefined
    lead.mia_link = undefined
    return
  }

  lead.pipedrive_deal_id = deal.deal_id
  if (!deal.mia_link) {
    lead.status = "sem_mia"
    lead.mia_link = undefined
  } else {
    lead.status = "ok"
    lead.mia_link = deal.mia_link
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const leadId: string = body.recheck
  const date: string = body.date || dateKey()
  if (!leadId) return NextResponse.json({ error: "missing recheck id" }, { status: 400 })

  const leads = await readLeads(date)
  const lead = leads.find(l => l.id === leadId)
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 })

  await recheckOne(lead)
  await writeLeads(date, leads)

  return NextResponse.json(lead, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const date = searchParams.get("date") || dateKey()

  let leads = await readLeads(date)

  // Em desenvolvimento ou quando não há dados, retorna mock
  if (leads.length === 0 && process.env.NODE_ENV === "development") {
    leads = MOCK_LEADS.filter(l => l.created_at.startsWith(date))
    if (leads.length === 0) {
      leads = MOCK_LEADS // Se não tiver dados para a data específica, retorna todos os mock
    }
  }

  // Limpa in_baserow de leads anteriores ao BASEROW_START (marcados false pelo sync Supabase quebrado)
  let cleared = false
  for (const l of leads) {
    if (l.created_at < BASEROW_START && l.in_baserow !== undefined) {
      l.in_baserow = undefined
      cleared = true
    }
  }

  const { leads: updated, changed } = await checkPending(leads)
  const isToday = date === dateKey()
  const baserowChanged = isToday ? await enrichBaserow(updated) : false
  if (changed || baserowChanged || cleared) {
    // Re-read fresh blob before writing to preserve notified:true set by concurrent runCheck().
    // Without this, a stale GET snapshot can overwrite notified:true back to undefined,
    // causing runCheck() to send a duplicate Slack notification on the next cron run.
    const fresh = await readLeads(date)
    const freshMap = new Map(fresh.map(l => [l.id, l]))
    const merged = updated.map(l => {
      const f = freshMap.get(l.id)
      if (f?.notified && !l.notified) return { ...l, notified: true }
      return l
    })
    await writeLeads(date, merged)
    leads = merged
  } else {
    leads = updated
  }

  leads = leads.filter(l => l.status !== "descartado")
  leads.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return NextResponse.json(leads, { headers: { "Cache-Control": "no-store" } })
}
