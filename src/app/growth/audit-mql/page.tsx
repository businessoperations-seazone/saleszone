"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import { ShieldAlert, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, ChevronDown } from "lucide-react"
import type { LeadRecord } from "@/lib/audit-mql"

type SlaRow = { id: number; vertical: string; nome: string; status: boolean; mql_intencoes: string[]; mql_faixas: string[]; mql_pagamentos: string[] }
type SlaData = { rows: SlaRow[] }

const META_TOKEN_EXPIRES = new Date("2026-05-05T19:14:42Z")

const T = {
  primary:    "#0055FF",
  bg:         "#FFFFFF",
  fg:         "#080E32",
  card:       "#FFFFFF",
  muted:      "#F3F3F5",
  mutedFg:    "#6B6E84",
  border:     "#E6E7EA",
  elevSm:     "0 1px 2px rgba(0,0,0,0.12), 0 0.1px 0.3px rgba(0,0,0,0.08)",
  elevMd:     "0 4px 16px rgba(0,0,0,0.12)",
  verde600:   "#5EA500",
  laranja500: "#FF6900",
  destructive:"#E7000B",
  font:       "'Helvetica Neue', -apple-system, BlinkMacSystemFont, sans-serif",
}

function brtNow() { return new Date(Date.now() - 3 * 60 * 60 * 1000) }
function todayKey() { return brtNow().toISOString().slice(0, 10) }
function offsetKey(days: number) {
  const d = brtNow(); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function offsetKeyFrom(key: string, days: number) {
  const d = new Date(key + "T12:00:00Z"); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const BRT = "America/Sao_Paulo"
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BRT })
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: BRT })
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BRT })
  return { date, time }
}
function datesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const s = new Date(start + "T12:00:00Z")
  const e = new Date(end + "T12:00:00Z")
  while (s <= e) {
    dates.push(s.toISOString().slice(0, 10))
    s.setDate(s.getDate() + 1)
  }
  return dates
}

type DateRange = { start: string; end: string }

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nome", first_name: "Nome", last_name: "Sobrenome",
  email: "E-mail", phone_number: "Telefone", phone: "Telefone",
}
function fieldLabel(name: string) {
  return FIELD_LABELS[name] || name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Hoje",            range: () => ({ start: todayKey(),    end: todayKey()    }) },
  { label: "Ontem",           range: () => ({ start: offsetKey(-1), end: offsetKey(-1) }) },
  { label: "Últimos 7 dias",  range: () => ({ start: offsetKey(-6), end: todayKey()    }) },
  { label: "Últimos 14 dias", range: () => ({ start: offsetKey(-13),end: todayKey()    }) },
  { label: "Últimos 30 dias", range: () => ({ start: offsetKey(-29),end: todayKey()    }) },
]

function fmtRangeLabel(range: DateRange): string {
  const today = todayKey()
  const yesterday = offsetKey(-1)
  if (range.start === range.end) {
    if (range.start === today)     return "Hoje"
    if (range.start === yesterday) return "Ontem"
    const [y, m, d] = range.start.split("-")
    return `${d}/${m}/${y}`
  }
  if (range.start === offsetKey(-6)  && range.end === today) return "Últimos 7 dias"
  if (range.start === offsetKey(-13) && range.end === today) return "Últimos 14 dias"
  if (range.start === offsetKey(-29) && range.end === today) return "Últimos 30 dias"
  const [, sm, sd] = range.start.split("-")
  const [, em, ed] = range.end.split("-")
  return `${sd}/${sm} – ${ed}/${em}`
}

type Status = LeadRecord["status"]

const STATUS_META: Record<Status, { bg: string; label: string; color: string }> = {
  aguardando:    { bg: "#F8FAFF", label: "AGUARDANDO",    color: T.primary    },
  ok:            { bg: "#F0FDF4", label: "OK",            color: T.verde600   },
  sem_mia:       { bg: "#FFF7ED", label: "SEM MIA",       color: T.laranja500 },
  sem_pipedrive: { bg: "#FEF2F2", label: "SEM PIPEDRIVE", color: T.destructive },
  fora_sla:      { bg: "#FDF4FF", label: "FORA SLA",      color: "#9333EA"    },
}

const VERTICAL_COLORS: Record<string, string> = {
  "Investimentos": "#0055FF",
  "Serviços":      "#5EA500",
  "Marketplace":   "#7C3AED",
  "Hóspedes":      "#FF6900",
}

function VerticalBadge({ vertical }: { vertical: string }) {
  const color = VERTICAL_COLORS[vertical] || T.mutedFg
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color,
      background: color + "15", border: `1px solid ${color}30`,
      padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap" }}>
      {vertical || "—"}
    </span>
  )
}

function StatusDot({ ok, pending, label }: { ok: boolean; pending?: boolean; label: string }) {
  const color = pending ? T.mutedFg : ok ? T.verde600 : T.destructive
  const Icon  = pending ? Clock : ok ? CheckCircle2 : XCircle
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12,
      fontWeight: ok || pending ? 500 : 700, color }}>
      <Icon size={13} color={color} />{label}
    </span>
  )
}

// ─── Date picker com range ────────────────────────────────────────────────────
function calendarDays(year: number, month: number) {
  const first = new Date(year, month, 1).getDay()
  const days  = new Date(year, month + 1, 0).getDate()
  return { first, days }
}

function DatePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen]             = useState(false)
  const [pendingStart, setPStart]   = useState(value.start)
  const [pendingEnd,   setPEnd]     = useState(value.end)
  const [pickStep,     setPickStep] = useState<"start" | "end">("start")
  const [hovered,      setHovered]  = useState<string | null>(null)

  const today = todayKey()
  const [calYear,  setCalYear]  = useState(() => parseInt(today.slice(0, 4)))
  const [calMonth, setCalMonth] = useState(() => parseInt(today.slice(5, 7)) - 1)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  useEffect(() => { setPStart(value.start); setPEnd(value.end) }, [value])

  function handleDayClick(key: string) {
    if (pickStep === "start") {
      setPStart(key); setPEnd(key); setPickStep("end")
    } else {
      if (key >= pendingStart) {
        setPEnd(key); setPickStep("start")
      } else {
        setPStart(key); setPEnd(key); setPickStep("end")
      }
    }
  }

  const apply  = () => { onChange({ start: pendingStart, end: pendingEnd }); setOpen(false); setPickStep("start") }
  const cancel = () => { setPStart(value.start); setPEnd(value.end); setOpen(false); setPickStep("start") }

  const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
  const prevM = calMonth === 0 ? 11 : calMonth - 1
  const prevY = calMonth === 0 ? calYear - 1 : calYear

  function renderCalendar(year: number, month: number) {
    const { first, days } = calendarDays(year, month)
    const cells: (number | null)[] = Array(first).fill(null)
    for (let d = 1; d <= days; d++) cells.push(d)

    let dispStart = pendingStart
    let dispEnd   = pendingEnd
    if (pickStep === "end" && hovered) {
      if (hovered >= pendingStart) dispEnd = hovered
      else { dispStart = hovered; dispEnd = pendingStart }
    }

    return (
      <div>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13, marginBottom: 8, color: T.fg }}>
          {monthNames[month]} {year}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 32px)" }}>
          {["D","S","T","Q","Q","S","S"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700,
              color: T.mutedFg, padding: "2px 0" }}>{d}</div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ width: 32, height: 32 }} />
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            const isFuture = key > today
            const isStart  = key === dispStart
            const isEnd    = key === dispEnd
            const inRange  = key > dispStart && key < dispEnd
            const isSingle = dispStart === dispEnd

            let bg = "transparent"
            let color: string = isFuture ? T.border : T.fg
            let fontWeight = 400
            let borderRadius = "6px"

            if (isStart || isEnd) {
              bg = T.primary; color = "#fff"; fontWeight = 700
              if (isSingle) borderRadius = "6px"
              else if (isStart) borderRadius = "6px 0 0 6px"
              else borderRadius = "0 6px 6px 0"
            } else if (inRange) {
              bg = T.primary + "22"; borderRadius = "0"
            }

            return (
              <button key={i} disabled={isFuture}
                onClick={() => handleDayClick(key)}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                style={{ width: 32, height: 32, borderRadius, border: "none",
                  cursor: isFuture ? "default" : "pointer",
                  background: bg, color, fontWeight, fontSize: 12,
                  transition: "background 0.1s" }}>
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const canGoRight = value.end < today

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center",
        border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden",
        boxShadow: T.elevSm, background: T.card }}>
        <button onClick={() => onChange({ start: offsetKeyFrom(value.start, -1), end: offsetKeyFrom(value.end, -1) })}
          style={{ border: "none", background: "none", padding: "6px 8px", cursor: "pointer", color: T.mutedFg }}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => { setPStart(value.start); setPEnd(value.end); setPickStep("start"); setOpen(o => !o) }}
          style={{ border: "none", borderLeft: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
            background: "none", padding: "6px 14px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, color: T.fg, minWidth: 140,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {fmtRangeLabel(value)}
          <ChevronDown size={11} color={T.mutedFg} />
        </button>
        <button onClick={() => canGoRight && onChange({ start: offsetKeyFrom(value.start, 1), end: offsetKeyFrom(value.end, 1) })}
          style={{ border: "none", background: "none", padding: "6px 8px",
            cursor: canGoRight ? "pointer" : "default",
            color: canGoRight ? T.mutedFg : T.border }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
          boxShadow: T.elevMd, display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex" }}>
            <div style={{ width: 160, padding: "12px 8px", borderRight: `1px solid ${T.border}` }}>
              {PRESETS.map(p => {
                const r = p.range()
                const active = pendingStart === r.start && pendingEnd === r.end
                return (
                  <button key={p.label} onClick={() => { setPStart(r.start); setPEnd(r.end); setPickStep("start") }}
                    style={{ display: "block", width: "100%", textAlign: "left",
                      padding: "7px 10px", border: "none", borderRadius: 6, cursor: "pointer",
                      fontSize: 13, fontWeight: active ? 700 : 400,
                      background: active ? "#EEF3FF" : "transparent",
                      color: active ? T.primary : T.fg }}>
                    {p.label}
                  </button>
                )
              })}
            </div>
            <div style={{ display: "flex", gap: 24, padding: "16px 20px" }} onMouseLeave={() => setHovered(null)}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}
                    style={{ border: "none", background: "none", cursor: "pointer", color: T.mutedFg, padding: "2px 4px" }}>
                    <ChevronLeft size={14} />
                  </button>
                  <span />
                </div>
                {renderCalendar(prevY, prevM)}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 4 }}>
                  <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}
                    style={{ border: "none", background: "none", cursor: "pointer", color: T.mutedFg, padding: "2px 4px" }}>
                    <ChevronRight size={14} />
                  </button>
                </div>
                {renderCalendar(calYear, calMonth)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", borderTop: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, color: T.mutedFg }}>
              {pickStep === "start" ? "Selecione a data inicial" : "Selecione a data final"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancel} style={{ padding: "6px 16px", borderRadius: 6,
                border: `1px solid ${T.border}`, background: "none", cursor: "pointer",
                fontSize: 13, color: T.fg }}>Cancelar</button>
              <button onClick={apply} style={{ padding: "6px 16px", borderRadius: 6,
                border: "none", background: T.primary, color: "#fff",
                cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Atualizar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Log entry type ───────────────────────────────────────────────────────────
interface LogEntry {
  key: string
  total: number
  pipedrive: number
  mia: number
  erros: number
  byVertical: Record<string, { total: number; pipedrive: number; mia: number; erros: number }>
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AuditMQL() {
  const [tab, setTab]               = useState<"leads" | "log" | "sobre">("leads")
  const [range, setRange]           = useState<DateRange>({ start: todayKey(), end: todayKey() })
  const [leads, setLeads]           = useState<LeadRecord[]>([])
  const [loading, setLoading]       = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [log, setLog]               = useState<LogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const [verticalFilter, setVerticalFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter]     = useState<Status | null>(null)
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const [slaData, setSlaData]               = useState<SlaData | null>(null)
  const [recovering, setRecovering]         = useState(false)
  const [recoveryMsg, setRecoveryMsg]       = useState<string | null>(null)

  const isToday = range.start === todayKey() && range.end === todayKey()

  const fetchLog = useCallback(async () => {
    setLogLoading(true)
    try {
      const res = await fetch("/api/growth/audit-mql/summary", { cache: "no-store" })
      if (res.ok) setLog(await res.json())
    } finally { setLogLoading(false) }
  }, [])

  useEffect(() => { if (tab === "log") fetchLog() }, [tab, fetchLog])

  const fetchLeads = useCallback(async (r: DateRange) => {
    setLoading(true)
    try {
      const dates = datesInRange(r.start, r.end)
      const results = await Promise.all(
        dates.map(d =>
          fetch(`/api/growth/audit-mql/leads?date=${d}`, { cache: "no-store" })
            .then(res => res.ok ? res.json() as Promise<LeadRecord[]> : [])
        )
      )
      const merged = results.flat()
      const seen = new Set<string>()
      const deduped = merged.filter(l => { if (seen.has(l.id)) return false; seen.add(l.id); return true })
      deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setLeads(deduped)
      setLastUpdate(new Date())
    } finally { setLoading(false) }
  }, [])

  const runRecovery = useCallback(async () => {
    setRecovering(true)
    setRecoveryMsg(null)
    try {
      const dates = datesInRange(range.start, range.end)
      let total = 0
      for (const date of dates) {
        const res = await fetch("/api/growth/audit-mql/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        })
        if (res.ok) {
          const data = await res.json()
          total += data.recovered || 0
        }
      }
      setRecoveryMsg(total > 0 ? `${total} lead${total !== 1 ? "s" : ""} recuperado${total !== 1 ? "s" : ""}` : "Nenhum lead faltando")
      if (total > 0) fetchLeads(range)
    } catch {
      setRecoveryMsg("Erro na recuperação")
    } finally {
      setRecovering(false)
      setTimeout(() => setRecoveryMsg(null), 5000)
    }
  }, [range, fetchLeads])

  useEffect(() => {
    fetchLeads(range)
    if (!isToday) return
    const interval = setInterval(() => fetchLeads(range), 30_000)
    return () => clearInterval(interval)
  }, [range, fetchLeads, isToday])

  useEffect(() => {
    fetch("/api/sla-mql", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rows) setSlaData(d) })
      .catch(() => {})
  }, [])

  const total      = leads.length
  const ok         = leads.filter(l => l.status === "ok").length
  const aguardando = leads.filter(l => l.status === "aguardando").length
  const semMia     = leads.filter(l => l.status === "sem_mia").length
  const semPipe    = leads.filter(l => l.status === "sem_pipedrive").length
  const foraSla    = leads.filter(l => l.status === "fora_sla").length

  const byVertical = leads.reduce((acc, l) => {
    const v = l.vertical || "—"
    if (!acc[v]) acc[v] = { total: 0, pipe: 0, ok: 0, semPipe: 0, semMia: 0 }
    acc[v].total++
    if (l.status !== "sem_pipedrive") acc[v].pipe++
    if (l.status === "ok")            acc[v].ok++
    if (l.status === "sem_pipedrive") acc[v].semPipe++
    if (l.status === "sem_mia")       acc[v].semMia++
    return acc
  }, {} as Record<string, { total: number; pipe: number; ok: number; semPipe: number; semMia: number }>)

  const visibleLeads = leads.filter(l => {
    if (verticalFilter && (l.vertical || "—") !== verticalFilter) return false
    if (statusFilter && l.status !== statusFilter) return false
    return true
  })

  // Anota form_values de um lead fora_sla com status de aprovação por critério SLA
  function annotateSla(formValues: string[], vertical: string): Array<{ val: string; ok: boolean | null }> {
    if (!slaData) return formValues.map(val => ({ val, ok: null }))
    const slaV = vertical === "Investimentos" ? "SZI" : vertical
    const allRows = slaData.rows.filter(r => r.vertical === slaV)
    const activeRows = allRows.filter(r => r.status)
    if (!activeRows.length) return formValues.map(val => ({ val, ok: null }))

    const allAccepted = new Set([
      ...activeRows.flatMap(r => r.mql_intencoes),
      ...activeRows.flatMap(r => r.mql_faixas),
      ...activeRows.flatMap(r => r.mql_pagamentos),
    ])
    const allSlaValues = new Set([
      ...allRows.flatMap(r => r.mql_intencoes),
      ...allRows.flatMap(r => r.mql_faixas),
      ...allRows.flatMap(r => r.mql_pagamentos),
    ])

    return formValues.map(val => {
      if (!allSlaValues.has(val)) return { val, ok: null }   // não é critério SLA
      return { val, ok: allAccepted.has(val) }
    })
  }

  return (
    <div style={{ fontFamily: T.font, background: T.bg, minHeight: "100vh", padding: "24px 32px", color: T.fg }}>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Link href="/" style={{ color: T.mutedFg, textDecoration: "none", fontSize: 13,
          display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={14} /> Início
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ShieldAlert size={22} color={T.destructive} />
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Audit MQL</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastUpdate && !loading && tab === "leads" && (
            <span style={{ fontSize: 12, color: T.mutedFg }}>{fmtTime(lastUpdate.toISOString())}</span>
          )}
          <button onClick={() => tab === "leads" ? fetchLeads(range) : fetchLog()}
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6,
              padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, color: T.mutedFg }}>
            <RefreshCw size={13} />
          </button>
          {tab === "leads" && (
            <button onClick={runRecovery} disabled={recovering}
              title="Busca leads direto na Meta API e salva os que estão faltando"
              style={{ background: recovering ? T.muted : "none",
                border: `1px solid ${recoveryMsg?.includes("recuperado") ? T.verde600 : T.border}`,
                borderRadius: 6, padding: "5px 10px", cursor: recovering ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                color: recoveryMsg?.includes("recuperado") ? T.verde600 : T.mutedFg,
                whiteSpace: "nowrap" }}>
              {recovering ? "Recuperando…" : recoveryMsg || "Recuperar leads"}
            </button>
          )}
          {tab === "leads" && <DatePicker value={range} onChange={r => { setRange(r); setVerticalFilter(null) }} />}
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
        {(["leads", "log", "sobre"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", border: "none", background: "none", cursor: "pointer",
            fontSize: 13, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? T.primary : T.mutedFg,
            borderBottom: tab === t ? `2px solid ${T.primary}` : "2px solid transparent",
            marginBottom: -1,
          }}>{t === "leads" ? "Leads" : t === "log" ? "Log Diário" : "Sobre"}</button>
        ))}
      </div>

      {/* ── ABA LOG ─────────────────────────────────────────────────────────── */}
      {tab === "log" && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: T.elevSm, overflowX: "auto" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600 }}>
            Histórico diário
          </div>
          {logLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: T.mutedFg }}>Carregando…</div>
          ) : log.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: T.mutedFg }}>
              Nenhum registro ainda. O log é gerado automaticamente às 08h.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.muted }}>
                  {["Data", "Leads", "Pipedrive", "MIA", "Erros", "Por vertical"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10,
                      fontWeight: 700, color: T.mutedFg, textTransform: "uppercase",
                      letterSpacing: "0.07em", whiteSpace: "nowrap",
                      borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map(entry => {
                  const [y, m, d] = entry.key.split("-")
                  const hasError = entry.erros > 0
                  return (
                    <tr key={entry.key} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>{d}/{m}/{y}</td>
                      <td style={{ padding: "10px 14px", fontVariantNumeric: "tabular-nums" }}>{entry.total}</td>
                      <td style={{ padding: "10px 14px", color: T.verde600, fontWeight: 600 }}>
                        {entry.pipedrive}/{entry.total}
                        <span style={{ color: T.mutedFg, fontWeight: 400, fontSize: 11, marginLeft: 4 }}>
                          ({entry.total > 0 ? Math.round(entry.pipedrive / entry.total * 100) : 0}%)
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: T.verde600, fontWeight: 600 }}>
                        {entry.mia}/{entry.total}
                        <span style={{ color: T.mutedFg, fontWeight: 400, fontSize: 11, marginLeft: 4 }}>
                          ({entry.total > 0 ? Math.round(entry.mia / entry.total * 100) : 0}%)
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {hasError
                          ? <span style={{ color: T.destructive, fontWeight: 700 }}>{entry.erros} ⚠️</span>
                          : <span style={{ color: T.verde600 }}>0 ✅</span>}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {Object.entries(entry.byVertical).sort((a, b) => b[1].total - a[1].total).map(([v, g]) => (
                            <span key={v} style={{ fontSize: 11, color: VERTICAL_COLORS[v] || T.mutedFg,
                              background: (VERTICAL_COLORS[v] || T.mutedFg) + "15",
                              border: `1px solid ${(VERTICAL_COLORS[v] || T.mutedFg)}30`,
                              padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
                              {v}: {g.mia}/{g.total}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ABA LEADS ────────────────────────────────────────────────────────── */}
      {tab === "leads" && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Leads",         value: total,      color: T.fg,          status: null             as Status | null },
            { label: "OK",            value: ok,         color: T.verde600,    status: "ok"             as Status | null },
            { label: "Aguardando",    value: aguardando, color: T.primary,     status: "aguardando"     as Status | null },
            { label: "Sem MIA",       value: semMia,     color: T.laranja500,  status: "sem_mia"        as Status | null },
            { label: "Sem Pipedrive", value: semPipe,    color: T.destructive, status: "sem_pipedrive"  as Status | null },
            { label: "Fora SLA",      value: foraSla,    color: "#9333EA",     status: "fora_sla"       as Status | null },
          ].map(c => {
            const active = statusFilter === c.status && c.status !== null
            return (
              <div key={c.label}
                onClick={() => c.status ? setStatusFilter(active ? null : c.status) : setStatusFilter(null)}
                style={{ background: active ? c.color + "12" : T.card,
                  border: `1px solid ${active ? c.color : T.border}`,
                  borderRadius: 10, padding: "12px 16px", boxShadow: T.elevSm,
                  cursor: c.status ? "pointer" : "default",
                  transition: "border-color 0.15s, background 0.15s" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.mutedFg,
                  textTransform: "uppercase", letterSpacing: "0.07em" }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: c.color, marginTop: 4,
                  fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
              </div>
            )
          })}
        </div>
        {statusFilter && (
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: T.mutedFg }}>Filtro ativo:</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_META[statusFilter].color,
              border: `1px solid ${STATUS_META[statusFilter].color}55`,
              padding: "2px 8px", borderRadius: 4 }}>{STATUS_META[statusFilter].label}</span>
            <button onClick={() => setStatusFilter(null)}
              style={{ background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: T.mutedFg, padding: 0 }}>× limpar</button>
          </div>
        )}

        {Object.keys(byVertical).length > 0 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            {Object.entries(byVertical).sort((a, b) => b[1].total - a[1].total).map(([v, g]) => {
              const active = verticalFilter === v
              const color  = VERTICAL_COLORS[v] || T.mutedFg
              return (
                <button key={v} onClick={() => setVerticalFilter(active ? null : v)}
                  style={{ background: T.card,
                    border: active ? `2px solid ${color}` : `1px solid ${T.border}`,
                    borderRadius: 10, padding: active ? "9px 13px" : "10px 14px",
                    boxShadow: active ? `0 0 0 3px ${color}22` : T.elevSm,
                    minWidth: 148, cursor: "pointer", textAlign: "left" }}>
                  <VerticalBadge vertical={v} />
                  <div style={{ marginTop: 6, fontSize: 12, color: T.mutedFg, lineHeight: 1.7 }}>
                    <div style={{ color: T.fg, fontWeight: 600 }}>{g.total} lead{g.total !== 1 ? "s" : ""}</div>
                    <div>Pipedrive: <strong style={{ color: T.verde600 }}>{g.pipe}</strong></div>
                    <div>MIA: <strong style={{ color: T.verde600 }}>{g.ok}</strong></div>
                    {g.semMia  > 0 && <div style={{ color: T.laranja500 }}>⚠ Sem MIA: {g.semMia}</div>}
                    {g.semPipe > 0 && <div style={{ color: T.destructive }}>✕ Sem Pipe: {g.semPipe}</div>}
                  </div>
                </button>
              )
            })}
            {verticalFilter && (
              <button onClick={() => setVerticalFilter(null)}
                style={{ alignSelf: "center", background: "none", border: `1px solid ${T.border}`,
                  borderRadius: 6, padding: "5px 12px", cursor: "pointer",
                  fontSize: 12, color: T.mutedFg }}>
                Limpar filtro ×
              </button>
            )}
          </div>
        )}

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
          boxShadow: T.elevSm, overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Leads — {fmtRangeLabel(range)}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isToday && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.verde600,
                    animation: "pulse 2s infinite" }} />
                  <span style={{ fontSize: 12, color: T.mutedFg }}>ao vivo · 30s</span>
                </div>
              )}
              {visibleLeads.length > 0 && (
                <button
                  onClick={() => {
                    const allFieldNames = Array.from(new Set(
                      visibleLeads.flatMap(l => (l.form_fields || []).map(f => f.name))
                    ))
                    const headers = ["Data", "Horário", "Nome", "E-mail", "Telefone", "Vertical", "Campanha", "Status",
                      ...allFieldNames.map(fieldLabel)]
                    const rows = visibleLeads.map(l => {
                      const fm = Object.fromEntries((l.form_fields || []).map(f => [f.name, f.value]))
                      const dt = new Date(l.created_at)
                      return [
                        dt.toLocaleDateString("pt-BR", { timeZone: BRT }),
                        dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BRT }),
                        l.name, l.email, l.phone, l.vertical || "", l.campaign_name || "",
                        STATUS_META[l.status]?.label || l.status,
                        ...allFieldNames.map(n => fm[n] || ""),
                      ]
                    })
                    const csv = [headers, ...rows]
                      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
                      .join("\n")
                    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `audit-mql-${range.start}${range.start !== range.end ? "_" + range.end : ""}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12,
                    color: T.mutedFg, background: "none", border: `1px solid ${T.border}`,
                    borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                  ↓ CSV
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: T.mutedFg }}>Carregando…</div>
          ) : visibleLeads.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: T.mutedFg }}>
              <AlertTriangle size={32} color={T.border} style={{ display: "block", margin: "0 auto 12px" }} />
              {leads.length === 0
                ? `Nenhum lead em ${fmtRangeLabel(range)}.`
                : `Nenhum lead da vertical "${verticalFilter}" no período.`}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.muted }}>
                  {["Data/Horário", "Lead", "Vertical", "Campanha", "Meta", "Pipedrive", "MIA", "Status"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10,
                      fontWeight: 700, color: T.mutedFg, textTransform: "uppercase",
                      letterSpacing: "0.07em", whiteSpace: "nowrap",
                      borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map(lead => {
                  const st = STATUS_META[lead.status]
                  const isPending  = lead.status === "aguardando"
                  const isForaSla  = lead.status === "fora_sla"
                  const isExpanded = expandedId === lead.id
                  const hasFormValues = lead.form_values && lead.form_values.length > 0

                  return (
                    <>
                      <tr key={lead.id}
                        onClick={() => hasFormValues ? setExpandedId(isExpanded ? null : lead.id) : undefined}
                        style={{ borderBottom: isExpanded ? "none" : `1px solid ${T.border}`,
                          background: st.bg, cursor: hasFormValues ? "pointer" : "default",
                          transition: "filter 0.1s" }}>
                        <td style={{ padding: "10px 14px", color: T.mutedFg, fontSize: 12, whiteSpace: "nowrap" }}>
                          {(() => { const { date, time } = fmtDateTime(lead.created_at); return <><div>{date}</div><div>{time}</div></> })()}
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            {lead.name || <span style={{ color: T.mutedFg }}>—</span>}
                            {hasFormValues && (
                              <ChevronDown size={13} color={T.mutedFg}
                                style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: T.mutedFg }}>{lead.email}</div>
                          {lead.phone && <div style={{ fontSize: 11, color: T.mutedFg }}>{lead.phone}</div>}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <VerticalBadge vertical={lead.vertical || "—"} />
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: T.mutedFg,
                          whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {lead.campaign_name || "—"}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <StatusDot ok={true} label="Gerado" />
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {isForaSla
                            ? <span style={{ color: T.mutedFg, fontSize: 12 }}>—</span>
                            : isPending
                              ? <StatusDot ok={false} pending label="Verificando…" />
                              : lead.pipedrive_deal_id
                                ? <a href={`https://seazone-fd92b9.pipedrive.com/deal/${lead.pipedrive_deal_id}`}
                                    target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    style={{ color: T.verde600, fontSize: 12, fontWeight: 600,
                                      textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <CheckCircle2 size={13} /> #{lead.pipedrive_deal_id}
                                  </a>
                                : <StatusDot ok={false} label="Não encontrado" />}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {isForaSla
                            ? <span style={{ color: T.mutedFg, fontSize: 12 }}>—</span>
                            : isPending
                              ? <StatusDot ok={false} pending label="Verificando…" />
                              : lead.mia_link
                                ? <a href={lead.mia_link} target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    style={{ color: T.verde600, fontSize: 12, fontWeight: 600,
                                      textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <CheckCircle2 size={13} /> Conversa
                                  </a>
                                : lead.status === "sem_mia"
                                  ? <StatusDot ok={false} label="Sem conversa" />
                                  : lead.status === "sem_pipedrive"
                                    ? <span style={{ color: T.mutedFg, fontSize: 12 }}>—</span>
                                    : <StatusDot ok={false} pending label="Verificando…" />}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ color: st.color, border: `1px solid ${st.color}55`,
                            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            whiteSpace: "nowrap" }}>{st.label}</span>
                        </td>
                      </tr>

                      {/* Detalhe expandido — respostas do formulário */}
                      {isExpanded && hasFormValues && (
                        <tr key={`${lead.id}-detail`} style={{ background: st.bg, borderBottom: `1px solid ${T.border}` }}>
                          <td colSpan={8} style={{ padding: "0 14px 14px 14px" }}>
                            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 0 }}>
                              {isForaSla && (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
                                  background: "#FDF4FF", border: "1px solid #9333EA55",
                                  borderRadius: 6, padding: "5px 10px", marginBottom: 10, fontSize: 12 }}>
                                  <span style={{ color: "#9333EA", fontWeight: 700 }}>⚠ Fora do SLA</span>
                                  <span style={{ color: T.mutedFg }}>— respostas não se encaixam em nenhum empreendimento ativo</span>
                                </div>
                              )}
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.mutedFg,
                                textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                                Respostas do formulário
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {lead.form_fields?.length
                                  ? (() => {
                                      const annotations = annotateSla(lead.form_fields.map(f => f.value), lead.vertical || "")
                                      return lead.form_fields.map((f, i) => {
                                        const { ok: valOk } = annotations[i]
                                        return (
                                          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                            <span style={{ fontSize: 11, color: T.mutedFg, minWidth: 120, flexShrink: 0 }}>
                                              {fieldLabel(f.name)}
                                            </span>
                                            <span style={{
                                              fontSize: 12, padding: "2px 8px", borderRadius: 4,
                                              background: valOk === false ? "#FEF2F2"
                                                        : valOk === true  ? "#F0FDF4"
                                                        : T.muted,
                                              border: `1px solid ${valOk === false ? T.destructive + "44"
                                                                 : valOk === true  ? T.verde600 + "44"
                                                                 : T.border}`,
                                              color: valOk === false ? T.destructive
                                                   : valOk === true  ? T.verde600
                                                   : T.fg,
                                              fontWeight: valOk === false ? 700 : 400,
                                            }}>{f.value}</span>
                                          </div>
                                        )
                                      })
                                    })()
                                  : annotateSla(lead.form_values!, lead.vertical || "").map(({ val, ok: valOk }, i) => (
                                      <span key={i} style={{
                                        fontSize: 12, padding: "2px 8px", borderRadius: 4,
                                        background: valOk === false ? "#FEF2F2" : valOk === true ? "#F0FDF4" : T.muted,
                                        border: `1px solid ${valOk === false ? T.destructive + "44" : valOk === true ? T.verde600 + "44" : T.border}`,
                                        color: valOk === false ? T.destructive : valOk === true ? T.verde600 : T.fg,
                                        fontWeight: valOk === false ? 700 : 400,
                                      }}>{val}</span>
                                    ))
                                }
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ marginTop: 12, fontSize: 11, color: T.mutedFg }}>
          Verificação automática 2 min após chegada. Resumo diário às 08h no canal #avaliação-diaria-mql.
        </p>
      </>}

      {/* ── ABA SOBRE ────────────────────────────────────────────────────────── */}
      {tab === "sobre" && (
        <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Alerta token expirando — dinâmico */}
          {(() => {
            const daysLeft = Math.ceil((META_TOKEN_EXPIRES.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            if (daysLeft > 30) return null
            const critical = daysLeft <= 5
            const expired  = daysLeft <= 0
            const bg    = expired || critical ? "#FEF2F2" : "#FFF7ED"
            const color = expired || critical ? T.destructive : T.laranja500
            const icon  = expired ? "🚨" : critical ? "🚨" : "⚠️"
            const title = expired
              ? "Token Meta EXPIRADO — sistema parado!"
              : critical
                ? `Token Meta expira em ${daysLeft} dia${daysLeft !== 1 ? "s" : ""}! Ação urgente`
                : `Token Meta expira em ${daysLeft} dias (05/05/2026)`
            return (
              <div style={{ background: bg, border: `1px solid ${color}55`, borderRadius: 10, padding: "14px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: T.mutedFg, lineHeight: 1.6 }}>
                    O <strong>META_ADS_TOKEN</strong> é usado por <strong>saleszone</strong> (audit-mql, campanhas, recovery) e <strong>artefatos-growth</strong> (gestão de campanhas, criativos, alocação, pausar anúncios). Quando expira, ambos os projetos param de funcionar. Ver passo a passo de renovação abaixo.
                  </div>
                </div>
              </div>
            )
          })()}

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>O que é o Audit MQL</h2>
            <p style={{ margin: 0, fontSize: 13, color: T.mutedFg, lineHeight: 1.7 }}>
              Sistema de monitoramento em tempo real que rastreia cada lead gerado pelos formulários do Meta Ads (Lead Gen) da Seazone e verifica se foi processado corretamente — passando pelo CRM Pipedrive e pelo atendimento via Morada IA (MIA). Inclui verificação de SLA (se o lead atende aos critérios dos empreendimentos ativos) e recovery automático de leads perdidos.
            </p>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Como funciona</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { step: "1", title: "Lead gerado no Meta Ads", desc: "Quando alguém preenche um formulário Lead Gen, o Meta envia os dados em tempo real via webhook para este sistema. Páginas inscritas: Seazone, Seazone Marketplace, Seazone Investimentos, Anfitrião Seazone, Vistas de Anitá, Seazone Rentals." },
                { step: "2", title: "Registro imediato", desc: "O lead é registrado com status \"Aguardando\" e aparece na tabela em até segundos. Atualiza automaticamente a cada 30s enquanto você está no dia de hoje." },
                { step: "3", title: "Verificação no Pipedrive (7 min depois)", desc: "Após 7 minutos (aguarda índice de busca do Pipedrive), o sistema busca a pessoa por e-mail e telefone. Se não encontrar deal, classifica como \"Sem Pipedrive\" e envia alerta no Slack." },
                { step: "4", title: "Verificação SLA", desc: "Se o deal existe, verifica se as respostas do formulário atendem aos critérios SLA de pelo menos um empreendimento ativo. Se não atendem, classifica como \"Fora SLA\". Clique na linha para ver quais respostas causaram a reprovação." },
                { step: "5", title: "Verificação da Morada IA", desc: "Se passou no SLA, verifica se o campo \"Link da Conversa\" foi preenchido pela Morada IA. Se vazio, classifica como \"Sem MIA\" e envia alerta. Re-verifica a cada request por até 4h desde a criação do lead." },
                { step: "6", title: "Status final OK", desc: "Lead com deal no Pipedrive, dentro do SLA e com conversa MIA preenchida." },
                { step: "7", title: "Recovery automático (a cada 30 min)", desc: "Um cron roda a cada 30 minutos buscando leads diretamente na Meta API. Leads que chegaram no Meta mas falharam no webhook são recuperados automaticamente e já entram na fila de verificação Pipedrive/SLA/MIA." },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ display: "flex", gap: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.primary,
                    color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>{step}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: T.mutedFg, lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Status dos leads</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "AGUARDANDO",    color: T.primary,    desc: "Lead recém-chegado. Aguardando 7 minutos para verificação no Pipedrive (tempo necessário para o índice de busca do Pipedrive indexar o novo deal)." },
                { label: "OK",            color: T.verde600,   desc: "Lead encontrado no Pipedrive, dentro do SLA e com conversa MIA preenchida." },
                { label: "SEM MIA",       color: T.laranja500, desc: "Deal existe no Pipedrive, mas o campo \"Link da Conversa\" não foi preenchido pela Morada IA. Alerta enviado no Slack. Re-verificado por até 4h." },
                { label: "SEM PIPEDRIVE", color: T.destructive,desc: "Lead não encontrado no Pipedrive 7 minutos após o registro. Alerta enviado no Slack." },
                { label: "FORA SLA",      color: "#9333EA",    desc: "Lead tem deal e MIA, mas as respostas do formulário não atendem aos critérios SLA de nenhum empreendimento ativo. Clique na linha para ver as respostas destacadas." },
              ].map(({ label, color, desc }) => (
                <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color,
                    border: `1px solid ${color}55`, padding: "2px 8px", borderRadius: 4,
                    whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 12, color: T.mutedFg, lineHeight: 1.6, paddingTop: 2 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Como renovar o META_ADS_TOKEN</h2>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: T.mutedFg, lineHeight: 1.6 }}>
              Afeta <strong>saleszone</strong> e <strong>artefatos-growth</strong> — atualizar nos dois.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { step: "1", title: "Acesse Meta Business Manager", desc: "business.facebook.com → entre com a conta da Seazone" },
                { step: "2", title: "Vá em Usuários do Sistema", desc: "Configurações (ícone engrenagem) → Usuários do sistema → selecione o usuário que tem o token atual" },
                { step: "3", title: "Gere novo token", desc: "Clique em \"Gerar novo token\" → selecione o App (Meta app que recebe os webhooks) → marque as permissões: leads_retrieval, pages_manage_ads, pages_read_engagement, ads_read, ads_management → defina expiração como 60 dias → copie o token gerado" },
                { step: "4", title: "Atualize no Vercel — saleszone", desc: "vercel.com → projeto saleszone → Settings → Environment Variables → META_ADS_TOKEN → editar valor → salvar → fazer redeploy (ou aguardar próximo push)" },
                { step: "5", title: "Atualize no Vercel — artefatos-growth", desc: "vercel.com → projeto artefatos-growth-seazone → Settings → Environment Variables → META_ADS_TOKEN → editar valor → salvar → redeploy" },
                { step: "6", title: "Atualize a data de expiração no código", desc: "Em saleszone/src/app/growth/audit-mql/page.tsx, linha com META_TOKEN_EXPIRES → altere para a nova data de expiração (disponível no Meta Business Manager após gerar o token)" },
                { step: "7", title: "Verifique", desc: "Acesse saleszone.vercel.app/growth/audit-mql → aba Sobre → o alerta deve sumir. Teste também uma busca no artefatos-growth para confirmar que as campanhas carregam." },
              ].map(({ step, title, desc }) => (
                <div key={step} style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: T.mutedFg,
                    color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>{step}</div>
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 1 }}>{title}</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Credenciais e validade</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  name: "META_ADS_TOKEN",
                  type: "System User Token (Meta Business Manager)",
                  expires: "05/05/2026 ⚠️",
                  expiresColor: T.laranja500,
                  where: "Meta Business Manager → Configurações → Usuários do sistema → Gerar novo token",
                  update: "Vercel → saleszone → Settings → Environment Variables",
                },
                {
                  name: "META_WEBHOOK_VERIFY_TOKEN",
                  type: "String estática: \"audit_mql_seazone\"",
                  expires: "Não expira",
                  expiresColor: T.verde600,
                  where: "Configurado no Meta for Developers → App → Webhooks",
                  update: "Não precisa atualizar",
                },
                {
                  name: "PIPEDRIVE_API_TOKEN",
                  type: "API Token de conta de usuário Pipedrive",
                  expires: "Não expira (revogado apenas se o usuário for desativado)",
                  expiresColor: T.verde600,
                  where: "Pipedrive → Configurações → Pessoal → API",
                  update: "Vercel → saleszone → Settings → Environment Variables",
                },
                {
                  name: "SLACK_WEBHOOK_AUDIT_MQL",
                  type: "Incoming Webhook URL do Slack",
                  expires: "Não expira (revogado apenas se o app Slack for deletado)",
                  expiresColor: T.verde600,
                  where: "Slack API → Your Apps → Incoming Webhooks",
                  update: "Vercel → saleszone → Settings → Environment Variables",
                },
                {
                  name: "CRON_SECRET",
                  type: "String aleatória para autenticar chamadas internas de cron",
                  expires: "Não expira (rotação manual se necessário)",
                  expiresColor: T.verde600,
                  where: "Gerado manualmente",
                  update: "Vercel → saleszone → Env Variables + GitHub → seazone-socios/saleszone → Settings → Secrets",
                },
              ].map(({ name, type, expires, expiresColor, where, update }) => (
                <div key={name} style={{ background: T.muted, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <code style={{ fontSize: 12, fontWeight: 700, background: T.border, padding: "2px 6px", borderRadius: 3 }}>{name}</code>
                    <span style={{ fontSize: 11, fontWeight: 700, color: expiresColor }}>{expires}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                    <div><strong>Tipo:</strong> {type}</div>
                    <div><strong>Onde renovar:</strong> {where}</div>
                    <div><strong>Onde atualizar:</strong> {update}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Webhook Meta — configuração</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: T.mutedFg, lineHeight: 1.7 }}>
              <div><strong style={{ color: T.fg }}>URL:</strong> <code>https://saleszone.vercel.app/api/growth/audit-mql/webhook</code></div>
              <div><strong style={{ color: T.fg }}>Verify Token:</strong> <code>audit_mql_seazone</code></div>
              <div><strong style={{ color: T.fg }}>Evento:</strong> <code>leadgen</code></div>
              <div><strong style={{ color: T.fg }}>Páginas inscritas (6):</strong> Seazone, Seazone Marketplace, Seazone Investimentos, Anfitrião Seazone, Vistas de Anitá, Seazone Rentals</div>
              <div><strong style={{ color: T.fg }}>Para adicionar página:</strong> Meta for Developers → seu App → Webhooks → Leadgen → assinar a página nova</div>
              <div><strong style={{ color: T.fg }}>Para alterar URL:</strong> Meta for Developers → seu App → Webhooks → editar endpoint (afeta todas as páginas inscritas)</div>
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Integrações</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { name: "Meta Ads (Lead Gen)", desc: "Webhook em tempo real + recovery a cada 30min via Meta Graph API. 6 páginas inscritas." },
                { name: "Pipedrive", desc: "Busca person por e-mail e telefone (com fallback sem código de país). Verifica deal e campo MIA." },
                { name: "Morada IA", desc: "Verifica campo \"Link da Conversa\" no deal do Pipedrive. Re-verifica por até 4h se ainda vazio." },
                { name: "Slack (#avaliação-diaria-mql)", desc: "Alertas individuais por lead problemático + resumo diário às 08h BRT." },
              ].map(({ name, desc }) => (
                <div key={name} style={{ background: T.muted, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{name}</div>
                  <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
