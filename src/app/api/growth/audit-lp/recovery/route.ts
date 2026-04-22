// Recovery — busca deals recentes criados via LPs no Pipedrive e garante que
// todos estejam no blob audit-lp. Cobre cenários em que o webhook do Elementor
// pra saleszone falhou mas o n8n criou o deal no Pipedrive (ou vice-versa).
//
// Identificação de deals-LP:
//   Heurística: deals criados nas últimas 2h cuja person tem campo
//   utm_source=wordpress ou cujo add_time bate com horário de cadastro que
//   não está no blob. Se não houver marcador, filtramos por pipeline+source
//   conhecidos e dedupamos por email+phone contra o blob.
//
// Como nossa fonte primária é o webhook do Elementor para saleszone (não o
// Pipedrive), esse recovery é fallback — o que nunca chegar aqui vira um alerta
// de "webhook falhou" via comparação horária com o n8n.

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import {
  LpLeadRecord,
  lpDateKey,
  readLpLeads,
  writeLpLeads,
  extractLpVertical,
} from "@/lib/audit-lp"

export const maxDuration = 120
export const dynamic = "force-dynamic"

const PIPEDRIVE_TOKEN  = process.env.PIPEDRIVE_API_TOKEN        || ""
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN   || "seazone"

// Env var opcional: lista de IDs de filter do Pipedrive que identificam deals
// vindos de LPs (criados via n8n com source=wordpress ou marketing=lp).
// Formato: "123,456,789". Preencher depois que criarmos os filters no Pipedrive.
const PIPEDRIVE_LP_FILTER_IDS = (process.env.PIPEDRIVE_LP_FILTER_IDS || "")
  .split(",").map(s => s.trim()).filter(Boolean)

// ─── Pipedrive helpers ────────────────────────────────────────────────────────

async function pdFetch(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return null
  return res.json()
}

interface PipedriveDeal {
  id: number
  add_time: string
  person_id?: { value?: number; email?: { value?: string }[]; phone?: { value?: string }[] }
  person_name?: string
  title?: string
}

async function fetchRecentDeals(sinceISO: string): Promise<PipedriveDeal[]> {
  if (!PIPEDRIVE_TOKEN) return []
  const all: PipedriveDeal[] = []

  // Se temos filter_ids configurados, buscamos por eles (mais preciso)
  if (PIPEDRIVE_LP_FILTER_IDS.length > 0) {
    for (const filterId of PIPEDRIVE_LP_FILTER_IDS) {
      let start = 0
      while (true) {
        const url = `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/deals` +
          `?filter_id=${filterId}&sort=add_time%20DESC&start=${start}&limit=100&api_token=${PIPEDRIVE_TOKEN}`
        const data = await pdFetch(url)
        if (!data?.data) break
        const batch = data.data as PipedriveDeal[]
        if (!batch.length) break
        // Pipedrive filter não suporta range de data, cortamos manualmente
        const withinWindow = batch.filter(d => new Date(d.add_time) >= new Date(sinceISO))
        all.push(...withinWindow)
        if (batch.length < 100 || withinWindow.length < batch.length) break
        start += 100
      }
    }
    return all
  }

  // Fallback: pega deals recentes sem filtro. Só útil pra baixo volume.
  // Descarta silenciosamente: sem filter_id a heurística de detecção de LP
  // é fraca demais. Logamos pra lembrar de configurar.
  console.log("[audit-lp-recovery] PIPEDRIVE_LP_FILTER_IDS não configurado — recovery desabilitado")
  return []
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const date: string = body.date || lpDateKey()

  // Janela: deals criados nas últimas 24h (cobre o dia corrente + madrugada)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const deals = await fetchRecentDeals(since)
  if (!deals.length) {
    return NextResponse.json({ recovered: 0, checked: 0, note: "no deals found (filter not configured?)", ts: new Date().toISOString() })
  }

  const existing = await readLpLeads(date)
  const existingByContact = new Set(
    existing.map(l => `${(l.email || "").toLowerCase()}|${(l.phone || "").replace(/\D/g, "").slice(-11)}`)
  )

  const toAdd: LpLeadRecord[] = []
  for (const deal of deals) {
    const email = deal.person_id?.email?.[0]?.value || ""
    const phone = deal.person_id?.phone?.[0]?.value || ""
    const contactKey = `${email.toLowerCase()}|${phone.replace(/\D/g, "").slice(-11)}`
    if (existingByContact.has(contactKey)) continue

    toAdd.push({
      id: crypto.randomUUID(),
      source: "elementor",
      form_id: "",
      form_name: "",
      page_slug: "",
      page_url: "",
      name: deal.person_name || deal.title || "",
      email,
      phone,
      vertical: extractLpVertical("", ""), // "Outros" — sem info de form
      created_at: deal.add_time,
      status: "aguardando",
      pipedrive_deal_id: deal.id,
      pipedrive_person_id: deal.person_id?.value,
      recovered_from_pipedrive: true,
    })
  }

  if (toAdd.length > 0) {
    await writeLpLeads(date, [...existing, ...toAdd])
  }

  return NextResponse.json({
    recovered: toAdd.length,
    checked: deals.length,
    existing: existing.length,
    ts: new Date().toISOString(),
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
