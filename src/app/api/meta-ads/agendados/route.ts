import { NextResponse } from "next/server"
import { queryNekt } from "@/lib/nekt"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Etapas "Agendado" por pipeline (fonte: audit-comercial-config.ts)
// Pipeline 28 (SZI/Investimentos) → stage 187
// Pipeline 14 (SZS/Serviços)      → stage 73
// Pipeline 37 (Marketplace)       → stage 284

export async function GET() {
  try {
    const sql = `
      SELECT
        empreendimento,
        proprietario,
        data_de_agendamento,
        data_da_reuniao,
        rd_campanha
      FROM nekt_silver.pipedrive_deals_readable
      WHERE status = 'open'
        AND (
          (pipeline_id = 28 AND CAST(stage AS INTEGER) = 187)
          OR (pipeline_id = 14 AND CAST(stage AS INTEGER) = 73)
          OR (pipeline_id = 37 AND CAST(stage AS INTEGER) = 284)
        )
    `

    const result = await queryNekt(sql)
    const rows = result.rows ?? []

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let semData = 0
    let ate7d   = 0
    let ate14d  = 0
    let alem14d = 0

    const byEmpreendimento: Record<string, number> = {}
    const byAdId: Record<string, number> = {}

    for (const r of rows) {
      const emp = String(r.empreendimento || "Sem empreendimento")
      byEmpreendimento[emp] = (byEmpreendimento[emp] || 0) + 1

      // Extrai ad_id do padrão rd_campanha = "{ad_id}_{campanha_name}"
      const rdCampanha = String(r.rd_campanha || "")
      const adId = rdCampanha.split("_")[0]
      if (adId && /^\d+$/.test(adId)) {
        byAdId[adId] = (byAdId[adId] || 0) + 1
      }

      const dateStr = r.data_de_agendamento || r.data_da_reuniao
      if (!dateStr) { semData++; continue }

      const d = new Date(String(dateStr))
      if (isNaN(d.getTime())) { semData++; continue }

      const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays <= 7)       ate7d++
      else if (diffDays <= 14) ate14d++
      else                     alem14d++
    }

    const sorted = Object.entries(byEmpreendimento)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, total]) => ({ nome, total }))

    return NextResponse.json({
      total: rows.length,
      semData,
      ate7d,
      ate14d,
      alem14d,
      byEmpreendimento: sorted,
      byAdId,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
