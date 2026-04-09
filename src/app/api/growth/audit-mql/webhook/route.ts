import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { waitUntil } from "@vercel/functions"
import { LeadRecord, dateKey, appendLeadSafe, extractVertical } from "@/lib/audit-mql"

export const maxDuration = 480 // 8 min: 7min de espera + margem para o check
export const dynamic = "force-dynamic"

const META_TOKEN       = process.env.META_ADS_TOKEN              || ""
const VERIFY_TOKEN     = process.env.META_WEBHOOK_VERIFY_TOKEN   || "audit_mql_seazone"
const APP_SECRET       = process.env.META_APP_SECRET             || ""
const CAPI_DATASET_SZS = process.env.META_DATASET_ID_SZS         || ""
const CAPI_TOKEN_SZS   = process.env.META_CAPI_TOKEN_SZS         || ""

// ─── Meta Lead Gen API ────────────────────────────────────────────────────────

async function fetchLeadData(leadgenId: string) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${META_TOKEN}`
  )
  if (!res.ok) return null
  const data = await res.json()

  const fields: Record<string, string> = {}
  for (const item of data.field_data || []) {
    fields[item.name] = item.values?.[0] || ""
  }

  const firstName = fields["first_name"] || ""
  const lastName  = fields["last_name"]  || ""
  const fullName  = fields["full_name"]  || `${firstName} ${lastName}`.trim()

  // Coleta todos os campos do formulário (para verificação SLA e exibição)
  const formFields: { name: string; value: string }[] = (data.field_data || []).flatMap(
    (f: { name: string; values: string[] }) => (f.values || []).map((v: string) => ({ name: f.name, value: v }))
  )
  const formValues = formFields.map(f => f.value)

  return {
    name:        fullName,
    email:       fields["email"] || "",
    phone:       fields["phone_number"] || fields["phone"] || "",
    ad_id:       String(data.ad_id   || ""),
    form_id:     String(data.form_id || ""),
    page_id:     String(data.page_id || ""),
    form_values: formValues,
    form_fields: formFields,
  }
}

async function fetchCampaignName(adId: string): Promise<string> {
  if (!adId) return ""
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${adId}?fields=campaign{name}&access_token=${META_TOKEN}`
    )
    if (!res.ok) return ""
    const data = await res.json()
    return data.campaign?.name || ""
  } catch {
    return ""
  }
}

// ─── CAPI Lead (SZS only) ─────────────────────────────────────────────────────

async function sendCapiLeadSzs(leadgenId: string, email: string, phone: string) {
  if (!CAPI_DATASET_SZS || !CAPI_TOKEN_SZS) return
  const userData: Record<string, unknown> = { lead_id: leadgenId }
  if (email) userData.em = [crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex")]
  if (phone) userData.ph = [crypto.createHash("sha256").update(phone.replace(/\D/g, "")).digest("hex")]
  await fetch(`https://graph.facebook.com/v19.0/${CAPI_DATASET_SZS}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [{
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "system_generated",
        event_id: `szs_lead_${leadgenId}`,
        user_data: userData,
      }],
      access_token: CAPI_TOKEN_SZS,
    }),
    cache: "no-store",
  }).catch(() => { /* silencia erro — não bloqueia o fluxo principal */ })
}

// ─── Webhook processing ───────────────────────────────────────────────────────

async function delayedCheck(baseUrl: string) {
  await new Promise(resolve => setTimeout(resolve, 7 * 60 * 1000)) // espera 7 min (índice de busca do Pipedrive tem lag ~5min)
  const cronSecret = process.env.CRON_SECRET
  await fetch(`${baseUrl}/api/growth/audit-mql/check`, {
    method: "POST",
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    cache: "no-store",
  })
}

async function processPayload(body: Record<string, unknown>, baseUrl: string) {
  const entries = (body.entry as Record<string, unknown>[]) || []
  let newLeadSaved = false

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) || []
    for (const change of changes) {
      if (change.field !== "leadgen") continue
      const v = change.value as Record<string, unknown>
      const leadgenId = String(v.leadgen_id || "")
      if (!leadgenId) continue

      try {
        const leadData = await fetchLeadData(leadgenId)
        const adId     = leadData?.ad_id || String(v.adgroup_id || "")
        const campaign = adId ? await fetchCampaignName(adId) : ""

        const record: LeadRecord = {
          id:            crypto.randomUUID(),
          leadgen_id:    leadgenId,
          form_id:       leadData?.form_id || String(v.form_id  || ""),
          ad_id:         adId,
          page_id:       leadData?.page_id || String(v.page_id  || ""),
          name:          leadData?.name    || "",
          email:         leadData?.email   || "",
          phone:         leadData?.phone   || "",
          campaign_name: campaign,
          vertical:      extractVertical(campaign),
          created_at:    new Date().toISOString(),
          status:        "aguardando",
          form_values:   leadData?.form_values || [],
          form_fields:   leadData?.form_fields || [],
        }

        const saved = await appendLeadSafe(dateKey(), record)
        if (saved) {
          newLeadSaved = true
          if (record.vertical === "Serviços") {
            sendCapiLeadSzs(leadgenId, record.email, record.phone)
          }
        }
      } catch {
        // Erro num lead não bloqueia os demais do mesmo payload
      }
    }
  }

  return newLeadSaved
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET — Meta challenge verification
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode      = searchParams.get("hub.mode")
  const token     = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 })
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

// POST — receive lead event
export async function POST(req: NextRequest) {
  const host    = req.headers.get("host") || "saleszone.vercel.app"
  const baseUrl = `https://${host}`

  let parsed: Record<string, unknown>

  if (APP_SECRET) {
    const raw = await req.text()
    const sig = req.headers.get("x-hub-signature-256") || ""
    const expected = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(raw).digest("hex")
    if (sig !== expected) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }
    try { parsed = JSON.parse(raw) } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
  } else {
    parsed = await req.json()
  }

  const newLeadSaved = await processPayload(parsed, baseUrl)

  // Se salvou lead novo: em background, espera 3 min e checa Pipedrive+MIA
  if (newLeadSaved) {
    waitUntil(delayedCheck(baseUrl))
  }

  return NextResponse.json({ ok: true })
}
