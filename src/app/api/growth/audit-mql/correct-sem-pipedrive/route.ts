import { NextRequest, NextResponse } from "next/server"
import { readLeads, writeLeads } from "@/lib/audit-mql"
import { dateKey } from "@/lib/audit-mql"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET /api/growth/audit-mql/correct-sem-pipedrive?date=YYYY-MM-DD
// Corrige retroativamente leads marcados como sem_pipedrive que na verdade estão no Pipedrive.
// Requer Bearer CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const date = searchParams.get("date") || dateKey()

  const PIPEDRIVE_TOKEN  = process.env.PIPEDRIVE_API_TOKEN        || ""
  const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN   || "seazone"
  const MIA_FIELD_KEY    = process.env.PIPEDRIVE_MORADA_FIELD_KEY || "3dda4dab1781dcfd8839a5fd6c0b7d5e7acfbcfc"

  async function pdFetch(url: string) {
    const r = await fetch(url, { cache: "no-store" })
    if (!r.ok) return null
    return r.json()
  }

  async function findPerson(email: string, phone: string): Promise<number | null> {
    if (email) {
      const d = await pdFetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`)
      const id = d?.data?.items?.[0]?.item?.id as number | undefined
      if (id) return id
    }
    if (phone) {
      const clean = phone.replace(/\D/g, "")
      const d1 = await pdFetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search?term=${encodeURIComponent(clean)}&fields=phone&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`)
      const id1 = d1?.data?.items?.[0]?.item?.id as number | undefined
      if (id1) return id1
      if (clean.startsWith("55") && clean.length === 13) {
        const d2 = await pdFetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/search?term=${encodeURIComponent(clean.slice(2))}&fields=phone&exact_match=true&api_token=${PIPEDRIVE_TOKEN}`)
        const id2 = d2?.data?.items?.[0]?.item?.id as number | undefined
        if (id2) return id2
      }
    }
    return null
  }

  async function getDeal(personId: number) {
    const d = await pdFetch(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/v1/persons/${personId}/deals?sort=add_time+DESC&limit=1&api_token=${PIPEDRIVE_TOKEN}`)
    const deal = d?.data?.[0]
    if (!deal) return null
    return { deal_id: deal.id as number, mia_link: (deal[MIA_FIELD_KEY] as string) || null }
  }

  const leads = await readLeads(date)
  const semPipe = leads.filter(l => l.status === "sem_pipedrive")

  if (semPipe.length === 0) {
    return NextResponse.json({ date, corrected: 0, message: "Nenhum sem_pipedrive encontrado" })
  }

  const corrections: Array<{ name: string; email: string; before: string; after: string }> = []

  for (const lead of semPipe) {
    lead.checked_at = new Date().toISOString()
    const personId = await findPerson(lead.email, lead.phone)
    if (!personId) continue // genuinamente sem_pipedrive

    const deal = await getDeal(personId)
    if (!deal) continue

    lead.pipedrive_deal_id = deal.deal_id
    const before = lead.status
    if (deal.mia_link) {
      lead.status   = "ok"
      lead.mia_link = deal.mia_link
      lead.notified = true
    } else {
      lead.status = "sem_mia"
    }
    corrections.push({ name: lead.name, email: lead.email, before, after: lead.status })

    // Evita rate limit do Pipedrive
    await new Promise(r => setTimeout(r, 300))
  }

  if (corrections.length > 0) {
    // semPipe é referência aos mesmos objetos de leads — mutações já refletem no array original
    await writeLeads(date, leads)
  }

  return NextResponse.json({ date, corrected: corrections.length, total_sem_pipedrive: semPipe.length, corrections })
}
