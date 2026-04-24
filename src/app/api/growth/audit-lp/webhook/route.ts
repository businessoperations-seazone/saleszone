// Webhook para Landing Pages (JetEngine Forms / Elementor).
// LP dispara 2 webhooks em paralelo no submit:
//   (1) n8n → cria Pessoa+Deal no Pipedrive + MIA
//   (2) saleszone (esta rota) → grava no blob para auditoria
//
// Auth: Authorization: Bearer {LP_WEBHOOK_SECRET}  (Elementor)
//       ?secret={LP_WEBHOOK_SECRET}                 (JetEngine — não suporta headers customizados)
// Payload: application/json (flat ou fields-nested) OR application/x-www-form-urlencoded

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import {
  LpLeadRecord,
  lpDateKey,
  appendLpLeadSafe,
  extractLpVertical,
} from "@/lib/audit-lp"

export const maxDuration = 480
export const dynamic = "force-dynamic"

const LP_WEBHOOK_SECRET = process.env.LP_WEBHOOK_SECRET || ""

// Mapa de possíveis nomes de campo → chave canônica.
// Elementor permite nomear os campos como quiser; aqui aceitamos várias variações.
const FIELD_ALIASES: Record<string, string[]> = {
  name:  ["name", "nome", "full_name", "your-name", "seu-nome", "field_name"],
  email: ["email", "e-mail", "your-email", "seu-email"],
  phone: ["phone", "telefone", "tel", "celular", "whatsapp", "your-phone"],
}

function pickField(fields: Record<string, string>, key: "name" | "email" | "phone"): string {
  const aliases = FIELD_ALIASES[key]
  for (const [k, v] of Object.entries(fields)) {
    const norm = k.toLowerCase().replace(/[_\-\s]/g, "")
    for (const a of aliases) {
      if (norm === a.toLowerCase().replace(/[_\-\s]/g, "")) return v
    }
  }
  return ""
}

function extractPageSlug(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split("/").filter(Boolean)
    return parts[parts.length - 1] || ""
  } catch {
    return ""
  }
}

// Parse body: aceita form-urlencoded OR JSON
async function parseBody(req: NextRequest): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || ""
  if (ct.includes("application/json")) {
    const json = await req.json().catch(() => ({}))
    // Elementor às vezes manda { fields: { name: { value: "..." } } }
    if (json.fields && typeof json.fields === "object") {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(json.fields as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v
        else if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
          out[k] = String((v as Record<string, unknown>).value ?? "")
        }
      }
      // Metadata no topo
      for (const meta of ["form_name", "form_id", "page_url", "page_title"]) {
        if (json[meta]) out[meta] = String(json[meta])
      }
      return out
    }
    // Ou payload flat
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") out[k] = String(v)
    }
    return out
  }
  // form-urlencoded
  const text = await req.text()
  const params = new URLSearchParams(text)
  const out: Record<string, string> = {}
  params.forEach((v, k) => { out[k] = v })
  return out
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET — healthcheck simples (útil pra validar configuração do Elementor)
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "audit-lp-webhook",
    auth_required: !!LP_WEBHOOK_SECRET,
  })
}

// POST — receive Elementor form submission
export async function POST(req: NextRequest) {
  if (!LP_WEBHOOK_SECRET) {
    console.error("[audit-lp-webhook] LP_WEBHOOK_SECRET não configurado — rejecting request")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }
  const auth     = req.headers.get("authorization") || ""
  const qsSecret = req.nextUrl.searchParams.get("secret") || ""
  const authorized = auth === `Bearer ${LP_WEBHOOK_SECRET}` ||
                     (!!qsSecret && qsSecret === LP_WEBHOOK_SECRET)
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const fields = await parseBody(req)

  // Metadata do form
  const formName = fields.form_name || fields.form_title ||
                   (fields.rd_event ? fields.rd_event.replace(/\/$/, "") : "") || ""
  const formId   = fields.form_id   || fields.post_id || ""
  const pageUrl  = fields.pagina    || fields.page_url || fields.referer || req.headers.get("referer") || ""
  const pageSlug = extractPageSlug(pageUrl)

  const name  = pickField(fields, "name")
  const email = pickField(fields, "email")
  const phone = pickField(fields, "phone")

  if (!name && !email && !phone) {
    return NextResponse.json({ error: "No name/email/phone in payload" }, { status: 400 })
  }

  // Todos os fields do form pra debug + exibição (exceto metadata Elementor)
  const metaKeys = new Set(["form_name", "form_title", "form_id", "page_url", "pagina", "page_title", "referer", "post_id", "rd_event", "Submit", "origem_lead"])
  const formFields = Object.entries(fields)
    .filter(([k]) => !metaKeys.has(k))
    .map(([k, v]) => ({ name: k, value: v }))

  const source = req.nextUrl.searchParams.get("source") || (qsSecret ? "jetengine" : "elementor")

  const record: LpLeadRecord = {
    id: crypto.randomUUID(),
    source,
    form_id: formId,
    form_name: formName,
    page_slug: pageSlug,
    page_url: pageUrl,
    name,
    email,
    phone,
    vertical: extractLpVertical(formName, pageSlug),
    created_at: new Date().toISOString(),
    status: "aguardando",

    utm_source:   fields.utm_source,
    utm_medium:   fields.utm_medium,
    utm_campaign: fields.utm_campaign,
    utm_content:  fields.utm_content,
    utm_term:     fields.utm_term,
    rd_event:     fields.rd_event,
    origem_lead:  fields.origem_lead,

    form_fields: formFields,
  }

  const saved = await appendLpLeadSafe(lpDateKey(), record)

  // Se salvou novo lead: em background, espera 5 min e aciona check.
  // Node runtime (Coolify): fire-and-forget. maxDuration=480 segura o processo.
  if (saved) {
    const host = req.headers.get("host") || "saleszone.vercel.app"
    const baseUrl = `https://${host}`
    delayedCheck(baseUrl).catch(err => console.error("[audit-lp] delayedCheck:", err))
  }

  return NextResponse.json({ ok: true, saved, id: record.id })
}

async function delayedCheck(baseUrl: string) {
  await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000))
  const cronSecret = process.env.CRON_SECRET
  await fetch(`${baseUrl}/api/growth/audit-lp/check`, {
    method: "POST",
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
    cache: "no-store",
  }).catch(() => {})
}
