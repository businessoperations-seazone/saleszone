"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"

export type DateRange = { start: string; end: string }

const T = {
  primary:    "#0055FF",
  bg:         "#FFFFFF",
  fg:         "#080E32",
  card:       "#FFFFFF",
  mutedFg:    "#6B6E84",
  border:     "#E6E7EA",
  elevSm:     "0 1px 2px rgba(0,0,0,0.12), 0 0.1px 0.3px rgba(0,0,0,0.08)",
  elevMd:     "0 4px 16px rgba(0,0,0,0.12)",
}

function brtNow() { return new Date(Date.now() - 3 * 60 * 60 * 1000) }
export function todayKey() { return brtNow().toISOString().slice(0, 10) }
export function offsetKey(days: number) {
  const d = brtNow(); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
export function offsetKeyFrom(key: string, days: number) {
  const d = new Date(key + "T12:00:00Z"); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysInRange(range: DateRange): string[] {
  const out: string[] = []
  let cur = range.start
  while (cur <= range.end) {
    out.push(cur)
    cur = offsetKeyFrom(cur, 1)
  }
  return out
}

export const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Hoje",            range: () => ({ start: todayKey(),    end: todayKey()    }) },
  { label: "Ontem",           range: () => ({ start: offsetKey(-1), end: offsetKey(-1) }) },
  { label: "Últimos 7 dias",  range: () => ({ start: offsetKey(-6), end: todayKey()    }) },
  { label: "Últimos 14 dias", range: () => ({ start: offsetKey(-13),end: todayKey()    }) },
  { label: "Últimos 30 dias", range: () => ({ start: offsetKey(-29),end: todayKey()    }) },
]

export function fmtRangeLabel(range: DateRange): string {
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

function calendarDays(year: number, month: number) {
  const first = new Date(year, month, 1).getDay()
  const days  = new Date(year, month + 1, 0).getDate()
  return { first, days }
}

export default function DatePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
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
