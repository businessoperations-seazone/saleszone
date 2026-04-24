import { NextRequest, NextResponse } from "next/server"
import { readLpLeads, writeLpLeads, lpDateKey } from "@/lib/audit-lp"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const NEKT_API_KEY = process.env.NEKT_API_KEY || ""
const CRON_SECRET  = process.env.CRON_SECRET   || ""

async function queryNekt(sql: string): Promise<Record<string, string | number | null>[]> {
  const queryRes = await fetch("https://api.nekt.ai/api/v1/sql-query/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": NEKT_API_KEY },
    body: JSON.stringify({ sql, mode: "csv" }),
  })
  if (!queryRes.ok) throw new Error(`Nekt ${queryRes.status}: ${await queryRes.text()}`)
  const qd = await queryRes.json()

  let urls: string[] = []
  if (Array.isArray(qd.presigned_urls) && qd.presigned_urls.length) urls = qd.presigned_urls
  else if (qd.presigned_url) urls = [qd.presigned_url]
  else if (qd.url)           urls = [qd.url]
  if (!urls.length) throw new Error(`Nekt: sem presigned_url — ${JSON.stringify(qd)}`)

  const chunks = await Promise.all(urls.map(async (u: string) => {
    const r = await fetch(u)
    if (!r.ok) throw new Error(`Nekt CSV ${r.status}`)
    return r.text()
  }))
  const combined = chunks[0] + (chunks.length > 1
    ? "\n" + chunks.slice(1).map((c: string) => c.trim().split("\n").slice(1).join("\n")).join("\n")
    : "")
  return parseCSV(combined)
}

function parseCSV(csv: string): Record<string, string | number | null>[] {
  const lines = csv.trim().split("\n")
  if (lines.length < 2) return []
  const cols = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""))
    const row: Record<string, string | number | null> = {}
    cols.forEach((c, i) => {
      const v = vals[i] ?? ""
      if (v === "" || v === "null" || v === "NULL") row[c] = null
      else if (!isNaN(Number(v))) row[c] = Number(v)
      else row[c] = v
    })
    return row
  })
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!NEKT_API_KEY) {
    return NextResponse.json({ error: "NEKT_API_KEY não configurada" }, { status: 500 })
  }

  const { searchParams } = req.nextUrl
  const targetDate = searchParams.get("date") ||
    lpDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000))

  const leads = await readLpLeads(targetDate)
  if (leads.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, date: targetDate, message: "Sem leads no dia" })
  }

  const leadsWithDeal = leads.filter(l => l.status !== "descartado" && l.pipedrive_deal_id)
  if (leadsWithDeal.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, date: targetDate, message: "Nenhum lead com deal Pipedrive" })
  }

  const dealIds = leadsWithDeal.map(l => l.pipedrive_deal_id!).join(", ")
  const sql = `
    SELECT id
    FROM nekt_silver.pipedrive_deals_readable
    WHERE id IN (${dealIds})
  `.trim()

  const rows = await queryNekt(sql)
  const nektIds = new Set(rows.map(r => Number(r.id)))

  let changed = false
  for (const lead of leads) {
    if (lead.status === "descartado" || !lead.pipedrive_deal_id) continue
    const next = nektIds.has(lead.pipedrive_deal_id) ? "ok" as const : "nao_encontrado" as const
    if (lead.nekt_status !== next) {
      lead.nekt_status = next
      changed = true
    }
  }

  if (changed) await writeLpLeads(targetDate, leads)

  return NextResponse.json({
    ok: true,
    date: targetDate,
    checked: leadsWithDeal.length,
    nekt_ok: leads.filter(l => l.nekt_status === "ok").length,
    nao_encontrado: leads.filter(l => l.nekt_status === "nao_encontrado").length,
  })
}
