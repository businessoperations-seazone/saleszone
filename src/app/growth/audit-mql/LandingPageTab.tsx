"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { ShieldAlert, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react"
import type { LpLeadRecord } from "@/lib/audit-lp"
import { type DateRange, daysInRange, todayKey } from "./DatePicker"

const T = {
  primary:    "#0055FF",
  bg:         "#FFFFFF",
  fg:         "#080E32",
  card:       "#FFFFFF",
  muted:      "#F3F3F5",
  mutedFg:    "#6B6E84",
  border:     "#E6E7EA",
  elevSm:     "0 1px 2px rgba(0,0,0,0.12), 0 0.1px 0.3px rgba(0,0,0,0.08)",
  verde600:   "#5EA500",
  laranja500: "#FF6900",
  destructive:"#E7000B",
}

const VERTICAL_COLORS: Record<string, string> = {
  "Investimentos": "#0055FF",
  "Serviços":      "#5EA500",
  "Marketplace":   "#7C3AED",
  "Hóspedes":      "#FF6900",
}

const BRT = "America/Sao_Paulo"
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BRT })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: BRT })
}

const STATUS_CFG: Record<LpLeadRecord["status"], { label: string; color: string; Icon: typeof ShieldAlert }> = {
  aguardando:    { label: "Aguardando",    color: T.mutedFg,     Icon: Clock },
  ok:            { label: "OK",            color: T.verde600,    Icon: CheckCircle2 },
  sem_pipedrive: { label: "Sem Pipedrive", color: T.destructive, Icon: XCircle },
  sem_mia:       { label: "Sem MIA",       color: T.laranja500,  Icon: AlertTriangle },
  descartado:    { label: "Descartado",    color: T.mutedFg,     Icon: XCircle },
}

type StatusFilter = LpLeadRecord["status"] | "sem_baserow" | "sem_nekt" | null

type LpLeadWithDate = LpLeadRecord & { _dateKey: string }

export default function LandingPageTab({ range }: { range: DateRange }) {
  const [leads, setLeads]               = useState<LpLeadWithDate[]>([])
  const [loading, setLoading]           = useState(true)
  const [expanded, setExpanded]         = useState<string | null>(null)
  const [recheckingId, setRecheckingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null)
  const [verticalFilter, setVerticalFilter] = useState<string | null>(null)
  const [origemFilter, setOrigemFilter] = useState<string | null>(null)

  const fetchLeads = useCallback(async (r: DateRange) => {
    setLoading(true)
    try {
      const days = daysInRange(r)
      const results = await Promise.all(
        days.map(async d => {
          const res = await fetch(`/api/growth/audit-lp/leads?date=${d}`, { cache: "no-store" })
          if (!res.ok) return [] as LpLeadWithDate[]
          const data: LpLeadRecord[] = await res.json()
          return data.map(l => ({ ...l, _dateKey: d }))
        })
      )
      setLeads(results.flat().sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads(range) }, [range, fetchLeads])

  useEffect(() => {
    if (range.end !== todayKey()) return
    const id = setInterval(() => fetchLeads(range), 30_000)
    return () => clearInterval(id)
  }, [range, fetchLeads])

  const recheck = async (id: string, dateKey: string) => {
    setRecheckingId(id)
    try {
      const res = await fetch("/api/growth/audit-lp/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recheck: id, date: dateKey }),
      })
      if (res.ok) await fetchLeads(range)
    } finally {
      setRecheckingId(null)
    }
  }

  const stats = {
    total:         leads.length,
    ok:            leads.filter(l => l.status === "ok").length,
    aguardando:    leads.filter(l => l.status === "aguardando").length,
    sem_pipedrive: leads.filter(l => l.status === "sem_pipedrive").length,
    sem_mia:       leads.filter(l => l.status === "sem_mia").length,
    sem_baserow:   leads.filter(l => l.in_baserow === false).length,
    sem_nekt:      leads.filter(l => l.nekt_status === "nao_encontrado").length,
  }

  const byVertical = useMemo(() => leads.reduce((acc, l) => {
    const v = l.vertical || "—"
    if (!acc[v]) acc[v] = { total: 0, semPipe: 0, semMia: 0, semBaserow: 0, semNekt: 0 }
    acc[v].total++
    if (l.status === "sem_pipedrive")          acc[v].semPipe++
    if (l.status === "sem_mia")                acc[v].semMia++
    if (l.in_baserow === false)                acc[v].semBaserow++
    if (l.nekt_status === "nao_encontrado")    acc[v].semNekt++
    return acc
  }, {} as Record<string, { total: number; semPipe: number; semMia: number; semBaserow: number; semNekt: number }>), [leads])

  const origens = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of leads) {
      const o = l.origem_lead || "—"
      counts.set(o, (counts.get(o) || 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [leads])

  const visibleLeads = useMemo(() => leads.filter(l => {
    if (verticalFilter && (l.vertical || "—") !== verticalFilter) return false
    if (origemFilter   && (l.origem_lead || "—") !== origemFilter) return false
    if (statusFilter === "sem_baserow") return l.in_baserow === false
    if (statusFilter === "sem_nekt")    return l.nekt_status === "nao_encontrado"
    if (statusFilter && l.status !== statusFilter) return false
    return true
  }), [leads, verticalFilter, origemFilter, statusFilter])

  const showDateColumn = range.start !== range.end
  const cols = (showDateColumn ? 14 : 13)

  const STAT_CARDS = [
    { label: "Total",         value: stats.total,         color: T.fg,          status: null            as StatusFilter },
    { label: "OK",            value: stats.ok,            color: T.verde600,    status: "ok"            as StatusFilter },
    { label: "Aguardando",    value: stats.aguardando,    color: T.mutedFg,     status: "aguardando"    as StatusFilter },
    { label: "Sem Pipedrive", value: stats.sem_pipedrive, color: T.destructive, status: "sem_pipedrive" as StatusFilter },
    { label: "Sem MIA",       value: stats.sem_mia,       color: T.laranja500,  status: "sem_mia"       as StatusFilter },
    { label: "Sem Baserow",   value: stats.sem_baserow,   color: "#DC2626",     status: "sem_baserow"   as StatusFilter },
    { label: "Sem Nekt",      value: stats.sem_nekt,      color: "#B45309",     status: "sem_nekt"      as StatusFilter },
  ]

  return (
    <div>
      {/* ── Stat cards (clicáveis = filtro de status) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 16 }}>
        {STAT_CARDS.map(c => {
          const active = statusFilter === c.status && c.status !== null
          return (
            <div key={c.label}
              onClick={() => c.status ? setStatusFilter(active ? null : c.status) : setStatusFilter(null)}
              style={{
                padding: "10px 12px", background: active ? c.color + "12" : T.card,
                border: `1px solid ${active ? c.color : T.border}`,
                borderRadius: 10, boxShadow: T.elevSm,
                cursor: c.status ? "pointer" : "default",
                transition: "border-color 0.15s, background 0.15s",
              }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: T.mutedFg,
                textTransform: "uppercase", letterSpacing: "0.07em" }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.color, marginTop: 2,
                fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
            </div>
          )
        })}
      </div>

      {/* ── Filtro ativo (status) ── */}
      {statusFilter && (() => {
        const color = statusFilter === "sem_baserow" ? "#DC2626"
          : statusFilter === "sem_nekt" ? "#B45309"
          : STATUS_CFG[statusFilter as LpLeadRecord["status"]]?.color || T.mutedFg
        const label = statusFilter === "sem_baserow" ? "SEM BASEROW"
          : statusFilter === "sem_nekt" ? "SEM NEKT"
          : statusFilter.replace(/_/g, " ").toUpperCase()
        return (
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: T.mutedFg }}>Filtro ativo:</span>
            <span style={{ fontSize: 11, fontWeight: 700, color,
              border: `1px solid ${color}55`, padding: "2px 8px", borderRadius: 4 }}>{label}</span>
            <button onClick={() => setStatusFilter(null)}
              style={{ background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: T.mutedFg, padding: 0 }}>× limpar</button>
          </div>
        )
      })()}

      {/* ── Filtros de vertical ── */}
      {Object.keys(byVertical).length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          {Object.entries(byVertical).sort((a, b) => b[1].total - a[1].total).map(([v, g]) => {
            const active = verticalFilter === v
            const color  = VERTICAL_COLORS[v] || T.mutedFg
            return (
              <button key={v} onClick={() => setVerticalFilter(active ? null : v)}
                style={{
                  background: T.card,
                  border: active ? `2px solid ${color}` : `1px solid ${T.border}`,
                  borderRadius: 10, padding: active ? "9px 13px" : "10px 14px",
                  boxShadow: active ? `0 0 0 3px ${color}22` : T.elevSm,
                  minWidth: 130, cursor: "pointer", textAlign: "left",
                }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{v}</div>
                <div style={{ fontSize: 12, color: T.fg, fontWeight: 600 }}>{g.total} lead{g.total !== 1 ? "s" : ""}</div>
                <div style={{ fontSize: 11, color: T.mutedFg, marginTop: 2, lineHeight: 1.6 }}>
                  {g.semPipe    > 0 && <div style={{ color: T.destructive }}>Sem Pipedrive: {g.semPipe}</div>}
                  {g.semMia     > 0 && <div style={{ color: T.laranja500 }}>Sem MIA: {g.semMia}</div>}
                  {g.semBaserow > 0 && <div style={{ color: "#DC2626" }}>Sem Baserow: {g.semBaserow}</div>}
                  {g.semNekt    > 0 && <div style={{ color: "#B45309" }}>Sem Nekt: {g.semNekt}</div>}
                </div>
              </button>
            )
          })}
          {verticalFilter && (
            <button onClick={() => setVerticalFilter(null)}
              style={{ alignSelf: "center", background: "none", border: `1px solid ${T.border}`,
                borderRadius: 6, padding: "5px 12px", cursor: "pointer",
                fontSize: 12, color: T.mutedFg }}>
              Limpar ×
            </button>
          )}
        </div>
      )}

      {/* ── Filtros de origem ── */}
      {origens.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: T.mutedFg, fontWeight: 600, marginRight: 4 }}>Origem:</span>
          {origens.map(([o, count]) => {
            const active = origemFilter === o
            return (
              <button key={o} onClick={() => setOrigemFilter(active ? null : o)}
                style={{
                  padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  border: active ? `1px solid ${T.primary}` : `1px solid ${T.border}`,
                  background: active ? T.primary + "12" : T.card,
                  color: active ? T.primary : T.fg, fontWeight: active ? 700 : 400,
                  transition: "all 0.1s",
                }}>
                {o} <span style={{ color: T.mutedFg, fontWeight: 400 }}>({count})</span>
              </button>
            )
          })}
          {origemFilter && (
            <button onClick={() => setOrigemFilter(null)}
              style={{ background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: T.mutedFg, padding: "4px 0" }}>× limpar</button>
          )}
        </div>
      )}

      {/* ── Tabela ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: T.muted }}>
            <tr>
              {showDateColumn && (
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Data</th>
              )}
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Horário</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Nome</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Email / Tel</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>LP / Form</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Origem</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Vertical</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Status</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Baserow</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Nekt</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Deal</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>MIA</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}></th>
            </tr>
          </thead>
          <tbody>
            {visibleLeads.length === 0 && !loading && (
              <tr><td colSpan={cols} style={{ padding: 40, textAlign: "center", color: T.mutedFg }}>
                Nenhum lead de LP no período selecionado.
              </td></tr>
            )}
            {visibleLeads.map(l => {
              const cfg = STATUS_CFG[l.status]
              const Icon = cfg.Icon
              const isExpanded = expanded === l.id
              return (
                <Fragment key={l.id}>
                  <tr style={{ borderTop: `1px solid ${T.border}`, cursor: "pointer" }}
                      onClick={() => setExpanded(isExpanded ? null : l.id)}>
                    {showDateColumn && (
                      <td style={{ padding: "10px 14px", fontVariantNumeric: "tabular-nums", color: T.mutedFg }}>
                        {fmtDate(l.created_at)}
                      </td>
                    )}
                    <td style={{ padding: "10px 14px", fontVariantNumeric: "tabular-nums", color: T.mutedFg }}>
                      {fmtTime(l.created_at)}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 500 }}>{l.name || "—"}</td>
                    <td style={{ padding: "10px 14px", color: T.mutedFg, fontSize: 12 }}>
                      <div>{l.email || "—"}</div>
                      <div>{l.phone || "—"}</div>
                    </td>
                    <td style={{ padding: "10px 14px", color: T.mutedFg, fontSize: 12 }}>
                      {l.form_name || l.page_slug || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", color: T.mutedFg, fontSize: 12 }}>
                      {l.origem_lead || "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {l.vertical ? (
                        <span style={{ fontSize: 11, fontWeight: 700,
                          color: VERTICAL_COLORS[l.vertical] || T.mutedFg }}>
                          {l.vertical}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
                        color: cfg.color, fontWeight: 500 }}>
                        <Icon size={14} /> {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>
                      {l.in_baserow === true
                        ? <span style={{ color: T.verde600 }}>✓</span>
                        : l.in_baserow === false
                        ? <span style={{ color: T.destructive }}>✗</span>
                        : <span style={{ color: T.mutedFg }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>
                      {l.nekt_status === "ok"
                        ? <span style={{ color: T.verde600 }}>✓</span>
                        : l.nekt_status === "nao_encontrado"
                        ? <span style={{ color: "#B45309" }}>✗</span>
                        : <span style={{ color: T.mutedFg }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {l.pipedrive_deal_id ? (
                        <a href={`https://seazone-fd92b9.pipedrive.com/deal/${l.pipedrive_deal_id}`}
                           target="_blank" rel="noopener noreferrer"
                           onClick={e => e.stopPropagation()}
                           style={{ color: T.primary, fontFamily: "monospace" }}>
                          #{l.pipedrive_deal_id}
                        </a>
                      ) : <span style={{ color: T.mutedFg }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {l.mia_link ? (
                        <a href={l.mia_link} target="_blank" rel="noopener noreferrer"
                           onClick={e => e.stopPropagation()}
                           style={{ color: T.verde600 }}>✓ Link</a>
                      ) : l.mia_error ? (
                        <span style={{ color: T.laranja500, fontSize: 12 }} title={l.mia_error.motivo_parsed}>
                          ⚠ {l.mia_error.motivo_parsed.slice(0, 30)}
                        </span>
                      ) : <span style={{ color: T.mutedFg }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {(l.status === "sem_pipedrive" || l.status === "sem_mia") && (
                        <button onClick={e => { e.stopPropagation(); recheck(l.id, l._dateKey) }}
                          disabled={recheckingId === l.id}
                          style={{ padding: "4px 8px", fontSize: 11,
                            background: T.muted, border: `1px solid ${T.border}`,
                            borderRadius: 4, cursor: "pointer", color: T.fg }}>
                          {recheckingId === l.id ? "..." : "Recheck"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: T.muted }}>
                      <td colSpan={cols} style={{ padding: 16 }}>
                        {l.mia_error && (
                          <div style={{ marginBottom: 12, padding: 12, background: "#FFF5F5",
                            border: `1px solid ${T.destructive}`, borderRadius: 6 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.destructive, marginBottom: 6 }}>
                              ⚠ Erro MIA — {l.mia_error.motivo_parsed}
                            </div>
                            {l.mia_error.transferido_para && (
                              <div style={{ fontSize: 12, color: T.fg }}>
                                <strong>Transferido para:</strong> {l.mia_error.transferido_para}
                              </div>
                            )}
                            {l.mia_error.n8n_url && (
                              <div style={{ fontSize: 12, marginTop: 4 }}>
                                <a href={l.mia_error.n8n_url} target="_blank" rel="noopener noreferrer"
                                   style={{ color: T.primary }}>Ver execução n8n →</a>
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: T.fg, marginBottom: 8 }}>
                          <strong>URL da LP:</strong> {l.page_url || "—"}
                        </div>
                        {(l.utm_source || l.utm_medium || l.utm_campaign) && (
                          <div style={{ fontSize: 12, color: T.mutedFg, marginBottom: 8 }}>
                            <strong>UTM:</strong>{" "}
                            {[l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(" / ")}
                          </div>
                        )}
                        {l.form_fields && l.form_fields.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: T.fg }}>
                              Campos do formulário:
                            </div>
                            <table style={{ fontSize: 12 }}>
                              <tbody>
                                {l.form_fields.map((f, i) => (
                                  <tr key={i}>
                                    <td style={{ padding: "2px 12px 2px 0", color: T.mutedFg, verticalAlign: "top" }}>
                                      {f.name}
                                    </td>
                                    <td style={{ padding: "2px 0", color: T.fg }}>{f.value || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {l.recovered_from_pipedrive && (
                          <div style={{ marginTop: 8, fontSize: 11, color: T.laranja500 }}>
                            🔄 Este lead foi backfilled via Pipedrive (webhook da LP para saleszone pode ter falhado)
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
