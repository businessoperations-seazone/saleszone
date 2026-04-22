# Monitor de Losts — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Monitor de Losts" view to the Saleszone dashboard that reads from the existing `monitor_lost_deals`, `monitor_lost_daily_summary`, and `monitor_lost_alerts` Supabase tables (populated by the monitor-atendimento Python collector) and displays lost deal analytics with compliance alerts for the SZS pipeline.

**Architecture:** A single API route reads from 3 Supabase tables, aggregates data, and returns a typed response. A single view component renders summary cards, reason breakdown, stage distribution, owner ranking, alerts banner, and deal table. Navigation adds a "Monitor Losts" entry to the Vendas dropdown in the header.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (anon key via `@/lib/supabase`), inline styles with `T` tokens from `@/lib/constants`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types.ts` | Modify | Add `LostsData` and related interfaces |
| `src/app/api/dashboard/losts/route.ts` | Create | API route: read 3 Supabase tables, aggregate, return typed JSON |
| `src/components/dashboard/losts-view.tsx` | Create | View component: summary cards, charts, tables, alerts |
| `src/components/dashboard/header.tsx` | Modify | Add "Monitor Losts" to Vendas dropdown |
| `src/app/page.tsx` | Modify | Add state, fetch callback, useEffect trigger, conditional render |

---

## Task 1: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts` (append at end)

- [ ] **Step 1: Add LostsData interfaces to types.ts**

Append these interfaces at the end of `src/lib/types.ts`:

```typescript
// Monitor de Losts — Lost deals compliance monitoring (SZS pipeline)
export interface LostDealRow {
  deal_id: number;
  title: string;
  stage_name: string;
  stage_category: "pre_vendas" | "vendas";
  owner_name: string;
  owner_email: string;
  lost_time: string;
  lost_hour: number;
  days_in_funnel: number;
  lost_reason: string;
  canal: string;
}

export interface LostAlert {
  id?: string;
  date: string;
  seller_email: string;
  seller_name: string;
  alert_type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  metric_value: number | null;
  threshold_value: number | null;
}

export interface LostsSummary {
  date: string;
  total: number;
  pre_vendas: number;
  vendas: number;
  pre_vendas_pct: number;
  vendas_pct: number;
  by_reason: Record<string, number>;
  by_owner: Record<string, number>;
  by_canal: Record<string, number>;
  median_days_in_funnel: number | null;
  same_day_lost_pct: number;
  batch_after_18h_pct: number;
}

export interface LostsData {
  date: string;
  summary: LostsSummary;
  deals: LostDealRow[];
  alerts: LostAlert[];
  trend: {
    dates: string[];
    totals: number[];
  };
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd /Users/joaopedrocoutinho/Claude-Code/saleszone && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: no new errors related to the added types

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add LostsData TypeScript interfaces for monitor losts view"
```

---

## Task 2: API Route

**Files:**
- Create: `src/app/api/dashboard/losts/route.ts`

**Context:**
- The 3 Supabase tables are: `monitor_lost_deals`, `monitor_lost_daily_summary`, `monitor_lost_alerts`
- Use `import { supabase } from "@/lib/supabase"` (anon key client — tables have no RLS)
- Use `export const dynamic = "force-dynamic"`
- Query param `?date=YYYY-MM-DD` (optional, defaults to yesterday)
- Also fetch last 7 days of `monitor_lost_daily_summary` for trend chart

- [ ] **Step 1: Create the API route file**

Create `src/app/api/dashboard/losts/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { LostsData, LostDealRow, LostAlert, LostsSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    // Default to yesterday
    const targetDate = dateParam || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split("T")[0];
    })();

    // 1. Fetch summary
    const { data: summaryRows, error: summaryErr } = await supabase
      .from("monitor_lost_daily_summary")
      .select("*")
      .eq("date", targetDate)
      .limit(1);

    if (summaryErr) throw new Error(`Summary: ${summaryErr.message}`);

    const rawSummary = summaryRows?.[0];
    const summary: LostsSummary = rawSummary
      ? {
          date: rawSummary.date,
          total: rawSummary.total ?? 0,
          pre_vendas: rawSummary.pre_vendas ?? 0,
          vendas: rawSummary.vendas ?? 0,
          pre_vendas_pct: rawSummary.pre_vendas_pct ?? 0,
          vendas_pct: rawSummary.vendas_pct ?? 0,
          by_reason: typeof rawSummary.by_reason === "string"
            ? JSON.parse(rawSummary.by_reason)
            : rawSummary.by_reason ?? {},
          by_owner: typeof rawSummary.by_owner === "string"
            ? JSON.parse(rawSummary.by_owner)
            : rawSummary.by_owner ?? {},
          by_canal: typeof rawSummary.by_canal === "string"
            ? JSON.parse(rawSummary.by_canal)
            : rawSummary.by_canal ?? {},
          median_days_in_funnel: rawSummary.median_days_in_funnel,
          same_day_lost_pct: rawSummary.same_day_lost_pct ?? 0,
          batch_after_18h_pct: rawSummary.batch_after_18h_pct ?? 0,
        }
      : {
          date: targetDate,
          total: 0,
          pre_vendas: 0,
          vendas: 0,
          pre_vendas_pct: 0,
          vendas_pct: 0,
          by_reason: {},
          by_owner: {},
          by_canal: {},
          median_days_in_funnel: null,
          same_day_lost_pct: 0,
          batch_after_18h_pct: 0,
        };

    // 2. Fetch deals
    const { data: dealRows, error: dealsErr } = await supabase
      .from("monitor_lost_deals")
      .select("deal_id, title, stage_name, stage_category, owner_name, owner_email, lost_time, lost_hour, days_in_funnel, lost_reason, canal")
      .eq("date", targetDate)
      .order("lost_time", { ascending: false });

    if (dealsErr) throw new Error(`Deals: ${dealsErr.message}`);

    const deals: LostDealRow[] = (dealRows ?? []).map((d) => ({
      deal_id: d.deal_id,
      title: d.title ?? "",
      stage_name: d.stage_name ?? "",
      stage_category: d.stage_category ?? "pre_vendas",
      owner_name: d.owner_name ?? "",
      owner_email: d.owner_email ?? "",
      lost_time: d.lost_time ?? "",
      lost_hour: d.lost_hour ?? 0,
      days_in_funnel: d.days_in_funnel ?? 0,
      lost_reason: d.lost_reason ?? "",
      canal: d.canal ?? "",
    }));

    // 3. Fetch alerts
    const { data: alertRows, error: alertsErr } = await supabase
      .from("monitor_lost_alerts")
      .select("*")
      .eq("date", targetDate)
      .order("severity", { ascending: true }); // critical first

    if (alertsErr) throw new Error(`Alerts: ${alertsErr.message}`);

    const alerts: LostAlert[] = (alertRows ?? []).map((a) => ({
      id: a.id,
      date: a.date,
      seller_email: a.seller_email ?? "",
      seller_name: a.seller_name ?? "",
      alert_type: a.alert_type ?? "",
      severity: a.severity ?? "info",
      message: a.message ?? "",
      metric_value: a.metric_value,
      threshold_value: a.threshold_value,
    }));

    // 4. Fetch 7-day trend
    const trendStart = new Date(targetDate);
    trendStart.setDate(trendStart.getDate() - 6);
    const trendStartStr = trendStart.toISOString().split("T")[0];

    const { data: trendRows } = await supabase
      .from("monitor_lost_daily_summary")
      .select("date, total")
      .gte("date", trendStartStr)
      .lte("date", targetDate)
      .order("date", { ascending: true });

    const trend = {
      dates: (trendRows ?? []).map((r) => r.date),
      totals: (trendRows ?? []).map((r) => r.total ?? 0),
    };

    const result: LostsData = { date: targetDate, summary, deals, alerts, trend };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[losts] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/joaopedrocoutinho/Claude-Code/saleszone && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: no errors

- [ ] **Step 3: Test API route locally**

Run: `cd /Users/joaopedrocoutinho/Claude-Code/saleszone && npm run dev &`
Then: `curl -s 'http://localhost:3000/api/dashboard/losts?date=2026-03-18' | python3 -m json.tool | head -40`
Expected: JSON with `date`, `summary`, `deals`, `alerts`, `trend` fields. Summary should show `total > 0` if data exists for that date.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dashboard/losts/route.ts
git commit -m "feat: add /api/dashboard/losts route reading from Supabase"
```

---

## Task 3: View Component

**Files:**
- Create: `src/components/dashboard/losts-view.tsx`

**Context:**
- Follow the same patterns as `baseline-view.tsx`, `forecast-view.tsx` — `"use client"`, inline styles with `T` tokens
- Props: `{ data: LostsData | null; loading: boolean; lastUpdated?: Date | null; lostsDate: string; onDateChange: (d: string) => void }`
- Import `DataSourceFooter` from `./ui` for footer
- Sections: (1) Date picker + summary cards, (2) Alerts banner, (3) Reasons breakdown, (4) By owner table, (5) Deals table
- Use color coding: critical=red, warning=orange, info=blue

- [ ] **Step 1: Create the view component**

Create `src/components/dashboard/losts-view.tsx`:

```typescript
"use client";

import React, { useState, useMemo } from "react";
import { T } from "@/lib/constants";
import type { LostsData, LostDealRow, LostAlert } from "@/lib/types";
import { DataSourceFooter } from "./ui";

interface Props {
  data: LostsData | null;
  loading: boolean;
  lastUpdated?: Date | null;
  lostsDate: string;
  onDateChange: (d: string) => void;
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: "10px",
  fontWeight: 500,
  color: "#6B6E84",
  borderBottom: "1px solid #E6E7EA",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  backgroundColor: "#f8f8fa",
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid #E6E7EA",
  fontSize: "12px",
  fontWeight: 400,
  color: "#141A3C",
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

const SEVERITY_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  critical: { bg: "#fef2f2", fg: "#dc2626", border: "#fecaca" },
  warning: { bg: "#fffbeb", fg: "#d97706", border: "#fde68a" },
  info: { bg: "#eff6ff", fg: "#2563eb", border: "#bfdbfe" },
};

function SummaryCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div
      style={{
        backgroundColor: "#FFF",
        border: "1px solid #E6E7EA",
        borderRadius: "12px",
        padding: "16px 20px",
        minWidth: "140px",
        flex: "1 1 0",
      }}
    >
      <div style={{ fontSize: "10px", fontWeight: 500, color: "#6B6E84", textTransform: "uppercase", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "24px", fontWeight: 700, color: color || T.fg, fontVariantNumeric: "tabular-nums" }}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      {sub && <div style={{ fontSize: "11px", color: "#6B6E84", marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

function AlertsBanner({ alerts }: { alerts: LostAlert[] }) {
  const criticals = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");
  const infos = alerts.filter((a) => a.severity === "info");

  if (alerts.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {criticals.length > 0 && (
        <div style={{ backgroundColor: SEVERITY_COLORS.critical.bg, border: `1px solid ${SEVERITY_COLORS.critical.border}`, borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: SEVERITY_COLORS.critical.fg, marginBottom: "6px" }}>
            {criticals.length} alerta{criticals.length > 1 ? "s" : ""} cr&iacute;tico{criticals.length > 1 ? "s" : ""}
          </div>
          {criticals.map((a, i) => (
            <div key={i} style={{ fontSize: "12px", color: "#141A3C", marginBottom: "3px" }}>
              &bull; <strong>{a.seller_name}</strong>: {a.message}
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ backgroundColor: SEVERITY_COLORS.warning.bg, border: `1px solid ${SEVERITY_COLORS.warning.border}`, borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: SEVERITY_COLORS.warning.fg, marginBottom: "6px" }}>
            {warnings.length} warning{warnings.length > 1 ? "s" : ""}
          </div>
          {warnings.map((a, i) => (
            <div key={i} style={{ fontSize: "12px", color: "#141A3C", marginBottom: "3px" }}>
              &bull; <strong>{a.seller_name}</strong> [{a.alert_type}]: {a.message}
            </div>
          ))}
        </div>
      )}
      {infos.length > 0 && (
        <div style={{ backgroundColor: SEVERITY_COLORS.info.bg, border: `1px solid ${SEVERITY_COLORS.info.border}`, borderRadius: "10px", padding: "12px 16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: SEVERITY_COLORS.info.fg, marginBottom: "6px" }}>
            {infos.length} observa&ccedil;&atilde;o{infos.length > 1 ? "&otilde;es" : ""}
          </div>
          {infos.map((a, i) => (
            <div key={i} style={{ fontSize: "12px", color: "#141A3C", marginBottom: "3px" }}>
              &bull; {a.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReasonsTable({ byReason, total }: { byReason: Record<string, number>; total: number }) {
  const sorted = useMemo(
    () => Object.entries(byReason).sort((a, b) => b[1] - a[1]),
    [byReason]
  );
  if (sorted.length === 0) return null;

  const maxCount = sorted[0]?.[1] ?? 1;

  return (
    <div style={{ backgroundColor: "#FFF", border: "1px solid #E6E7EA", borderRadius: "12px", padding: "16px", flex: "1 1 0", minWidth: "320px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 600, color: T.fg, marginBottom: "12px" }}>Motivos de Lost</h3>
      {sorted.map(([reason, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={reason} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
              <span style={{ color: "#141A3C" }}>{reason}</span>
              <span style={{ color: "#6B6E84", fontVariantNumeric: "tabular-nums" }}>{count} ({pct}%)</span>
            </div>
            <div style={{ height: "6px", backgroundColor: "#E6E7EA", borderRadius: "3px" }}>
              <div
                style={{
                  height: "6px",
                  borderRadius: "3px",
                  backgroundColor: T.primary,
                  width: `${(count / maxCount) * 100}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OwnersTable({ byOwner, total }: { byOwner: Record<string, number>; total: number }) {
  const sorted = useMemo(
    () => Object.entries(byOwner).sort((a, b) => b[1] - a[1]),
    [byOwner]
  );
  if (sorted.length === 0) return null;

  return (
    <div style={{ backgroundColor: "#FFF", border: "1px solid #E6E7EA", borderRadius: "12px", padding: "16px", flex: "1 1 0", minWidth: "320px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 600, color: T.fg, marginBottom: "12px" }}>Volume por Owner</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Owner</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Deals</th>
            <th style={{ ...thStyle, textAlign: "right" }}>%</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 10).map(([owner, count]) => (
            <tr key={owner}>
              <td style={tdStyle}>{owner}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{count}</td>
              <td style={{ ...tdStyle, textAlign: "right", color: "#6B6E84" }}>
                {total > 0 ? Math.round((count / total) * 100) : 0}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StageBreakdown({ preVendas, vendas, preVendasPct, vendasPct }: { preVendas: number; vendas: number; preVendasPct: number; vendasPct: number }) {
  return (
    <div style={{ backgroundColor: "#FFF", border: "1px solid #E6E7EA", borderRadius: "12px", padding: "16px", minWidth: "200px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 600, color: T.fg, marginBottom: "12px" }}>Fase do Funil</h3>
      <div style={{ display: "flex", gap: "16px" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#2563eb" }}>{preVendas}</div>
          <div style={{ fontSize: "11px", color: "#6B6E84" }}>Pré-vendas ({preVendasPct}%)</div>
        </div>
        <div style={{ width: "1px", backgroundColor: "#E6E7EA" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#dc2626" }}>{vendas}</div>
          <div style={{ fontSize: "11px", color: "#6B6E84" }}>Vendas ({vendasPct}%)</div>
        </div>
      </div>
    </div>
  );
}

function TrendMini({ dates, totals }: { dates: string[]; totals: number[] }) {
  if (dates.length < 2) return null;

  const max = Math.max(...totals, 1);
  const w = 220;
  const h = 50;
  const points = totals.map((v, i) => {
    const x = (i / (totals.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });

  return (
    <div style={{ backgroundColor: "#FFF", border: "1px solid #E6E7EA", borderRadius: "12px", padding: "16px", minWidth: "260px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 600, color: T.fg, marginBottom: "8px" }}>Tend&ecirc;ncia 7 dias</h3>
      <svg width={w} height={h} style={{ display: "block" }}>
        <polyline points={points.join(" ")} fill="none" stroke={T.primary} strokeWidth="2" />
        {totals.map((v, i) => {
          const x = (i / (totals.length - 1)) * w;
          const y = h - (v / max) * h;
          return <circle key={i} cx={x} cy={y} r="3" fill={T.primary} />;
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#6B6E84", marginTop: "4px" }}>
        <span>{dates[0]?.slice(5)}</span>
        <span>{dates[dates.length - 1]?.slice(5)}</span>
      </div>
    </div>
  );
}

function DealsTable({ deals }: { deals: LostDealRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? deals : deals.slice(0, 15);

  if (deals.length === 0) return null;

  return (
    <div style={{ backgroundColor: "#FFF", border: "1px solid #E6E7EA", borderRadius: "12px", padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "13px", fontWeight: 600, color: T.fg }}>Deals Lost ({deals.length})</h3>
        {deals.length > 15 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              fontSize: "11px",
              color: T.primary,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {expanded ? "Mostrar menos" : `Ver todos (${deals.length})`}
          </button>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Deal</th>
              <th style={thStyle}>Owner</th>
              <th style={thStyle}>Etapa</th>
              <th style={thStyle}>Fase</th>
              <th style={thStyle}>Motivo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Dias no Funil</th>
              <th style={thStyle}>Canal</th>
              <th style={thStyle}>Hora</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.deal_id}>
                <td style={tdStyle}>
                  <a
                    href={`https://seazone-fd92b9.pipedrive.com/deal/${d.deal_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: T.primary, textDecoration: "none", fontSize: "12px" }}
                  >
                    #{d.deal_id}
                  </a>
                  <span style={{ marginLeft: "6px", fontSize: "11px", color: "#6B6E84" }}>{d.title.slice(0, 30)}</span>
                </td>
                <td style={tdStyle}>{d.owner_name}</td>
                <td style={tdStyle}>{d.stage_name}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      backgroundColor: d.stage_category === "vendas" ? "#fee2e2" : "#dbeafe",
                      color: d.stage_category === "vendas" ? "#dc2626" : "#2563eb",
                      fontWeight: 500,
                    }}
                  >
                    {d.stage_category === "vendas" ? "Vendas" : "Pr\u00e9-vendas"}
                  </span>
                </td>
                <td style={tdStyle}>{d.lost_reason || "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{d.days_in_funnel}d</td>
                <td style={tdStyle}>{d.canal || "—"}</td>
                <td style={tdStyle}>{d.lost_hour}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LostsView({ data, loading, lastUpdated, lostsDate, onDateChange }: Props) {
  if (loading || !data) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
        <p style={{ fontSize: "14px" }}>{loading ? "Carregando dados de losts..." : "Sem dados de losts"}</p>
      </div>
    );
  }

  const { summary, deals, alerts, trend } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Date picker row */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <label style={{ fontSize: "12px", color: "#6B6E84", fontWeight: 500 }}>Data:</label>
        <input
          type="date"
          value={lostsDate}
          onChange={(e) => onDateChange(e.target.value)}
          style={{
            fontSize: "12px",
            padding: "6px 10px",
            border: "1px solid #E6E7EA",
            borderRadius: "8px",
            color: T.fg,
          }}
        />
        <span style={{ fontSize: "12px", color: "#6B6E84" }}>
          Pipeline SZS &middot; {summary.total} deals lost
        </span>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        <SummaryCard label="Total Lost" value={summary.total} />
        <SummaryCard label="Mediana no Funil" value={summary.median_days_in_funnel != null ? `${summary.median_days_in_funnel}d` : "—"} />
        <SummaryCard label="Same-day Lost" value={`${summary.same_day_lost_pct}%`} />
        <SummaryCard
          label="Batch (ap\u00f3s 18h)"
          value={`${summary.batch_after_18h_pct}%`}
          color={summary.batch_after_18h_pct > 60 ? "#d97706" : undefined}
        />
        <SummaryCard
          label="Alertas"
          value={alerts.length}
          sub={`${alerts.filter((a) => a.severity === "critical").length} cr\u00edticos`}
          color={alerts.some((a) => a.severity === "critical") ? "#dc2626" : undefined}
        />
      </div>

      {/* Alerts */}
      <AlertsBanner alerts={alerts} />

      {/* Middle row: reasons + owners + stage + trend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        <ReasonsTable byReason={summary.by_reason} total={summary.total} />
        <OwnersTable byOwner={summary.by_owner} total={summary.total} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        <StageBreakdown
          preVendas={summary.pre_vendas}
          vendas={summary.vendas}
          preVendasPct={summary.pre_vendas_pct}
          vendasPct={summary.vendas_pct}
        />
        <TrendMini dates={trend.dates} totals={trend.totals} />
      </div>

      {/* Deals table */}
      <DealsTable deals={deals} />

      <DataSourceFooter source="Monitor Atendimento" updatedAt={lastUpdated} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/joaopedrocoutinho/Claude-Code/saleszone && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/losts-view.tsx
git commit -m "feat: add LostsView component with summary, alerts, reasons, owners, deals table"
```

---

## Task 4: Wire Into page.tsx and Header

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/dashboard/header.tsx`

**Context:**
- page.tsx pattern: add state (`lostsData`), fetch callback (`fetchLosts`), useEffect trigger, conditional render
- header.tsx pattern: add `"losts"` to `VENDAS_VIEWS` array, add dropdown entry with icon

- [ ] **Step 1: Add "losts" to VENDAS_VIEWS in header.tsx**

In `src/components/dashboard/header.tsx`, line 12:

Change:
```typescript
const VENDAS_VIEWS = ["perf-vendas", "baseline", "diagnostico-vendas", "ociosidade", "leadtime"] as const;
```

To:
```typescript
const VENDAS_VIEWS = ["perf-vendas", "baseline", "diagnostico-vendas", "ociosidade", "leadtime", "losts"] as const;
```

- [ ] **Step 2: Add dropdown entry for Monitor Losts**

In the Vendas dropdown items array (around line 328-334), add a new entry after `leadtime`:

```typescript
{ key: "leadtime", label: "Leadtime", icon: <Timer size={13} /> },
{ key: "losts", label: "Monitor Losts", icon: <Layers size={13} /> },
```

Note: `Layers` is already imported in the imports at line 4.

- [ ] **Step 3: Add state and fetch to page.tsx**

In `src/app/page.tsx`:

3a. Add import for LostsView (after the other view imports, around line 25):
```typescript
import { LostsView } from "@/components/dashboard/losts-view";
```

3b. Add import for `LostsData` type (update the existing type import on line 7):
Add `LostsData` to the type import.

3c. Add state (after `leadtimeData` state, around line 71):
```typescript
const [lostsData, setLostsData] = useState<LostsData | null>(null);
const [lostsDate, setLostsDate] = useState(() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
});
```

3d. Add fetch callback (after `fetchLeadtime`, around line 306):
```typescript
const fetchLosts = useCallback(async (date?: string) => {
  setLoading(true);
  try {
    const d = date || lostsDate;
    const res = await fetch(`/api/dashboard/losts?date=${d}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setLostsData(await res.json());
  } catch (err) {
    console.error("Fetch losts error:", err);
  } finally {
    setLoading(false);
  }
}, [lostsDate]);
```

3e. Add useEffect trigger (inside the main useEffect around line 368, before the closing `}`):
```typescript
} else if (mainView === "losts" && !lostsData) {
  fetchLosts();
}
```

3f. Add to `clearAllCaches` (around line 394):
```typescript
setLostsData(null);
```

3g. Add to `fetchCurrentView` (around line 411):
```typescript
else if (mainView === "losts") await fetchLosts();
```

3h. Add conditional render (after the leadtime render block, around line 520):
```typescript
{mainView === "losts" && (
  <LostsView
    data={lostsData}
    loading={loading}
    lastUpdated={lastUpdated}
    lostsDate={lostsDate}
    onDateChange={(d) => { setLostsDate(d); setLostsData(null); fetchLosts(d); }}
  />
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/joaopedrocoutinho/Claude-Code/saleszone && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: no errors

- [ ] **Step 5: Test visually**

Run: `cd /Users/joaopedrocoutinho/Claude-Code/saleszone && npm run dev`
Open browser: http://localhost:3000
Click "Vendas" dropdown → "Monitor Losts" should appear and load data.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/dashboard/header.tsx
git commit -m "feat: wire LostsView into page navigation and data flow"
```

---

## Task 5: Verification & Polish

- [ ] **Step 1: Run full build**

Run: `cd /Users/joaopedrocoutinho/Claude-Code/saleszone && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run lint**

Run: `cd /Users/joaopedrocoutinho/Claude-Code/saleszone && npm run lint 2>&1 | tail -20`
Expected: No new lint errors. If any, fix and re-run.

- [ ] **Step 3: Visual verification**

Open http://localhost:3000 → Vendas → Monitor Losts:
1. Summary cards show total, median days, same-day %, batch %, alert count
2. Alerts banner shows critical (red), warning (orange), info (blue) sections
3. Reasons table shows bar chart of lost reasons
4. Owners table shows top 10 owners by volume
5. Stage breakdown shows pre-vendas vs vendas split
6. Trend mini chart shows 7-day line
7. Deals table shows individual deals with Pipedrive links
8. Date picker changes date and reloads data

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete monitor losts view with full dashboard integration"
```

---

## Notes

- **Data source:** The Python collector (`monitor-atendimento`) populates the 3 Supabase tables daily at 07:00 via launchd. The Saleszone dashboard just reads from them.
- **No sync function needed:** Unlike other tabs, the losts data comes from an external collector, not a Supabase Edge Function. The "Atualizar" button won't sync losts data — it refreshes from whatever is already in the DB.
- **Module-agnostic:** The losts route is at `/api/dashboard/losts` (not `/api/szs/losts`) because the monitor_lost_* tables are not module-specific. The data is always for pipeline SZS (id=14) regardless of which module is active.
- **RLS:** The monitor_lost_* tables have no RLS policies, so the anon key client works fine.
- **DataSourceFooter:** Uses the shared `DataSourceFooter` component from `ui.tsx`. If its signature doesn't match exactly (it may expect different props), adjust the footer call in losts-view.tsx accordingly.
