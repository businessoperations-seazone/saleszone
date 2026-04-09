import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { readLeads } from "@/lib/audit-mql"
import { runCheck } from "@/lib/audit-mql-check"

export const maxDuration = 120
export const dynamic = "force-dynamic"

const SLACK_WEBHOOK  = process.env.SLACK_WEBHOOK_AUDIT_MQL || ""
const BLOB_STORE_URL = process.env.BLOB_URL                || ""

function offsetKey(days: number) {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtDate(key: string) {
  const [y, m, d] = key.split("-")
  return `${d}/${m}/${y}`
}

function pct(n: number, d: number) { return d > 0 ? `${Math.round(n / d * 100)}%` : "—" }

async function buildSummary(key: string) {
  const leads = await readLeads(key)
  if (leads.length === 0) return null

  const byVertical = new Map<string, { total: number; pipedrive: number; mia: number; erros: number }>()
  for (const l of leads) {
    const v = l.vertical || "Outros"
    if (!byVertical.has(v)) byVertical.set(v, { total: 0, pipedrive: 0, mia: 0, erros: 0 })
    const g = byVertical.get(v)!
    g.total++
    if (l.status !== "sem_pipedrive") g.pipedrive++
    if (l.status === "ok")            g.mia++
    if (l.status !== "ok")            g.erros++
  }

  const total     = leads.length
  const pipedrive = leads.filter(l => l.status !== "sem_pipedrive").length
  const mia       = leads.filter(l => l.status === "ok").length
  const erros     = leads.filter(l => l.status !== "ok").length

  return { key, total, pipedrive, mia, erros, byVertical: Object.fromEntries(byVertical) }
}

async function checkMetaTokenExpiry(): Promise<{ daysLeft: number; expiresAt: string } | null> {
  const token = process.env.META_ADS_TOKEN || ""
  if (!token) return null
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/debug_token?input_token=${token}&access_token=${token}`,
      { cache: "no-store" }
    )
    if (!res.ok) return null
    const data = await res.json()
    const expiresAt: number = data?.data?.expires_at
    if (!expiresAt) return null
    const daysLeft = Math.ceil((expiresAt * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
    return { daysLeft, expiresAt: new Date(expiresAt * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) }
  } catch {
    return null
  }
}

async function sendSlack(summary: NonNullable<Awaited<ReturnType<typeof buildSummary>>>, tokenExpiry: { daysLeft: number; expiresAt: string } | null) {
  if (!SLACK_WEBHOOK) return
  const { key, total, pipedrive, mia, erros, byVertical } = summary

  let text = `📊 *Resumo Audit MQL — ${fmtDate(key)}*\n\n`
  text += `*Total de leads:* ${total}\n`
  text += `*Chegaram no Pipedrive:* ${pipedrive} (${pct(pipedrive, total)})\n`
  text += `*Atendidos pela MIA:* ${mia} (${pct(mia, total)})\n`
  text += erros > 0 ? `*Erros:* ${erros} ⚠️\n` : `*Erros:* 0 ✅\n`
  text += "\n*Por vertical:*\n"

  const sorted = Object.entries(byVertical).sort((a, b) => b[1].total - a[1].total)
  for (const [vertical, g] of sorted) {
    text += `\n*${vertical}* — ${g.total} lead${g.total !== 1 ? "s" : ""}\n`
    text += `  • Pipedrive: ${g.pipedrive}/${g.total} (${pct(g.pipedrive, g.total)})\n`
    text += `  • MIA: ${g.mia}/${g.total} (${pct(g.mia, g.total)})\n`
    if (g.erros > 0) text += `  • Erros: ${g.erros} ⚠️\n`
  }

  // Alerta de expiração do token Meta
  if (tokenExpiry) {
    const { daysLeft, expiresAt } = tokenExpiry
    const mentions = "<@U03KA47L2Q5> <@U0625PXJC4Q> <@U0A0AFJQ3GV>"
    if (daysLeft <= 0) {
      text += `\n\n🚨 ${mentions} *TOKEN META EXPIRADO!* O META_ADS_TOKEN expirou em ${expiresAt}. saleszone e artefatos-growth estão sem funcionar. Renovar agora: Meta Business Manager → Usuários do sistema → Gerar novo token → atualizar no Vercel.`
    } else if (daysLeft <= 5) {
      text += `\n\n🚨 ${mentions} *TOKEN META EXPIRA EM ${daysLeft} DIA${daysLeft !== 1 ? "S" : ""}!* (${expiresAt}) — Renovar urgente no Meta Business Manager e atualizar em saleszone + artefatos-growth no Vercel. Ver passo a passo: saleszone.vercel.app/growth/audit-mql → aba Sobre.`
    } else if (daysLeft <= 30) {
      text += `\n\n⚠️ ${mentions} *Token Meta expira em ${daysLeft} dias* (${expiresAt}) — Programar renovação. Ver passo a passo: saleszone.vercel.app/growth/audit-mql → aba Sobre.`
    }
  }

  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
}

async function saveLog(summary: NonNullable<Awaited<ReturnType<typeof buildSummary>>>) {
  const token = process.env.BLOB_READ_WRITE_TOKEN || ""
  let logs: typeof summary[] = []
  if (BLOB_STORE_URL) {
    try {
      const res = await fetch(`${BLOB_STORE_URL}/audit-mql/log.json`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      })
      if (res.ok) logs = await res.json()
    } catch { /* vazio */ }
  }

  const idx = logs.findIndex(l => l.key === summary.key)
  if (idx >= 0) logs[idx] = summary
  else logs.unshift(summary)

  logs = logs.slice(0, 90)

  await put("audit-mql/log.json", JSON.stringify(logs), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
}

// GET — cron diário (com Authorization) ou leitura do log histórico (sem auth)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const { searchParams } = req.nextUrl

  const hasBearer = authHeader?.startsWith("Bearer ")
  if (hasBearer) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Invalid CRON_SECRET" }, { status: 401 })
    }
    const key = searchParams.get("date") || offsetKey(-1)

    await runCheck(key)

    const [summary, tokenExpiry] = await Promise.all([buildSummary(key), checkMetaTokenExpiry()])
    if (!summary) {
      return NextResponse.json({ message: "Sem leads para essa data", date: key })
    }

    await Promise.all([sendSlack(summary, tokenExpiry), saveLog(summary)])
    return NextResponse.json({ sent: true, ...summary })
  }

  // Sem auth → retorna o log histórico (UI)
  if (!BLOB_STORE_URL) return NextResponse.json([])
  const token = process.env.BLOB_READ_WRITE_TOKEN || ""
  try {
    const res = await fetch(`${BLOB_STORE_URL}/audit-mql/log.json`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json(), { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json([])
  }
}

// POST — gera e envia o resumo (cron diário ou manual via CRON_SECRET)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const key = searchParams.get("date") || offsetKey(-1)

  await runCheck(key)

  const [summary, tokenExpiry] = await Promise.all([buildSummary(key), checkMetaTokenExpiry()])
  if (!summary) {
    return NextResponse.json({ message: "Sem leads para essa data", date: key })
  }

  await Promise.all([sendSlack(summary, tokenExpiry), saveLog(summary)])
  return NextResponse.json({ sent: true, ...summary })
}
