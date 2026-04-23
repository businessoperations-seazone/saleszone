// SZS (Serviços) module — alinhamento por canal e analista
import { NextResponse } from "next/server";
import { createSquadSupabaseAdmin } from "@/lib/squad/supabase";
import { getModuleConfig } from "@/lib/modules";
import type { AlinhamentoData } from "@/lib/types";
import { paginate } from "@/lib/paginate";
import {
  getSquadIdFromCanalGroup,
  getCanalGroupFromId,
} from "@/lib/szs-utils";

const mc = getModuleConfig("szs");

export const dynamic = "force-dynamic";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchOwner(colName: string, ownerName: string): boolean {
  if (!colName || !ownerName) return false;
  return normalize(ownerName).includes(normalize(colName));
}

export async function GET() {
  try {
    const admin = createSquadSupabaseAdmin();

    const deals = await paginate((o, ps) =>
      admin
        .from("szs_deals")
        .select("empreendimento, canal, owner_name, preseller_name, lost_reason")
        .eq("status", "open")
        .range(o, o + ps - 1)
    );

    // Group deals by canal_group × owner
    const groupOwner = new Map<string, Map<string, number>>();
    for (const d of deals) {
      if (d.lost_reason === "Duplicado/Erro") continue;
      const canalGroup = getCanalGroupFromId(String(d.canal || ""));
      if (!groupOwner.has(canalGroup)) groupOwner.set(canalGroup, new Map());
      const ownerMap = groupOwner.get(canalGroup)!;
      const owner = d.owner_name || "Sem owner";
      ownerMap.set(owner, (ownerMap.get(owner) || 0) + 1);
    }

    const PV_COLS = mc.presellers;
    const V_COLS = mc.closers;

    // Build rows: canals as sub-rows, grouped by squad
    const rows: AlinhamentoData["rows"] = [];
    const allCanalGroups = Array.from(groupOwner.keys()).sort();

    for (const canalGroup of allCanalGroups) {
      const owners = groupOwner.get(canalGroup) || new Map<string, number>();
      const sqId = getSquadIdFromCanalGroup(canalGroup);
      const sqName = mc.squads.find((s) => s.id === sqId)?.name || `Squad ${sqId}`;

      const pv: Record<string, number> = {};
      const v: Record<string, number> = {};

      PV_COLS.forEach((col) => {
        let total = 0;
        for (const [owner, count] of owners) {
          if (matchOwner(col, owner)) total += count;
        }
        pv[col] = total;
      });

      V_COLS.forEach((col) => {
        let total = 0;
        for (const [owner, count] of owners) {
          if (matchOwner(col, owner)) total += count;
        }
        v[col] = total;
      });

      const sq = mc.squads.find((s) => s.id === sqId);
      rows.push({
        sqId,
        sqName,
        emp: canalGroup,
        correctPV: sq?.preVenda || "",
        correctV: sq?.venda || "",
        cells: { pv, v },
      });
    }

    // Sort by squad then canal name
    rows.sort((a, b) => a.sqId - b.sqId || a.emp.localeCompare(b.emp));

    // Build PV → squad mapping (PVs not matching any squad.preVenda fall to squad 1)
    const pvToSquad = new Map<string, number>();
    for (const p of PV_COLS) {
      const pvSq = mc.squads.find((s) => normalize(s.preVenda) === normalize(p));
      pvToSquad.set(p, pvSq?.id ?? mc.squads[0]?.id ?? 1);
    }

    // Stats: calculate misaligned deals
    let total = 0;
    let mis = 0;
    rows.forEach((row) => {
      PV_COLS.forEach((p) => {
        const val = row.cells.pv[p] || 0;
        total += val;
        if (val > 0 && pvToSquad.get(p) !== row.sqId) mis += val;
      });
      const sqVIndices = mc.squadCloserMap[row.sqId] || [];
      V_COLS.forEach((p, idx) => {
        const val = row.cells.v[p] || 0;
        total += val;
        if (val > 0 && !sqVIndices.includes(idx)) mis += val;
      });
    });

    const result: AlinhamentoData = {
      rows,
      stats: { total, ok: total - mis, mis },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("SZS Alinhamento error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
