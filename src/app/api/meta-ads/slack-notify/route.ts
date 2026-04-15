import { NextRequest, NextResponse } from "next/server"

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_PAUSA_URL
const SLACK_TAG_USERS = ["U0ADJGTD198", "U0ABY7KQ6J1"]

interface PausedAd {
  ad_id: string
  ad_name: string
  campaign_name: string
  vertical: string
  reason: string
}

export async function POST(req: NextRequest) {
  try {
    const { ads } = await req.json() as { ads: PausedAd[] }

    if (!ads || ads.length === 0) return NextResponse.json({ ok: true })
    if (!SLACK_WEBHOOK) return NextResponse.json({ ok: true, skipped: "no webhook configured" })

    const groups: Record<string, PausedAd[]> = {}
    for (const ad of ads) {
      const v = ad.vertical || "Outros"
      if (!groups[v]) groups[v] = []
      groups[v].push(ad)
    }

    const date = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    })

    let text = `:pause_button: *Anúncios pausados — ${date}*\n${SLACK_TAG_USERS.map(u => `<@${u}>`).join(" ")}\n\n`
    text += `*${ads.length} anúncio${ads.length > 1 ? "s" : ""} pausado${ads.length > 1 ? "s" : ""}*\n\n`

    for (const [vertical, vAds] of Object.entries(groups)) {
      text += `*${vertical}* (${vAds.length}):\n`
      for (const ad of vAds) {
        text += `• \`${ad.ad_id}\` — ${ad.ad_name}\n`
        text += `  _${ad.campaign_name}_\n`
        text += `  Motivo: ${ad.reason}\n`
      }
      text += "\n"
    }

    const res = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: `Slack error: ${body}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
