// GET /api/growth/audit-lp/leads?date=YYYY-MM-DD → lista leads LP do dia
// POST /api/growth/audit-lp/leads { recheck: id, date? } → re-checa lead no Pipedrive

import { NextRequest, NextResponse } from "next/server"
import { LpLeadRecord, lpDateKey, readLpLeads, writeLpLeads } from "@/lib/audit-lp"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const PIPEDRIVE_TOKEN  = process.env.PIPEDRIVE_API_TOKEN        || ""
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN   || "seazone"
const MIA_FIELD_KEY    = process.env.PIPEDRIVE_MORADA_FIELD_KEY || "3dda4dab1781dcfd8839a5fd6c0b7d5e7acfbcfc"

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

async function recheckOne(lead: LpLeadRecord): Promise<void> {
  lead.checked_at = new Date().toISOString()
  const personId = await findPerson(lead.email, lead.phone)
  if (!personId) {
    lead.status = "sem_pipedrive"
    lead.pipedrive_deal_id = undefined
    lead.mia_link = undefined
    return
  }
  lead.pipedrive_person_id = personId
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const leadId: string = body.recheck
  const date: string = body.date || lpDateKey()
  if (!leadId) return NextResponse.json({ error: "missing recheck id" }, { status: 400 })

  const leads = await readLpLeads(date)
  const lead = leads.find(l => l.id === leadId)
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 })

  await recheckOne(lead)
  await writeLpLeads(date, leads)

  return NextResponse.json(lead, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const date = searchParams.get("date") || lpDateKey()

  const leads = await readLpLeads(date)
  const filtered = leads.filter(l => l.status !== "descartado")
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return NextResponse.json(filtered, { headers: { "Cache-Control": "no-store" } })
}
