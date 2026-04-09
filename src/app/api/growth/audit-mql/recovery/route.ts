// Recuperação de leads perdidos — busca direto na Meta API e salva no Blob
// POST { date: "2026-04-05" } → compara com Blob e salva o que falta

import { NextRequest, NextResponse } from "next/server"
import { LeadRecord, dateKey, readLeads, writeLeads, appendLeadSafe, extractVertical } from "@/lib/audit-mql"
import { runCheck } from "@/lib/audit-mql-check"
import crypto from "crypto"

export const maxDuration = 120
export const dynamic = "force-dynamic"

const META_TOKEN = process.env.META_ADS_TOKEN || ""

// Pages subscritas ao webhook leadgen
const PAGE_IDS = ["100873924683761", "842763402253490", "144663558738581"]

// ─── Meta API helpers ─────────────────────────────────────────────────────────

async function metaFetch(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return null
  return res.json()
}

/** Converte o System User token em Page tokens via /me/accounts */
async function getPageTokens(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let url: string | null = `https://graph.facebook.com/v19.0/me/accounts?fields=id,access_token&limit=100&access_token=${META_TOKEN}`
  while (url) {
    const data = await metaFetch(url)
    if (!data?.data) break
    for (const p of data.data) map.set(String(p.id), String(p.access_token))
    url = data.paging?.next || null
  }
  return map
}

async function getFormsForPage(pageId: string, pageToken: string): Promise<{ id: string; name: string }[]> {
  const forms: { id: string; name: string }[] = []
  let url = `https://graph.facebook.com/v19.0/${pageId}/leadgen_forms` +
    `?fields=id,name,status&limit=100&access_token=${pageToken}`

  while (url) {
    const data = await metaFetch(url)
    if (!data?.data) break
    forms.push(...data.data
      .filter((f: { id: string; name: string; status: string }) => f.status === "ACTIVE")
      .map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })))
    url = data.paging?.next || ""
  }
  return forms
}

function parseLead(lead: Record<string, unknown>): Partial<LeadRecord> & { form_values: string[]; form_fields: { name: string; value: string }[] } {
  const fieldData = (lead.field_data as { name: string; values: string[] }[]) || []
  const fields: Record<string, string> = {}
  for (const item of fieldData) {
    fields[item.name] = item.values?.[0] || ""
  }
  const firstName = fields["first_name"] || ""
  const lastName  = fields["last_name"]  || ""
  const fullName  = fields["full_name"]  || `${firstName} ${lastName}`.trim()

  const form_fields = fieldData.flatMap(f => (f.values || []).map(v => ({ name: f.name, value: v })))

  return {
    name:        fullName,
    email:       fields["email"] || "",
    phone:       fields["phone_number"] || fields["phone"] || "",
    form_id:     String(lead.form_id || ""),
    ad_id:       String(lead.ad_id   || ""),
    page_id:     String(lead.page_id || ""),
    form_values: form_fields.map(f => f.value),
    form_fields,
  }
}

async function getLeadsForForm(
  formId: string,
  minTs: number,
  maxTs: number,
  pageToken: string
): Promise<{ leadgen_id: string; created_time: string; parsed: Partial<LeadRecord> }[]> {
  const results: { leadgen_id: string; created_time: string; parsed: Partial<LeadRecord> }[] = []
  let url = `https://graph.facebook.com/v19.0/${formId}/leads` +
    `?fields=id,created_time,field_data,ad_id,form_id,page_id` +
    `&time_range%5Bmin%5D=${minTs}&time_range%5Bmax%5D=${maxTs}` +
    `&limit=100&access_token=${pageToken}`

  while (url) {
    const data = await metaFetch(url)
    if (!data?.data) break
    for (const lead of data.data) {
      results.push({
        leadgen_id:   String(lead.id),
        created_time: String(lead.created_time || ""),
        parsed:       parseLead(lead as Record<string, unknown>),
      })
    }
    url = data.paging?.next || ""
  }
  return results
}

// ─── Route ────────────────────────────────────────────────────────────────────

async function recoverDate(targetDate: string, pageTokens: Map<string, string>) {
  const minDate = new Date(`${targetDate}T03:00:00Z`)
  const maxDate = new Date(minDate.getTime() + 24 * 60 * 60 * 1000 - 1)
  const minUnix = Math.floor(minDate.getTime() / 1000)
  const maxUnix = Math.floor(maxDate.getTime() / 1000)

  const existing   = await readLeads(targetDate)
  const existingMap = new Map(existing.map(l => [l.leadgen_id, l]))

  let recovered  = 0
  let backfilled = 0
  let skipped    = 0
  let errors     = 0
  const recoveredLeads: string[] = []
  // leadgen_id → form_values + form_fields a retroalimentar em leads já existentes
  const toBackfill = new Map<string, { form_values: string[]; form_fields: { name: string; value: string }[] }>()

  for (const pageId of PAGE_IDS) {
    const pageToken = pageTokens.get(pageId)
    if (!pageToken) continue

    let forms: { id: string; name: string }[] = []
    try { forms = await getFormsForPage(pageId, pageToken) } catch { continue }

    for (const form of forms) {
      let metaLeads: Awaited<ReturnType<typeof getLeadsForForm>> = []
      try { metaLeads = await getLeadsForForm(form.id, minUnix, maxUnix, pageToken) } catch { continue }

      for (const ml of metaLeads) {
        const blobLead = existingMap.get(ml.leadgen_id)

        if (blobLead) {
          // Lead já existe — backfill se faltar form_values ou form_fields
          const needsBackfill = (!blobLead.form_values?.length || !blobLead.form_fields?.length) && ml.parsed.form_values?.length
          if (needsBackfill) {
            toBackfill.set(ml.leadgen_id, { form_values: ml.parsed.form_values!, form_fields: ml.parsed.form_fields! })
          } else {
            skipped++
          }
          continue
        }

        // Lead ausente — salvar
        let campaign = ""
        if (ml.parsed.ad_id) {
          try {
            const adData = await metaFetch(
              `https://graph.facebook.com/v19.0/${ml.parsed.ad_id}?fields=campaign{name}&access_token=${META_TOKEN}`
            )
            campaign = adData?.campaign?.name || ""
          } catch { /* sem campanha */ }
        }

        const record: LeadRecord = {
          id:            crypto.randomUUID(),
          leadgen_id:    ml.leadgen_id,
          form_id:       ml.parsed.form_id || form.id,
          ad_id:         ml.parsed.ad_id   || "",
          page_id:       ml.parsed.page_id || pageId,
          name:          ml.parsed.name    || "",
          email:         ml.parsed.email   || "",
          phone:         ml.parsed.phone   || "",
          campaign_name: campaign,
          vertical:      extractVertical(campaign),
          created_at:    ml.created_time || new Date().toISOString(),
          status:        "aguardando",
          form_values:   ml.parsed.form_values,
          form_fields:   ml.parsed.form_fields,
        }

        try {
          const saved = await appendLeadSafe(targetDate, record)
          if (saved) {
            recovered++
            existingMap.set(ml.leadgen_id, record)
            recoveredLeads.push(`${record.name || record.email} (${record.vertical})`)
          }
        } catch { errors++ }
      }
    }
  }

  // Backfill em lote: um único read→write para todos os leads sem form_values
  if (toBackfill.size > 0) {
    try {
      const allLeads = await readLeads(targetDate)
      let changed = false
      for (const lead of allLeads) {
        const bf = toBackfill.get(lead.leadgen_id)
        if (bf) { lead.form_values = bf.form_values; lead.form_fields = bf.form_fields; backfilled++; changed = true }
      }
      if (changed) await writeLeads(targetDate, allLeads)
    } catch (err) { console.error("[recovery] backfill write failed:", err) }
  }

  return { date: targetDate, recovered, backfilled, skipped, errors, recoveredLeads, existingBefore: existing.length }
}

function yesterdayKey() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function recoverAndCheck(targetDate: string, pageTokens: Map<string, string>) {
  const result = await recoverDate(targetDate, pageTokens)
  if (result.recovered > 0 || result.backfilled > 0) await runCheck(targetDate)
  return result
}

// GET — cron automático a cada 10min (Vercel envia CRON_SECRET como Bearer)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const pageTokens = await getPageTokens()
  const [r1, r2] = await Promise.all([recoverAndCheck(yesterdayKey(), pageTokens), recoverAndCheck(dateKey(), pageTokens)])
  return NextResponse.json({ yesterday: r1, today: r2 })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const pageTokens = await getPageTokens()
  const body = await req.json().catch(() => ({}))
  const targetDate = body.date || null

  if (targetDate) {
    return NextResponse.json(await recoverAndCheck(targetDate, pageTokens))
  }

  const [r1, r2] = await Promise.all([recoverAndCheck(yesterdayKey(), pageTokens), recoverAndCheck(dateKey(), pageTokens)])
  return NextResponse.json({ yesterday: r1, today: r2 })
}
