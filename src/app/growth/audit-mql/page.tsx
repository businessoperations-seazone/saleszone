"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import { ShieldAlert, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, ChevronDown } from "lucide-react"
import type { LeadRecord } from "@/lib/audit-mql"

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
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
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
  const [recovering, setRecovering]         = useState(false)
  const [recoveryMsg, setRecoveryMsg]       = useState<string | null>(null)
  const [sending, setSending]               = useState(false)
  const [sendMsg, setSendMsg]               = useState<string | null>(null)
  const [sendDate, setSendDate]             = useState<string>(() => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })

  const isToday = range.start === todayKey() && range.end === todayKey()

  const fetchLog = useCallback(async () => {
    setLogLoading(true)
    try {
      const res = await fetch("/api/growth/audit-mql/summary", { cache: "no-store" })
      if (res.ok) setLog(await res.json())
    } finally { setLogLoading(false) }
  }, [])

  const sendSummary = useCallback(async () => {
    setSending(true)
    setSendMsg(null)
    try {
      const res = await fetch(`/api/growth/audit-mql/summary?date=${sendDate}`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setSendMsg(`Erro: ${data.error || res.status}`); return }
      if (data.message) { setSendMsg(data.message); return }
      setSendMsg(`Enviado! ${data.total} leads — Pipedrive: ${data.pipedrive} | MIA: ${data.mia} | Erros: ${data.erros}`)
      fetchLog()
    } catch (e) {
      setSendMsg(`Erro: ${e}`)
    } finally { setSending(false) }
  }, [sendDate, fetchLog])

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

  const total      = leads.length
  const ok         = leads.filter(l => l.status === "ok").length
  const aguardando = leads.filter(l => l.status === "aguardando").length
  const semMia     = leads.filter(l => l.status === "sem_mia").length
  const semPipe    = leads.filter(l => l.status === "sem_pipedrive").length

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

  const visibleLeads = verticalFilter
    ? leads.filter(l => (l.vertical || "—") === verticalFilter)
    : leads

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
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>Histórico diário</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <input
                type="date"
                value={sendDate}
                onChange={e => setSendDate(e.target.value)}
                style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.muted, color: T.fg }}
              />
              <button
                onClick={sendSummary}
                disabled={sending}
                style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`,
                  background: sending ? T.muted : T.primary, color: "#fff", cursor: sending ? "not-allowed" : "pointer",
                  fontWeight: 600, opacity: sending ? 0.6 : 1 }}>
                {sending ? "Enviando…" : "Reenviar resumo"}
              </button>
              {sendMsg && (
                <span style={{ fontSize: 11, color: sendMsg.startsWith("Erro") ? T.destructive : T.verde600, maxWidth: 260 }}>
                  {sendMsg}
                </span>
              )}
            </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Leads",         value: total,      color: T.fg          },
            { label: "OK",            value: ok,         color: T.verde600    },
            { label: "Aguardando",    value: aguardando, color: T.primary     },
            { label: "Sem MIA",       value: semMia,     color: T.laranja500  },
            { label: "Sem Pipedrive", value: semPipe,    color: T.destructive },
          ].map(c => (
            <div key={c.label} style={{ background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 10, padding: "12px 16px", boxShadow: T.elevSm }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.mutedFg,
                textTransform: "uppercase", letterSpacing: "0.07em" }}>{c.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: c.color, marginTop: 4,
                fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
            </div>
          ))}
        </div>

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
            {isToday && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.verde600,
                  animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 12, color: T.mutedFg }}>ao vivo · 30s</span>
              </div>
            )}
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
                  const isPending = lead.status === "aguardando"
                  return (
                    <tr key={lead.id} style={{ borderBottom: `1px solid ${T.border}`, background: st.bg }}>
                      <td style={{ padding: "10px 14px", color: T.mutedFg, fontSize: 12, whiteSpace: "nowrap" }}>
                        {(() => { const { date, time } = fmtDateTime(lead.created_at); return <><div>{date}</div><div>{time}</div></> })()}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600 }}>{lead.name || <span style={{ color: T.mutedFg }}>—</span>}</div>
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
                        {isPending
                          ? <StatusDot ok={false} pending label="Verificando…" />
                          : lead.pipedrive_deal_id
                            ? <a href={`https://seazone-fd92b9.pipedrive.com/deal/${lead.pipedrive_deal_id}`}
                                target="_blank" rel="noreferrer"
                                style={{ color: T.verde600, fontSize: 12, fontWeight: 600,
                                  textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <CheckCircle2 size={13} /> #{lead.pipedrive_deal_id}
                              </a>
                            : <StatusDot ok={false} label="Não encontrado" />}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {isPending
                          ? <StatusDot ok={false} pending label="Verificando…" />
                          : lead.mia_link
                            ? <a href={lead.mia_link} target="_blank" rel="noreferrer"
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
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>O que é o Audit MQL</h2>
            <p style={{ margin: 0, fontSize: 13, color: T.mutedFg, lineHeight: 1.7 }}>
              Sistema de monitoramento em tempo real que rastreia cada lead gerado pelos formulários do Meta Ads (Lead Gen) da Seazone e verifica se foi processado corretamente — passando pelo CRM Pipedrive e pelo atendimento via Morada IA (MIA).
            </p>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Como funciona</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { step: "1", title: "Lead gerado no Meta Ads", desc: "Quando alguém preenche um formulário de Lead Gen, o Meta envia os dados em tempo real via webhook para este sistema." },
                { step: "2", title: "Registro imediato", desc: "O lead é registrado com status \"Aguardando\" e aparece na tabela em até segundos. Atualiza automaticamente a cada 30s enquanto você está no dia de hoje." },
                { step: "3", title: "Verificação no Pipedrive (2 min depois)", desc: "Após 2 minutos, o sistema busca a pessoa no Pipedrive pelo e-mail e telefone. Se não encontrar deal, classifica como \"Sem Pipedrive\" e envia alerta no Slack." },
                { step: "4", title: "Verificação da Morada IA", desc: "Se o deal existe, o sistema verifica se o campo \"Link da Conversa\" foi preenchido pela Morada IA. Se vazio, classifica como \"Sem MIA\" e envia alerta." },
                { step: "5", title: "Status final OK", desc: "Se tudo certo — deal no Pipedrive e link da conversa preenchido — o lead vira \"OK\"." },
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
                { label: "AGUARDANDO",    color: T.primary,    desc: "Lead recém-chegado. Aguardando 2 minutos para verificação no Pipedrive." },
                { label: "OK",            color: T.verde600,   desc: "Lead encontrado no Pipedrive com deal e atendido pela Morada IA." },
                { label: "SEM MIA",       color: T.laranja500, desc: "Deal existe no Pipedrive, mas o campo \"Link da Conversa\" não foi preenchido. Alerta enviado no Slack." },
                { label: "SEM PIPEDRIVE", color: T.destructive,desc: "Lead não encontrado no Pipedrive 2 minutos após o registro. Alerta enviado no Slack." },
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
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Verticais monitoradas</h2>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: T.mutedFg, lineHeight: 1.6 }}>
              A vertical é extraída automaticamente do nome da campanha no Meta Ads com base nas tags padronizadas:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { vertical: "Investimentos", tags: "[SI], [SZI], INVESTIMENTO" },
                { vertical: "Serviços",      tags: "[SS], [SZS], SERVI" },
                { vertical: "Marketplace",   tags: "[MKTPLACE], [MKT], MARKETPLACE" },
                { vertical: "Hóspedes",      tags: "[SH], HOSPEDE, HÓSPEDE" },
              ].map(({ vertical, tags }) => (
                <div key={vertical} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <VerticalBadge vertical={vertical} />
                  <span style={{ fontSize: 12, color: T.mutedFg }}>{tags}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>Resumo diário e alertas</h2>
            <div style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.8 }}>
              <p style={{ margin: "0 0 8px" }}>
                <strong style={{ color: T.fg }}>Alertas em tempo real</strong> — Quando um lead fica sem Pipedrive ou sem MIA, uma notificação é enviada imediatamente no canal <strong style={{ color: T.fg }}>#avaliação-diaria-mql</strong> no Slack com nome, vertical, campanha e link do deal.
              </p>
              <p style={{ margin: "0 0 8px" }}>
                <strong style={{ color: T.fg }}>Resumo diário às 08h</strong> — Todo dia às 08h00 (BRT), o sistema envia um compilado do dia anterior com total de leads, taxa de chegada no Pipedrive, taxa de atendimento pela MIA e breakdown por vertical.
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: T.fg }}>Log Diário</strong> — A aba &ldquo;Log Diário&rdquo; desta ferramenta mantém o histórico dos últimos 90 dias com as mesmas métricas.
              </p>
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Integrações</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { name: "Meta Ads (Lead Gen)",   desc: "Recebe leads via webhook em tempo real. Páginas subscritas: Seazone, Seazone Marketplace, Seazone Investimentos." },
                { name: "Pipedrive",             desc: "Busca person por e-mail e telefone, verifica se há deal criado e lê o campo personalizado da Morada IA." },
                { name: "Morada IA",             desc: "Verifica se o campo \"Link da Conversa\" foi preenchido no deal do Pipedrive após o atendimento automático." },
                { name: "Slack",                 desc: "Envia alertas individuais e resumo diário no canal #avaliação-diaria-mql." },
              ].map(({ name, desc }) => (
                <div key={name} style={{ background: T.muted, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{name}</div>
                  <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "20px 24px", boxShadow: T.elevSm }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>Stack técnica — configuração completa</h2>
            <p style={{ margin: "0 0 20px", fontSize: 12, color: T.mutedFg, lineHeight: 1.6 }}>
              O Audit MQL não depende de nenhuma ferramenta de automação externa (n8n, Make, Zapier). Tudo roda dentro desta aplicação hospedada na Vercel. Abaixo está cada camada com os detalhes de como foi configurada.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#0055FF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>1. Aplicação (Next.js + Vercel)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 12, borderLeft: "3px solid #0055FF33" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Next.js — App Router</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Framework da aplicação. Cada rota dentro de <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>src/app/api/growth/audit-mql/</code> é uma serverless function independente hospedada na Vercel. Não existe servidor dedicado nem processo contínuo rodando — cada chamada acorda a função, executa e encerra.<br />
                      <strong style={{ color: T.fg }}>Rotas criadas:</strong>
                      <br />• <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>GET /api/growth/audit-mql/webhook</code> — verificação do token pelo Meta
                      <br />• <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>POST /api/growth/audit-mql/webhook</code> — recebe lead em tempo real
                      <br />• <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>GET /api/growth/audit-mql/leads?date=YYYY-MM-DD</code> — retorna leads do dia e roda verificação Pipedrive inline
                      <br />• <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>GET /api/growth/audit-mql/summary</code> — retorna histórico de resumos
                      <br />• <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>POST /api/growth/audit-mql/summary</code> — gera e envia o resumo do dia anterior (chamado pelo cron)
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Deploy automático via GitHub</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Qualquer merge na branch <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>main</code> do repositório <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>seazone-socios/saleszone</code> aciona um deploy automático na Vercel. Em cerca de 60 segundos o código novo já está em produção em <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>saleszone.vercel.app</code>.
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Cron job — resumo diário (vercel.json)</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Configurado em <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>vercel.json</code> com a linha <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>{'"schedule": "0 11 * * *"'}</code> (11h UTC = 08h BRT). A Vercel dispara automaticamente um GET autenticado para <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>/api/growth/audit-mql/summary</code> todo dia.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>2. Armazenamento (Vercel Blob)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 12, borderLeft: "3px solid #7C3AED33" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Vercel Blob — store privado</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Funciona como o banco de dados da ferramenta. É um object storage privado onde os leads e o histórico são salvos como arquivos JSON.<br /><br />
                      <strong style={{ color: T.fg }}>Estrutura de arquivos:</strong>
                      <br />• <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>audit-mql/2026-04-07.json</code> — array de LeadRecord do dia (fuso BRT = UTC-3)
                      <br />• <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>audit-mql/log.json</code> — array com os últimos 90 resumos diários<br /><br />
                      <strong style={{ color: T.fg }}>Variável de ambiente necessária:</strong> <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>BLOB_READ_WRITE_TOKEN</code> — gerada automaticamente ao criar o Blob Store no painel da Vercel e vinculada ao projeto.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#FF6900", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>3. Meta Ads — webhook e Graph API</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 12, borderLeft: "3px solid #FF690033" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>App no Meta for Developers</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      O webhook foi configurado dentro de um App no Meta for Developers. No painel do App, em <strong style={{ color: T.fg }}>Webhooks → Page → leadgen</strong>, foi cadastrada a URL de callback:<br />
                      <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>https://saleszone.vercel.app/api/growth/audit-mql/webhook</code><br /><br />
                      O Meta faz um GET nessa URL com <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>hub.challenge</code> para verificar que o servidor responde corretamente. A aplicação responde com o mesmo valor do challenge quando o <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>hub.verify_token</code> bate com <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>audit_mql_seazone</code> (definido na env <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>META_WEBHOOK_VERIFY_TOKEN</code>).
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Assinatura HMAC-SHA256 (segurança)</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Todo POST do Meta vem com o header <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>x-hub-signature-256</code>. O servidor recalcula o HMAC usando o App Secret (<code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>META_APP_SECRET</code>) e rejeita qualquer request que não bata — garantindo que só o Meta consegue enviar leads para o sistema.
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Subscrição nas páginas</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Cada Página do Facebook que tem formulários de Lead Gen foi subscrita ao campo <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>leadgen</code>:<br /><br />
                      • <strong style={{ color: T.fg }}>Seazone</strong> (ID 100873924683761)<br />
                      • <strong style={{ color: T.fg }}>Seazone Marketplace</strong> (ID 842763402253490)<br />
                      • <strong style={{ color: T.fg }}>Seazone Investimentos</strong> (ID 144663558738581)
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Busca dos dados do lead (Graph API v19.0)</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      O webhook recebe apenas o <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>leadgen_id</code>. Para buscar nome, e-mail e telefone:<br />
                      <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>GET /v19.0/{"{leadgen_id}"}?fields=field_data,ad_id,campaign_id&access_token=...</code><br /><br />
                      O token usado é o <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>META_ADS_TOKEN</code> (System User token com permissão <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>leads_retrieval</code> e <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>ads_read</code>).
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#5EA500", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>4. Pipedrive — verificação do funil</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 12, borderLeft: "3px solid #5EA50033" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Autenticação</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Usa um API Token salvo na Vercel como <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>PIPEDRIVE_API_TOKEN</code>. O domínio da conta (<code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>seazone</code>) é salvo em <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>PIPEDRIVE_COMPANY_DOMAIN</code> e compõe a URL base: <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>seazone-fd92b9.pipedrive.com</code>.
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Busca da pessoa</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Primeiro tenta por e-mail (match exato):<br />
                      <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>GET /v1/persons/search?term={"{email}"}&fields=email&exact_match=true</code><br />
                      Se não encontrar, tenta por telefone (apenas dígitos, match parcial):<br />
                      <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>GET /v1/persons/search?term={"{telefone}"}&fields=phone&exact_match=false</code>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Busca do deal e campo da Morada IA</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Com o ID da pessoa, busca deals via:<br />
                      <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>GET /v1/persons/{"{id}"}/deals</code><br /><br />
                      No objeto do deal, lê o campo customizado da Morada IA pelo seu hash de chave:<br />
                      <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>deal["3dda4dab1781dcfd8839a5fd6c0b7d5e7acfbcfc"]</code><br />
                      Esse hash está salvo na env <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>PIPEDRIVE_MORADA_FIELD_KEY</code>. Se o campo estiver preenchido, o lead é classificado como OK.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#E7000B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>5. Slack — alertas e resumo diário</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 12, borderLeft: "3px solid #E7000B33" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Incoming Webhook</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Configurado em <strong style={{ color: T.fg }}>api.slack.com/apps → Incoming Webhooks</strong>, vinculado ao canal <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>#avaliação-diaria-mql</code>. A URL do webhook é salva na env <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>SLACK_WEBHOOK_AUDIT_MQL</code>.
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Deduplicação de alertas</div>
                    <div style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.7 }}>
                      Cada LeadRecord tem um campo <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>notified: boolean</code>. Após enviar o alerta, o campo é marcado como <code style={{ background: T.muted, padding: "1px 5px", borderRadius: 3 }}>true</code> e salvo no Blob. Nas verificações seguintes, leads já notificados são ignorados — evitando duplicatas mesmo que o lead continue em status de erro.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Variáveis de ambiente (Vercel)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 12, borderLeft: `3px solid ${T.border}` }}>
                  {[
                    { name: "PIPEDRIVE_API_TOKEN",       desc: "Token de API do Pipedrive (Perfil → Ferramentas → Tokens de API)" },
                    { name: "PIPEDRIVE_COMPANY_DOMAIN",  desc: "Domínio da conta: seazone (URL: seazone-fd92b9.pipedrive.com)" },
                    { name: "PIPEDRIVE_MORADA_FIELD_KEY",desc: "Hash do campo customizado \"Link da Conversa\" no Pipedrive: 3dda4dab1781dcfd8839a5fd6c0b7d5e7acfbcfc" },
                    { name: "META_WEBHOOK_VERIFY_TOKEN", desc: "Token de verificação do webhook Meta: audit_mql_seazone" },
                    { name: "META_APP_SECRET",           desc: "App Secret do App no Meta for Developers (usado para validar assinatura HMAC)" },
                    { name: "META_ADS_TOKEN",            desc: "System User token do Meta com permissões leads_retrieval e ads_read" },
                    { name: "SLACK_WEBHOOK_AUDIT_MQL",   desc: "URL do Incoming Webhook do Slack para o canal #avaliação-diaria-mql" },
                    { name: "BLOB_READ_WRITE_TOKEN",     desc: "Token do Vercel Blob Store (gerado automaticamente ao criar o store no painel da Vercel)" },
                    { name: "CRON_SECRET",               desc: "Secret para autenticar chamadas do cron Vercel e do GitHub Actions fallback (a cada 15 min)" },
                  ].map(({ name, desc }) => (
                    <div key={name} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <code style={{ fontSize: 10, background: T.muted, padding: "2px 6px", borderRadius: 3,
                        whiteSpace: "nowrap", flexShrink: 0, color: T.primary }}>{name}</code>
                      <span style={{ fontSize: 11, color: T.mutedFg, lineHeight: 1.6, paddingTop: 2 }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
