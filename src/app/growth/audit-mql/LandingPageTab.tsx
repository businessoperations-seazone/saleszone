"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { ShieldAlert, CheckCircle2, XCircle, Clock, RefreshCw, AlertTriangle } from "lucide-react"
import type { LpLeadRecord } from "@/lib/audit-lp"

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

const BRT = "America/Sao_Paulo"
function brtNow() { return new Date(Date.now() - 3 * 60 * 60 * 1000) }
function todayKey() { return brtNow().toISOString().slice(0, 10) }
function offsetKey(days: number) {
  const d = brtNow(); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BRT })
}

const STATUS_CFG: Record<LpLeadRecord["status"], { label: string; color: string; Icon: typeof ShieldAlert }> = {
  aguardando:    { label: "Aguardando",   color: T.mutedFg,     Icon: Clock },
  ok:            { label: "OK",           color: T.verde600,    Icon: CheckCircle2 },
  sem_pipedrive: { label: "Sem Pipedrive", color: T.destructive, Icon: XCircle },
  sem_mia:       { label: "Sem MIA",       color: T.laranja500,  Icon: AlertTriangle },
  descartado:    { label: "Descartado",    color: T.mutedFg,     Icon: XCircle },
}

export default function LandingPageTab() {
  const [date, setDate] = useState(todayKey())
  const [leads, setLeads] = useState<LpLeadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [recheckingId, setRecheckingId] = useState<string | null>(null)

  const fetchLeads = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/growth/audit-lp/leads?date=${d}`, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setLeads(data)
      }
      setLastUpdate(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads(date) }, [date, fetchLeads])

  useEffect(() => {
    if (date !== todayKey()) return
    const id = setInterval(() => fetchLeads(date), 30_000)
    return () => clearInterval(id)
  }, [date, fetchLeads])

  const recheck = async (id: string) => {
    setRecheckingId(id)
    try {
      const res = await fetch("/api/growth/audit-lp/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recheck: id, date }),
      })
      if (res.ok) await fetchLeads(date)
    } finally {
      setRecheckingId(null)
    }
  }

  const stats = {
    total: leads.length,
    ok: leads.filter(l => l.status === "ok").length,
    sem_pipedrive: leads.filter(l => l.status === "sem_pipedrive").length,
    sem_mia: leads.filter(l => l.status === "sem_mia").length,
    aguardando: leads.filter(l => l.status === "aguardando").length,
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {lastUpdate && !loading && (
          <span style={{ fontSize: 12, color: T.mutedFg }}>
            Atualizado {fmtTime(lastUpdate.toISOString())}
          </span>
        )}
        <button onClick={() => fetchLeads(date)}
          style={{
            padding: "5px 10px", fontSize: 12, background: "none", border: `1px solid ${T.border}`,
            borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            color: T.mutedFg,
          }}>
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : undefined }} />
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "Hoje", value: todayKey() },
            { label: "Ontem", value: offsetKey(-1) },
            { label: "-2", value: offsetKey(-2) },
            { label: "-3", value: offsetKey(-3) },
          ].map(p => (
            <button key={p.value} onClick={() => setDate(p.value)}
              style={{
                padding: "4px 10px", fontSize: 12,
                background: date === p.value ? T.primary : T.muted,
                color: date === p.value ? T.bg : T.fg,
                border: `1px solid ${date === p.value ? T.primary : T.border}`,
                borderRadius: 6, cursor: "pointer",
              }}>{p.label}</button>
          ))}
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{
              padding: "4px 8px", fontSize: 12,
              background: T.bg, color: T.fg,
              border: `1px solid ${T.border}`, borderRadius: 6,
            }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total", value: stats.total, color: T.fg },
          { label: "OK", value: stats.ok, color: T.verde600 },
          { label: "Aguardando", value: stats.aguardando, color: T.mutedFg },
          { label: "Sem Pipedrive", value: stats.sem_pipedrive, color: T.destructive },
          { label: "Sem MIA", value: stats.sem_mia, color: T.laranja500 },
        ].map(c => (
          <div key={c.label} style={{
            padding: 16, background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 8, boxShadow: T.elevSm,
          }}>
            <div style={{ fontSize: 12, color: T.mutedFg, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color, fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: T.muted }}>
            <tr>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Horário</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Nome</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Email / Tel</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>LP / Form</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Vertical</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Status</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>Deal</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}>MIA</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: T.mutedFg }}></th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && !loading && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: T.mutedFg }}>
                Nenhum lead de LP para {date}.
              </td></tr>
            )}
            {leads.map(l => {
              const cfg = STATUS_CFG[l.status]
              const Icon = cfg.Icon
              const isExpanded = expanded === l.id
              return (
                <Fragment key={l.id}>
                  <tr style={{ borderTop: `1px solid ${T.border}`, cursor: "pointer" }}
                      onClick={() => setExpanded(isExpanded ? null : l.id)}>
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
                    <td style={{ padding: "10px 14px" }}>{l.vertical || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        color: cfg.color, fontWeight: 500,
                      }}>
                        <Icon size={14} /> {cfg.label}
                      </span>
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
                        <button onClick={e => { e.stopPropagation(); recheck(l.id) }}
                          disabled={recheckingId === l.id}
                          style={{
                            padding: "4px 8px", fontSize: 11,
                            background: T.muted, border: `1px solid ${T.border}`,
                            borderRadius: 4, cursor: "pointer", color: T.fg,
                          }}>
                          {recheckingId === l.id ? "..." : "Recheck"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: T.muted }}>
                      <td colSpan={9} style={{ padding: 16 }}>
                        {l.mia_error && (
                          <div style={{
                            marginBottom: 12, padding: 12, background: "#FFF5F5",
                            border: `1px solid ${T.destructive}`, borderRadius: 6,
                          }}>
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
