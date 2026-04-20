import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { SQUADS } from "@/lib/constants";
import { getModuleConfig } from "@/lib/modules";
import type { PresalesData, PresellerSummary, PresalesDealRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// --- Horário útil: 08:00-18:00 seg-sex, almoço 12:00-13:00 ---
const WORK_START = 8; // 08:00
const WORK_END = 18;  // 18:00
const LUNCH_START = 12;
const LUNCH_END = 13;
const WORK_MINUTES_PER_DAY = (WORK_END - WORK_START) * 60 - (LUNCH_END - LUNCH_START) * 60; // 540

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/** Clamp timestamp to work hours boundary (returns minutes from midnight in BRT) */
function clampToWork(minutesFromMidnight: number): number {
  if (minutesFromMidnight < WORK_START * 60) return WORK_START * 60;
  if (minutesFromMidnight > WORK_END * 60) return WORK_END * 60;
  return minutesFromMidnight;
}

/** Work minutes in a single day between two times (in minutes from midnight), already clamped */
function workMinutesInDay(startMin: number, endMin: number): number {
  const s = clampToWork(startMin);
  const e = clampToWork(endMin);
  if (e <= s) return 0;
  let mins = e - s;
  // Subtract lunch overlap
  const lunchS = LUNCH_START * 60;
  const lunchE = LUNCH_END * 60;
  const overlapStart = Math.max(s, lunchS);
  const overlapEnd = Math.min(e, lunchE);
  if (overlapEnd > overlapStart) mins -= (overlapEnd - overlapStart);
  return Math.max(0, mins);
}

/** Clamp date to next business start (BRT). Ex: domingo → segunda 08:00, sexta 19h → segunda 08:00 */
function clampToNextBusinessStart(brt: Date): Date {
  const dow = brt.getDay();
  const minOfDay = brt.getHours() * 60 + brt.getMinutes();

  // Dentro do horário útil em dia útil → sem ajuste
  if (dow >= 1 && dow <= 5 && minOfDay >= WORK_START * 60 && minOfDay < WORK_END * 60) {
    return brt;
  }

  const next = new Date(brt);
  // Após expediente em dia útil → próximo dia
  if (dow >= 1 && dow <= 5 && minOfDay >= WORK_END * 60) {
    next.setDate(next.getDate() + 1);
  }
  // Antes do expediente em dia útil → mesmo dia (será setado 08:00 abaixo)
  // Pular fim de semana
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(WORK_START, 0, 0, 0);
  return next;
}

/** Calculate business minutes between two Date objects (BRT-aware) */
function calcBusinessMinutes(start: Date, end: Date): number {
  // Convert to BRT (UTC-3)
  const BRT_OFFSET = -3 * 60;
  const startBrt = clampToNextBusinessStart(
    new Date(start.getTime() + (BRT_OFFSET + start.getTimezoneOffset()) * 60000)
  );
  const endBrt = new Date(end.getTime() + (BRT_OFFSET + end.getTimezoneOffset()) * 60000);

  if (endBrt <= startBrt) return 0;

  // Same day
  const startDay = new Date(startBrt.getFullYear(), startBrt.getMonth(), startBrt.getDate());
  const endDay = new Date(endBrt.getFullYear(), endBrt.getMonth(), endBrt.getDate());
  const startMinOfDay = startBrt.getHours() * 60 + startBrt.getMinutes();
  const endMinOfDay = endBrt.getHours() * 60 + endBrt.getMinutes();

  if (startDay.getTime() === endDay.getTime()) {
    return isWeekday(startDay) ? workMinutesInDay(startMinOfDay, endMinOfDay) : 0;
  }

  let total = 0;

  // First day
  if (isWeekday(startDay)) {
    total += workMinutesInDay(startMinOfDay, WORK_END * 60);
  }

  // Full days in between
  const cursor = new Date(startDay);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor.getTime() < endDay.getTime()) {
    if (isWeekday(cursor)) total += WORK_MINUTES_PER_DAY;
    cursor.setDate(cursor.getDate() + 1);
  }

  // Last day
  if (isWeekday(endDay)) {
    total += workMinutesInDay(WORK_START * 60, endMinOfDay);
  }

  return total;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const _mc = getModuleConfig("szi");

function findSquadId(name: string): number | null {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const sq of SQUADS) {
    if (n(sq.preVenda) === n(name)) return sq.id;
  }
  // Fallback: PV not matching any squad.preVenda → Squad 1
  if (_mc.presellers.some((p) => n(p) === n(name))) return SQUADS[0]?.id ?? 1;
  return null;
}

export async function GET() {
  try {
    const admin = createSquadSupabaseAdmin();

    const { data: rows, error } = await supabase
      .from("squad_presales_response")
      .select("deal_id, deal_title, preseller_name, transbordo_at, first_action_at, response_time_minutes, action_type, last_mia_at")
      .order("transbordo_at", { ascending: false });

    if (error) throw new Error(`Supabase error: ${error.message}`);

    const mc = getModuleConfig("szi");
    const MAIN_PVS = mc.presellers;
    const deals = (rows || []).filter((d) => MAIN_PVS.includes(d.preseller_name));
    const now = new Date();

    // Para presellers do squad sem dados em squad_presales_response, buscar de squad_deals
    const presentInPresales = new Set(deals.map((d) => d.preseller_name));
    const missingPVs = MAIN_PVS.filter((pv) => !presentInPresales.has(pv));

    if (missingPVs.length > 0) {
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
      for (const pv of missingPVs) {
        const { data: pvDeals } = await admin
          .from("squad_deals")
          .select("deal_id, title, preseller_name, add_time, last_activity_date, status")
          .eq("preseller_name", pv)
          .eq("status", "open")
          .gte("add_time", cutoff);
        for (const d of pvDeals || []) {
          deals.push({
            deal_id: d.deal_id,
            deal_title: d.title || "",
            preseller_name: d.preseller_name,
            transbordo_at: d.add_time,
            first_action_at: d.last_activity_date ? `${d.last_activity_date}T12:00:00+00:00` : null,
            response_time_minutes: null,
            action_type: null,
            last_mia_at: null,
          });
        }
      }
    }

    // Buscar add_time dos deals (de squad_deals, que tem dados atualizados)
    const dealIds = deals.map((d) => Number(d.deal_id));
    const addTimeMap = new Map<number, string>();
    // Paginar em batches de 500 (limite do .in())
    for (let i = 0; i < dealIds.length; i += 500) {
      const batch = dealIds.slice(i, i + 500);
      const { data: dealsExtra } = await admin
        .from("squad_deals")
        .select("deal_id, add_time")
        .in("deal_id", batch);
      for (const d of dealsExtra || []) {
        if (d.add_time) addTimeMap.set(d.deal_id, d.add_time);
      }
    }

    // last_mia_at é populado pelo sync-squad-presales (que busca notas do Pipedrive)

    // Calcular tempo em horário útil para cada deal
    const dealsWithBizTime = deals.map((d) => {
      const transbordo = new Date(d.transbordo_at);
      const actionTime = d.first_action_at ? new Date(d.first_action_at) : now;
      const bizMinutes = calcBusinessMinutes(transbordo, actionTime);
      return {
        ...d,
        biz_minutes: bizMinutes,
        is_pending: d.first_action_at == null,
      };
    });

    // Agrupar por pré-vendedor
    const byPreseller = new Map<string, typeof dealsWithBizTime>();
    for (const d of dealsWithBizTime) {
      const key = d.preseller_name;
      if (!byPreseller.has(key)) byPreseller.set(key, []);
      byPreseller.get(key)!.push(d);
    }

    const presellers: PresellerSummary[] = [];
    for (const [name, pDeals] of byPreseller) {
      const comAcao = pDeals.filter((d) => !d.is_pending);
      // Pass 1: mediana base dos deals COM ação (tempo definitivo)
      const baseTempos = comAcao.map((d) => d.biz_minutes);
      const baseMedian = median(baseTempos);
      // Pass 2: pendentes só entram se biz_minutes > baseMedian (nunca puxam mediana pra baixo)
      const tempos = pDeals
        .filter((d) => !d.is_pending || d.biz_minutes > baseMedian)
        .map((d) => d.biz_minutes);

      presellers.push({
        name,
        squadId: findSquadId(name),
        totalDeals: pDeals.length,
        dealsComAcao: comAcao.length,
        dealsPendentes: pDeals.length - comAcao.length,
        avgMinutes: tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0,
        medianMinutes: Math.round(median(tempos)),
        pctSub30: tempos.length > 0 ? Math.round((tempos.filter((m) => m <= 30).length / tempos.length) * 100) : 0,
        pctSub60: tempos.length > 0 ? Math.round((tempos.filter((m) => m <= 60).length / tempos.length) * 100) : 0,
      });
    }

    // Ordenar: pré-vendedores dos squads primeiro, depois por volume
    presellers.sort((a, b) => {
      if (a.squadId != null && b.squadId == null) return -1;
      if (a.squadId == null && b.squadId != null) return 1;
      return b.totalDeals - a.totalDeals;
    });

    // Deals: pendentes primeiro (mais antigo no topo), depois respondidos
    const sorted = [...dealsWithBizTime].sort((a, b) => {
      if (a.is_pending && !b.is_pending) return -1;
      if (!a.is_pending && b.is_pending) return 1;
      return new Date(a.transbordo_at).getTime() - new Date(b.transbordo_at).getTime();
    });

    const recentDeals: PresalesDealRow[] = sorted.slice(0, 50).map((d) => ({
      deal_id: d.deal_id,
      deal_title: d.deal_title || "",
      preseller_name: d.preseller_name,
      transbordo_at: d.transbordo_at,
      first_action_at: d.first_action_at,
      response_time_minutes: d.biz_minutes,
      action_type: d.action_type,
      deal_add_time: addTimeMap.get(Number(d.deal_id)) || null,
      last_mia_at: d.last_mia_at || null,
    }));

    // Totais globais: mediana progressiva (pendentes só entram se > mediana base)
    const allBaseTempos = dealsWithBizTime.filter((d) => !d.is_pending).map((d) => d.biz_minutes);
    const allBaseMedian = median(allBaseTempos);
    const allTempos = dealsWithBizTime
      .filter((d) => !d.is_pending || d.biz_minutes > allBaseMedian)
      .map((d) => d.biz_minutes);

    const result: PresalesData = {
      presellers,
      recentDeals,
      totals: {
        totalDeals: deals.length,
        dealsComAcao: dealsWithBizTime.filter((d) => !d.is_pending).length,
        dealsPendentes: dealsWithBizTime.filter((d) => d.is_pending).length,
        avgMinutes: allTempos.length > 0 ? Math.round(allTempos.reduce((a, b) => a + b, 0) / allTempos.length) : 0,
        medianMinutes: Math.round(median(allTempos)),
        pctSub30: allTempos.length > 0 ? Math.round((allTempos.filter((m) => m <= 30).length / allTempos.length) * 100) : 0,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Presales error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
