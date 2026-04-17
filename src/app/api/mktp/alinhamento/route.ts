import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getModuleConfig } from "@/lib/modules";
import type { AlinhamentoData } from "@/lib/types";

const mc = getModuleConfig("mktp");
const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";
const FIELD_EMPREENDIMENTO = "6d565fd4fce66c16da078f520a685fa2fa038272";
const PIPELINE_ID = 37;

// Full empreendimento map (same as sync-mktp-deals) — covers all historical + active properties
const EMP_MAP: Record<string, string> = {
  "3313": "Altavista", "1132": "Barra de São Miguel Spot", "3478": "Barra Grande Spot",
  "462": "Barra Spot", "2840": "Batel Spot", "3303": "Bonito Spot", "3451": "Bonito Spot II",
  "3266": "Cachoeira Beach Spot", "2835": "Cachoeira Spot", "2324": "Campeche Spot",
  "4090": "Canas Beach Spot", "2573": "Canasvieiras Spot", "692": "Canela Spot",
  "3416": "Caraguá Spot", "510": "Downtown", "1125": "Duetto", "4271": "Farol da Barra Spot",
  "4056": "Foz Spot", "3201": "Ilha do Campeche II Spot", "2607": "Ilha do Campeche Spot",
  "828": "Imbassaí Spot", "464": "Ingleses Spot", "3467": "Itacaré Spot",
  "466": "Japaratinga Spot", "3985": "Jardim dos Namorados", "2904": "Jurerê Beach Spot",
  "506": "Jurerê Spot", "3333": "Jurerê Spot II", "4586": "Jurerê Spot III",
  "505": "Lagoa Spot", "2935": "Marista 144 Spot", "1126": "Maxxi Garden",
  "3158": "Meireles Spot", "2885": "Morro das Pedras Spot", "1127": "Mosaico",
  "4495": "Natal Spot", "3182": "New Life", "4292": "Novo Campeche Spot",
  "4655": "Novo Campeche Spot II", "636": "Olímpia Spot", "490": "Penha Spot",
  "1124": "Pio 4", "3489": "Ponta das Canas Spot", "4109": "Ponta das Canas Spot II",
  "1128": "Reflect", "2795": "Rosa Norte Spot", "504": "Rosa Spot", "463": "Rosa Sul Spot",
  "1447": "Salvador Spot", "3298": "Santinho Spot", "3119": "Santo Antônio Spot",
  "3308": "Soul Guarajuba", "2868": "Sul da Ilha Spot", "1129": "T58", "824": "Top Club",
  "1171": "Trancoso Spot", "465": "Urubici Spot", "2526": "Urubici Spot II",
  "2415": "Vale do Ouro", "461": "Vistas de Anitá I", "637": "Vistas de Anitá II",
  "2745": "VN Ueno", "3309": "Zn Barra", "492": "Aguardando definição",
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function matchOwner(colName: string, ownerName: string): boolean {
  const c = normalize(colName);
  const o = normalize(ownerName);
  return o.includes(c) || c.includes(o);
}

async function pipeFetch(token: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://${PIPEDRIVE_DOMAIN}/api/v1${path}`);
  url.searchParams.set("api_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Pipedrive ${path}: ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const srvClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: tokenData } = await srvClient.rpc("vault_read_secret", { secret_name: "PIPEDRIVE_API_TOKEN" });
    const token = typeof tokenData === "string" ? tokenData : "";
    if (!token) throw new Error("PIPEDRIVE_API_TOKEN not found in vault");

    // Fetch all users (paginated) to resolve owner IDs → names
    const userMap = new Map<number, string>();
    let uStart = 0;
    while (true) {
      const res = await pipeFetch(token, "/users", { limit: "500", start: String(uStart) });
      for (const u of res.data || []) userMap.set(Number(u.id), u.name);
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      uStart += 500;
    }

    // Fetch all open deals from pipeline 37 (paginated)
    // Group: empreendimento → owner → count
    const ownerCounts = new Map<string, Map<string, number>>();
    let start = 0;
    while (true) {
      const res = await pipeFetch(token, `/pipelines/${PIPELINE_ID}/deals`, {
        limit: "500", start: String(start), everyone: "1",
      });
      if (!res.data || res.data.length === 0) break;

      for (const deal of res.data) {
        if (deal.pipeline_id !== PIPELINE_ID) continue;

        // Resolve empreendimento — fallback to "Outros" so no deal is discarded
        const empId = String(deal[FIELD_EMPREENDIMENTO] || "");
        const emp = EMP_MAP[empId] || (empId ? `Outros (${empId})` : "Sem empreendimento");

        // Resolve owner name — pipeline endpoint returns user_id as integer
        const userId = typeof deal.user_id === "object" ? deal.user_id?.id : deal.user_id;
        const ownerName = userId
          ? (userMap.get(Number(userId)) || `User ${userId}`)
          : "Sem owner";

        if (!ownerCounts.has(emp)) ownerCounts.set(emp, new Map());
        const counts = ownerCounts.get(emp)!;
        counts.set(ownerName, (counts.get(ownerName) || 0) + 1);
      }

      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
    }

    const PV_COLS = mc.presellers; // ["Karoline Borges"]
    const V_COLS = mc.closers;     // ["Nevine Saratt", "Willian Miranda"]
    const sq = mc.squads[0];

    const allEmps = Array.from(ownerCounts.keys()).sort();

    const rows: AlinhamentoData["rows"] = allEmps.map((emp) => {
      const counts = ownerCounts.get(emp)!;

      const pv: Record<string, number> = {};
      PV_COLS.forEach((col) => {
        let total = 0;
        for (const [owner, count] of counts) {
          if (matchOwner(col, owner)) total += count;
        }
        pv[col] = total;
      });

      const v: Record<string, number> = {};
      V_COLS.forEach((col) => {
        let total = 0;
        for (const [owner, count] of counts) {
          if (matchOwner(col, owner)) total += count;
        }
        v[col] = total;
      });

      return {
        sqId: sq?.id ?? 1,
        sqName: sq?.name ?? "Marketplace",
        emp,
        correctPV: mc.presellers.join(", "),
        correctV: mc.closers.join(", "),
        cells: { pv, v },
      };
    });

    let total = 0;
    rows.forEach((row) => {
      V_COLS.forEach((col) => { total += row.cells.v[col] || 0; });
      PV_COLS.forEach((col) => { total += row.cells.pv[col] || 0; });
    });

    // Debug: collect all distinct owner names found in pipeline deals
    const allOwnerNames = new Set<string>();
    for (const counts of ownerCounts.values()) {
      for (const owner of counts.keys()) allOwnerNames.add(owner);
    }

    const result: AlinhamentoData = {
      rows,
      stats: { total, ok: total, mis: 0 },
    };

    return NextResponse.json({ ...result, _debug_owners: Array.from(allOwnerNames).sort() });
  } catch (error) {
    console.error("MKTP Alinhamento error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
