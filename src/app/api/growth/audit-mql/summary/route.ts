import { NextRequest, NextResponse } from "next/server"
import { putBlob, fetchBlobJson } from "@/lib/blob"
import { readLeads } from "@/lib/audit-mql"
import { runCheck } from "@/lib/audit-mql-check"
import { MOCK_LOG } from "@/lib/audit-mql-mock"

export const maxDuration = 120
export const dynamic = "force-dynamic"

const SLACK_WEBHOOK  = process.env.SLACK_WEBHOOK_AUDIT_MQL || ""

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
  const all = await readLeads(key)
  // Filtra por created_at dentro do dia BRT (igual à UI) + exclui descartados.
  // O blob pode conter leads históricos adicionados pelo recovery cron quando
  // o filtro de data da Meta API falha — esses leads têm created_at de outros dias.
  const dayStart = new Date(`${key}T03:00:00Z`).getTime() // midnight BRT = 03:00 UTC
  const dayEnd   = dayStart + 24 * 60 * 60 * 1000         // next midnight BRT
  const leads = all.filter(l =>
    l.status !== "descartado" &&
    new Date(l.created_at).getTime() >= dayStart &&
    new Date(l.created_at).getTime() < dayEnd
  )
  if (leads.length === 0) return null

  // fora_sla não é erro — lead simplesmente não qualificou
  // MQL = leads que passaram no SLA e foram verificados
  // Erros = sem_pipedrive + sem_mia + não chegou no Baserow + não encontrado na Nekt
  const byVertical = new Map<string, { total: number; mql: number; mia: number; fora_sla: number; erros: number }>()
  for (const l of leads) {
    const v = l.vertical || "Outros"
    if (!byVertical.has(v)) byVertical.set(v, { total: 0, mql: 0, mia: 0, fora_sla: 0, erros: 0 })
    const g = byVertical.get(v)!
    g.total++
    if (l.status === "fora_sla") {
      g.fora_sla++
    } else if (l.status !== "aguardando") {
      g.mql++
      if (l.status === "ok")            g.mia++
      if (l.status === "sem_pipedrive") g.erros++
      if (l.status === "sem_mia")       g.erros++
      if (l.nekt_status === "nao_encontrado") g.erros++
    }
    if (l.in_baserow === false) g.erros++
  }

  const total    = leads.length
  const foraSla  = leads.filter(l => l.status === "fora_sla").length
  const mql      = leads.filter(l => l.status !== "fora_sla" && l.status !== "aguardando").length
  const mia      = leads.filter(l => l.status === "ok").length
  const baserowNao = leads.filter(l => l.in_baserow === false).length
  const nektNao    = leads.filter(l => l.nekt_status === "nao_encontrado").length
  const erros    = leads.filter(l => l.status === "sem_pipedrive").length
               + leads.filter(l => l.status === "sem_mia").length
               + baserowNao + nektNao

  // Baserow — só conta leads verificados (in_baserow !== undefined)
  const baserowChecked = leads.filter(l => l.in_baserow !== undefined).length
  const baserowOk      = leads.filter(l => l.in_baserow === true).length

  // Nekt — só conta leads com deal no Pipedrive verificados
  const nektChecked = leads.filter(l => l.nekt_status !== undefined).length
  const nektOk      = leads.filter(l => l.nekt_status === "ok").length

  return {
    key, total, mql, mia, fora_sla: foraSla, erros,
    byVertical: Object.fromEntries(byVertical),
    baserowChecked, baserowOk, baserowNao,
    nektChecked, nektOk, nektNao,
  }
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
  const { key, total, mql, mia, fora_sla, erros, byVertical,
          baserowChecked, baserowOk, baserowNao,
          nektChecked, nektOk, nektNao } = summary

  let text = `📊 *Resumo Audit MQL — ${fmtDate(key)}*\n\n`
  text += `*Total de leads:* ${total}`
  if (fora_sla > 0) text += ` (${fora_sla} fora do SLA)`
  text += "\n"
  text += `*MQL:* ${mql}\n`
  text += `*Atendidos pela MIA:* ${mia} (${pct(mia, mql)})\n`
  text += erros > 0 ? `*Erros:* ${erros} ⚠️\n` : `*Erros:* 0 ✅\n`

  // Baserow
  if (baserowChecked > 0) {
    const icon = baserowNao > 0 ? "⚠️" : "✅"
    text += `*Baserow:* ${baserowOk}/${baserowChecked} chegaram ${icon}`
    if (baserowNao > 0) text += ` (${baserowNao} não chegou${baserowNao !== 1 ? "ram" : ""})`
    text += "\n"
  }

  // Nekt
  if (nektChecked > 0) {
    const icon = nektNao > 0 ? "⚠️" : "✅"
    text += `*Nekt:* ${nektOk}/${nektChecked} deals encontrados ${icon}`
    if (nektNao > 0) text += ` (${nektNao} não encontrado${nektNao !== 1 ? "s" : ""})`
    text += "\n"
  }

  text += "\n*Por vertical:*\n"

  const sorted = Object.entries(byVertical).sort((a, b) => b[1].total - a[1].total)
  for (const [vertical, g] of sorted) {
    text += `\n*${vertical}* — ${g.total} lead${g.total !== 1 ? "s" : ""}`
    if (g.fora_sla > 0) text += ` (${g.fora_sla} fora do SLA)`
    text += "\n"
    if (g.mql > 0) {
      text += `  • MQL: ${g.mql}\n`
      text += `  • MIA: ${g.mia}/${g.mql} (${pct(g.mia, g.mql)})\n`
    }
    if (g.erros > 0) text += `  • Erros: ${g.erros} ⚠️\n`
    else if (g.mql > 0) text += `  • Erros: 0 ✅\n`
  }

  // Alerta de expiração do token Meta
  if (tokenExpiry) {
    const { daysLeft, expiresAt } = tokenExpiry
    const mentions = "<@U03KA47L2Q5> <@U0625PXJC4Q> <@U0A0AFJQ3GV>"
    if (daysLeft <= 0) {
      text += `\n\n🚨 ${mentions} *TOKEN META EXPIRADO!* O META_ADS_TOKEN expirou em ${expiresAt}. saleszone e artefatos-growth estão sem funcionar. Renovar agora: Meta Business Manager → Usuários do sistema → Gerar novo token → atualizar no Vercel.`
    } else if (daysLeft <= 5) {
      text += `\n\n🚨 ${mentions} *TOKEN META EXPIRA EM ${daysLeft} DIA${daysLeft !== 1 ? "S" : ""}!* (${expiresAt}) — Renovar urgente no Meta Business Manager e atualizar em saleszone + artefatos-growth no Vercel. Ver passo a passo: saleszone.vercel.app/growth/audit-mql → aba Sobre.`
    }
  }

  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
}

async function saveLog(summary: NonNullable<Awaited<ReturnType<typeof buildSummary>>>) {
  let logs = (await fetchBlobJson<typeof summary[]>("audit-mql/log.json")) ?? []

  const idx = logs.findIndex(l => l.key === summary.key)
  if (idx >= 0) logs[idx] = summary
  else logs.unshift(summary)

  logs = logs.slice(0, 90)

  await putBlob("audit-mql/log.json", logs)
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
  const logs = await fetchBlobJson<unknown[]>("audit-mql/log.json")
  if (!logs || logs.length === 0) {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json(MOCK_LOG, { headers: { "Cache-Control": "no-store" } })
    }
    return NextResponse.json([])
  }
  return NextResponse.json(logs, { headers: { "Cache-Control": "no-store" } })
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
