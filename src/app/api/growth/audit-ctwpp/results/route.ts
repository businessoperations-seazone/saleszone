import { NextResponse } from "next/server"
import { readAuditCTWPP, writeAuditCTWPP, dateKeyBRT } from "@/lib/audit-ctwpp"

export const dynamic = "force-dynamic"

export async function GET(req: Request & { nextUrl: URL }) {
  const date = req.nextUrl.searchParams.get("date") || dateKeyBRT(new Date(Date.now() - 86_400_000))

  if (date === "all") {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (i + 1) * 86_400_000)
      return dateKeyBRT(d)
    })
    const results = await Promise.all(days.map(d => readAuditCTWPP(d)))
    const valid = results.filter(Boolean) as Awaited<ReturnType<typeof readAuditCTWPP>>[]
    if (!valid.length) return NextResponse.json({ error: "not_found" }, { status: 404 })
    const leads = valid.flatMap(d => d!.leads)
    return NextResponse.json({
      date: "all",
      ran_at: valid[0]!.ran_at,
      total_leads: leads.length,
      leads,
    })
  }

  const data = await readAuditCTWPP(date)
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json(data)
}

// PATCH — corrige um lead específico sem reprocessar tudo
// Body: { date, deal_id, patch: { tem_problema, tag, resumo, problemas, recomendacao } }
export async function PATCH(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { date, deal_id, patch } = body

  if (!date || !deal_id || !patch) {
    return NextResponse.json({ error: "Require: date, deal_id, patch" }, { status: 400 })
  }

  const data = await readAuditCTWPP(date)
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const lead = data.leads.find(l => l.deal_id === deal_id)
  if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 })

  const ALLOWED = ["tem_problema", "tag", "resumo", "problemas", "recomendacao"] as const
  for (const key of ALLOWED) {
    if (key in patch) (lead as unknown as Record<string, unknown>)[key] = patch[key]
  }

  try {
    await writeAuditCTWPP(date, data)
  } catch (err) {
    console.error("[audit-ctwpp PATCH] write failed", { date, deal_id, err })
    return NextResponse.json({ error: "write_failed" }, { status: 500 })
  }

  console.log("[audit-ctwpp PATCH] patched", { date, deal_id, patch })
  return NextResponse.json({ ok: true, date, deal_id, updated: patch })
}
