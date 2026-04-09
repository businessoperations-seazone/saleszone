import { NextRequest, NextResponse } from "next/server"
import { readLog, appendLog } from "@/lib/sla-mql-blob"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const entries = await readLog()
    return NextResponse.json({ entries })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/sla-mql/log
// Body: { entries: Array<{ user_name, user_email, vertical, section, action, entity, detail }> }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      entries: Array<{
        user_name: string
        user_email: string
        vertical: string
        section: string
        action: string
        entity: string
        detail: string
      }>
    }

    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const ts = new Date().toISOString()
    await appendLog(body.entries.map(e => ({ ...e, ts })))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
