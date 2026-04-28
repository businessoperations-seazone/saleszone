"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronLeft, Columns3, Info, BarChart3, Table2 } from "lucide-react";
import { T, TABS, SQUAD_COLORS, TAB_COLORS, NUM_DAYS, MONTHS_PT } from "@/lib/constants";
import type { TabKey, AcompanhamentoData, SquadData } from "@/lib/types";
import { Pill, Tag, TH, cellStyle, cellRightStyle, hdrBaseStyle, DataSourceFooter } from "./ui";

function heatColor(value: number, min: number, max: number): string | undefined {
  if (value === 0) return undefined;
  if (min === max) return "rgba(34,197,94,0.15)";
  const ratio = (value - min) / (max - min);
  if (ratio <= 0.5) {
    const t = ratio * 2;
    const r = Math.round(239 + (234 - 239) * t);
    const g = Math.round(68 + (179 - 68) * t);
    const b = Math.round(68 + (8 - 68) * t);
    return `rgba(${r},${g},${b},0.18)`;
  }
  const t = (ratio - 0.5) * 2;
  const r = Math.round(234 + (34 - 234) * t);
  const g = Math.round(179 + (197 - 179) * t);
  const b = Math.round(8 + (94 - 8) * t);
  return `rgba(${r},${g},${b},0.18)`;
}

function rowMinMax(daily: number[]): { min: number; max: number } {
  const nonZero = daily.filter(v => v > 0);
  if (nonZero.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...nonZero), max: Math.max(...nonZero) };
}

export type AcompFilter = "all" | "marketing" | "paid" | "ctwa" | "vd" | "expansao" | "sao-paulo" | "salvador" | "florianopolis" | "outros";

interface Props {
  data: AcompanhamentoData | null;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  loading: boolean;
  lastUpdated?: Date | null;
  moduleId?: string;
  acompFilter: AcompFilter;
  setAcompFilter: (f: AcompFilter) => void;
}

// ─── Gráfico de Barras Empilhadas ─────────────────────────────────────────

interface BarChartData {
  label: string;
  segments: { name: string; value: number; color: string }[];
  total: number;
}

function StackedBarChart({ bars, maxValue }: { bars: BarChartData[]; maxValue: number }) {
  const BAR_HEIGHT = 220;
  const [hoverBar, setHoverBar] = useState<number | null>(null);

  if (bars.length === 0 || maxValue === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: T.mutedFg, fontSize: "13px" }}>
        Sem dados para exibir
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: bars.length > 20 ? "2px" : "4px",
          padding: "20px 8px 0",
          minHeight: BAR_HEIGHT + 50,
          minWidth: bars.length * (bars.length > 20 ? 28 : 40),
        }}
      >
        {bars.map((bar, bi) => {
          const barPx = maxValue > 0 ? (bar.total / maxValue) * BAR_HEIGHT : 0;
          return (
            <div
              key={bi}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: "1 1 0",
                minWidth: bars.length > 20 ? 24 : 36,
              }}
              onMouseEnter={() => setHoverBar(bi)}
              onMouseLeave={() => setHoverBar(null)}
            >
              {/* Total em cima */}
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: bar.total > 0 ? T.fg : T.cinza300,
                  marginBottom: "4px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {bar.total > 0 ? bar.total : ""}
              </div>
              {/* Barra empilhada */}
              <div
                style={{
                  width: "100%",
                  height: `${barPx}px`,
                  display: "flex",
                  flexDirection: "column-reverse",
                  borderRadius: "3px 3px 0 0",
                  overflow: "hidden",
                  transition: "opacity 0.15s",
                  opacity: hoverBar !== null && hoverBar !== bi ? 0.5 : 1,
                  position: "relative",
                }}
              >
                {bar.segments.map((seg, si) => {
                  const segPx = maxValue > 0 ? (seg.value / maxValue) * BAR_HEIGHT : 0;
                  return (
                    <div
                      key={si}
                      style={{
                        height: `${segPx}px`,
                        backgroundColor: seg.color,
                        minHeight: seg.value > 0 ? 2 : 0,
                      }}
                      title={`${seg.name}: ${seg.value}`}
                    />
                  );
                })}
              </div>
              {/* Label do dia */}
              <div
                style={{
                  fontSize: "9px",
                  color: T.cinza600,
                  marginTop: "4px",
                  textAlign: "center",
                  lineHeight: "1.2",
                  whiteSpace: "nowrap",
                }}
              >
                {bar.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AcompanhamentoView({ data, activeTab, setActiveTab, loading, lastUpdated, moduleId, acompFilter, setAcompFilter }: Props) {
  const isSZS = moduleId === "szs";
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true });
  const [showTeamCols, setShowTeamCols] = useState(false);
  const [hCol, setHCol] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [chartGroup, setChartGroup] = useState<"day" | "week">("day");

  const toggle = (id: number) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const dates = data?.dates || [];
  const squads = data?.squads || [];
  const grand = data?.grand || { totalMes: 0, metaToDate: 0, daily: [] };

  const pct = grand.metaToDate > 0 ? Math.round((grand.totalMes / grand.metaToDate) * 100) : 0;
  const cellBg = (i: number) => (hCol === i ? T.azul50 : dates[i]?.isWeekend ? "#FAFAFB" : "transparent");

  const weekStarts = useMemo(() => {
    const s = new Set<number>();
    dates.forEach((d, i) => {
      if (d.isSunday && i > 0) s.add(i);
    });
    return s;
  }, [dates]);

  // ─── Dados do gráfico de barras empilhadas ─────────────────────────────────
  const chartBars = useMemo((): BarChartData[] => {
    if (!data || dates.length === 0 || squads.length === 0) return [];

    // Montar barras por dia: cada barra tem segmentos por squad
    const dailyBars: BarChartData[] = dates.map((d, i) => {
      const segments = squads.map((sq) => {
        const val = sq.rows.reduce((s, r) => s + (r.daily[i] || 0), 0);
        return { name: sq.name, value: val, color: SQUAD_COLORS[sq.id] || T.azul600 };
      });
      const total = segments.reduce((s, seg) => s + seg.value, 0);
      const dayLabel = `${d.label.split(" ")[0]}/${MONTHS_PT.indexOf(d.label.split(" ")[1]) + 1}`;
      return { label: dayLabel, segments, total };
    });

    if (chartGroup === "day") return dailyBars;

    // Agrupar por semana
    const weekBars: BarChartData[] = [];
    let currentWeek: BarChartData | null = null;
    let weekNum = 1;

    dailyBars.forEach((bar, i) => {
      if (i === 0 || weekStarts.has(i)) {
        if (currentWeek) weekBars.push(currentWeek);
        currentWeek = {
          label: `Sem. ${weekNum}`,
          segments: squads.map((sq) => ({ name: sq.name, value: 0, color: SQUAD_COLORS[sq.id] || T.azul600 })),
          total: 0,
        };
        weekNum++;
      }
      if (currentWeek) {
        currentWeek.total += bar.total;
        bar.segments.forEach((seg, si) => {
          if (currentWeek!.segments[si]) currentWeek!.segments[si].value += seg.value;
        });
      }
    });
    if (currentWeek) weekBars.push(currentWeek);
    return weekBars;
  }, [data, dates, squads, chartGroup, weekStarts]);

  const chartMax = useMemo(() => {
    if (chartBars.length === 0) return 0;
    return Math.max(...chartBars.map((b) => b.total), 1);
  }, [chartBars]);

  if (loading && !data) {
    return (
      <div style={{ textAlign: "center", padding: "60px", color: T.cinza600 }}>
        Carregando dados do Pipedrive...
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: "3px",
              backgroundColor: T.bg,
              borderRadius: "12px",
              padding: "3px",
              border: `1px solid ${T.border}`,
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "7px 22px",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  transition: "all 0.15s",
                  backgroundColor: activeTab === tab.key ? TAB_COLORS[tab.key] : "transparent",
                  color: activeTab === tab.key ? "#FFF" : T.mutedFg,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Filtro Geral / Marketing / Mídia Paga */}
          {acompFilter !== "all" && (
            <span style={{
              fontSize: "11px",
              fontWeight: 600,
              color: T.primary,
              backgroundColor: T.azul50,
              padding: "3px 10px",
              borderRadius: "6px",
              border: `1px solid ${T.primary}33`,
            }}>
              {acompFilter === "marketing" ? "Marketing" : acompFilter === "paid" ? "Mídia Paga" : "CTWA"}
            </span>
          )}
          <div
            style={{
              display: "flex",
              gap: "2px",
              backgroundColor: T.bg,
              borderRadius: "8px",
              padding: "2px",
              border: `1px solid ${T.border}`,
            }}
          >
            {(isSZS ? [
              { key: "all" as AcompFilter, label: "Geral" },
              { key: "sao-paulo" as AcompFilter, label: "São Paulo" },
              { key: "salvador" as AcompFilter, label: "Salvador" },
              { key: "florianopolis" as AcompFilter, label: "Florianópolis" },
              { key: "outros" as AcompFilter, label: "Outros" },
            ] : [
              { key: "all" as AcompFilter, label: "Geral" },
              { key: "marketing" as AcompFilter, label: "Marketing" },
              { key: "paid" as AcompFilter, label: "Mídia Paga" },
              { key: "ctwa" as AcompFilter, label: "CTWA" },
            ]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setAcompFilter(opt.key)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 500,
                  transition: "all 0.15s",
                  backgroundColor: acompFilter === opt.key ? T.primary : "transparent",
                  color: acompFilter === opt.key ? "#FFF" : T.mutedFg,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Toggle Tabela/Gráfico */}
          <div
            style={{
              display: "flex",
              gap: "2px",
              backgroundColor: T.bg,
              borderRadius: "8px",
              padding: "2px",
              border: `1px solid ${T.border}`,
            }}
          >
            <button
              onClick={() => setViewMode("table")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "5px 10px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 500,
                backgroundColor: viewMode === "table" ? T.fg : "transparent",
                color: viewMode === "table" ? "#FFF" : T.mutedFg,
                transition: "all 0.15s",
              }}
            >
              <Table2 size={12} /> Tabela
            </button>
            <button
              onClick={() => setViewMode("chart")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "5px 10px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 500,
                backgroundColor: viewMode === "chart" ? T.fg : "transparent",
                color: viewMode === "chart" ? "#FFF" : T.mutedFg,
                transition: "all 0.15s",
              }}
            >
              <BarChart3 size={12} /> Gráfico
            </button>
          </div>
          {/* Toggle Dia/Semana (somente no gráfico) */}
          {viewMode === "chart" && (
            <div
              style={{
                display: "flex",
                gap: "2px",
                backgroundColor: T.bg,
                borderRadius: "8px",
                padding: "2px",
                border: `1px solid ${T.border}`,
              }}
            >
              <button
                onClick={() => setChartGroup("day")}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 500,
                  backgroundColor: chartGroup === "day" ? T.fg : "transparent",
                  color: chartGroup === "day" ? "#FFF" : T.mutedFg,
                  transition: "all 0.15s",
                }}
              >
                Por Dia
              </button>
              <button
                onClick={() => setChartGroup("week")}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 500,
                  backgroundColor: chartGroup === "week" ? T.fg : "transparent",
                  color: chartGroup === "week" ? "#FFF" : T.mutedFg,
                  transition: "all 0.15s",
                }}
              >
                Por Semana
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Pill label="Total mês" value={grand.totalMes} bg={grand.totalMes >= grand.metaToDate ? T.verde600 : T.destructive} />
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <Pill label="Meta TD" value={grand.metaToDate} />
            {data?.metaInfo && (
              <div style={{ position: "relative", marginLeft: "4px", cursor: "help" }} className="meta-info-trigger">
                <Info size={15} color={T.cinza400} />
                <div className="meta-info-tooltip" style={{
                  display: "none",
                  position: "absolute",
                  top: "24px",
                  right: 0,
                  zIndex: 1000,
                  backgroundColor: "#1a1a2e",
                  color: "#e0e0e0",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  whiteSpace: "pre",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  minWidth: "420px",
                  fontFamily: "monospace",
                }}>
                  {(() => {
                    const m = data.metaInfo!;
                    const lines: string[] = [];
                    lines.push(`Meta WON total: ${m.wonMetaTotal} (pago + direto)`);
                    {
                      const totalClosers = m.squads.reduce((sum, sq) => sum + sq.closers, 0);
                      lines.push(`WON por closer: ${m.wonPerCloser.toFixed(1)} (${m.wonMetaTotal} / ${totalClosers} closer${totalClosers === 1 ? "" : "s"})`);
                    }
                    lines.push(`Proporção: dia ${m.day} / ${m.totalDaysInMonth} = ${(m.day / m.totalDaysInMonth * 100).toFixed(1)}%`);
                    lines.push(``);
                    lines.push(`Ratios 90d por squad (${activeTab.toUpperCase()}):`);
                    for (const sq of m.squads) {
                      const c = sq.counts90d;
                      lines.push(``);
                      lines.push(`Squad ${sq.id} (${sq.closers} closer${sq.closers > 1 ? "s" : ""}):`);
                      lines.push(`  MQL=${c.mql}  SQL=${c.sql}  OPP=${c.opp}  WON=${c.won}`);
                      lines.push(`  mql/sql=${sq.ratios.mql_sql}  sql/opp=${sq.ratios.sql_opp}  opp/won=${sq.ratios.opp_won}`);
                      const wonMetaSq = m.wonPerCloser * sq.closers;
                      const proportion = m.day / m.totalDaysInMonth;
                      let metaVal = proportion * wonMetaSq;
                      if (activeTab === "opp") metaVal *= sq.ratios.opp_won;
                      if (activeTab === "sql") metaVal *= sq.ratios.opp_won * sq.ratios.sql_opp;
                      if (activeTab === "mql") metaVal *= sq.ratios.opp_won * sq.ratios.sql_opp * sq.ratios.mql_sql;
                      lines.push(`  Meta ${activeTab.toUpperCase()} TD = ${Math.round(metaVal)}`);
                    }
                    return lines.join("\n");
                  })()}
                </div>
                <style>{`
                  .meta-info-trigger:hover .meta-info-tooltip { display: block !important; }
                `}</style>
              </div>
            )}
          </div>
          <Pill
            label="% Meta"
            value={`${pct}%`}
            color={pct >= 100 ? T.verde600 : pct >= 60 ? T.laranja500 : T.destructive}
          />
        </div>
      </div>

      {/* ─── Gráfico de Barras Empilhadas ─────────────────────────────── */}
      {viewMode === "chart" && (
        <div
          style={{
            backgroundColor: T.card,
            borderRadius: "12px",
            border: `1px solid ${T.border}`,
            boxShadow: T.elevSm,
            padding: "16px",
          }}
        >
          <StackedBarChart bars={chartBars} maxValue={chartMax} />
        </div>
      )}

      {/* ─── Tabela Heatmap ─────────────────────────────────────────── */}
      {viewMode === "table" && (
      <div
        style={{
          backgroundColor: T.card,
          borderRadius: "12px",
          border: `1px solid ${T.border}`,
          boxShadow: T.elevSm,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showTeamCols ? "2400px" : "2100px" }}>
            <thead>
              <tr style={{ backgroundColor: T.fg }}>
                <th colSpan={showTeamCols ? 5 : 3} style={{ ...hdrBaseStyle, borderBottom: "none" }} />
                <th style={{ ...hdrBaseStyle, borderBottom: "none" }} />
                <th style={{ ...hdrBaseStyle, borderBottom: "none" }} />
                {(() => {
                  const weeks: { start: number; count: number }[] = [];
                  let cw = { start: 0, count: 0 };
                  dates.forEach((d, i) => {
                    if (weekStarts.has(i) && cw.count > 0) {
                      weeks.push({ ...cw });
                      cw = { start: i, count: 0 };
                    }
                    cw.count++;
                  });
                  if (cw.count > 0) weeks.push(cw);
                  return weeks.map((w, wi) => (
                    <th
                      key={wi}
                      colSpan={w.count}
                      style={{
                        ...hdrBaseStyle,
                        textAlign: "center",
                        borderBottom: "none",
                        borderLeft: wi > 0 ? "2px solid rgba(255,255,255,0.15)" : "none",
                        fontSize: "9px",
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      Sem. {wi + 1}
                    </th>
                  ));
                })()}
              </tr>
              <tr style={{ backgroundColor: T.cinza50 }}>
                <TH w={120}>Squad</TH>
                {showTeamCols ? (
                  <>
                    <TH w={90}>
                      <span
                        style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
                        onClick={() => setShowTeamCols(false)}
                      >
                        <ChevronLeft size={11} style={{ color: T.primary }} /> Mkt
                      </span>
                    </TH>
                    <TH w={120}>Pré-Venda</TH>
                    <TH w={100}>Venda</TH>
                  </>
                ) : (
                  <TH w={150}>
                    <span
                      style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
                      onClick={() => setShowTeamCols(true)}
                    >
                      <Columns3 size={11} style={{ color: T.primary }} /> Equipe
                    </span>
                  </TH>
                )}
                <TH w={170}>{isSZS ? "Cidade" : "Empreendimento"}</TH>
                <TH w={68} right>
                  Total
                </TH>
                <TH w={68} right>
                  Meta
                </TH>
                {dates.map((d, i) => (
                  <TH
                    key={i}
                    w={52}
                    right
                    onMouseEnter={() => setHCol(i)}
                    onMouseLeave={() => setHCol(null)}
                    extraStyle={{
                      backgroundColor: hCol === i ? T.azul50 : d.isWeekend ? "#FAFAFB" : undefined,
                      borderLeft: weekStarts.has(i) ? `2px solid ${T.cinza200}` : undefined,
                      paddingLeft: "4px",
                      paddingRight: "4px",
                    }}
                  >
                    <div style={{ lineHeight: "1.1" }}>
                      <div
                        style={{
                          fontSize: "9px",
                          color: d.isWeekend ? T.cinza400 : T.cinza600,
                          fontWeight: 400,
                          textTransform: "none",
                        }}
                      >
                        {d.weekday}
                      </div>
                      <div>
                        {d.label.split(" ")[0]}/{MONTHS_PT.indexOf(d.label.split(" ")[1]) + 1}
                      </div>
                    </div>
                  </TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {squads.map((sq) => {
                const isOpen = expanded[sq.id] !== false;
                const clr = SQUAD_COLORS[sq.id] || T.azul600;
                const sqTm = sq.rows.reduce((s, r) => s + r.totalMes, 0);
                const sqD = new Array(NUM_DAYS).fill(0) as number[];
                sq.rows.forEach((r) => r.daily.forEach((v, i) => (sqD[i] += v)));
                return [
                  <tr
                    key={sq.id}
                    onClick={() => toggle(sq.id)}
                    style={{ cursor: "pointer", borderTop: `2px solid ${clr}33` }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.cinza50)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                  >
                    <td style={{ ...cellStyle, fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        {isOpen ? (
                          <ChevronDown size={13} style={{ color: clr, flexShrink: 0 }} />
                        ) : (
                          <ChevronRight size={13} style={{ color: clr, flexShrink: 0 }} />
                        )}
                        <span
                          style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "9999px",
                            backgroundColor: clr,
                            flexShrink: 0,
                          }}
                        />
                        {sq.name}
                      </div>
                    </td>
                    {showTeamCols ? (
                      <>
                        <td style={{ ...cellStyle, color: T.cinza700, fontWeight: 500 }}>{sq.marketing}</td>
                        <td style={{ ...cellStyle, color: T.cinza700, fontSize: "12px" }}>{sq.preVenda}</td>
                        <td style={{ ...cellStyle, color: T.cinza700, fontWeight: 500 }}>{sq.venda}</td>
                      </>
                    ) : (
                      <td style={{ ...cellStyle, color: T.cinza700 }}>
                        <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                          <Tag color={clr}>{sq.marketing}</Tag>
                          <Tag color={T.cinza600}>{(() => { const p = sq.preVenda.split(" "); return p.length > 1 ? p[0] + " " + p[p.length - 1][0] + "." : p[0]; })()}</Tag>
                          <Tag color={T.cinza600}>{(() => { const p = sq.venda.split(" "); return p.length > 1 ? p[0] + " " + p[p.length - 1][0] + "." : p[0]; })()}</Tag>
                        </div>
                      </td>
                    )}
                    <td style={{ ...cellStyle, fontWeight: 600, color: T.cinza600 }}>TOTAL</td>
                    <td style={{ ...cellRightStyle, fontWeight: 700, color: "#FFF", backgroundColor: sqTm >= sq.metaToDate ? T.verde600 : T.destructive, borderRadius: "4px" }}>{sqTm}</td>
                    <td style={{ ...cellRightStyle, fontWeight: 600 }}>{Math.round(sq.metaToDate)}</td>
                    {(() => {
                      const { min: sqMin, max: sqMax } = rowMinMax(sqD);
                      return sqD.map((v, i) => (
                        <td
                          key={i}
                          style={{
                            ...cellRightStyle,
                            fontWeight: 600,
                            backgroundColor: heatColor(v, sqMin, sqMax) || cellBg(i),
                            borderLeft: weekStarts.has(i) ? `2px solid ${T.cinza200}` : undefined,
                          }}
                          onMouseEnter={() => setHCol(i)}
                          onMouseLeave={() => setHCol(null)}
                        >
                          {v}
                        </td>
                      ));
                    })()}
                  </tr>,
                  ...(isOpen
                    ? sq.rows.map((r, ri) => (
                        <tr
                          key={`${sq.id}-${ri}`}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.cinza50)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                        >
                          <td style={cellStyle} />
                          {showTeamCols ? (
                            <>
                              <td style={cellStyle} />
                              <td style={cellStyle} />
                              <td style={cellStyle} />
                            </>
                          ) : (
                            <td style={cellStyle} />
                          )}
                          <td style={{ ...cellStyle, paddingLeft: "28px", color: T.cinza800 }}>{r.emp}</td>
                          <td style={cellRightStyle}>{r.totalMes}</td>
                          <td style={cellRightStyle} />
                          {(() => {
                            const { min: rMin, max: rMax } = rowMinMax(r.daily);
                            return r.daily.map((v, i) => (
                              <td
                                key={i}
                                style={{
                                  ...cellRightStyle,
                                  color: v === 0 ? T.cinza300 : T.cardFg,
                                  backgroundColor: heatColor(v, rMin, rMax) || cellBg(i),
                                  borderLeft: weekStarts.has(i) ? `2px solid ${T.cinza200}` : undefined,
                                }}
                                onMouseEnter={() => setHCol(i)}
                                onMouseLeave={() => setHCol(null)}
                              >
                                {v}
                              </td>
                            ));
                          })()}
                        </tr>
                      ))
                    : []),
                ];
              })}
              <tr style={{ backgroundColor: T.fg }}>
                <td colSpan={showTeamCols ? 5 : 3} style={{ ...cellStyle, fontWeight: 700, color: T.primaryFg }}>
                  TOTAL GERAL
                </td>
                <td style={{ ...cellRightStyle, fontWeight: 700, color: "#FFF", backgroundColor: grand.totalMes >= grand.metaToDate ? T.verde600 : T.destructive, borderRadius: "4px" }}>{grand.totalMes}</td>
                <td style={{ ...cellRightStyle, fontWeight: 700, color: T.primaryFg }}>{Math.round(grand.metaToDate)}</td>
                {grand.daily.map((v, i) => (
                  <td
                    key={i}
                    style={{
                      ...cellRightStyle,
                      fontWeight: 700,
                      color: T.primaryFg,
                      borderLeft: weekStarts.has(i) ? "2px solid rgba(255,255,255,0.12)" : undefined,
                    }}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      )}

      <div
        style={{
          marginTop: "12px",
          display: "flex",
          gap: "16px",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          {data?.squads && data.squads.length > 0
            ? data.squads.map((sq) => (
                <div key={sq.id} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "9999px", backgroundColor: SQUAD_COLORS[sq.id] || T.azul600 }} />
                  <span style={{ fontSize: "11px", fontWeight: 500, color: T.cinza600 }}>{sq.name}</span>
                </div>
              ))
            : Object.entries(SQUAD_COLORS).map(([n, cc]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "9999px", backgroundColor: cc }} />
                  <span style={{ fontSize: "11px", fontWeight: 500, color: T.cinza600 }}>Squad {n}</span>
                </div>
              ))}
        </div>
        <span style={{ fontSize: "11px", color: T.cinza400 }}>
          Pipedrive · {new Date().toLocaleDateString("pt-BR")}
        </span>
      </div>
      <DataSourceFooter lastUpdated={lastUpdated} />
    </>
  );
}
