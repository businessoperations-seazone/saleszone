import { NextRequest, NextResponse } from "next/server"
import { readData, writeData } from "@/lib/sla-mql-blob"

export const dynamic = "force-dynamic"

export type SlaRow = {
  id: number
  vertical: string
  nome: string
  status: boolean
  commercial_squad: string
  mql_intencoes: string[]
  mql_faixas: string[]
  mql_pagamentos: string[]
}

export async function GET() {
  try {
    const data = await readData()
    return NextResponse.json({ rows: data.rows, forms: data.forms })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      vertical: string
      nome: string
      commercial_squad?: string
      mql_intencoes?: string[]
      mql_faixas?: string[]
      mql_pagamentos?: string[]
    }
    const { vertical, nome, commercial_squad = "", mql_intencoes = [], mql_faixas = [], mql_pagamentos = [] } = body

    if (!vertical || !nome?.trim()) {
      return NextResponse.json({ error: "params inválidos" }, { status: 400 })
    }

    const data = await readData()
    const maxId = data.rows.reduce((m, r) => Math.max(m, r.id), 0)
    const newRow: SlaRow = { id: maxId + 1, vertical, nome: nome.trim(), status: true, commercial_squad, mql_intencoes, mql_faixas, mql_pagamentos }
    await writeData({ ...data, rows: [...data.rows, newRow] })
    return NextResponse.json({ ok: true, id: newRow.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
