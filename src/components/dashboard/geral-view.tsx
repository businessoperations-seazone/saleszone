"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { T } from "@/lib/constants";
import type { GeralData, GeralChannelResult } from "@/lib/types";

interface Props {
  data: GeralData | null;
  loading: boolean;
  lastUpdated?: Date | null;
}

const CHANNEL_ICONS: Record<string, string> = {
  Geral: "📊",
  "Vendas Diretas": "🎯",
  Parceiros: "🤝",
};

const CHANNEL_ACCENT: Record<string, string> = {
  Geral: "rgba(34,197,94,0.04)",
  "Vendas Diretas": "rgba(59,130,246,0.04)",
  Parceiros: "rgba(168,85,247,0.04)",
};

function progressColor(pct: number): string {
  if (pct >= 100) return "#22c55e";
  if (pct >= 80) return "#3b82f6";
  if (pct >= 60) return "#f97316";
  return "#ef4444";
}

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtMoney(n: number): string {
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return `R$ ${fmtNum(n)}`;
}

function ProgressBar({ label, real, meta, isMoney }: { label: string; real: number; meta: number; isMoney?: boolean }) {
  const pct = meta > 0 ? Math.round((real / meta) * 1000) / 10 : 0;
  const clampedWidth = Math.min(pct, 100);
  const color = progressColor(pct);
  const fmt = isMoney ? fmtMoney : fmtNum;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.cinza600, marginBottom: 3 }}>
        <span>{label}</span>
        <span>{fmt(real)} / {fmt(meta)}</span>
      </div>
      <div style={{ height: 22, background: T.cinza50, borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${clampedWidth}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            paddingLeft: 8,
            fontSize: 10,
            color: "#fff",
            fontWeight: 600,
            minWidth: 40,
          }}
        >
          {pct.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function AreaChart({ data, color }: { data: { date: string; value: number }[]; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div style={{ fontSize: 11, color: T.cinza400, padding: 20, textAlign: "center" }}>Dados insuficientes</div>;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const W = 500;
  const H = 70;
  const todayStr = new Date().toISOString().substring(0, 10);
  const todayIdx = data.findIndex((d) => d.date === todayStr);
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - (d.value / maxVal) * (H - 5),
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" L");
  const area = `M${line} L${W},${H} L0,${H} Z`;
  const activeIdx = hover ?? (todayIdx >= 0 ? todayIdx : data.length - 1);

  return (
    <svg width="100%" height={H + 18} viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * W;
        const idx = Math.round((x / W) * (data.length - 1));
        if (idx >= 0 && idx < data.length) setHover(idx);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${color.replace("#", "")})`} opacity={0.3} />
      <path d={`M${line}`} fill="none" stroke={color} strokeWidth={2} />
      {activeIdx >= 0 && activeIdx < points.length && (
        <>
          <line x1={points[activeIdx].x} y1={0} x2={points[activeIdx].x} y2={H} stroke={T.cinza300} strokeWidth={1} strokeDasharray="3" />
          <circle cx={points[activeIdx].x} cy={points[activeIdx].y} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
          <text x={points[activeIdx].x} y={H + 13} textAnchor="middle" fontSize={10} fontWeight={600} fill={T.fg}>
            {fmtNum(data[activeIdx].value)} · {data[activeIdx].date.substring(5).replace("-", "/")}
          </text>
        </>
      )}
    </svg>
  );
}

const STAGE_COLORS: Record<string, string> = {
  mql: "#60a5fa", sql: "#a855f7", opp: "#fbbf24", won: "#22c55e", reserva: "#f97316", contrato: "#ef4444",
};

const STAGE_LABELS: Record<string, string> = {
  mql: "MQL", sql: "SQL", opp: "OPP", won: "WON", reserva: "Reserva", contrato: "Contrato",
};

function MultiLineChart({ data }: { data: { date: string; byStage: Record<string, number> }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div style={{ fontSize: 11, color: T.cinza400, padding: 20, textAlign: "center" }}>Dados insuficientes</div>;
  const stages = Object.keys(STAGE_COLORS);
  const maxVal = Math.max(...data.flatMap((d) => stages.map((s) => d.byStage[s] || 0)), 1);
  const W = 500;
  const H = 70;
  const todayStr = new Date().toISOString().substring(0, 10);
  const todayIdx = data.findIndex((d) => d.date === todayStr);
  const activeIdx = hover ?? (todayIdx >= 0 ? todayIdx : data.length - 1);
  const activeData = activeIdx >= 0 && activeIdx < data.length ? data[activeIdx] : null;

  return (
    <div>
      {activeData && (
        <div style={{ fontSize: 9, color: T.cinza600, marginBottom: 4, minHeight: 14, display: "flex", flexWrap: "wrap", gap: "2px 8px" }}>
          <span style={{ fontWeight: 600 }}>{activeData.date.substring(5).replace("-", "/")}</span>
          {stages.map((s) => (
            <span key={s} style={{ color: STAGE_COLORS[s], fontWeight: 500 }}>
              {STAGE_LABELS[s]}: {fmtNum(activeData.byStage[s] || 0)}
            </span>
          ))}
        </div>
      )}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round((x / W) * (data.length - 1));
          if (idx >= 0 && idx < data.length) setHover(idx);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {stages.map((stage) => {
          const points = data.map((d, i) => {
            const x = (i / (data.length - 1)) * W;
            const y = H - ((d.byStage[stage] || 0) / maxVal) * (H - 5);
            return `${x},${y}`;
          });
          const isDashed = stage === "reserva" || stage === "contrato";
          return (
            <path
              key={stage}
              d={`M${points.join(" L")}`}
              fill="none"
              stroke={STAGE_COLORS[stage]}
              strokeWidth={1.5}
              strokeDasharray={isDashed ? "4" : undefined}
            />
          );
        })}
      </svg>
    </div>
  );
}

function ChannelCard({ channel, historyDays }: { channel: GeralChannelResult; historyDays: number }) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const { metrics, snapshots, ocupacaoAgenda, noShow, reservaHistory, dealsHistory, lastMonthWon, name } = channel;
  const icon = CHANNEL_ICONS[name] || "📊";
  const accent = CHANNEL_ACCENT[name] || "transparent";
  const isGeral = name === "Geral";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - historyDays);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  const filteredHistory = dealsHistory.filter((h) => h.date >= cutoffStr);

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 20, background: accent, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: T.fg }}>
          {icon} {name}
        </span>
        <span style={{ fontSize: 13, color: T.cinza600 }}>
          ({fmtNum(metrics.won.real)}/{fmtNum(metrics.won.meta)} vendas) — LM: {fmtNum(lastMonthWon)}
        </span>
        <span
          style={{ position: "relative", cursor: "pointer", color: T.cinza400, fontSize: 14 }}
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
        >
          <Info size={14} />
          {tooltipOpen && (
            <div style={{
              position: "absolute", top: 20, left: -100, zIndex: 10, background: T.fg, color: "#fff",
              padding: "8px 12px", borderRadius: 6, fontSize: 11, width: 280, lineHeight: 1.4,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}>
              {channel.filterDescription}
            </div>
          )}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 16 }}>
        <div>
          {metrics.orcamento && <ProgressBar label="Orçamento" real={metrics.orcamento.real} meta={metrics.orcamento.meta} isMoney />}
          {metrics.leads && <ProgressBar label="Leads" real={metrics.leads.real} meta={metrics.leads.meta} />}
          <ProgressBar label="MQL" real={metrics.mql.real} meta={metrics.mql.meta} />
          <ProgressBar label="SQL" real={metrics.sql.real} meta={metrics.sql.meta} />
          <ProgressBar label="OPP" real={metrics.opp.real} meta={metrics.opp.meta} />
          {metrics.reserva && <ProgressBar label="Reserva" real={metrics.reserva.real} meta={metrics.reserva.meta} />}
          {metrics.contrato && <ProgressBar label="Contrato" real={metrics.contrato.real} meta={metrics.contrato.meta} />}
          <ProgressBar label="Ganhos (WON)" real={metrics.won.real} meta={metrics.won.meta} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: "12px 14px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.fg, marginBottom: 8 }}>Deals Abertos no Funil</div>
            <AreaChart
              data={filteredHistory.map((h) => ({ date: h.date, value: h.total }))}
              color={name === "Parceiros" ? "#a855f7" : name === "Vendas Diretas" ? "#3b82f6" : "#22c55e"}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: T.cinza400, marginTop: 2 }}>
              <span>{filteredHistory[0]?.date.substring(5).replace("-", "/") || ""}</span>
              <span>{filteredHistory[filteredHistory.length - 1]?.date.substring(5).replace("-", "/") || ""}</span>
            </div>
          </div>
          <div style={{ padding: "12px 14px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.fg }}>Deals por Etapa</span>
              <div style={{ display: "flex", gap: 6, fontSize: 9 }}>
                {Object.entries(STAGE_LABELS).map(([key, lbl]) => (
                  <span key={key} style={{ color: STAGE_COLORS[key] }}>● {lbl}</span>
                ))}
              </div>
            </div>
            <MultiLineChart data={filteredHistory} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isGeral ? `repeat(${3 + (noShow ? 1 : 0)}, 1fr)` : `repeat(${3 + (noShow ? 1 : 0)}, 1fr)`, gap: 10 }}>
        {isGeral && reservaHistory ? (
          <>
            <div style={{ padding: "14px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.cinza600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Reservas no Mês</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#f97316" }}>
                {fmtNum(reservaHistory.length > 0 ? reservaHistory[reservaHistory.length - 1].reserva : 0)}
              </div>
              <div style={{ fontSize: 11, color: T.cinza400, marginTop: 4 }}>acumulado</div>
            </div>
            <div style={{ padding: "14px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.cinza600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Contratos no Mês</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>
                {fmtNum(reservaHistory.length > 0 ? reservaHistory[reservaHistory.length - 1].contrato : 0)}
              </div>
              <div style={{ fontSize: 11, color: T.cinza400, marginTop: 4 }}>acumulado</div>
            </div>
            <div style={{ padding: "14px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.cinza600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Ocupação Agenda</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#60a5fa" }}>
                {ocupacaoAgenda ? ocupacaoAgenda.percent.toFixed(1) : "—"}<span style={{ fontSize: 14 }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: T.cinza400, marginTop: 4 }}>{ocupacaoAgenda ? `${ocupacaoAgenda.agendadas}/${ocupacaoAgenda.capacidade} slots (7d)` : "sem dados"}</div>
            </div>
            {noShow && (
              <div style={{ padding: "14px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: T.cinza600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>No-Show</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: noShow.percent > 20 ? "#ef4444" : noShow.percent > 10 ? "#f59e0b" : "#22c55e" }}>
                  {noShow.percent.toFixed(1)}<span style={{ fontSize: 14 }}>%</span>
                </div>
                <div style={{ fontSize: 11, color: T.cinza400, marginTop: 4 }}>{noShow.canceladas}/{noShow.total} reuniões (7d)</div>
              </div>
            )}
          </>
        ) : snapshots ? (
          <>
            <div style={{ padding: "14px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.cinza600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Em Reserva</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#f97316" }}>{fmtNum(snapshots.reserva)}</div>
              <div style={{ fontSize: 11, color: T.cinza400, marginTop: 4 }}>deals na etapa</div>
            </div>
            <div style={{ padding: "14px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.cinza600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Em Contrato</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{fmtNum(snapshots.contrato)}</div>
              <div style={{ fontSize: 11, color: T.cinza400, marginTop: 4 }}>deals na etapa</div>
            </div>
            <div style={{ padding: "14px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.cinza600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Ocupação Agenda</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#60a5fa" }}>
                {ocupacaoAgenda ? ocupacaoAgenda.percent.toFixed(1) : "—"}<span style={{ fontSize: 14 }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: T.cinza400, marginTop: 4 }}>{ocupacaoAgenda ? `${ocupacaoAgenda.agendadas}/${ocupacaoAgenda.capacidade} slots (7d)` : "sem dados"}</div>
            </div>
            {noShow && (
            <div style={{ padding: "14px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.cinza600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>No-Show</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: noShow.percent > 20 ? "#ef4444" : noShow.percent > 10 ? "#f59e0b" : "#22c55e" }}>
                {noShow.percent.toFixed(1)}<span style={{ fontSize: 14 }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: T.cinza400, marginTop: 4 }}>{noShow.canceladas}/{noShow.total} reuniões (7d)</div>
            </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function GeralView({ data, loading, lastUpdated }: Props) {
  const [historyDays, setHistoryDays] = useState(30);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60, color: T.cinza400, fontSize: 14 }}>
        Carregando...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60, color: T.cinza400, fontSize: 14 }}>
        Sem dados
      </div>
    );
  }

  return (
    <div style={{ fontFamily: T.font, maxWidth: 1100, margin: "0 auto", padding: "20px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: T.cinza600 }}>
          {data.month.replace("-", "/")}
          {lastUpdated && <span style={{ marginLeft: 8, fontSize: 10, color: T.cinza400 }}>Atualizado {lastUpdated.toLocaleTimeString("pt-BR")}</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setHistoryDays(d)}
              style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                background: historyDays === d ? T.azul600 : T.cinza50,
                color: historyDays === d ? "#fff" : T.cinza600,
                fontWeight: 500,
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {data.channels.map((ch) => (
        <ChannelCard key={ch.name} channel={ch} historyDays={historyDays} />
      ))}

      <div style={{ textAlign: "center", fontSize: 11, color: T.cinza400, marginTop: 8 }}>
        Barras: <span style={{ color: "#22c55e" }}>■</span> ≥100%
        {" · "}<span style={{ color: "#3b82f6" }}>■</span> 80-99%
        {" · "}<span style={{ color: "#f97316" }}>■</span> 60-79%
        {" · "}<span style={{ color: "#ef4444" }}>■</span> &lt;60%
      </div>
    </div>
  );
}
