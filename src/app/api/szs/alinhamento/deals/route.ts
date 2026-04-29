// SZS (Serviços) module
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getModuleConfig } from "@/lib/modules";
import { getSquadIdFromDeal, getCanalGroupFromId } from "@/lib/szs-utils";

const mc = getModuleConfig("szs");

export const dynamic = "force-dynamic";

const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchOwner(colName: string, ownerName: string): boolean {
  return normalize(ownerName).includes(normalize(colName));
}

const PV_COLS = mc.presellers;
const V_COLS = mc.closers;

interface MisalignedDeal {
  deal_id: number;
  title: string;
  empreendimento: string;
  canal: string;
  canalGroup: string;
  owner_name: string;
  link: string;
}

export async function GET() {
  try {
    // Fetch alignment deals
    const { data: deals, error } = await supabase
      .from("szs_alignment_deals")
      .select("deal_id, title, empreendimento, owner_name");

    if (error) throw new Error(`Supabase error: ${error.message}`);

    // Fetch canal/canal_de_origem/rd_source for each deal from szs_deals to determine squad assignment
    const dealIds = (deals || []).map((d) => d.deal_id);
    type DealClassFields = { canal: string; canal_de_origem: string | null; rd_source: string | null };
    const fieldsMap = new Map<number, DealClassFields>();
    const PAGE = 1000;
    for (let i = 0; i < dealIds.length; i += PAGE) {
      const batch = dealIds.slice(i, i + PAGE);
      const { data: rows } = await supabase
        .from("szs_deals")
        .select("deal_id, canal, canal_de_origem, rd_source")
        .in("deal_id", batch);
      for (const r of rows || []) {
        fieldsMap.set(r.deal_id, {
          canal: r.canal || "",
          canal_de_origem: r.canal_de_origem ?? null,
          rd_source: r.rd_source ?? null,
        });
      }
    }

    function getSquadInfo(f: DealClassFields) {
      const squadId = getSquadIdFromDeal(f.canal, f.canal_de_origem, f.rd_source);
      const sq = mc.squads.find((s) => s.id === squadId);
      if (!sq) return null;
      const vIndices = mc.squadCloserMap[sq.id] || [];
      return { correctPV: sq.preVenda, correctVIndices: vIndices, squadId: sq.id };
    }

    // Group misaligned deals by person (PV or V column name)
    const byPerson = new Map<string, { role: "pv" | "v"; deals: MisalignedDeal[] }>();

    for (const deal of deals || []) {
      const f = fieldsMap.get(deal.deal_id);
      if (!f) continue;
      const canal = f.canal;
      const info = getSquadInfo(f);
      if (!info) continue;

      // Check which PV/V column this owner matches
      let matchedPV: string | null = null;
      let matchedV: string | null = null;

      for (const col of PV_COLS) {
        if (matchOwner(col, deal.owner_name)) { matchedPV = col; break; }
      }
      for (const col of V_COLS) {
        if (matchOwner(col, deal.owner_name)) { matchedV = col; break; }
      }

      const dealInfo: MisalignedDeal = {
        deal_id: deal.deal_id,
        title: deal.title,
        empreendimento: deal.empreendimento,
        canal,
        canalGroup: getCanalGroupFromId(canal),
        owner_name: deal.owner_name,
        link: `https://${PIPEDRIVE_DOMAIN}/deal/${deal.deal_id}`,
      };

      // Check PV misalignment
      if (matchedPV && !matchOwner(info.correctPV, deal.owner_name)) {
        if (!byPerson.has(matchedPV)) byPerson.set(matchedPV, { role: "pv", deals: [] });
        byPerson.get(matchedPV)!.deals.push(dealInfo);
      }

      // Check V misalignment
      if (matchedV) {
        const vIdx = V_COLS.indexOf(matchedV);
        if (!info.correctVIndices.includes(vIdx)) {
          if (!byPerson.has(matchedV)) byPerson.set(matchedV, { role: "v", deals: [] });
          byPerson.get(matchedV)!.deals.push(dealInfo);
        }
      }
    }

    const result = Array.from(byPerson.entries()).map(([person, data]) => ({
      person,
      role: data.role,
      deals: data.deals.sort((a, b) => a.canalGroup.localeCompare(b.canalGroup)),
    }));

    return NextResponse.json({ byPerson: result });
  } catch (error) {
    console.error("SZS Alinhamento deals error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
