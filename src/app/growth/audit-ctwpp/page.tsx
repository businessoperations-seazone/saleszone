"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  ArrowLeft, RefreshCw, Loader2, ExternalLink,
  AlertTriangle, CheckCircle, ChevronDown,
  ChevronLeft, ChevronRight, Info,
} from "lucide-react"
import type { AuditCTWPPDay, AuditCTWPPLead } from "@/lib/audit-ctwpp"

// ─── Tokens (saleszone pattern) ───────────────────────────────────────────────

const T = {
  primary:     "#0055FF",
  bg:          "#FFFFFF",
  fg:          "#080E32",
  card:        "#FFFFFF",
  muted:       "#F3F3F5",
  mutedFg:     "#6B6E84",
  border:      "#E6E7EA",
  elevSm:      "0 1px 2px rgba(0,0,0,0.12), 0 0.1px 0.3px rgba(0,0,0,0.08)",
  elevMd:      "0 4px 16px rgba(0,0,0,0.12)",
  verde:       "#5EA500",
  laranja:     "#FF6900",
  destructive: "#E7000B",
  font:        "'Helvetica Neue', -apple-system, BlinkMacSystemFont, sans-serif",
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function brtNow() { return new Date(Date.now() - 3 * 60 * 60 * 1000) }
function todayKey() { return brtNow().toISOString().slice(0, 10) }
function offsetKey(days: number) {
  const d = brtNow(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10)
}
function offsetKeyFrom(key: string, days: number) {
  const d = new Date(key + "T12:00:00Z"); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10)
}
function fmtLabel(key: string) {
  if (key === "all") return "Todos"
  const today = todayKey(), yesterday = offsetKey(-1)
  if (key === today)     return "Hoje"
  if (key === yesterday) return "Ontem"
  const [, m, d] = key.split("-")
  return `${d}/${m}`
}
function fmtDate(iso: string) {
  const d = (iso || "").slice(0, 10)
  if (!d || d.length < 10) return "—"
  return new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR")
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Todos analisados", key: () => "all"          },
  { label: "Hoje",             key: () => todayKey()     },
  { label: "Ontem",            key: () => offsetKey(-1)  },
  { label: "2 dias atrás",     key: () => offsetKey(-2)  },
  { label: "3 dias atrás",     key: () => offsetKey(-3)  },
  { label: "7 dias atrás",     key: () => offsetKey(-7)  },
  { label: "14 dias atrás",    key: () => offsetKey(-14) },
]

function calendarDays(year: number, month: number) {
  return { first: new Date(year, month, 1).getDay(), days: new Date(year, month + 1, 0).getDate() }
}

function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [open, setOpen]       = useState(false)
  const [pending, setPending] = useState(value)
  const today = todayKey()
  const [calYear,  setCalYear]  = useState(() => parseInt(today.slice(0, 4)))
  const [calMonth, setCalMonth] = useState(() => parseInt(today.slice(5, 7)) - 1)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h)
  }, [])
  useEffect(() => { setPending(value) }, [value])

  const apply  = () => { onChange(pending); setOpen(false) }
  const cancel = () => { setPending(value); setOpen(false) }

  const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
  const prevM = calMonth === 0 ? 11 : calMonth - 1
  const prevY = calMonth === 0 ? calYear - 1 : calYear

  function renderCalendar(year: number, month: number) {
    const { first, days } = calendarDays(year, month)
    const cells: (number | null)[] = Array(first).fill(null)
    for (let d = 1; d <= days; d++) cells.push(d)
    return (
      <div>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          {monthNames[month]} {year}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 30px)" }}>
          {["D","S","T","Q","Q","S","S"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: T.mutedFg, padding: "2px 0" }}>{d}</div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ width: 30, height: 30 }} />
            const k = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            const isFuture = k > today, isSel = k === pending
            return (
              <button key={i} disabled={isFuture} onClick={() => setPending(k)}
                style={{ width: 30, height: 30, borderRadius: 6, border: "none",
                  cursor: isFuture ? "default" : "pointer", fontSize: 12,
                  background: isSel ? T.primary : "transparent",
                  color: isSel ? "#fff" : isFuture ? T.border : T.fg,
                  fontWeight: isSel ? 700 : 400 }}>
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const isAll     = value === "all"
  const canGoLeft  = !isAll
  const canGoRight = !isAll && value < today

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", background: T.card, boxShadow: T.elevSm }}>
        <button onClick={() => canGoLeft && onChange(offsetKeyFrom(value, -1))}
          style={{ border: "none", background: "none", padding: "6px 8px", cursor: canGoLeft ? "pointer" : "default", color: canGoLeft ? T.mutedFg : T.border }}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => { setPending(value); setOpen(o => !o) }}
          style={{ border: "none", borderLeft: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, background: "none", padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: T.fg, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {fmtLabel(value)} <ChevronDown size={11} color={T.mutedFg} />
        </button>
        <button onClick={() => canGoRight && onChange(offsetKeyFrom(value, 1))}
          style={{ border: "none", background: "none", padding: "6px 8px", cursor: canGoRight ? "pointer" : "default", color: canGoRight ? T.mutedFg : T.border }}>
          <ChevronRight size={14} />
        </button>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: T.elevMd, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex" }}>
            <div style={{ width: 140, padding: "12px 8px", borderRight: `1px solid ${T.border}` }}>
              {PRESETS.map(p => {
                const k = p.key(), active = pending === k
                return (
                  <button key={p.label} onClick={() => setPending(k)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 400, background: active ? T.primary + "12" : "transparent", color: active ? T.primary : T.fg }}>
                    {p.label}
                  </button>
                )
              })}
            </div>
            <div style={{ display: "flex", gap: 20, padding: "16px 20px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}
                    style={{ border: "none", background: "none", cursor: "pointer", color: T.mutedFg }}><ChevronLeft size={14} /></button>
                  <span />
                </div>
                {renderCalendar(prevY, prevM)}
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}
                    style={{ border: "none", background: "none", cursor: "pointer", color: T.mutedFg }}><ChevronRight size={14} /></button>
                </div>
                {renderCalendar(calYear, calMonth)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px", borderTop: `1px solid ${T.border}`, gap: 8 }}>
            <button onClick={cancel} style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${T.border}`, background: "none", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
            <button onClick={apply}  style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: T.primary, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Atualizar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Temperatura badge ────────────────────────────────────────────────────────

const TEMP_CFG: Record<string, { label: string; bg: string; color: string }> = {
  Quente:    { label: "🔥 Quente",    bg: "#FFF1F0", color: "#E7000B" },
  Morno:     { label: "🌡️ Morno",     bg: "#FFFBEB", color: "#D97706" },
  Frio:      { label: "❄️ Frio",      bg: "#EFF6FF", color: "#2563EB" },
  Indefinido:{ label: "❓ Indefinido", bg: T.muted,   color: T.mutedFg },
}

function TempBadge({ temp }: { temp: string }) {
  const cfg = TEMP_CFG[temp] || TEMP_CFG.Indefinido
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  )
}

// ─── Tag badge ────────────────────────────────────────────────────────────────

const TAG_CFG: Record<string, { bg: string; color: string }> = {
  "Insistência":           { bg: "#FFF4ED", color: "#C2410C" },
  "Não entendeu":          { bg: "#F5F3FF", color: "#6D28D9" },
  "Loop/Repetição":        { bg: "#FFFBEB", color: "#B45309" },
  "Falha de agenda":       { bg: "#FFF1F0", color: "#E7000B" },
  "Contradição de agenda": { bg: "#FFF1F0", color: "#9F1239" },
  "Info incorreta":        { bg: "#EFF6FF", color: "#1D4ED8" },
  "Demora atendimento":    { bg: "#FEFCE8", color: "#854D0E" },
  "Sem conversa":          { bg: T.muted,   color: T.mutedFg },
}

function TagBadge({ tag }: { tag?: string }) {
  if (!tag) return null
  const cfg = TAG_CFG[tag] || { bg: T.muted, color: T.mutedFg }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>
      {tag}
    </span>
  )
}

// ─── Lead row ─────────────────────────────────────────────────────────────────

const td: React.CSSProperties = { padding: "10px 14px", fontSize: 13, verticalAlign: "middle" }

function LeadRow({ lead, odd }: { lead: AuditCTWPPLead; odd: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr onClick={() => setOpen(o => !o)}
        style={{ background: open ? T.primary + "08" : odd ? T.muted : T.card, cursor: "pointer", borderBottom: `1px solid ${T.border}` }}>
        <td style={td}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.fg }}>{fmtDate(lead.deal_created_at)}</div>
          <div style={{ fontSize: 11, color: T.mutedFg }}>{lead.deal_id}</div>
        </td>
        <td style={td}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontWeight: 600, color: T.fg }}>{lead.deal_title}</span>
            <a href={`https://seazone.pipedrive.com/deal/${lead.deal_id}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: T.mutedFg, display: "flex", alignItems: "center" }}>
              <ExternalLink size={11} />
            </a>
          </div>
          <div style={{ fontSize: 11, color: T.mutedFg, marginTop: 1 }}>{lead.owner_name}</div>
        </td>
        <td style={td}>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: T.muted, color: T.mutedFg, whiteSpace: "nowrap" }}>
            {lead.stage_name}
          </span>
        </td>
        <td style={td}><TempBadge temp={lead.temperatura} /></td>
        <td style={td}><TagBadge tag={lead.tag} /></td>
        <td style={{ ...td, maxWidth: 300 }}>
          <div style={{ fontSize: 12, color: T.fg, lineHeight: 1.5 }}>
            {lead.resumo || lead.problemas.split(/[.!?]/)[0]?.trim()}
          </div>
        </td>
        <td style={{ ...td, width: 28, textAlign: "center" }}>
          <ChevronDown size={14} color={T.mutedFg}
            style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }} />
        </td>
      </tr>
      {open && (
        <tr style={{ background: T.primary + "06", borderBottom: `1px solid ${T.border}` }}>
          <td colSpan={7} style={{ padding: "12px 16px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.mutedFg, marginBottom: 6 }}>O que aconteceu</div>
                <div style={{ fontSize: 13, color: T.fg, lineHeight: 1.6 }}>{lead.problemas}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.mutedFg, marginBottom: 6 }}>Recomendação</div>
                <div style={{ fontSize: 13, color: T.fg, lineHeight: 1.6 }}>{lead.recomendacao}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              {lead.morada_conversation_url && (
                <a href={lead.morada_conversation_url} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: T.primary, textDecoration: "none" }}>
                  <ExternalLink size={12} /> Ver conversa na Morada
                </a>
              )}
              <a href={`https://seazone.pipedrive.com/deal/${lead.deal_id}`}
                target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: T.mutedFg, textDecoration: "none" }}>
                <ExternalLink size={12} /> Ver no Pipedrive
              </a>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Leads table ──────────────────────────────────────────────────────────────

function LeadsTable({ data, loading, error }: { data: AuditCTWPPDay | null; loading: boolean; error: string }) {
  const [showAll, setShowAll] = useState(false)

  const leads       = data?.leads || []
  const filtered    = showAll ? leads : leads.filter(l => l.tem_problema)
  const comProblema = leads.filter(l => l.tem_problema).length

  const tempCounts = filtered.reduce((acc, l) => { acc[l.temperatura] = (acc[l.temperatura] || 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <>
      {data && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Total analisados", value: showAll ? data.total_leads : comProblema, color: T.fg       },
            ...(showAll ? [{ label: "Com problema", value: comProblema, color: T.destructive }] : []),
            { label: "🔥 Quentes",       value: tempCounts["Quente"] || 0,  color: T.destructive },
            { label: "🌡️ Mornos",        value: tempCounts["Morno"]  || 0,  color: "#D97706"  },
            { label: "❄️ Frios",         value: tempCounts["Frio"]   || 0,  color: "#2563EB"  },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 18px", boxShadow: T.elevSm, minWidth: 110 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
            <span style={{ fontSize: 11, color: T.mutedFg }}>
              {data.date === "all"
                ? "Últimos 30 dias"
                : `Rodou às ${new Date(data.ran_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`}
            </span>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.mutedFg, padding: "48px 0" }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13 }}>Carregando audit...</span>
        </div>
      )}
      {!loading && error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.destructive, padding: "48px 0" }}>
          <AlertTriangle size={15} /><span style={{ fontSize: 13 }}>{error}</span>
        </div>
      )}
      {!loading && data && leads.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.verde, padding: "48px 0" }}>
          <CheckCircle size={15} /><span style={{ fontSize: 13 }}>Nenhum lead encontrado para esta data.</span>
        </div>
      )}

      {!loading && data && leads.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.fg }}>
              {showAll ? `${leads.length} leads` : `${comProblema} com problema`}
            </span>
            <button onClick={() => setShowAll(v => !v)}
              style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.mutedFg, cursor: "pointer" }}>
              {showAll ? "Mostrar só problemas" : "Mostrar todos"}
            </button>
          </div>
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", boxShadow: T.elevSm }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.font }}>
              <thead>
                <tr style={{ background: T.muted }}>
                  {["Data / ID", "Lead", "Etapa", "Temperatura", "Tag", "Resumo", ""].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.mutedFg, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: "32px", textAlign: "center", color: T.mutedFg, fontSize: 13 }}>Nenhum problema identificado nesta data.</td></tr>
                ) : (
                  filtered.map((lead, i) => <LeadRow key={lead.deal_id} lead={lead} odd={i % 2 === 1} />)
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

// ─── Sobre ────────────────────────────────────────────────────────────────────

const sec: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "22px 24px", boxShadow: T.elevSm, marginBottom: 14 }
const h2s: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: T.fg, margin: "0 0 12px", letterSpacing: "-0.01em" }
const h3s: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: T.mutedFg, margin: "16px 0 6px" }
const ps:  React.CSSProperties = { fontSize: 13, color: T.fg, lineHeight: 1.65, margin: "0 0 8px" }

function SobreTab() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={sec}>
        <h2 style={h2s}>O que é o Audit CTWPP</h2>
        <p style={ps}>Análise diária das conversas da MIA (Morada.ai) com leads que chegaram no funil <strong>Vendas Spot (SZI)</strong> via anúncios <strong>Click to WhatsApp</strong> no Meta Ads.</p>
        <p style={ps}>Todo dia pela manhã busca os leads de CTWPP criados no dia anterior, lê a conversa completa e usa IA para identificar problemas no atendimento.</p>
        <p style={{ ...ps, margin: 0 }}>Diferença do Audit Morada padrão: o filtro é por <strong>source = Click To WhatsApp</strong> (todos os stages), não por stage específico.</p>
      </div>
      <div style={sec}>
        <h2 style={h2s}>Como funciona</h2>
        {[
          { n: "1", t: "Nekt",         d: `Filtra pipedrive_deals_readable com pipeline_id=28 + rd_source='Click To WhatsApp' + data de entrada = ontem.` },
          { n: "2", t: "Pipedrive",    d: "Busca detalhes de cada deal individualmente para obter a URL da conversa na Morada, etapa atual e responsável." },
          { n: "3", t: "Metabase",     d: "Lê o histórico completo de mensagens entre a MIA e o lead (até as últimas 100)." },
          { n: "4", t: "Análise IA",   d: "Claude avalia problema, classifica tag, temperatura do lead e gera recomendação para o time comercial." },
        ].map(({ n, t, d }) => (
          <div key={n} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: T.primary, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{n}</div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.fg }}>{t}: </span>
              <span style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.55 }}>{d}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={sec}>
        <h2 style={h2s}>Infraestrutura</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { label: "Cron",              value: "Todo dia às ~10h BRT (Vercel)" },
            { label: "Filtro",            value: "pipeline_id=28 + rd_source='Click To WhatsApp' + data = ontem" },
            { label: "Conversas",         value: "Metabase / Morada.ai (token expira — renovar em DevTools)" },
            { label: "IA",                value: "Claude Sonnet via OpenRouter" },
            { label: "Armazenamento",     value: "Vercel Blob — audit-ctwpp/YYYY-MM-DD.json" },
            { label: "Token Metabase",    value: "DevTools → metabase.morada.ai → Cookies → metabase.SESSION → vercel env update METABASE_SESSION_TOKEN production" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: T.mutedFg, marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 12, color: T.fg, lineHeight: 1.5 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditCTWPPPage() {
  const [tab, setTab]         = useState<"leads" | "sobre">("leads")
  const [date, setDate]       = useState(todayKey())
  const [data, setData]       = useState<AuditCTWPPDay | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  async function fetchData(d: string) {
    setLoading(true); setError(""); setData(null)
    try {
      // O cron de cada dia analisa os leads do dia ANTERIOR.
      // "Hoje" no DatePicker = o cron que rodou hoje = leads de ontem.
      const blobDate = d === "all" ? "all" : offsetKeyFrom(d, -1)
      const res = await fetch(`/api/growth/audit-ctwpp/results?date=${blobDate}`)
      if (res.status === 404) setError("Audit não encontrado. Aguarde o cron de amanhã.")
      else if (!res.ok)      setError("Erro ao carregar dados.")
      else                   setData(await res.json())
    } catch { setError("Erro de rede.") }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData(date) }, [date])

  return (
    <div style={{ minHeight: "100vh", background: "#F5F6FA", fontFamily: T.font }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: "0 24px", boxShadow: T.elevSm }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 14, height: 54 }}>
          <Link href="/"
            style={{ color: T.mutedFg, display: "flex", alignItems: "center", textDecoration: "none" }}>
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.fg, letterSpacing: "-0.01em" }}>Audit CTWPP — Vendas Spot</div>
            <div style={{ fontSize: 11, color: T.mutedFg }}>Click to WhatsApp · MIA · SZI · Pipeline 28</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => fetchData(date)} disabled={loading}
              style={{ border: `1px solid ${T.border}`, background: T.card, padding: "6px 10px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.mutedFg }}>
              <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex" }}>
          {(["leads", "sobre"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "12px 16px", fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? T.primary : T.mutedFg, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${T.primary}` : "2px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, marginBottom: -1 }}>
              {t === "sobre" && <Info size={13} />}
              {t === "leads" ? "Leads" : "Sobre"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px" }}>
        {tab === "sobre" ? <SobreTab /> : (
          <>
            <div style={{ marginBottom: 20 }}>
              <DatePicker value={date} onChange={d => { setDate(d); setTab("leads") }} />
            </div>
            <LeadsTable data={data} loading={loading} error={error} />
          </>
        )}
      </div>
    </div>
  )
}
