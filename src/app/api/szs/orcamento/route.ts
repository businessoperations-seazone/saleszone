// SZS (Serviços) module — orcamento with canal_group as squad
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getModuleConfig } from "@/lib/modules";
import { getNektBudget } from "@/lib/nekt";
import type { OrcamentoData, OrcamentoSquadBreakdown, OrcamentoEmpBreakdown, OrcamentoLogEntry } from "@/lib/types";

const mc = getModuleConfig("szs");

const CANAL_GROUP_ORDER = ["Marketing", "Ind. Corretor", "Ind. Franquia", "Expansão", "Spots", "Mônica", "Outros"];

export const dynamic = "force-dynamic";

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export async function GET() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const curMonth = `${year}-${String(month).padStart(2, "0")}`;
    const diasNoMes = getDaysInMonth(year, month);
    const diasPassados = now.getDate();
    const startDate = `${curMonth}-01`;

    const { data: latestSnap } = await supabase
      .from("szs_meta_ads")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1);

    const snapshotDate = latestSnap?.[0]?.snapshot_date || now.toISOString().split("T")[0];

    const [orcRes, metaAllRes, metaLatestRes, approvedRes] = await Promise.all([
      supabase.from("szs_orcamento").select("*").eq("mes", curMonth).maybeSingle(),
      supabase
        .from("szs_meta_ads")
        .select("ad_id, spend_month, leads_month, squad_id, empreendimento")
        .gte("snapshot_date", startDate),
      supabase
        .from("szs_meta_ads")
        .select("ad_id, campaign_name, effective_status, squad_id, empreendimento")
        .eq("snapshot_date", snapshotDate),
      supabase
        .from("szs_orcamento_approved")
        .select("empreendimento, budget_recomendado, explicacao")
        .eq("mes", curMonth),
    ]);

    if (orcRes.error) console.warn("Orcamento query error:", orcRes.error.message);
    if (metaAllRes.error) console.warn("Meta all query error:", metaAllRes.error.message);
    if (metaLatestRes.error) console.warn("Meta latest query error:", metaLatestRes.error.message);

    let orcamentoTotal = Number(orcRes.data?.orcamento_total) || 0;

    // Fallback: szs_orcamento vazio → puxa do Nekt (orcamento_*_lovable.ads_venda_spot)
    if (!orcamentoTotal) {
      try {
        const nextMonthDt = new Date(year, month, 1);
        const nextMonthStart = `${nextMonthDt.getFullYear()}-${String(nextMonthDt.getMonth() + 1).padStart(2, "0")}-01`;
        const budget = await getNektBudget("SZS", "ads_venda_spot", startDate, nextMonthStart);
        orcamentoTotal = Math.round(budget.orcamento);
      } catch (e) {
        console.warn("[szs/orcamento] Nekt fallback falhou:", e);
      }
    }

    const adMaxSpend = new Map<string, { spend: number; leads: number; squadId: number; emp: string }>();
    for (const row of metaAllRes.data || []) {
      const spend = Number(row.spend_month) || 0;
      const leads = Number(row.leads_month) || 0;
      const cur = adMaxSpend.get(row.ad_id);
      if (!cur || spend > cur.spend) {
        adMaxSpend.set(row.ad_id, { spend, leads, squadId: row.squad_id, emp: row.empreendimento });
      }
    }

    // Aggregate spend by canal_group (Meta Ads only relates to Marketing canal)
    // For orcamento, we group by canal_group but Meta Ads spend is city-level
    // We attribute all Meta Ads spend to "Marketing" canal group
    const canalGroupSpend = new Map<string, number>();
    let gastoAtual = 0;
    for (const [, data] of adMaxSpend) {
      gastoAtual += data.spend;
      // All Meta Ads spend goes under "Marketing"
      const cg = "Marketing";
      canalGroupSpend.set(cg, (canalGroupSpend.get(cg) || 0) + data.spend);
    }
    gastoAtual = Math.round(gastoAtual * 100) / 100;

    // Also track spend by city within Marketing for empreendimento breakdown
    const citySpend = new Map<string, number>();
    for (const [, data] of adMaxSpend) {
      citySpend.set(data.emp, (citySpend.get(data.emp) || 0) + data.spend);
    }

    // Active campaigns by city
    const cityCampaigns = new Map<string, Set<string>>();
    for (const row of metaLatestRes.data || []) {
      if (row.effective_status !== "ACTIVE") continue;
      if (!cityCampaigns.has(row.empreendimento)) cityCampaigns.set(row.empreendimento, new Set());
      cityCampaigns.get(row.empreendimento)!.add(row.campaign_name);
    }

    let gastoAtivo = 0;
    const activeCampaigns = new Set<string>();
    for (const row of metaLatestRes.data || []) {
      if (row.effective_status === "ACTIVE") activeCampaigns.add(row.ad_id);
    }
    for (const [adId, data] of adMaxSpend) {
      if (activeCampaigns.has(adId)) gastoAtivo += data.spend;
    }
    const gastoDiario = diasPassados > 0
      ? Math.round((gastoAtivo / diasPassados) * 100) / 100
      : 0;

    const projecaoMes = diasPassados >= 3
      ? Math.round((gastoAtual / diasPassados) * diasNoMes * 100) / 100
      : Math.round(gastoDiario * diasNoMes * 100) / 100;

    const ritmoIdeal = orcamentoTotal > 0
      ? Math.round((orcamentoTotal / diasNoMes) * diasPassados * 100) / 100
      : 0;

    let status: "ok" | "alerta" | "critico" = "ok";
    if (orcamentoTotal > 0) {
      const ratio = projecaoMes / orcamentoTotal;
      if (ratio > 1.15) status = "critico";
      else if (ratio > 1.05) status = "alerta";
    }

    const empBudgetRec = new Map<string, number>();
    const empExplicacao = new Map<string, string>();
    for (const row of approvedRes.data || []) {
      empBudgetRec.set(row.empreendimento, Number(row.budget_recomendado) || 0);
      empExplicacao.set(row.empreendimento, row.explicacao || "");
    }

    // Build squads by canal_group
    // For Marketing canal group: break down by city with Meta Ads data
    // For other canal groups: single squad with no spend data (they don't use Meta Ads)
    const squadsBreakdown: OrcamentoSquadBreakdown[] = CANAL_GROUP_ORDER.map((canalGroup, idx) => {
      if (canalGroup === "Marketing") {
        // Build city-level empreendimentos for Marketing
        const allCidades = new Set<string>();
        for (const cidade of citySpend.keys()) allCidades.add(cidade);
        for (const cidade of cityCampaigns.keys()) allCidades.add(cidade);
        for (const cidade of empBudgetRec.keys()) allCidades.add(cidade);

        const sortedCidades = Array.from(allCidades).sort();
        const empreendimentos: OrcamentoEmpBreakdown[] = sortedCidades.map((cidade) => {
          const empGasto = Math.round((citySpend.get(cidade) || 0) * 100) / 100;
          const empCampCount = cityCampaigns.get(cidade)?.size || 0;
          return {
            emp: cidade,
            gastoAtual: empGasto,
            gastoDiario: empCampCount > 0 && diasPassados > 0 ? Math.round((empGasto / diasPassados) * 100) / 100 : 0,
            campaignsActive: empCampCount,
            budgetRecomendado: empBudgetRec.get(cidade) || 0,
            budgetExplicacao: empExplicacao.get(cidade) || "",
          };
        });

        const sqGasto = empreendimentos.reduce((s, e) => s + e.gastoAtual, 0);
        const sqCampaigns = empreendimentos.reduce((s, e) => s + e.campaignsActive, 0);

        return {
          id: idx + 1,
          name: canalGroup,
          gastoAtual: Math.round(sqGasto * 100) / 100,
          gastoDiario: diasPassados > 0 ? Math.round((sqGasto / diasPassados) * 100) / 100 : 0,
          campaignsActive: sqCampaigns,
          empreendimentos,
        };
      } else {
        // Non-Marketing canal groups: no Meta Ads spend
        return {
          id: idx + 1,
          name: canalGroup,
          gastoAtual: 0,
          gastoDiario: 0,
          campaignsActive: 0,
          empreendimentos: [],
        };
      }
    });

    // Log
    const today = now.toISOString().split("T")[0];
    const logInserts: Array<{ date: string; empreendimento: string; squad_id: number; budget_recomendado: number; budget_real: number; tipo: string; explicacao: string }> = [];

    for (const sq of squadsBreakdown) {
      for (const emp of sq.empreendimentos) {
        const rec = emp.budgetRecomendado || 0;
        const real = emp.gastoDiario;
        if (rec <= 0 || real <= 0) continue;
        if (Math.round(real) !== Math.round(rec)) continue;

        let tipo: string;
        const delta = rec - real;
        if (emp.campaignsActive === 0) {
          tipo = "Escalar";
        } else if (delta > real * 0.05) {
          tipo = "Escalar";
        } else if (delta < -real * 0.05) {
          tipo = "Reduzir";
        } else {
          const expl = (emp.budgetExplicacao || "").toLowerCase();
          if (expl.includes("acima da média") || expl.includes("reduzir")) {
            tipo = "Otimizar";
          } else if (expl.includes("escalar") || expl.includes("melhor")) {
            tipo = "Escalar";
          } else {
            tipo = "Manter";
          }
        }

        logInserts.push({
          date: today,
          empreendimento: emp.emp,
          squad_id: sq.id,
          budget_recomendado: rec,
          budget_real: Math.round(real),
          tipo,
          explicacao: emp.budgetExplicacao || "",
        });
      }
    }

    if (logInserts.length > 0) {
      await supabase.from("szs_orcamento_log").upsert(logInserts, { onConflict: "date,empreendimento" });
    }

    const logCutoff = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
    const { data: logRows } = await supabase
      .from("szs_orcamento_log")
      .select("*")
      .gte("date", logCutoff)
      .order("date", { ascending: false })
      .order("empreendimento");

    const log: OrcamentoLogEntry[] = (logRows || []).map((r: Record<string, unknown>) => ({
      date: r.date as string,
      empreendimento: r.empreendimento as string,
      squadId: r.squad_id as number,
      budgetRecomendado: Number(r.budget_recomendado),
      budgetReal: Number(r.budget_real),
      tipo: (r.tipo as OrcamentoLogEntry["tipo"]) || "Manter",
      explicacao: r.explicacao as string,
    }));

    const result: OrcamentoData = {
      mes: curMonth,
      orcamentoTotal,
      gastoAtual,
      gastoDiario,
      diasNoMes,
      diasPassados,
      projecaoMes,
      ritmoIdeal,
      status,
      squads: squadsBreakdown,
      snapshotDate,
      log,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("SZS Orcamento GET error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mes, orcamentoTotal } = body as { mes: string; orcamentoTotal: number };

    if (!mes || typeof orcamentoTotal !== "number") {
      return NextResponse.json({ error: "mes e orcamentoTotal são obrigatórios" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("szs_orcamento")
      .upsert({ mes, orcamento_total: orcamentoTotal, updated_at: new Date().toISOString() }, { onConflict: "mes" })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json(data);
  } catch (error) {
    console.error("SZS Orcamento POST error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
