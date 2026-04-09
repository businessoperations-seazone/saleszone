// Verificação de leads pendentes — roda via GitHub Actions a cada 15min (fallback)
// Processa hoje E ontem (leads que chegam tarde da noite)

import { NextRequest, NextResponse } from "next/server"
import { dateKey, readLeads, writeLeads } from "@/lib/audit-mql"
import { runCheck, recheckSla } from "@/lib/audit-mql-check"

export const maxDuration = 120
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = dateKey()
  const yesterday = (() => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const body = await req.json().catch(() => ({}))

  // POST com { dedup: true } — remove duplicatas por leadgen_id do blob
  if (body.dedup) {
    const dates: string[] = body.dates || [today, yesterday]
    const results: Record<string, { before: number; after: number; removed: number }> = {}
    for (const d of dates) {
      const leads = await readLeads(d)
      const seen = new Set<string>()
      const deduped = leads.filter(l => {
        if (seen.has(l.leadgen_id)) return false
        seen.add(l.leadgen_id)
        return true
      })
      const removed = leads.length - deduped.length
      if (removed > 0) await writeLeads(d, deduped)
      results[d] = { before: leads.length, after: deduped.length, removed }
    }
    return NextResponse.json({ dedup: results, ts: new Date().toISOString() })
  }

  // POST com { recheck_sla: true } re-avalia SLA de todos os leads retroativamente
  if (body.recheck_sla) {
    const dates: string[] = body.dates || [today]
    const results: Record<string, { total: number; fixed: number }> = {}
    for (const d of dates) {
      results[d] = await recheckSla(d)
    }
    return NextResponse.json({ recheck_sla: results, ts: new Date().toISOString() })
  }

  const [r1, r2] = await Promise.all([runCheck(yesterday), runCheck(today)])

  // recheckSla garante que leads já classificados são reavaliados quando o SLA muda
  const [s1, s2] = await Promise.all([recheckSla(yesterday), recheckSla(today)])

  return NextResponse.json({
    [yesterday]: { ...r1, sla_recheck: s1 },
    [today]:     { ...r2, sla_recheck: s2 },
    ts: new Date().toISOString(),
  })
}
