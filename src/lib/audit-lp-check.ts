// Verificação dos leads de Landing Pages (Elementor Forms).
// Paralela ao audit-mql mas mais simples:
//   - Não tem SLA de campanha (LPs são sempre válidas, sem filtro por mql_intencoes)
//   - Não tem Baserow (cadastros de LP só vão pro Pipedrive via n8n)
//   - Tem captura de erro MIA (mesmo shape do audit-mql)

import {
  MiaErrorInfo,
  acquireLock,
  releaseLock,
} from "@/lib/audit-mql"
import {
  LpLeadRecord,
  readLpLeads,
  writeLpLeads,
} from "@/lib/audit-lp"

const PIPEDRIVE_TOKEN  = process.env.PIPEDRIVE_API_TOKEN        || ""
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN   || "seazone"
const MIA_FIELD_KEY    = process.env.PIPEDRIVE_MORADA_FIELD_KEY || "3dda4dab1781dcfd8839a5fd6c0b7d5e7acfbcfc"
const SLACK_WEBHOOK    = process.env.SLACK_WEBHOOK_AUDIT_MQL    || ""

const FIVE_MINUTES      = 5  * 60 * 1000
const FOUR_HOURS        = 4  * 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

// ─── Pipedrive lookup ─────────────────────────────────────────────────────────

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

// ─── Erro MIA via Pipedrive Notes ─────────────────────────────────────────────
// Mesma lógica do audit-mql: quando MIA falha, n8n grava Note no deal com o motivo.

function parseMiaMotivo(raw: string): { label: string; code?: string } {
  const s = raw.replace(/\s+/g, " ").trim()
  if (/invalid phone number/i.test(s))              return { label: "Número de telefone inválido",     code: "invalid_phone" }
  if (/not.*whatsapp|not on whatsapp|no whatsapp/i.test(s)) return { label: "Número não está no WhatsApp",      code: "not_on_whatsapp" }
  if (/timeout|timed out/i.test(s))                 return { label: "Timeout na conexão com a MIA",    code: "timeout" }
  if (/\b(401|403)\b|unauthor|forbidden/i.test(s))  return { label: "Erro de autenticação no envio",   code: "auth_error" }
  if (/\b(5\d\d)\b|internal server error/i.test(s)) return { label: "Erro interno do servidor MIA",    code: "server_error" }
  if (/phonenumber/i.test(s))                       return { label: "Problema com o número de telefone", code: "phone_issue" }
  const clean = s.replace(/["\[\]{}\\]/g, "").replace(/code: custom/gi, "").replace(/path: phoneNumber/gi, "").trim()
  return { label: clean.slice(0, 120) || "Erro desconhecido" }
}

function parseMiaErrorNote(content: string): MiaErrorInfo | null {
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

export async function fetchMiaErrorFromPipedrive(dealId: number): Promise<MiaErrorInfo | null> {
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

// ─── Slack notify ─────────────────────────────────────────────────────────────

async function notifyLp(lead: LpLeadRecord, key: string, problem: "sem_pipedrive" | "sem_mia") {
  if (!SLACK_WEBHOOK || lead.notified) return

  const lockPath = `audit-lp/locks/${key}/${lead.id}.lock`
  const got = await acquireLock(lockPath)
  if (!got) {
    console.log(`[audit-lp-notify] lock held lead=${lead.id} problem=${problem} — skip duplicate`)
    return
  }

  try {
    const fresh = await readLpLeads(key).catch(() => [])
    const target = fresh.find(l => l.id === lead.id)
    if (target?.notified) return

    if (target) {
      target.notified = true
      await writeLpLeads(key, fresh).catch(() => {})
    }

    const time = new Date(lead.created_at).toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    })
    const dealLink = lead.pipedrive_deal_id
      ? `<https://seazone-fd92b9.pipedrive.com/deal/${lead.pipedrive_deal_id}|#${lead.pipedrive_deal_id}>`
      : null

    const miaErrorLine = (problem === "sem_mia" && lead.mia_error)
      ? `*Erro MIA:* ${lead.mia_error.motivo_parsed}` +
        (lead.mia_error.transferido_para ? `  |  *Transferido para:* ${lead.mia_error.transferido_para}` : "") +
        "\n"
      : ""

    const text =
      problem === "sem_pipedrive"
        ? `<@U09TS4BLYRY> 🚨 *[LP] Lead sem deal no Pipedrive* — ${time}\n` +
          `*Nome:* ${lead.name || "—"}  |  *Vertical:* ${lead.vertical || "—"}\n` +
          `*Email:* ${lead.email || "—"}  |  *Tel:* ${lead.phone || "—"}\n` +
          `*LP:* ${lead.form_name || lead.page_slug || "—"}  (${lead.page_url || "—"})\n` +
          `O lead chegou pela LP mas não foi encontrado no Pipedrive após 5 minutos.`
        : `<@U09TS4BLYRY> ⚠️ *[LP] Lead sem atendimento MIA* — ${time}\n` +
          `*Nome:* ${lead.name || "—"}  |  *Vertical:* ${lead.vertical || "—"}\n` +
          `*Deal:* ${dealLink || "—"}  |  *LP:* ${lead.form_name || lead.page_slug || "—"}\n` +
          miaErrorLine +
          `O deal existe no Pipedrive mas o campo *Link da Conversa* não foi preenchido pela Morada IA.`

    const res = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(err => { console.error("[audit-lp-notify] Slack error:", err); return null })

    if (res && res.ok) {
      console.log(`[audit-lp-notify] sent lead=${lead.id} problem=${problem} vertical=${lead.vertical}`)
    } else if (res) {
      console.error(`[audit-lp-notify] Slack non-OK status=${res.status} lead=${lead.id}`)
    }
  } finally {
    await releaseLock(lockPath)
  }
}

// ─── runCheckLp ───────────────────────────────────────────────────────────────

export async function runCheckLp(key: string): Promise<{ checked: number; resolved: number }> {
  try {
    const leads = await readLpLeads(key)
    if (leads.length === 0) return { checked: 0, resolved: 0 }

    const now = Date.now()
    const pending = leads.filter(l => {
      if (l.status === "descartado") return false
      if (l.status === "aguardando" && now - new Date(l.created_at).getTime() > FIVE_MINUTES) return true
      const hasProblem = l.status === "sem_pipedrive" || l.status === "sem_mia"
      if (hasProblem) {
        const age = now - new Date(l.created_at).getTime()
        if (age > TWENTY_FOUR_HOURS) return false
        if (!l.checked_at) return true
        return now - new Date(l.checked_at).getTime() >= FOUR_HOURS
      }
      return false
    })

    if (pending.length === 0) return { checked: 0, resolved: 0 }

    pending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const batch = pending.slice(0, 30)

    let resolved = 0
    for (const lead of batch) {
      lead.checked_at = new Date().toISOString()
      if (lead.status === "ok") continue

      const personId = await findPerson(lead.email, lead.phone)
      if (!personId) {
        lead.status = "sem_pipedrive"
        await notifyLp(lead, key, "sem_pipedrive")
        lead.notified = true
        continue
      }

      lead.pipedrive_person_id = personId
      const deal = await getLatestDeal(personId)
      if (!deal) {
        lead.status = "sem_pipedrive"
        await notifyLp(lead, key, "sem_pipedrive")
        lead.notified = true
      } else {
        lead.pipedrive_deal_id = deal.deal_id
        if (!deal.mia_link) {
          lead.status = "sem_mia"
          const miaErrorStale =
            !lead.mia_error ||
            (Date.now() - new Date(lead.mia_error.fetched_at).getTime() > 60 * 60 * 1000)
          if (miaErrorStale) {
            const err = await fetchMiaErrorFromPipedrive(deal.deal_id)
            if (err) lead.mia_error = err
          }
          await notifyLp(lead, key, "sem_mia")
          lead.notified = true
        } else {
          lead.mia_link = deal.mia_link
          lead.status = "ok"
          lead.notified = true
          resolved++
        }
      }
    }

    // Merge fresco monotônico (mesmo padrão do audit-mql)
    const pendingMap = new Map(batch.map(l => [l.id, l]))
    const fresh = await readLpLeads(key).catch(() => leads)
    const freshMap = new Map(fresh.map(l => [l.id, l]))
    const finalLeads: LpLeadRecord[] = []

    for (const f of fresh) {
      const processed = pendingMap.get(f.id)
      if (!processed) {
        finalLeads.push(f)
        continue
      }
      finalLeads.push({
        ...processed,
        notified: f.notified === true ? true : processed.notified,
      })
    }
    for (const [id, p] of pendingMap) {
      if (!freshMap.has(id)) finalLeads.push(p)
    }

    await writeLpLeads(key, finalLeads)

    return { checked: batch.length, resolved }
  } catch (err) {
    console.error(`[audit-lp-check] runCheckLp(${key}) error:`, err)
    if (SLACK_WEBHOOK) {
      await fetch(SLACK_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `<@U09TS4BLYRY> ❌ *Erro no Audit LP* — ${key}\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``,
        }),
      }).catch(e => console.error("[audit-lp-check] Slack error notification failed:", e))
    }
    return { checked: 0, resolved: 0 }
  }
}
