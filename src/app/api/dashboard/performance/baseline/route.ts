import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { V_COLS, SQUAD_V_MAP } from "@/lib/constants";
import type { BaselineData, BaselineCloserData, BaselineMonthData } from "@/lib/types";

export const dynamic = "force-dynamic";

// Data de contratação manual por closer (YYYY-MM)
// "auto" = usar mês do primeiro deal
const CLOSER_HIRE_DATES: Record<string, string> = {
  "Luana Schaikoski": "2024-03",
  "Filipe Padoveze": "auto",
  "Hellen Dias": "auto",
};

function rate(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

interface DealRow {
  deal_id: number;
  owner_name: string;
  empreendimento: string | null;
  status: string;
  max_stage_order: number;
  lost_reason: string | null;
  is_marketing: boolean;
  add_time: string;
}

async function fetchDeals(cutoff: string | null): Promise<DealRow[]> {
  const PAGE = 1000;
  const all: DealRow[] = [];
  let offset = 0;
  while (true) {
    let query = supabase
      .from("squad_deals")
      .select("deal_id, owner_name, empreendimento, status, max_stage_order, lost_reason, is_marketing, add_time")
      .eq("is_marketing", true);
    if (cutoff) query = query.gte("add_time", cutoff);
    query = query.range(offset, offset + PAGE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error (squad_deals): ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as DealRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export async function GET() {
  try {
    const allDealsRaw = await fetchDeals(null);

    const allDeals = allDealsRaw.filter((d) => {
      if (!d.empreendimento) return false;
      if (d.lost_reason === "Duplicado/Erro") return false;
      if (!V_COLS.includes(d.owner_name)) return false;
      return true;
    });

    // Group deals by closer
    const closerDealsMap = new Map<string, DealRow[]>();
    for (const d of allDeals) {
      if (!closerDealsMap.has(d.owner_name)) closerDealsMap.set(d.owner_name, []);
      closerDealsMap.get(d.owner_name)!.push(d);
    }

    let globalMaxOffset = 0;
    const closers: BaselineCloserData[] = [];

    for (const name of V_COLS) {
      const deals = closerDealsMap.get(name) || [];
      if (deals.length === 0) continue;

      // Find squad
      let squadId = 1;
      for (const [sid, indices] of Object.entries(SQUAD_V_MAP)) {
        if (indices.includes(V_COLS.indexOf(name))) {
          squadId = Number(sid);
          break;
        }
      }

      // Find monthZero: usar data de contratação manual ou primeiro deal
      const hireDateStr = CLOSER_HIRE_DATES[name];
      let zeroYear: number;
      let zeroMonth: number;

      if (hireDateStr && hireDateStr !== "auto") {
        const [hy, hm] = hireDateStr.split("-").map(Number);
        zeroYear = hy;
        zeroMonth = hm - 1; // 0-indexed
      } else {
        // Fallback: earliest deal
        let earliestDate: Date | null = null;
        for (const d of deals) {
          const dt = new Date(d.add_time);
          if (!earliestDate || dt < earliestDate) earliestDate = dt;
        }
        if (!earliestDate) continue;
        zeroYear = earliestDate.getFullYear();
        zeroMonth = earliestDate.getMonth();
      }

      const monthZero = `${zeroYear}-${String(zeroMonth + 1).padStart(2, "0")}`;

      // Calculate current month offset
      const now = new Date();
      const maxPossibleOffset = (now.getFullYear() - zeroYear) * 12 + (now.getMonth() - zeroMonth);

      // Group deals by monthOffset
      const monthMap = new Map<number, { opp: number; won: number }>();
      for (const d of deals) {
        const dt = new Date(d.add_time);
        const offset = (dt.getFullYear() - zeroYear) * 12 + (dt.getMonth() - zeroMonth);
        if (!monthMap.has(offset)) monthMap.set(offset, { opp: 0, won: 0 });
        const m = monthMap.get(offset)!;
        if (d.max_stage_order >= 9) m.opp++;
        if (d.status === "won") m.won++;
      }

      // Build months array without gaps
      const months: BaselineMonthData[] = [];
      let totalOpp = 0, totalWon = 0, wonAccum = 0;
      for (let i = 0; i <= maxPossibleOffset; i++) {
        const m = monthMap.get(i) || { opp: 0, won: 0 };
        totalOpp += m.opp;
        totalWon += m.won;
        wonAccum += m.won;
        months.push({
          monthOffset: i,
          opp: m.opp,
          won: m.won,
          oppToWon: rate(m.won, m.opp),
          wonAccumulated: wonAccum,
        });
      }

      if (maxPossibleOffset > globalMaxOffset) globalMaxOffset = maxPossibleOffset;

      closers.push({
        name,
        squadId,
        monthZero,
        monthsActive: maxPossibleOffset,
        months,
        totals: { opp: totalOpp, won: totalWon, oppToWon: rate(totalWon, totalOpp) },
      });
    }

    // Sort by monthZero ascending (oldest first)
    closers.sort((a, b) => a.monthZero.localeCompare(b.monthZero));

    const result: BaselineData = { closers, maxMonthOffset: globalMaxOffset };
    return NextResponse.json(result);
  } catch (error) {
    console.error("Baseline error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
