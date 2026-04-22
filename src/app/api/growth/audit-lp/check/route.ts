// Cron check — roda a cada 5-10 min para verificar leads pendentes das LPs.

import { NextRequest, NextResponse } from "next/server"
import { lpDateKey, readLpLeads, writeLpLeads } from "@/lib/audit-lp"
import { runCheckLp } from "@/lib/audit-lp-check"

export const maxDuration = 120
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = lpDateKey()
  const body = await req.json().catch(() => ({}))

  // Dedup admin op: remove entradas com mesmo email+phone em um dia
  if (body.dedup) {
    const dates: string[] = body.dates || [today]
    const results: Record<string, { before: number; after: number; removed: number }> = {}
    for (const d of dates) {
      const leads = await readLpLeads(d)
      const seen = new Set<string>()
      const deduped = leads.filter(l => {
        const k = `${(l.email || "").toLowerCase()}|${(l.phone || "").replace(/\D/g, "").slice(-11)}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      const removed = leads.length - deduped.length
      if (removed > 0) await writeLpLeads(d, deduped)
      results[d] = { before: leads.length, after: deduped.length, removed }
    }
    return NextResponse.json({ dedup: results, ts: new Date().toISOString() })
  }

  const r = await runCheckLp(today)
  return NextResponse.json({ [today]: r, ts: new Date().toISOString() })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
