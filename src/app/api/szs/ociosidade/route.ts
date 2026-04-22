// SZS (Serviços) module
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getModuleConfig } from "@/lib/modules";
import type { OciosidadeCloser, OciosidadeDay, OciosidadeData, OciosidadeDate } from "@/lib/types";
import { MONTHS_PT, WEEKDAYS_PT } from "@/lib/constants";

const mc = getModuleConfig("szs");

export const dynamic = "force-dynamic";

const JORNADA_MIN = 480; // 8h úteis

function getSquadId(name: string): number {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const sq of mc.squads) {
    const v = sq.venda.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (n === v || n.includes(v) || v.includes(n)) return sq.id;
  }
  return 0;
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getBusinessDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (isWeekday(cur)) days.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function isoWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d.getTime() - jan4.getTime()) / 86400000) + 4;
  const week = Math.ceil(dayOfYear / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET() {
  try {
    // 1. Get SZS closers — include "Expansao" setor (Giovanna is there)
    const { data: rules, error: closerErr } = await supabase
      .from("squad_closer_rules")
      .select("email")
      .in("setor", ["SZS", "Expansao"]);

    if (closerErr) throw closerErr;
    if (!rules || rules.length === 0) {
      return NextResponse.json({ closers: [], dates: [], syncedAt: new Date().toISOString() });
    }

    // Only keep emails that match mc.closers (excludes Samuel, Maria Vitória)
    const closerNorm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const configClosers = mc.closers.map(closerNorm);
    // Emails originais (para query Supabase que faz match case-sensitive)
    const rawMatchedEmails = rules
      .filter((r) => {
        // Match email prefix (e.g. "gabriela.lemos") against closer names
        const prefix = r.email.split("@")[0].replace(".", " ");
        return configClosers.some((c) => c.includes(closerNorm(prefix)) || closerNorm(prefix).includes(c.split(" ")[0]));
      })
      .map((r) => r.email);
    // Emails deduplicados por forma normalizada (lowercase + trim)
    const emails = [...new Set(rawMatchedEmails.map((e) => e.toLowerCase().trim()))];

    // 2. Date window
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 30);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 20);

    // 3. Query ALL events — usa emails originais (case-sensitive) para não perder registros
    const { data: events, error: evtErr } = await supabase
      .from("szs_calendar_events")
      .select("closer_email, closer_name, dia, duracao_min, cancelou")
      .in("closer_email", [...new Set(rawMatchedEmails)])
      .gte("dia", formatDate(windowStart))
      .lte("dia", formatDate(windowEnd));

    if (evtErr) throw evtErr;

    // 4. Build aggregation
    const agg = new Map<string, Map<string, { totalMin: number; count: number; cancelledCount: number; totalScheduled: number }>>();
    for (const e of emails) agg.set(e, new Map());

    for (const evt of events || []) {
      const normEmail = (evt.closer_email || "").toLowerCase().trim();
      const emailMap = agg.get(normEmail);
      if (!emailMap) continue;
      const existing = emailMap.get(evt.dia) || { totalMin: 0, count: 0, cancelledCount: 0, totalScheduled: 0 };
      existing.totalScheduled += 1;
      if (evt.cancelou) {
        existing.cancelledCount += 1;
      } else {
        existing.totalMin += evt.duracao_min || 0;
        existing.count += 1;
      }
      emailMap.set(evt.dia, existing);
    }

    // 5. Build business days for display
    const todayStr = formatDate(today);

    const pastDays: string[] = [];
    const cur = new Date(today);
    cur.setDate(cur.getDate() - 1);
    while (pastDays.length < 7) {
      if (isWeekday(cur)) pastDays.unshift(formatDate(cur));
      cur.setDate(cur.getDate() - 1);
    }

    const futureDays: string[] = [];
    const cur2 = new Date(today);
    cur2.setDate(cur2.getDate() + 1);
    while (futureDays.length < 7) {
      if (isWeekday(cur2)) futureDays.push(formatDate(cur2));
      cur2.setDate(cur2.getDate() + 1);
    }

    const displayDays = isWeekday(today) ? [...pastDays, todayStr, ...futureDays] : [...pastDays, ...futureDays];

    const dates: OciosidadeDate[] = displayDays.map((ds) => {
      const d = new Date(ds + "T12:00:00");
      const day = d.getDate();
      const mon = MONTHS_PT[d.getMonth()];
      const wd = WEEKDAYS_PT[d.getDay()];
      return {
        date: ds,
        label: `${day} ${mon}`,
        weekday: wd,
        isWeekend: !isWeekday(d),
        isPast: ds < todayStr,
        isToday: ds === todayStr,
      };
    });

    const allBizDays = getBusinessDays(windowStart, windowEnd);

    const nameMap = new Map<string, string>();
    for (const evt of events || []) {
      const normEmail = (evt.closer_email || "").toLowerCase().trim();
      if (evt.closer_name && !nameMap.has(normEmail)) {
        nameMap.set(normEmail, evt.closer_name);
      }
    }

    // Map emails to full names from mc.closers for disambiguation
    // e.g. gabriela.lemos@ → "Gabriela Lemos", gabriela.branco@ → "Gabriela Branco"
    const emailToFullName = new Map<string, string>();
    for (const closer of mc.closers) {
      const parts = closerNorm(closer).split(" ");
      for (const e of emails) {
        const emailParts = e.split("@")[0].split(".");
        if (emailParts.length >= 2 && parts[0] === emailParts[0] && parts.some((p) => p === emailParts[1])) {
          emailToFullName.set(e, closer);
        } else if (emailParts.length === 1 && parts[0] === emailParts[0] && !emailToFullName.has(e)) {
          emailToFullName.set(e, closer);
        }
      }
    }

    const result: OciosidadeCloser[] = emails.map((email) => {
      const emailMap = agg.get(email) || new Map();
      const name = emailToFullName.get(email) || nameMap.get(email) || email.split("@")[0].replace(".", " ");
      const squadId = getSquadId(name);

      const days: OciosidadeDay[] = displayDays.map((ds) => {
        const info = emailMap.get(ds) || { totalMin: 0, count: 0, cancelledCount: 0, totalScheduled: 0 };
        return {
          date: ds,
          occupancyPct: Math.round((info.totalMin / JORNADA_MIN) * 100),
          eventCount: info.count,
          totalMinutes: info.totalMin,
          cancelledCount: info.cancelledCount,
          totalScheduled: info.totalScheduled,
          noShowPct: info.totalScheduled > 0 ? Math.round((info.cancelledCount / info.totalScheduled) * 100) : -1,
        };
      });

      const past7Days = pastDays.slice(-7);
      const defaultInfo = { totalMin: 0, count: 0, cancelledCount: 0, totalScheduled: 0 };
      const past7Vals = past7Days.map((ds) => {
        const info = emailMap.get(ds) || defaultInfo;
        return (info.totalMin / JORNADA_MIN) * 100;
      });
      const avgPast7 = past7Vals.length > 0 ? Math.round(past7Vals.reduce((a, b) => a + b, 0) / past7Vals.length) : 0;

      const past7NoShow = past7Days.map((ds) => {
        const info = emailMap.get(ds) || defaultInfo;
        return info.totalScheduled > 0 ? (info.cancelledCount / info.totalScheduled) * 100 : -1;
      }).filter((v) => v >= 0);
      const avgNoShow7 = past7NoShow.length > 0 ? Math.round(past7NoShow.reduce((a, b) => a + b, 0) / past7NoShow.length) : 0;

      const next7Days = futureDays.slice(0, 7);
      const next7Vals = next7Days.map((ds) => {
        const info = emailMap.get(ds) || defaultInfo;
        return (info.totalMin / JORNADA_MIN) * 100;
      });
      const avgNext7 = next7Vals.length > 0 ? Math.round(next7Vals.reduce((a, b) => a + b, 0) / next7Vals.length) : 0;

      const allVals = allBizDays
        .filter((ds) => ds <= todayStr)
        .map((ds) => {
          const info = emailMap.get(ds) || defaultInfo;
          return (info.totalMin / JORNADA_MIN) * 100;
        });
      const avgHistorical = allVals.length > 0 ? Math.round(allVals.reduce((a, b) => a + b, 0) / allVals.length) : 0;

      const weekMap = new Map<string, number[]>();
      for (const ds of allBizDays.filter((d) => d <= todayStr)) {
        const wk = isoWeekLabel(ds);
        const info = emailMap.get(ds) || defaultInfo;
        if (!weekMap.has(wk)) weekMap.set(wk, []);
        weekMap.get(wk)!.push((info.totalMin / JORNADA_MIN) * 100);
      }

      let maxWeek = { weekLabel: "-", avg: 0 };
      let minWeek = { weekLabel: "-", avg: 100 };
      for (const [wk, vals] of weekMap) {
        if (vals.length < 3) continue;
        const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        if (avg > maxWeek.avg) maxWeek = { weekLabel: wk, avg };
        if (avg < minWeek.avg) minWeek = { weekLabel: wk, avg };
      }
      if (minWeek.weekLabel === "-") minWeek = { weekLabel: "-", avg: 0 };

      return { email, name, squadId, days, avgPast7, avgNext7, avgHistorical, avgNoShow7, maxWeek, minWeek };
    });

    result.sort((a, b) => a.squadId - b.squadId || a.name.localeCompare(b.name));

    const { data: syncRow } = await supabase
      .from("szs_calendar_events")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .single();

    const response: OciosidadeData = {
      closers: result,
      dates,
      syncedAt: syncRow?.synced_at || new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("SZS Ociosidade API error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
