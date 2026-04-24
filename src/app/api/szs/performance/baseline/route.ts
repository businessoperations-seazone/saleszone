// SZS (Serviços) module
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getModuleConfig } from "@/lib/modules";
import type { BaselineData, BaselineCloserData, BaselineMonthData } from "@/lib/types";

const mc = getModuleConfig("szs");
const V_COLS = mc.closers;

export const dynamic = "force-dynamic";

// TODO: SZS closer hire dates — fill in when team structure is discovered
const CLOSER_HIRE_DATES: Record<string, string> = {};

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
      .from("szs_deals")
      .select("deal_id, owner_name, empreendimento, status, max_stage_order, lost_reason, is_marketing, add_time")
      .not("canal", "in", "(582,583,1748,3189)");
    if (cutoff) query = query.gte("add_time", cutoff);
    query = query.range(offset, offset + PAGE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error (szs_deals): ${error.message}`);
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

      let squadId = 1;
      for (const [sid, indices] of Object.entries(mc.squadCloserMap)) {
        if (indices.includes(V_COLS.indexOf(name))) {
          squadId = Number(sid);
          break;
        }
      }

      const hireDateStr = CLOSER_HIRE_DATES[name];
      let zeroYear: number;
      let zeroMonth: number;

      if (hireDateStr && hireDateStr !== "auto") {
        const [hy, hm] = hireDateStr.split("-").map(Number);
        zeroYear = hy;
        zeroMonth = hm - 1;
      } else {
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

      const now = new Date();
      const maxPossibleOffset = (now.getFullYear() - zeroYear) * 12 + (now.getMonth() - zeroMonth);

      const monthMap = new Map<number, { opp: number; won: number }>();
      for (const d of deals) {
        const dt = new Date(d.add_time);
        const offset = (dt.getFullYear() - zeroYear) * 12 + (dt.getMonth() - zeroMonth);
        if (!monthMap.has(offset)) monthMap.set(offset, { opp: 0, won: 0 });
        const m = monthMap.get(offset)!;
        if (d.max_stage_order >= 8) m.opp++; // SZS OPP = Reunião Realizada (order 8)
        if (d.status === "won") m.won++;
      }

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

    closers.sort((a, b) => a.monthZero.localeCompare(b.monthZero));

    const result: BaselineData = { closers, maxMonthOffset: globalMaxOffset };
    return NextResponse.json(result);
  } catch (error) {
    console.error("SZS Baseline error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
