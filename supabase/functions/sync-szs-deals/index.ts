// SZS (Serviços) module — auto-generated from SZI equivalent
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ---- Pipedrive constants ----
const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";
const BASE = `https://${PIPEDRIVE_DOMAIN}/api/v1`;
const PIPELINE_ID = 14;
const FIELD_CANAL = "93b3ada8b94bd1fc4898a25754d6bcac2713f835";
const FIELD_EMPREENDIMENTO = "6d565fd4fce66c16da078f520a685fa2fa038272";
const FIELD_CIDADE = "45a56c6ae1f43dad4992c3c23d4a2a32787d93d6";
const FIELD_QUALIFICACAO = "bc74bcc4326527cbeb331d1697d4c8812d68506e";
const FIELD_REUNIAO = "bfafc352c5c6f2edbaa41bf6d1c6daa825fc9c16";
const FIELD_RD_SOURCE = "ff53f6910138fa1d8969b686acb4b1336d50c9bd";
const FIELD_PRESELLER = "34a7f4f5f78e8a8d4751ddfb3cfcfb224d8ff908";
// SZS filter: exclude specific channels (inverse of SZI's "canal = Marketing" filter)
const EXCLUDED_CANAIS = new Set(["582", "583", "1748", "3189"]); // Indicação de Corretor, Indicação de Franquia, Expansão, Spot Seazone

const EMPREENDIMENTO_MAP: Record<string, string> = {
  "3313": "Altavista",
  "1132": "Barra de São Miguel Spot",
  "3478": "Barra Grande Spot",
  "462": "Barra Spot",
  "2840": "Batel Spot",
  "3303": "Bonito Spot",
  "3451": "Bonito Spot II",
  "3266": "Cachoeira Beach Spot",
  "2835": "Cachoeira Spot",
  "2324": "Campeche Spot",
  "4090": "Canas Beach Spot",
  "2573": "Canasvieiras Spot",
  "692": "Canela Spot",
  "3416": "Caraguá Spot",
  "510": "Downtown",
  "1125": "Duetto",
  "4271": "Farol da Barra Spot",
  "4056": "Foz Spot",
  "3201": "Ilha do Campeche II Spot",
  "2607": "Ilha do Campeche Spot",
  "828": "Imbassaí Spot",
  "464": "Ingleses Spot",
  "3467": "Itacaré Spot",
  "466": "Japaratinga Spot",
  "3985": "Jardim dos Namorados",
  "2904": "Jurerê Beach Spot",
  "506": "Jurerê Spot",
  "3333": "Jurerê Spot II",
  "4586": "Jurerê Spot III",
  "505": "Lagoa Spot",
  "2935": "Marista 144 Spot",
  "1126": "Maxxi Garden",
  "3158": "Meireles Spot",
  "2885": "Morro das Pedras Spot",
  "1127": "Mosaico",
  "4495": "Natal Spot",
  "3182": "New Life",
  "4292": "Novo Campeche Spot",
  "4655": "Novo Campeche Spot II",
  "636": "Olímpia Spot",
  "490": "Penha Spot",
  "1124": "Pio 4",
  "3489": "Ponta das Canas Spot",
  "4109": "Ponta das Canas Spot II",
  "1128": "Reflect",
  "2795": "Rosa Norte Spot",
  "504": "Rosa Spot",
  "463": "Rosa Sul Spot",
  "1447": "Salvador Spot",
  "3298": "Santinho Spot",
  "3119": "Santo Antônio Spot",
  "3308": "Soul Guarajuba",
  "2868": "Sul da Ilha Spot",
  "1129": "T58",
  "824": "Top Club",
  "1171": "Trancoso Spot",
  "465": "Urubici Spot",
  "2526": "Urubici Spot II",
  "2415": "Vale do Ouro",
  "461": "Vistas de Anitá I",
  "637": "Vistas de Anitá II",
  "2745": "VN Ueno",
  "3309": "Zn Barra",
};

const PIPELINE_STAGES: number[] = [70, 71, 72, 345, 341, 73, 342, 151, 74, 75, 152, 76];

const STAGE_ORDER: Record<number, number> = {
  70: 1, 71: 2, 72: 3, 345: 4, 341: 5, 73: 6, 342: 7, 151: 8, 74: 9, 75: 10, 152: 11, 76: 12,
};

const OPP_MIN_ORDER = 9;

// ---- Pipedrive API ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pipedriveGet(apiToken: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_token", apiToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const RETRY_DELAYS = [5_000, 15_000, 30_000];
  for (let attempt = 0; attempt <= 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 3) {
      console.warn(`Pipedrive 429 on ${path}, retry ${attempt + 1}/3 in ${RETRY_DELAYS[attempt] / 1000}s`);
      await sleep(RETRY_DELAYS[attempt]);
      continue;
    }
    throw new Error(`Pipedrive ${path}: ${res.status}`);
  }
  throw new Error(`Pipedrive ${path}: max retries exceeded`);
}

const CIDADE_MAP: Record<string, string> = {
  "1465": "Alagoinhas, BA",
  "607": "Alfredo Wagner, SC",
  "1781": "Alto Paraíso de Goiás, GO",
  "2255": "Anchieta, ES",
  "434": "Angra dos Reis, RJ",
  "650": "Anitápolis, SC",
  "4170": "Anápolis, GO",
  "2484": "Aparecida de Goiânia, GO",
  "3319": "Aparecida, SP",
  "2515": "Apiúna, SC",
  "3265": "Aquiraz, CE",
  "2196": "Aracaju, SE",
  "2680": "Aracati, CE",
  "2563": "Aragoiânia, GO",
  "2468": "Arapiraca, AL",
  "2383": "Araranguá, SC",
  "2469": "Araraquara, SP",
  "2074": "Araruama, RJ",
  "2629": "Araçariguama, SP",
  "2153": "Arcoverde, PE",
  "196": "Armação dos Búzios, RJ",
  "436": "Arraial do Cabo, RJ",
  "2666": "Atibaia, SP",
  "2478": "Balneário Barra do Sul, SC",
  "158": "Balneário Camboriú, SC",
  "2455": "Balneário Pinhal, RS",
  "431": "Balneário Piçarras, SC",
  "2734": "Barra de Santo Antônio, AL",
  "1079": "Barra de São Miguel, AL",
  "1939": "Barra Mansa, RJ",
  "1905": "Barra Velha, SC",
  "1463": "Barreiras, BA",
  "1940": "Barreirinhas, MA",
  "4654": "Barueri, SP",
  "632": "Bauru, SP",
  "2667": "Baía Formosa, RN",
  "3264": "Beberibe, CE",
  "1901": "Belmonte, BA",
  "1421": "Belo Horizonte, MG",
  "3263": "Belém, PA",
  "854": "Bento Gonçalves, RS",
  "258": "Bertioga, SP",
  "2470": "Bezerros, PE",
  "1911": "Biguaçu, SC",
  "2630": "Biritiba Mirim, SP",
  "1848": "Blumenau, SC",
  "2479": "Bom Jardim da Serra, SC",
  "612": "Bom Retiro, SC",
  "161": "Bombinhas, SC",
  "3262": "Bonito, MS",
  "2681": "Bragança Paulista, SP",
  "1740": "Brasília, DF",
  "2140": "Braço do Norte, SC",
  "2608": "Brusque, SC",
  "2184": "Cabedelo, PB",
  "2489": "Cabo de Santo Agostinho, PE",
  "235": "Cabo Frio, RJ",
  "1912": "Cachoeira Paulista, SP",
  "2631": "Cachoeiras de Macacu, RJ",
  "1913": "Cachoeirinha, RS",
  "440": "Cairu, BA",
  "3261": "Cajueiro da Praia, PI",
  "1387": "Caldas Novas, GO",
  "3260": "Camanducaia, MG",
  "1043": "Camaçari, BA",
  "1853": "Camboriú, SC",
  "2712": "Camorim, RJ",
  "1914": "Campinas, SP",
  "2388": "Campo Alegre, SC",
  "1941": "Campo Grande, MS",
  "233": "Campos do Jordão, SP",
  "1791": "Canavieiras, BA",
  "2222": "Candeias, BA",
  "225": "Canela, RS",
  "2115": "Canoas, RS",
  "850": "Capão da Canoa, RS",
  "425": "Caraguatatuba, SP",
  "2223": "Caravelas, BA",
  "1849": "Caruaru, PE",
  "1978": "Casimiro de Abreu, RJ",
  "4533": "Catalão, GO",
  "2735": "Caucaia, CE",
  "845": "Caxias do Sul, RS",
  "2389": "Chapecó, SC",
  "3259": "Conde, BA",
  "2682": "Conde, PB",
  "1422": "Conselheiro Lafaiete, MG",
  "2312": "Coruripe, AL",
  "2632": "Cotia, SP",
  "2930": "Criciúma, SC",
  "3258": "Cruz, CE",
  "1742": "Cuiabá, MT",
  "1887": "Curitiba, PR",
  "2609": "Delfinópolis, MG",
  "4289": "Dourados, MS",
  "1915": "Duque de Caxias, RJ",
  "2683": "Embu Guaçu, SP",
  "1916": "Entre Rios, BA",
  "1761": "Eunápolis, BA",
  "1466": "Feira de Santana, BA",
  "119": "Florianópolis, SC",
  "1917": "Fortaleza, CE",
  "3257": "Fortim, CE",
  "2480": "Foz do Iguaçu, PR",
  "3256": "Garibaldi, RS",
  "239": "Garopaba, SC",
  "2684": "Goianira, GO",
  "1743": "Goiás, GO",
  "1744": "Goiânia, GO",
  "1946": "Gonçalves, MG",
  "432": "Governador Celso Ramos, SC",
  "4172": "Governador Valadares, MG",
  "224": "Gramado, RS",
  "2713": "Gravatá, PE",
  "2337": "Guapimirim, RJ",
  "2102": "Guaramiranga, CE",
  "1448": "Guarapari, ES",
  "2440": "Guaratinguetá, SP",
  "3320": "Guaratuba, PR",
  "1918": "Guarujá, SP",
  "1919": "Guarulhos, SP",
  "1769": "Guará, DF",
  "2481": "Harmonia, RS",
  "1745": "Hidrolândia, GO",
  "1920": "Ibiúna, SP",
  "2151": "Icapuí, CE",
  "2543": "Iguape, SP",
  "2714": "Ilha de Itamaracá, PE",
  "426": "Ilhabela, SP",
  "831": "Ilhéus, BA",
  "241": "Imbituba, SC",
  "2633": "Imbé, RS",
  "1133": "Ipojuca, PE",
  "1462": "Itabuna, BA",
  "605": "Itacaré, BA",
  "236": "Itajaí, SC",
  "1850": "Itanhaém, SP",
  "839": "Itaparica, BA",
  "157": "Itapema, SC",
  "2075": "Itapoá, SC",
  "2150": "Itatiba, SP",
  "2154": "Itatuba, PB",
  "2268": "Itobi, SP",
  "2076": "Itu, SP",
  "4548": "Itumbiara, GO",
  "1180": "Jaboatão dos Guararapes, PE",
  "3137": "Jaguaruna, SC",
  "590": "Japaratinga, AL",
  "1921": "Jaraguá do Sul, SC",
  "2610": "Jaú, SP",
  "1464": "Jequié, BA",
  "1254": "Joinville, SC",
  "4649": "João Monlevade, MG",
  "1406": "João Pessoa, PB",
  "2116": "Juazeiro do Norte, CE",
  "1467": "Juazeiro, BA",
  "2141": "Juiz de Fora, MG",
  "2931": "Lages, SC",
  "1397": "Lauro de Freitas, BA",
  "3255": "Lençóis, BA",
  "2224": "Leopoldo Bulhões, GO",
  "2155": "Londrina, PR",
  "2715": "Luis Correia, PI",
  "2668": "Luziânia, GO",
  "2157": "Luís Eduardo Magalhães, BA",
  "4619": "Macapá, AP",
  "614": "Maceió, AL",
  "2588": "Mairiporã, SP",
  "1948": "Manaus, AM",
  "437": "Mangaratiba, RJ",
  "442": "Maragogi, AL",
  "628": "Maraú, BA",
  "1066": "Marechal Deodoro, AL",
  "2471": "Marialva, PR",
  "2564": "Maricá, RJ",
  "1922": "Maringá, PR",
  "649": "Mata de São João, BA",
  "3254": "Matinhos, PR",
  "2634": "Miguel Pereira, RJ",
  "2185": "Mogi das Cruzes, SP",
  "2441": "Mongaguá, SP",
  "1851": "Natal, RN",
  "2142": "Navegantes, SC",
  "438": "Niterói, RJ",
  "2313": "Nova Petrópolis, RS",
  "2611": "Nova Prata, RS",
  "2490": "Nova Santa Rita, RS",
  "427": "Olímpia, SP",
  "2371": "Orleans, SC",
  "3253": "Ouro Preto, MG",
  "177": "Outros",
  "1168": "Palhoça, SC",
  "1949": "Palmas, TO",
  "2736": "Palmeira, SC",
  "3252": "Palmeiras, BA",
  "2472": "Paraipaba, CE",
  "1852": "Paranavaí, PR",
  "2491": "Paraty, RJ",
  "1923": "Paripueira, AL",
  "1886": "Passo de Camaragibe, AL",
  "2669": "Paulista, PE",
  "2589": "Pelotas, RS",
  "433": "Penha, SC",
  "2482": "Peruíbe, SP",
  "439": "Petrópolis, RJ",
  "1854": "Piatã, BA",
  "1746": "Pirenópolis, GO",
  "2152": "Pitimbu, PB",
  "3251": "Pomerode, SC",
  "1924": "Ponta Grossa, PR",
  "4494": "Ponta Porã, MS",
  "2612": "Pontal do Paraná, PR",
  "392": "Porto Alegre, RS",
  "159": "Porto Belo, SC",
  "1724": "Porto de Pedras, AL",
  "441": "Porto Seguro, BA",
  "2156": "Pouso Alegre, MG",
  "1142": "Poços de Caldas, MG",
  "2186": "Prado, BA",
  "242": "Praia do Rosa, SC",
  "2402": "Praia Grande, SC",
  "428": "Praia Grande, SP",
  "4301": "Presidente Prudente, SP",
  "613": "Rancho Queimado, SC",
  "1179": "Recife, PE",
  "2635": "Ribeirão das Neves, MG",
  "630": "Ribeirão Preto, SP",
  "2143": "Rio das Ostras, RJ",
  "1202": "Rio de Janeiro, RJ",
  "2565": "Rio do Sul, SC",
  "3250": "Salinópolis, PA",
  "653": "Salvador, BA",
  "1177": "Santa Cruz Cabrália, BA",
  "232": "Torres, RS",
  "429": "Santos, SP",
  "430": "São Sebastião, SP",
  "384": "Ubatuba, SP",
  "631": "São José do Rio Preto, SP",
  "695": "Uberaba, MG",
  "698": "Uberlândia, MG",
  "455": "Urubici, SC",
  "1058": "São Miguel dos Milagres, AL",
  "1178": "Tamandaré, PE",
  "1182": "Sinop, MT",
  "1239": "Teixeira de Freitas, BA",
  "1310": "São Paulo, SP",
  "1461": "Vitória da Conquista, BA",
  "1468": "Tibau do Sul, RN",
  "1727": "Vitória, ES",
  "1770": "Taguatinga, DF",
  "1793": "Uruçuca, BA",
  "1855": "Teresópolis, RJ",
  "1856": "Vila Velha, ES",
  "1858": "Tangará da Serra, MT",
  "1885": "São Pedro da Aldeia, RJ",
  "1899": "Teresina, PI",
  "1925": "Sapucaí-Mirim, MG",
  "1926": "São José, SC",
  "1952": "São Carlos, SP",
  "1976": "São Pedro de Alcântara, SC",
  "1977": "São Francisco do Sul, SC",
  "2098": "Sorocaba, SP",
  "2099": "Toledo, PR",
  "2103": "Santa Maria, RS",
  "2104": "Volta Redonda, RJ",
  "2144": "Santo Amaro da Imperatriz, SC",
  "2187": "Santa Luzia, MG",
  "2188": "São José dos Campos, SP",
  "2189": "São Vicente, SP",
  "2225": "Tubarão, SC",
  "2328": "São José dos Pinhais, PR",
  "2338": "Una, BA",
  "2349": "Serra Negra, SP",
  "2350": "São Bernardo do Campo, SP",
  "2372": "Vassouras, RJ",
  "2390": "Santo André, SP",
  "2391": "Timbó, SC",
  "2456": "São Leopoldo, RS",
  "2473": "Santo Antônio da Patrulha, RS",
  "2477": "Santo Amaro do Maranhão, MA",
  "2544": "Serra, ES",
  "2566": "São Joaquim, SC",
  "2590": "São Caetano do Sul, SP",
  "2591": "São Tomé das Letras, MG",
  "2613": "São Francisco de Paula, RS",
  "2636": "São Roque, SP",
  "2637": "Vera Cruz, BA",
  "2685": "Senador Canedo, GO",
  "2686": "Vespasiano, MG",
  "2716": "Timburi, SP",
  "2717": "Unaí, MG",
  "3247": "São Miguel do Gostosos, RN",
  "3248": "São Luís, MA",
  "3249": "Santarém, PA",
  "4547": "Valença, BA",
  "4650": "Santo Ângelo, RS",
  "856": "Xangri-lá, RS",
  "1771": "Águas Claras, DF",
  "4676": "Três Rios, RJ",
  "4677": "Primavera do Leste, MT",
  "4679": "Indaiatuba, SP",
  "4682": "Cascavel, PR",
  "4683": "São João del Rei, MG",
  "4815": "São Miguel do Gostoso, RN",
  "4816": "Schroeder, SC",
  "4817": "Itaitinga, CE",
  "4818": "Ipióca, AL",
  "4819": "Caeté, MG",
  "4820": "Alfredo Chaves, ES",
};

// ---- Deal helpers ----
function getEmpreendimento(deal: any): string | null {
  const enumId = String(deal[FIELD_EMPREENDIMENTO] || "");
  return EMPREENDIMENTO_MAP[enumId] || null;
}

function getCidade(deal: any): string {
  const enumId = String(deal[FIELD_CIDADE] || "");
  return CIDADE_MAP[enumId] || "Sem cidade";
}

function dealToRow(deal: any, maxStageOrder: number | null, flowFetched: boolean) {
  const stageOrder = STAGE_ORDER[deal.stage_id] || 0;
  return {
    deal_id: deal.id,
    title: deal.title || `Deal #${deal.id}`,
    stage_id: deal.stage_id,
    status: deal.status,
    user_id: typeof deal.user_id === "object" ? deal.user_id?.id : deal.user_id,
    owner_name: typeof deal.user_id === "object" ? deal.user_id?.name : null,
    add_time: deal.add_time || null,
    won_time: deal.won_time || null,
    lost_time: deal.lost_time || null,
    update_time: deal.update_time || null,
    canal: String(deal[FIELD_CANAL] || ""),
    canal_de_origem: deal.channel ? String(deal.channel) : null,
    empreendimento_id: String(deal[FIELD_CIDADE] || ""),
    empreendimento: getCidade(deal),
    qualificacao_date: deal[FIELD_QUALIFICACAO] || null,
    reuniao_date: deal[FIELD_REUNIAO] || null,
    lost_reason: deal.lost_reason || null,
    rd_source: deal[FIELD_RD_SOURCE] || null,
    preseller_name: typeof deal[FIELD_PRESELLER] === "object" ? deal[FIELD_PRESELLER]?.name : null,
    stage_order: stageOrder,
    max_stage_order: maxStageOrder ?? stageOrder,
    last_activity_date: deal.last_activity_date || null,
    next_activity_date: deal.next_activity_date || null,
    flow_fetched: flowFetched,
    synced_at: new Date().toISOString(),
  };
}

// ---- Batch upsert helper ----
async function upsertBatch(supabase: any, rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from("szs_deals").upsert(batch, { onConflict: "deal_id" });
    if (error) console.error(`Upsert error:`, error.message);
  }
}

// ---- Batch update helper (partial update, doesn't reset other columns) ----
async function updateFlowBatch(supabase: any, rows: Array<{ deal_id: number; max_stage_order: number }>) {
  const now = new Date().toISOString();
  for (const row of rows) {
    const { error } = await supabase
      .from("szs_deals")
      .update({ max_stage_order: row.max_stage_order, flow_fetched: true, synced_at: now })
      .eq("deal_id", row.deal_id);
    if (error) console.error(`Update error deal ${row.deal_id}:`, error.message);
  }
}

// ---- Flow API: find max stage a deal ever reached ----
async function getMaxStageReached(apiToken: string, dealId: number, currentOrder: number): Promise<number> {
  if (currentOrder >= OPP_MIN_ORDER) return currentOrder;
  let max = currentOrder;
  let s = 0;
  try {
    while (true) {
      const res = await pipedriveGet(apiToken, `/deals/${dealId}/flow`, { limit: "100", start: String(s) });
      if (!res.data) break;
      for (const e of res.data) {
        if (e.object === "dealChange" && e.data?.field_key === "stage_id") {
          for (const v of [e.data.old_value, e.data.new_value]) {
            const order = STAGE_ORDER[parseInt(v)] || 0;
            if (order > max) max = order;
          }
        }
      }
      if (max >= OPP_MIN_ORDER) break;
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      s += 100;
    }
  } catch (err) {
    console.error(`flow error deal ${dealId}:`, err);
  }
  return max;
}

// ---- Stale cleanup: fetch all open deal IDs from DB, exclude current Pipedrive IDs ----
async function fetchStaleIdsSZ(supabase: any, currentPdIds: Set<number>): Promise<number[]> {
  const staleIds: number[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("szs_deals")
      .select("deal_id")
      .eq("status", "open")
      .range(offset, offset + 999);
    if (error) { console.error("  Stale cleanup query error:", error.message); break; }
    if (!data || data.length === 0) break;
    for (const d of data) {
      if (!currentPdIds.has(d.deal_id)) staleIds.push(d.deal_id);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return staleIds;
}

// ---- Mode: deals-open ----
async function syncDealsOpen(apiToken: string, supabase: any) {
  console.log(`syncDealsOpen: fetching pipeline ${PIPELINE_ID} open deals...`);

  // /pipelines/{id}/deals returns user_id as integer (not object with name),
  // so fetch ALL users (paginated) to build complete userMap for owner name resolution
  const userMap = new Map<number, string>();
  let uStart = 0;
  while (true) {
    const usersRes = await pipedriveGet(apiToken, "/users", { limit: "500", start: String(uStart) });
    for (const u of usersRes.data || []) userMap.set(Number(u.id), u.name);
    if (!usersRes.additional_data?.pagination?.more_items_in_collection) break;
    uStart += 500;
  }
  console.log(`  Users loaded: ${userMap.size}`);

  const rows: any[] = [];
  let start = 0;
  let total = 0;

  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start),
    });
    if (!res.data || res.data.length === 0) break;
    total += res.data.length;

    for (const deal of res.data) {
      // Pipeline endpoint only returns SZS pipeline, but filter just in case
      if (deal.pipeline_id !== PIPELINE_ID) continue;
      // Resolve owner_name: always prefer userMap (handles both integer and object user_id)
      const userId = typeof deal.user_id === "object" ? deal.user_id?.id : deal.user_id;
      const resolvedName = userId
        ? (userMap.get(Number(userId)) ?? (typeof deal.user_id === "object" ? deal.user_id?.name : null))
        : null;
      deal.user_id = { id: userId, name: resolvedName };
      const stageOrder = STAGE_ORDER[deal.stage_id] || 0;
      rows.push(dealToRow(deal, stageOrder, true));
    }

    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }

  console.log(`  Open deals fetched: ${total}, rows to upsert: ${rows.length}`);
  await upsertBatch(supabase, rows);

  // Stale cleanup: mark as "lost" any deals that are "open" in DB but no longer
  // in the Pipedrive open deals list (i.e., they were closed since last sync).
  const currentPdIds = new Set(rows.map((r: any) => r.deal_id));
  const staleIds = currentPdIds.size > 0
    ? await fetchStaleIdsSZ(supabase, currentPdIds)
    : [];

  if (staleIds.length > 0) {
    await supabase
      .from("szs_deals")
      .update({ status: "lost", synced_at: new Date().toISOString() })
      .in("deal_id", staleIds);
    console.log(`  Stale cleanup: marked ${staleIds.length} deals as lost`);
  }

  return { totalFetched: total, upserted: rows.length };
}

// ---- Mode: deals-won ----
async function syncDealsWon(apiToken: string, supabase: any) {
  console.log(`syncDealsWon: fetching won deals via stage_id loop...`);
  const seenDealIds = new Set<number>();
  const rows: any[] = [];
  let totalFetched = 0;

  for (const stageId of PIPELINE_STAGES) {
    let start = 0;
    while (true) {
      const res = await pipedriveGet(apiToken, "/deals", {
        status: "won",
        stage_id: String(stageId),
        limit: "500",
        start: String(start),
      });
      if (!res.data || res.data.length === 0) break;
      totalFetched += res.data.length;

      for (const deal of res.data) {
        if (deal.pipeline_id !== PIPELINE_ID) continue;
        if (seenDealIds.has(deal.id)) continue;
        seenDealIds.add(deal.id);
        // Won deals passed all stages: max_stage_order = 12 (SZS has 12 stages)
        rows.push(dealToRow(deal, 12, true));
      }

      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
    }
  }

  console.log(`  Won deals fetched: ${totalFetched}, unique: ${seenDealIds.size}, rows: ${rows.length}`);
  await upsertBatch(supabase, rows);
  return { totalFetched, unique: seenDealIds.size, upserted: rows.length };
}

// ---- Mode: deals-lost ----
// Each stage is paginated independently. State is tracked per-stage via `stage_offsets`.
// Body params: cutoff_days (0=no cutoff), stage_offsets (Record<stageId, offset>, default all 0)
async function syncDealsLost(
  apiToken: string,
  supabase: any,
  cutoffDays: number,
  stageOffsets: Record<string, number>,
) {
  let cutoffStr = "";
  if (cutoffDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cutoffDays);
    cutoffStr = cutoff.toISOString().substring(0, 10);
  }
  console.log(`syncDealsLost: cutoff=${cutoffStr || "NONE"}, stageOffsets=${JSON.stringify(stageOffsets)}`);

  const seenDealIds = new Set<number>();
  const rows: any[] = [];
  let totalFetched = 0;
  const completedStages: number[] = [];
  const nextOffsets: Record<string, number> = { ...stageOffsets };
  let hitCap = false;

  for (const stageId of PIPELINE_STAGES) {
    const key = String(stageId);
    // -1 means this stage was already fully synced in a prior invocation
    if (nextOffsets[key] === -1) {
      completedStages.push(stageId);
      continue;
    }

    let start = nextOffsets[key] || 0;
    let stageDone = false;

    while (true) {
      const res = await pipedriveGet(apiToken, "/deals", {
        status: "lost",
        stage_id: key,
        sort: "add_time DESC",
        limit: "500",
        start: String(start),
      });
      if (!res.data || res.data.length === 0) { stageDone = true; break; }

      for (const deal of res.data) {
        if (deal.pipeline_id !== PIPELINE_ID) continue;
        if (seenDealIds.has(deal.id)) continue;
        seenDealIds.add(deal.id);

        const stageOrder = STAGE_ORDER[deal.stage_id] || 0;
        rows.push(dealToRow(deal, stageOrder, false));
      }

      totalFetched += res.data.length;

      // Check cutoff
      if (cutoffStr) {
        const oldestAddTime = res.data[res.data.length - 1]?.add_time?.substring(0, 10) || "";
        if (oldestAddTime && oldestAddTime < cutoffStr) { stageDone = true; break; }
      }

      if (!res.additional_data?.pagination?.more_items_in_collection) { stageDone = true; break; }
      start += 500;

      // Cap total rows at 5000 per invocation to stay within memory/time limits
      if (rows.length >= 5000) { hitCap = true; break; }
    }

    if (stageDone) {
      nextOffsets[key] = -1; // mark stage as complete
      completedStages.push(stageId);
    } else {
      nextOffsets[key] = start; // save where we left off
    }

    if (hitCap) break;
  }

  console.log(`  Lost deals fetched: ${totalFetched}, unique: ${seenDealIds.size}, rows: ${rows.length}, completedStages: ${completedStages.length}/${PIPELINE_STAGES.length}`);
  await upsertBatch(supabase, rows);

  const allDone = completedStages.length === PIPELINE_STAGES.length;
  return {
    dealsScanned: seenDealIds.size,
    upserted: rows.length,
    completedStages: completedStages.length,
    totalStages: PIPELINE_STAGES.length,
    done: allDone,
    stage_offsets: allDone ? null : nextOffsets,
  };
}

// ---- Mode: deals-flow ----
async function syncDealsFlow(apiToken: string, supabase: any) {
  console.log(`syncDealsFlow: fetching deals needing flow analysis...`);

  // Query deals that need flow: flow_fetched=false, status=lost, not excluded channels, with empreendimento
  const { data: deals, error: queryErr } = await supabase
    .from("szs_deals")
    .select("deal_id, stage_order, canal, empreendimento")
    .eq("flow_fetched", false)
    .eq("status", "lost")
    .not("canal", "in", `(${Array.from(EXCLUDED_CANAIS).join(",")})`)
    .not("empreendimento", "is", null)
    .limit(500);

  if (queryErr) {
    console.error("Query error:", queryErr.message);
    return { processed: 0, remaining: 0, done: true, error: queryErr.message };
  }

  if (!deals || deals.length === 0) {
    console.log("  No deals need flow analysis");
    return { processed: 0, remaining: 0, done: true };
  }

  console.log(`  Found ${deals.length} deals needing flow analysis`);

  // Separate deals that already have stage_order >= OPP_MIN_ORDER (skip flow)
  const skipFlow: any[] = [];
  const needFlow: any[] = [];

  for (const deal of deals) {
    if (deal.stage_order >= OPP_MIN_ORDER) {
      skipFlow.push(deal);
    } else {
      needFlow.push(deal);
    }
  }

  // Batch update deals that can skip flow (use UPDATE, not upsert, to preserve other columns)
  if (skipFlow.length > 0) {
    await updateFlowBatch(supabase, skipFlow.map((d: any) => ({
      deal_id: d.deal_id,
      max_stage_order: d.stage_order,
    })));
    console.log(`  Skipped flow for ${skipFlow.length} deals (already OPP+)`);
  }

  // Process deals that need flow API with concurrency=20
  let processed = 0;
  const CONCURRENCY = 20;

  for (let i = 0; i < needFlow.length; i += CONCURRENCY) {
    const chunk = needFlow.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (deal: any) => {
        const maxOrder = await getMaxStageReached(apiToken, deal.deal_id, deal.stage_order);
        return { deal_id: deal.deal_id, max_stage_order: maxOrder };
      })
    );
    await updateFlowBatch(supabase, results);
    processed += results.length;
  }

  console.log(`  Flow processed: ${processed}, skipped: ${skipFlow.length}`);

  // Check if there are more deals remaining
  const { count: remaining } = await supabase
    .from("szs_deals")
    .select("deal_id", { count: "exact", head: true })
    .eq("flow_fetched", false)
    .eq("status", "lost")
    .not("canal", "in", `(${Array.from(EXCLUDED_CANAIS).join(",")})`)
    .not("empreendimento", "is", null);

  return {
    processed: processed + skipFlow.length,
    remaining: remaining || 0,
    done: (remaining || 0) === 0,
  };
}

// ---- Nekt Data API helpers ----
async function queryNekt(nektApiKey: string, sql: string): Promise<Record<string, string | null>[]> {
  const queryRes = await fetch("https://api.nekt.ai/api/v1/sql-query/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": nektApiKey },
    body: JSON.stringify({ sql, mode: "csv" }),
  });
  if (!queryRes.ok) throw new Error(`Nekt API error (${queryRes.status}): ${await queryRes.text()}`);
  const queryData = await queryRes.json();
  let presignedUrl: string | undefined;
  if (queryData.presigned_url) presignedUrl = queryData.presigned_url;
  else if (Array.isArray(queryData.presigned_urls) && queryData.presigned_urls.length > 0) presignedUrl = queryData.presigned_urls[0];
  else if (queryData.url) presignedUrl = queryData.url;
  if (!presignedUrl) throw new Error(`Nekt API: no presigned_url — ${JSON.stringify(queryData)}`);
  const csvRes = await fetch(presignedUrl);
  if (!csvRes.ok) throw new Error(`Failed to download CSV: ${csvRes.status}`);
  return parseCSVNekt(await csvRes.text());
}

function parseCSVLineNekt(line: string): string[] {
  const result: string[] = [];
  let current = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else current += ch;
  }
  result.push(current.trim());
  return result;
}

function parseCSVNekt(csv: string): Record<string, string | null>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const columns = parseCSVLineNekt(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseCSVLineNekt(line);
    const row: Record<string, string | null> = {};
    for (let i = 0; i < columns.length; i++) {
      const val = (values[i] ?? "").trim();
      row[columns[i]] = val === "" || val === "null" || val === "NULL" ? null : val;
    }
    return row;
  });
}

// ---- Mode: backfill-stage-entries (Nekt consolidated_deal_flow) ----
// Populates reserva_entered_at (stage 152 = Aguardando Dados) and contrato_entered_at (stage 76 = Contrato)
// com LAST timestamp por deal no SZS pipeline (14).
async function syncBackfillStageEntries(nektApiKey: string, supabase: any) {
  console.log(`syncBackfillStageEntries SZS: querying Nekt stage entries into 152/76...`);
  const sql = `
    SELECT CAST(item_id AS varchar) AS deal_id,
           new_value AS stage,
           MAX(log_time) AS entered_at
    FROM nekt_trusted.pipedrive_v2_consolidated_deal_flow
    WHERE field_key = 'stage_id' AND new_value IN ('152', '76')
    GROUP BY item_id, new_value
  `;
  const rows = await queryNekt(nektApiKey, sql);
  console.log(`  Nekt returned ${rows.length} stage-entry events`);

  const dealMap = new Map<number, { reserva: string | null; contrato: string | null }>();
  for (const r of rows) {
    const dealId = parseInt(r.deal_id || "0");
    if (!dealId) continue;
    let entry = dealMap.get(dealId);
    if (!entry) { entry = { reserva: null, contrato: null }; dealMap.set(dealId, entry); }
    const ts = r.entered_at || null;
    if (r.stage === "152") entry.reserva = ts;
    else if (r.stage === "76") entry.contrato = ts;
  }
  console.log(`  Unique deals with stage entries: ${dealMap.size}`);

  const updates = [...dealMap.entries()].map(([deal_id, v]) => ({
    deal_id,
    reserva_entered_at: v.reserva,
    contrato_entered_at: v.contrato,
  }));

  let processed = 0, failed = 0;
  const CONCURRENCY = 50;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (u) => {
      const patch: Record<string, string | null> = {};
      if (u.reserva_entered_at) patch.reserva_entered_at = u.reserva_entered_at;
      if (u.contrato_entered_at) patch.contrato_entered_at = u.contrato_entered_at;
      if (Object.keys(patch).length === 0) return { ok: false };
      const { error } = await supabase.from("szs_deals").update(patch).eq("deal_id", u.deal_id);
      return { ok: !error };
    }));
    for (const r of results) { if (r.ok) processed++; else failed++; }
  }
  console.log(`  Updated ${processed}, failed ${failed}`);
  return { processed, failed, total_events: rows.length, unique_deals: dealMap.size, done: true };
}

// ---- Deno.serve handler ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const t0 = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get Pipedrive token from vault
    const { data: tokenData, error: tokenErr } = await supabase.rpc("vault_read_secret", {
      secret_name: "PIPEDRIVE_API_TOKEN",
    });
    if (tokenErr || !tokenData) throw new Error(`Vault error: ${tokenErr?.message}`);
    const apiToken = tokenData;

    // Parse mode from request body
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "deals-open";
    console.log(`sync-szs-deals: mode=${mode}`);

    let result: any;

    switch (mode) {
      case "deals-open":
        result = await syncDealsOpen(apiToken, supabase);
        break;
      case "deals-won":
        result = await syncDealsWon(apiToken, supabase);
        break;
      case "deals-lost": {
        const cutoffDays = body.cutoff_days ?? 365; // 0 = no cutoff (full backfill)
        const stageOffsets: Record<string, number> = body.stage_offsets || {};
        result = await syncDealsLost(apiToken, supabase, cutoffDays, stageOffsets);
        break;
      }
      case "deals-flow":
        result = await syncDealsFlow(apiToken, supabase);
        break;
      case "backfill-stage-entries": {
        const { data: nektKey, error: nektErr } = await supabase.rpc("vault_read_secret", {
          secret_name: "NEKT_API_KEY",
        });
        if (nektErr || !nektKey) throw new Error(`Vault error (NEKT_API_KEY): ${nektErr?.message}`);
        result = await syncBackfillStageEntries(nektKey, supabase);
        break;
      }
      case "inspect-fields": {
        // Temporary: list deal fields matching a search term
        const search = (body.search || "source").toLowerCase();
        const fieldsRes = await pipedriveGet(apiToken, "/dealFields", { limit: "500", start: "0" });
        const fields = (fieldsRes.data || [])
          .filter((f: any) => (f.name || "").toLowerCase().includes(search))
          .map((f: any) => ({ key: f.key, name: f.name, field_type: f.field_type, options: f.options }));
        result = { fields };
        break;
      }
      case "inspect-stages": {
        // Temporary: list stages for this pipeline + full empreendimento options + canal options
        const inspectPipelineId = body.pipeline_id || PIPELINE_ID;
        const stagesRes = await pipedriveGet(apiToken, "/stages", { pipeline_id: String(inspectPipelineId) });
        const stages = (stagesRes.data || []).map((s: any) => ({
          id: s.id, name: s.name, order_nr: s.order_nr, pipeline_id: s.pipeline_id,
          deals_count: s.deals_count,
        }));
        // Also fetch empreendimento and canal field options (full list)
        const fieldsRes2 = await pipedriveGet(apiToken, "/dealFields", { limit: "500", start: "0" });
        const allFields = fieldsRes2.data || [];
        const empField = allFields.find((f: any) => f.key === "6d565fd4fce66c16da078f520a685fa2fa038272");
        const canalField = allFields.find((f: any) => f.key === "93b3ada8b94bd1fc4898a25754d6bcac2713f835");
        result = {
          pipeline_id: inspectPipelineId,
          stages,
          empreendimento_options: (empField?.options || []).map((o: any) => ({ id: o.id, label: o.label })),
          canal_options: (canalField?.options || []).map((o: any) => ({ id: o.id, label: o.label })),
        };
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown mode: ${mode}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const elapsed = Date.now() - t0;
    console.log(`sync-szs-deals: mode=${mode} done in ${elapsed}ms`);

    return new Response(
      JSON.stringify({ success: true, mode, result, elapsed_ms: elapsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("sync-szs-deals error:", err);
    return new Response(
      JSON.stringify({ error: err.message, elapsed_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
