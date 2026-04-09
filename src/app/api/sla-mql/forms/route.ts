import { NextRequest, NextResponse } from "next/server"
import { readData, writeData } from "@/lib/sla-mql-blob"

export const dynamic = "force-dynamic"

// PUT /api/sla-mql/forms
// Body: { vertical: string; questions: Array<{ pergunta: string; opcoes: string[] }> }
// Substitui todas as perguntas da vertical (delete + re-insert ordenado)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      vertical: string
      questions: Array<{ pergunta: string; opcoes: string[] }>
    }
    const { vertical, questions } = body

    if (!vertical || !Array.isArray(questions)) {
      return NextResponse.json({ error: "params inválidos" }, { status: 400 })
    }

    const data = await readData()
    await writeData({ ...data, forms: { ...data.forms, [vertical]: questions } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
