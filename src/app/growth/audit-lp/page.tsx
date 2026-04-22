"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import Link from "next/link"
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
  font:       "'Helvetica Neue', -apple-system, BlinkMacSystemFont, sans-serif",
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
  aguardando:    { label: "Aguardando",   color: T.mutedFg,       Icon: Clock },
  ok:            { label: "OK",            color: T.verde600,      Icon: CheckCircle2 },
  sem_pipedrive: { label: "Sem Pipedrive", color: T.destructive,   Icon: XCircle },
  sem_mia:       { label: "Sem MIA",       color: T.laranja500,    Icon: AlertTriangle },
  descartado:    { label: "Descartado",    color: T.mutedFg,       Icon: XCircle },
}

export default function AuditLP() {
  const [tab, setTab] = useState<"leads" | "sobre">("leads")
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

  // Auto-refresh a cada 30s quando olhando o dia de hoje
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
    <div style={{ fontFamily: T.font, background: T.bg, color: T.fg, minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ padding: "20px 32px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Audit Morada</h1>
          <p style={{ fontSize: 12, color: T.mutedFg, margin: "4px 0 0 0" }}>
            Monitoramento de leads → Pipedrive → MIA
          </p>
        </div>
        <nav style={{ display: "flex", gap: 8 }}>
          <Link href="/growth/audit-mql" style={{
            padding: "6px 12px", fontSize: 13, textDecoration: "none",
            color: T.mutedFg, border: `1px solid ${T.border}`, borderRadius: 6,
          }}>Meta Ads</Link>
          <span style={{
            padding: "6px 12px", fontSize: 13, fontWeight: 600,
            color: T.bg, background: T.primary, borderRadius: 6,
          }}>Landing Pages</span>
        </nav>
      </header>

      <div style={{ padding: "24px 32px" }}>
        {/* Filtros */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {lastUpdate && !loading && tab === "leads" && (
            <span style={{ fontSize: 12, color: T.mutedFg }}>
              Atualizado {fmtTime(lastUpdate.toISOString())}
            </span>
          )}
          <button onClick={() => fetchLeads(date)}
            style={{
              padding: "6px 12px", fontSize: 13, background: T.muted, border: `1px solid ${T.border}`,
              borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : undefined }} />
            Atualizar
          </button>
          {tab === "leads" && (
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
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 24 }}>
          {(["leads", "sobre"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 16px", background: "transparent", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? T.primary : T.mutedFg,
              borderBottom: tab === t ? `2px solid ${T.primary}` : "2px solid transparent",
              marginBottom: -1,
            }}>{t === "leads" ? "Leads" : "Sobre"}</button>
          ))}
        </div>

        {tab === "leads" && (
          <>
            {/* Stats */}
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

            {/* Tabela */}
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
          </>
        )}

        {tab === "sobre" && <SobreTab />}
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

function SobreTab() {
  return (
    <div style={{ maxWidth: 960 }}>
      <section style={{ marginBottom: 32 }}>
        <h2 style={{
          fontSize: 12, fontWeight: 600, color: T.mutedFg,
          textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12,
        }}>O que é este audit</h2>
        <div style={{
          padding: 16, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
          fontSize: 14, lineHeight: 1.6,
        }}>
          <p style={{ margin: 0 }}>
            Monitora cadastros vindos das nossas <strong>Landing Pages WordPress</strong> (Elementor Forms).
            Valida se cada cadastro gerou <strong>deal no Pipedrive</strong> e recebeu <strong>atendimento da MIA</strong>.
            Envia alertas no Slack <code>#heartbeat-audit-mql</code> com prefixo <code>[LP]</code> quando algo falha.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{
          fontSize: 12, fontWeight: 600, color: T.mutedFg,
          textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12,
        }}>Fluxo de 1 cadastro</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {[
            { step: "1", title: "Usuário envia o form na LP", desc: "Cadastro via Elementor Form em alguma LP do domínio institucional.seazone.com.br (ex: /novos-proprietarios/)." },
            { step: "2", title: "Elementor dispara 2 webhooks em paralelo", desc: "(a) Para o n8n → cria Pessoa+Deal no Pipedrive e aciona MIA. (b) Para o saleszone (/api/growth/audit-lp/webhook) → grava em blob para auditoria." },
            { step: "3", title: "Audit grava como 'Aguardando'", desc: "O webhook saleszone valida Bearer token, extrai campos e salva em audit-lp/{YYYY-MM-DD}.json. Dedup por email+phone do dia." },
            { step: "4", title: "Delayed check em 5 min", desc: "Background task dispara o cron /check após 5 min. O cron também roda a cada 10 min (Vercel) como fallback." },
            { step: "5", title: "Check verifica Pipedrive + MIA", desc: "Busca Person por email → fallback phone. Pega deal mais recente e lê o campo 'Link da Conversa' (MIA). Se faltar deal → Sem Pipedrive; se faltar link → Sem MIA + busca a Note do erro." },
            { step: "6", title: "Alerta Slack", desc: "Quando detecta problema, envia mensagem em #heartbeat-audit-mql com prefixo [LP]. Protegido por lock atômico (mesma mecânica do audit-mql) pra não duplicar alerta." },
            { step: "7", title: "Recovery a cada 30 min", desc: "Backfill via Pipedrive para cobrir webhook saleszone perdido (o webhook do n8n ainda funcionou e o deal existe no Pipe). Requer filter_id Pipedrive configurado." },
          ].map(s => (
            <div key={s.step} style={{
              display: "grid", gridTemplateColumns: "40px 1fr",
              gap: 12, padding: 12, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: T.primary, color: T.bg,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
              }}>{s.step}</div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{
          fontSize: 12, fontWeight: 600, color: T.mutedFg,
          textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12,
        }}>Configuração do webhook no Elementor</h2>
        <div style={{
          padding: 16, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
          fontSize: 13, lineHeight: 1.6,
        }}>
          <p style={{ margin: "0 0 8px 0" }}>
            Em cada formulário Elementor, adicionar um segundo Webhook em <em>Actions After Submit → Webhook</em>:
          </p>
          <ul style={{ margin: "0 0 8px 20px", padding: 0 }}>
            <li><strong>URL:</strong> <code>https://saleszone.vercel.app/api/growth/audit-lp/webhook</code></li>
            <li><strong>Advanced → Custom Headers:</strong> <code>Authorization: Bearer {'{'}LP_WEBHOOK_SECRET{'}'}</code></li>
            <li><strong>Method:</strong> POST</li>
            <li><strong>Advanced Data:</strong> mantem padrão (form fields + form_name + page_url)</li>
          </ul>
          <p style={{ margin: 0, color: T.mutedFg, fontSize: 12 }}>
            O webhook do n8n já existente continua rodando em paralelo. Se o webhook saleszone falhar,
            o cron /recovery (30 min) pega os deals criados via n8n como fallback.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{
          fontSize: 12, fontWeight: 600, color: T.mutedFg,
          textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12,
        }}>Status possíveis</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {Object.entries(STATUS_CFG).map(([k, cfg]) => (
            <div key={k} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: 10, background: T.card, border: `1px solid ${T.border}`, borderRadius: 6,
            }}>
              <cfg.Icon size={16} style={{ color: cfg.color }} />
              <strong style={{ minWidth: 140 }}>{cfg.label}</strong>
              <span style={{ fontSize: 13, color: T.mutedFg }}>
                {k === "aguardando"    && "Lead acabou de chegar; check em até 5 min."}
                {k === "ok"            && "Deal no Pipedrive existe e MIA está atendendo."}
                {k === "sem_pipedrive" && "Lead chegou na LP mas não achamos no Pipedrive (n8n pode ter falhado)."}
                {k === "sem_mia"       && "Deal existe mas MIA não respondeu; erro é capturado da Note do deal."}
                {k === "descartado"    && "Lead ignorado manualmente (trim_before admin op)."}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{
          fontSize: 12, fontWeight: 600, color: T.mutedFg,
          textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12,
        }}>Storage & crons</h2>
        <div style={{
          padding: 16, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
          fontSize: 13, lineHeight: 1.6,
        }}>
          <ul style={{ margin: 0, padding: "0 0 0 20px" }}>
            <li><strong>Blob paths:</strong> <code>audit-lp/{'{YYYY-MM-DD}'}.json</code> (leads), <code>audit-lp/locks/{'{date}'}/{'{id}'}.lock</code> (concurrency)</li>
            <li><strong>Cron check:</strong> a cada 10 min (Vercel)</li>
            <li><strong>Cron recovery:</strong> a cada 30 min (Vercel)</li>
            <li><strong>Webhook delayed check:</strong> 5 min após cada submit (via waitUntil)</li>
            <li><strong>Slack webhook:</strong> reutiliza <code>SLACK_WEBHOOK_AUDIT_MQL</code> com prefixo <code>[LP]</code></li>
          </ul>
        </div>
      </section>
    </div>
  )
}
