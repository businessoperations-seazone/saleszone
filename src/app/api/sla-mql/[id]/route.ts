import { NextRequest, NextResponse } from "next/server"
import { readData, writeData } from "@/lib/sla-mql-blob"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = parseInt(id, 10)
    if (isNaN(numId)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

    const body = await req.json() as {
      status: boolean
      mql_intencoes: string[]
      mql_faixas: string[]
      mql_pagamentos: string[]
    }

    const data = await readData()
    const rows = data.rows.map(r => r.id === numId ? { ...r, ...body } : r)
    await writeData({ ...data, rows })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = parseInt(id, 10)
    if (isNaN(numId)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

    const data = await readData()
    await writeData({ ...data, rows: data.rows.filter(r => r.id !== numId) })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
