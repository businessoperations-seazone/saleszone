// SZS (Serviços) module — auto-generated from SZI equivalent
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let DB_SCHEMA = "public";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
// ---- Pipedrive constants ----
const PIPEDRIVE_DOMAIN = "seazone-fd92b9.pipedrive.com";
const BASE = `https://${PIPEDRIVE_DOMAIN}/api/v1`;
const PIPELINE_ID = 44;
const FIELD_CANAL = "93b3ada8b94bd1fc4898a25754d6bcac2713f835";
const FIELD_EMPREENDIMENTO = "6d565fd4fce66c16da078f520a685fa2fa038272";
const FIELD_CIDADE = "45a56c6ae1f43dad4992c3c23d4a2a32787d93d6";
const FIELD_BAIRRO = "b080625d5e1ec11f518490717bfa9d22d393f036";
const FIELD_QUALIFICACAO = "bc74bcc4326527cbeb331d1697d4c8812d68506e";
const FIELD_REUNIAO = "bfafc352c5c6f2edbaa41bf6d1c6daa825fc9c16";
// Canal group mapping: groups deals by channel for SZS module
// Decor pipeline 44 — no meaningful canal split, everything is "Outros"
const CANAL_GROUPS: Record<string, string> = {};
// Any canal ID not in this map → "Outros"
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
// SZS team: single squad with 5 closers
const SQUADS: Array<{ id: number; closers: number; empreendimentos: string[] }> = [
  { id: 1, closers: 5, empreendimentos: Object.values(EMPREENDIMENTO_MAP) },
];
const TOTAL_CLOSERS = SQUADS.reduce((sum, sq) => sum + sq.closers, 0);
const TABS = ["mql", "sql", "opp", "won"] as const;
const ALL_TABS = ["mql", "sql", "opp", "won", "reserva", "contrato"] as const;
type Tab = typeof TABS[number];
type AllTab = typeof ALL_TABS[number];

// Stage IDs for Aguardando Dados and Contrato
// SZS uses "Aguardando Dados" (stage 152) instead of "Reserva"
const STAGE_RESERVA = 152;  // "Aguardando Dados"
const STAGE_CONTRATO = 76;  // "Contrato"

const PIPELINE_STAGES: number[] = [70, 71, 72, 345, 341, 73, 342, 151, 74, 75, 152, 76];

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

// ---- Deal helpers ----
function getDateField(deal: any, tab: Tab): string | null {
  switch (tab) {
    case "mql": return deal.add_time || null;
    case "sql": return deal[FIELD_QUALIFICACAO] || null;
    case "opp": return deal[FIELD_REUNIAO] || null;
    case "won": return deal.won_time || null;
  }
}

function getCanalGroup(deal: any): string {
  const canal = String(deal[FIELD_CANAL] || "");
  return CANAL_GROUPS[canal] || "Outros";
}

function getEmpreendimento(deal: any) {
  const enumId = String(deal[FIELD_EMPREENDIMENTO] || "");
  return EMPREENDIMENTO_MAP[enumId] || null;
}

function getCidade(deal: any): string {
  const enumId = String(deal[FIELD_CIDADE] || "");
  return CIDADE_MAP[enumId] || "Sem cidade";
}

function getBairro(deal: any): string {
  const val = deal[FIELD_BAIRRO];
  if (!val || typeof val !== "string" || val.trim() === "") return "Sem bairro";
  return val.trim().split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function getDateRange() {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start35 = new Date(now); start35.setDate(start35.getDate() - 35);
  const startDate = start35.toISOString().substring(0, 10);
  return { startDate, endDate };
}

// ---- Stream deals from API, counting all tabs ----
function countDeals(
  deals: any[], startDate: string, endDate: string,
  countsPerTab: Record<Tab, Map<string, number>>,
) {
  let mkt = 0;
  for (const deal of deals) {
    // Filter to SZS pipeline only (/deals endpoint returns ALL pipelines)
    if (deal.pipeline_id !== PIPELINE_ID) continue;
    if (String(deal.lost_reason || "").toLowerCase() === "duplicado/erro") continue;
    mkt++;
    const canalGroup = getCanalGroup(deal);
    const emp = getEmpreendimento(deal);
    const bairro = getBairro(deal);
    if (!emp) continue;
    for (const tab of TABS) {
      const dateStr = getDateField(deal, tab);
      if (!dateStr) continue;
      const day = dateStr.substring(0, 10);
      if (day < startDate || day > endDate) continue;
      const key = `${day}|${canalGroup}|${emp}|${bairro}`;
      countsPerTab[tab].set(key, (countsPerTab[tab].get(key) || 0) + 1);
    }
  }
  return mkt;
}

// ---- Write counts to DB ----
async function writeDailyCounts(supabase: any, countsPerTab: Record<Tab, Map<string, number>>, startDate: string, endDate: string, source: string) {
  const result: Record<string, number> = {};
  for (const tab of TABS) {
    const final = countsPerTab[tab];

    const rows = Array.from(final.entries()).map(([key, count]) => {
      const [date, canal_group, empreendimento, bairro] = key.split("|");
      return { date, tab, canal_group, empreendimento, bairro, count, source, synced_at: new Date().toISOString() };
    });

    // Delete only rows from THIS source (idempotent — each source replaces only itself)
    await supabase.from("decor_daily_counts").delete()
      .eq("tab", tab)
      .eq("source", source)
      .gte("date", startDate)
      .lte("date", endDate);

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase.from("decor_daily_counts").insert(batch);
        if (error) console.error(`Insert error ${tab}:`, error.message);
      }
    }
    console.log(`  ${tab}: ${rows.length} rows (source=${source})`);
    result[tab] = rows.length;
  }
  return result;
}

// ---- Count deals in specific stages (snapshot for today) ----
function countDealsByStage(
  deals: any[],
  stageCounts: Record<"reserva" | "contrato", Map<string, number>>,
) {
  const today = new Date().toISOString().substring(0, 10);
  for (const deal of deals) {
    const canalGroup = getCanalGroup(deal);
    const emp = getEmpreendimento(deal);
    const bairro = getBairro(deal);
    if (!emp) continue;
    const stageId = deal.stage_id;
    if (stageId === STAGE_RESERVA) {
      const key = `${today}|${canalGroup}|${emp}|${bairro}`;
      stageCounts.reserva.set(key, (stageCounts.reserva.get(key) || 0) + 1);
    } else if (stageId === STAGE_CONTRATO) {
      const key = `${today}|${canalGroup}|${emp}|${bairro}`;
      stageCounts.contrato.set(key, (stageCounts.contrato.get(key) || 0) + 1);
    }
  }
}

async function writeStageCounts(supabase: any, stageCounts: Record<"reserva" | "contrato", Map<string, number>>) {
  const today = new Date().toISOString().substring(0, 10);
  for (const tab of ["reserva", "contrato"] as const) {
    // Delete previous snapshot data for this tab
    const { error: delErr } = await supabase.from("decor_daily_counts").delete().eq("tab", tab);
    if (delErr) console.error(`Delete error ${tab}:`, delErr.message);
    const rows = Array.from(stageCounts[tab].entries()).map(([key, count]) => {
      const [date, canal_group, empreendimento, bairro] = key.split("|");
      return { date, tab, canal_group, empreendimento, bairro, count, synced_at: new Date().toISOString() };
    });
    if (rows.length > 0) {
      const { error } = await supabase.from("decor_daily_counts").insert(rows);
      if (error) console.error(`Insert error ${tab}:`, error.message);
    }
    console.log(`  ${tab}: ${rows.length} rows`);
  }
}

// ---- Mode: daily-open (pipeline endpoint, replaces counts) ----
async function syncDailyOpen(apiToken: string, supabase: any) {
  const { startDate, endDate } = getDateRange();
  console.log(`syncDailyOpen: fetching pipeline ${PIPELINE_ID} open deals...`);

  const countsPerTab: Record<Tab, Map<string, number>> = {
    mql: new Map(), sql: new Map(), opp: new Map(), won: new Map(),
  };
  const stageCounts: Record<"reserva" | "contrato", Map<string, number>> = {
    reserva: new Map(), contrato: new Map(),
  };
  let start = 0;
  let total = 0;
  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start),
    });
    if (!res.data || res.data.length === 0) break;
    total += res.data.length;
    countDeals(res.data, startDate, endDate, countsPerTab);
    countDealsByStage(res.data, stageCounts);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  const reservaTotal = Array.from(stageCounts.reserva.values()).reduce((a, b) => a + b, 0);
  const contratoTotal = Array.from(stageCounts.contrato.values()).reduce((a, b) => a + b, 0);
  console.log(`  Open deals: ${total}, reserva=${reservaTotal}, contrato=${contratoTotal}`);
  // Write main counts first, then stage counts (so stage counts aren't overwritten)
  const mainResult = await writeDailyCounts(supabase, countsPerTab, startDate, endDate, "open");
  await writeStageCounts(supabase, stageCounts);
  return { ...mainResult, reserva: reservaTotal, contrato: contratoTotal };
}

// ---- Mode: daily-status (uses stage_id filter, merges with existing) ----
// For lost deals: sorts by add_time DESC and stops when deals are older than cutoff
async function syncDailyByStatus(apiToken: string, supabase: any, status: string) {
  const { startDate, endDate } = getDateRange();
  // Cutoff: stop scanning when add_time is older than 90 days (generous buffer over 35-day window)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  console.log(`syncDailyByStatus: ${status} via stage_id, cutoff=${cutoffStr}`);

  const countsPerTab: Record<Tab, Map<string, number>> = {
    mql: new Map(), sql: new Map(), opp: new Map(), won: new Map(),
  };
  let totalDeals = 0;
  let totalMkt = 0;
  let skippedStages = 0;
  // Deduplicate: /deals endpoint ignores stage_id param (same as pipeline_id),
  // so each stage query returns ALL deals of that status, causing 14x duplication.
  const seenDealIds = new Set<number>();

  for (const stageId of PIPELINE_STAGES) {
    let start = 0;
    let stoppedEarly = false;
    while (true) {
      const res = await pipedriveGet(apiToken, "/deals", {
        status,
        stage_id: String(stageId),
        sort: "add_time DESC",
        limit: "500",
        start: String(start),
      });
      if (!res.data || res.data.length === 0) break;

      // Filter out deals already seen from previous stage queries
      const newDeals = res.data.filter((d: any) => {
        if (seenDealIds.has(d.id)) return false;
        seenDealIds.add(d.id);
        return true;
      });

      totalDeals += newDeals.length;
      totalMkt += countDeals(newDeals, startDate, endDate, countsPerTab);

      // Check if the oldest deal in this page is before cutoff
      const oldestAddTime = res.data[res.data.length - 1]?.add_time?.substring(0, 10) || "";
      if (oldestAddTime && oldestAddTime < cutoffStr) {
        stoppedEarly = true;
        break;
      }

      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      start += 500;
    }
    if (stoppedEarly) skippedStages++;
  }
  console.log(`  ${status}: ${totalDeals} unique deals (${seenDealIds.size} seen), ${totalMkt} marketing, ${skippedStages} stages stopped early`);
  return writeDailyCounts(supabase, countsPerTab, startDate, endDate, status);
}

// ---- Mode: alignment ----
async function syncAlignment(apiToken: string, supabase: any) {
  console.log(`syncAlignment: fetching pipeline ${PIPELINE_ID} open deals...`);
  const deals: any[] = [];
  let start = 0;
  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start),
    });
    if (!res.data || res.data.length === 0) break;
    deals.push(...res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }

  const usersRes = await pipedriveGet(apiToken, "/users");
  const userMap = new Map(usersRes.data.map((u: any) => [u.id, u.name]));
  const counts = new Map<string, number>();
  const dealRows: Array<{deal_id: number; title: string; empreendimento: string; owner_name: string; synced_at: string}> = [];
  for (const deal of deals) {
    const emp = getEmpreendimento(deal);
    if (!emp) continue;
    // Pipeline endpoint returns user_id as integer (not object)
    const ownerId = typeof deal.user_id === "object" ? deal.user_id?.id : deal.user_id;
    if (!ownerId) continue;
    const ownerName = userMap.get(ownerId) || String(ownerId);
    const key = `${emp}|${ownerName}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    dealRows.push({
      deal_id: deal.id,
      title: deal.title || `Deal #${deal.id}`,
      empreendimento: emp,
      owner_name: ownerName,
      synced_at: new Date().toISOString(),
    });
  }

  // Write aggregated counts
  await supabase.from("decor_alignment").delete().neq("empreendimento", "");
  const rows = Array.from(counts.entries()).map(([key, count]) => {
    const [empreendimento, owner_name] = key.split("|");
    return { empreendimento, owner_name, count, synced_at: new Date().toISOString() };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from("decor_alignment").insert(batch);
      if (error) console.error("Alignment insert error:", error.message);
    }
  }

  // Write individual deal records
  await supabase.from("decor_alignment_deals").delete().neq("empreendimento", "");
  if (dealRows.length > 0) {
    for (let i = 0; i < dealRows.length; i += 500) {
      const batch = dealRows.slice(i, i + 500);
      const { error } = await supabase.from("decor_alignment_deals").insert(batch);
      if (error) console.error("Alignment deals insert error:", error.message);
    }
  }

  console.log(`syncAlignment: ${rows.length} rows, ${dealRows.length} deals (${deals.length} total)`);
  return rows.length;
}

// ---- Mode: metas (DB only) ----
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

async function syncMetas(supabase: any) {
  console.log("syncMetas: calculating from nekt_meta26_metas + decor_daily_counts");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const totalDays = daysInMonth(year, month);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  const metaDateStr = `01/${String(month).padStart(2, "0")}/${year}`;
  const { data: nektMeta, error: nektErr } = await supabase
    .from("nekt_meta26_metas")
    .select("won_szi_meta_pago, won_szi_meta_direto")
    .eq("data", metaDateStr)
    .single();
  if (nektErr || !nektMeta) throw new Error(`nekt_meta26_metas not found for ${metaDateStr}: ${nektErr?.message}`);
  // SZS uses same meta columns as SZI (shared Pipedrive instance)
  const wonMetaTotal = (Number(nektMeta.won_szi_meta_pago) || 0) + (Number(nektMeta.won_szi_meta_direto) || 0);
  const wonPerCloser = TOTAL_CLOSERS > 0 ? wonMetaTotal / TOTAL_CLOSERS : 0;

  const start90 = new Date(now); start90.setDate(start90.getDate() - 90);
  const startDate = start90.toISOString().substring(0, 10);
  const endDate = now.toISOString().substring(0, 10);

  const counts90d: Record<Tab, number> = { mql: 0, sql: 0, opp: 0, won: 0 };
  for (const tab of TABS) {
    const { data: dailyRows } = await supabase
      .from("decor_daily_counts").select("count").eq("tab", tab).gte("date", startDate).lte("date", endDate);
    if (dailyRows) counts90d[tab] = dailyRows.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
    console.log(`  90d ${tab}: ${counts90d[tab]}`);
  }

  const ratioOppWon = counts90d.won > 0 ? counts90d.opp / counts90d.won : 0;
  const ratioSqlOpp = counts90d.opp > 0 ? counts90d.sql / counts90d.opp : 0;
  const ratioMqlSql = counts90d.sql > 0 ? counts90d.mql / counts90d.sql : 0;
  const ratios = { opp_won: ratioOppWon, sql_opp: ratioSqlOpp, mql_sql: ratioMqlSql };

  const metaRows: any[] = [];
  for (const sq of SQUADS) {
    const wonMetaSquad = wonPerCloser * sq.closers;
    const metas = {
      won: (day / totalDays) * wonMetaSquad,
      opp: (day / totalDays) * ratioOppWon * wonMetaSquad,
      sql: (day / totalDays) * ratioSqlOpp * ratioOppWon * wonMetaSquad,
      mql: (day / totalDays) * ratioMqlSql * ratioSqlOpp * ratioOppWon * wonMetaSquad,
    };
    for (const tab of TABS) {
      metaRows.push({ month: monthStart, squad_id: sq.id, tab, meta: Math.round(metas[tab]), synced_at: new Date().toISOString() });
    }
  }

  await supabase.from("decor_metas").upsert(metaRows, { onConflict: "month,squad_id,tab" });
  await supabase.from("decor_ratios").upsert(
    { month: monthStart, ratios, counts_90d: counts90d, synced_at: new Date().toISOString() },
    { onConflict: "month" },
  );

  // Save daily snapshot to decor_ratios_daily (global + per-canal_group)
  const CANAL_ID_MAP: Record<string, number> = {
    "Marketing": 1,
    "Ind. Corretor": 2, "Ind. Franquia": 2, "Ind. Outros Parceiros": 2, "Parceiros": 2,
    "Expansão": 3, "Spots": 4, "Mônica": 5, "Outros": 6,
  };
  const canalCounts90d: Record<number, Record<Tab, number>> = {};
  for (const cId of Object.values(CANAL_ID_MAP)) {
    canalCounts90d[cId] = { mql: 0, sql: 0, opp: 0, won: 0 };
  }
  for (const tab of TABS) {
    const { data: canalRows } = await supabase
      .from("decor_daily_counts").select("count, canal_group").eq("tab", tab).gte("date", startDate).lte("date", endDate);
    if (canalRows) {
      for (const r of canalRows) {
        const cId = CANAL_ID_MAP[r.canal_group];
        if (cId && canalCounts90d[cId]) canalCounts90d[cId][tab] += r.count || 0;
      }
    }
  }

  const today = endDate;
  const dailyRows = [
    { date: today, squad_id: 0, ratios, counts_90d: counts90d, synced_at: new Date().toISOString() },
  ];
  for (const [canalName, cId] of Object.entries(CANAL_ID_MAP)) {
    const cc = canalCounts90d[cId];
    dailyRows.push({
      date: today,
      squad_id: cId,
      ratios: {
        opp_won: cc.won > 0 ? cc.opp / cc.won : 0,
        sql_opp: cc.opp > 0 ? cc.sql / cc.opp : 0,
        mql_sql: cc.sql > 0 ? cc.mql / cc.sql : 0,
      },
      counts_90d: cc,
      synced_at: new Date().toISOString(),
    });
  }
  const { error: dailyErr } = await supabase
    .from("decor_ratios_daily")
    .upsert(dailyRows, { onConflict: "date,squad_id" });
  if (dailyErr) console.error("decor_ratios_daily upsert error:", dailyErr.message);
  else console.log(`  decor_ratios_daily: ${dailyRows.length} rows for ${today}`);

  console.log(`syncMetas: ${metaRows.length} rows, total_won_meta=${wonMetaTotal}`);
  return { squadMetas: metaRows.length, ratios };
}

// ---- Mode: backfill-monthly-* (Pipedrive → decor_monthly_counts, 12 months) ----
// Split into 3 separate calls to stay within 150MB memory:
//   backfill-monthly-clear  → empties table
//   backfill-monthly-open   → open deals (pipeline endpoint)
//   backfill-monthly-won    → won deals (stage_id loop)
//   backfill-monthly-lost   → lost deals (stage_id loop with cutoff)
// Uses RPC add_monthly_counts for additive upsert (count += new).

async function backfillMonthlyClear(supabase: any) {
  const { error } = await supabase.from("decor_monthly_counts").delete().neq("month", "");
  if (error) throw new Error(`Clear error: ${error.message}`);
  console.log("backfill-monthly-clear: table emptied");
  return { cleared: true };
}

// Decor pipeline 44 stages (348-359)
const STAGE_ORDER: Record<number, number> = {
  348: 1, 349: 2, 350: 3, 351: 4, 352: 5, 353: 6, 354: 7, 355: 8, 356: 9, 357: 10, 358: 11, 359: 12,
};
const MQL_MIN_ORDER = 2;  // Contatados
const SQL_MIN_ORDER = 4;  // Qualificado
const OPP_MIN_ORDER = 8;  // Reunião Realizada

// ---- Flow API: find max stage a deal ever reached ----
async function getMaxStageReached(apiToken: string, dealId: number, currentOrder: number): Promise<number> {
  if (currentOrder >= OPP_MIN_ORDER) return currentOrder; // Already at OPP+, skip flow
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
      if (max >= OPP_MIN_ORDER) break; // Found OPP+, early exit
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      s += 100;
    }
  } catch (err) { console.error(`flow error deal ${dealId}:`, err); }
  return max;
}

// Count deal into monthly map based on max stage reached
function countDealByStage(deal: any, maxOrder: number, monthly: Map<string, number>, startDate: string, endDate: string) {
  if (String(deal.lost_reason || "").toLowerCase() === "duplicado/erro") return;
  const addTime = deal.add_time;
  if (!addTime) return;
  const day = addTime.substring(0, 10);
  if (day < startDate || day > endDate) return;
  const emp = getEmpreendimento(deal);
  const bairro = getBairro(deal);
  if (!emp) return;
  const canalGroup = getCanalGroup(deal);
  const month = day.substring(0, 7);

  if (maxOrder >= MQL_MIN_ORDER) {
    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|mql`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|mql`) || 0) + 1);
  }
  if (maxOrder >= SQL_MIN_ORDER) {
    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|sql`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|sql`) || 0) + 1);
  }
  if (maxOrder >= OPP_MIN_ORDER) {
    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|opp`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|opp`) || 0) + 1);
  }
  if (deal.status === "won") {
    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|won`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|won`) || 0) + 1);
  }
}

// ---- Backfill open+won deals (stage_id based, no flow needed) ----
async function backfillOpenWon(apiToken: string, supabase: any) {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start365 = new Date(now); start365.setDate(start365.getDate() - 365);
  const startDate = start365.toISOString().substring(0, 10);
  console.log(`backfillOpenWon: ${startDate} → ${endDate}`);

  const monthly = new Map<string, number>();
  let totalOpen = 0, totalWon = 0;

  // Open deals — stage_id is reliable for active deals (forward progression)
  let s = 0;
  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, { limit: "500", start: String(s) });
    if (!res.data || res.data.length === 0) break;
    for (const deal of res.data) {
      if (deal.pipeline_id !== PIPELINE_ID) continue;

      totalOpen++;
      const currentOrder = STAGE_ORDER[deal.stage_id] || 0;
      countDealByStage(deal, currentOrder, monthly, startDate, endDate);
    }
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    s += 500;
  }

  // Won deals — all at Contrato (order 13), no flow needed
  const seenWon = new Set<number>();
  for (const stageId of PIPELINE_STAGES) {
    let ws = 0;
    while (true) {
      const res = await pipedriveGet(apiToken, "/deals", {
        status: "won", stage_id: String(stageId), sort: "add_time DESC", limit: "500", start: String(ws),
      });
      if (!res.data || res.data.length === 0) break;
      for (const deal of res.data) {
        if (seenWon.has(deal.id)) continue;
        seenWon.add(deal.id);
        if (deal.pipeline_id !== PIPELINE_ID) continue;

        totalWon++;
        countDealByStage(deal, 12, monthly, startDate, endDate); // Won = passed all stages (SZS has 12 stages)
      }
      if (!res.additional_data?.pagination?.more_items_in_collection) break;
      ws += 500;
    }
  }

  // Upsert (additive)
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, canal_group, empreendimento, bairro, tab] = key.split("|");
    return { month, canal_group, empreendimento, bairro, tab, count };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await supabase.rpc("add_monthly_counts", { rows: batch });
      if (error) console.error(`backfillOpenWon RPC error:`, error.message);
    }
  }

  console.log(`backfillOpenWon: open=${totalOpen} won=${totalWon} rows=${rows.length}`);
  return { totalOpen, totalWon, monthlyRows: rows.length };
}

// ---- Backfill lost deals with flow API (batched, parallel flow calls) ----
async function backfillLostWithFlow(apiToken: string, supabase: any, startFrom: number = 0) {
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const start365 = new Date(now); start365.setDate(start365.getDate() - 365);
  const startDate = start365.toISOString().substring(0, 10);
  const BATCH_LIMIT = 5000; // API-returned deals per invocation
  const FLOW_CONCURRENCY = 10; // parallel flow API calls

  console.log(`backfillLostWithFlow(start=${startFrom}): ${startDate} → ${endDate}`);

  const monthly = new Map<string, number>();
  const seenDealIds = new Set<number>();
  let mktDeals = 0, flowCalls = 0;
  let apiStart = startFrom;
  let dealsScanned = 0;
  let reachedEnd = false;
  let reachedCutoff = false;

  while (dealsScanned < BATCH_LIMIT) {
    const res = await pipedriveGet(apiToken, "/deals", {
      status: "lost", sort: "add_time DESC", limit: "500", start: String(apiStart),
    });
    if (!res.data || res.data.length === 0) { reachedEnd = true; break; }

    // Collect marketing deals that need flow
    const dealsNeedingFlow: { deal: any; currentOrder: number }[] = [];
    for (const deal of res.data) {
      if (seenDealIds.has(deal.id)) continue;
      seenDealIds.add(deal.id);
      dealsScanned++;
      if (deal.pipeline_id !== PIPELINE_ID) continue;

      const addTime = deal.add_time;
      if (!addTime) continue;
      const day = addTime.substring(0, 10);
      if (day < startDate || day > endDate) continue;
      mktDeals++;
      const currentOrder = STAGE_ORDER[deal.stage_id] || 0;
      dealsNeedingFlow.push({ deal, currentOrder });
    }

    // Fetch flows in parallel batches
    for (let i = 0; i < dealsNeedingFlow.length; i += FLOW_CONCURRENCY) {
      const chunk = dealsNeedingFlow.slice(i, i + FLOW_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(({ deal, currentOrder }) => getMaxStageReached(apiToken, deal.id, currentOrder))
      );
      flowCalls += chunk.length;
      for (let j = 0; j < chunk.length; j++) {
        countDealByStage(chunk[j].deal, results[j], monthly, startDate, endDate);
      }
    }

    // Cutoff: stop when deals are older than our window
    const oldest = res.data[res.data.length - 1]?.add_time?.substring(0, 10) || "";
    if (oldest && oldest < startDate) { reachedCutoff = true; break; }
    if (!res.additional_data?.pagination?.more_items_in_collection) { reachedEnd = true; break; }
    apiStart += 500;
  }

  // Upsert (additive)
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, canal_group, empreendimento, bairro, tab] = key.split("|");
    return { month, canal_group, empreendimento, bairro, tab, count };
  });
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await supabase.rpc("add_monthly_counts", { rows: batch });
      if (error) console.error(`backfillLost RPC error:`, error.message);
    }
  }

  const done = reachedEnd || reachedCutoff;
  const nextStart = done ? null : apiStart;
  console.log(`backfillLostWithFlow: scanned=${dealsScanned} mkt=${mktDeals} flow=${flowCalls} rows=${rows.length} done=${done}`);
  return { dealsScanned, mktDeals, flowCalls, monthlyRows: rows.length, nextStart, done };
}

// ---- Mode: monthly-rollup (stage-based counting from Pipedrive for current + prev month) ----
async function syncMonthlyRollup(apiToken: string, supabase: any) {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const startDate = `${prevMonth}-01`;
  const endDate = now.toISOString().substring(0, 10);

  console.log(`syncMonthlyRollup (stage-based): ${startDate} → ${endDate}`);

  const monthly = new Map<string, number>();

  function countDeal(deal: any) {
    if (deal.pipeline_id !== PIPELINE_ID) return;
    if (String(deal.lost_reason || "").toLowerCase() === "duplicado/erro") return;
    const canalGroup = getCanalGroup(deal);
    const emp = getEmpreendimento(deal);
    const bairro = getBairro(deal);
    if (!emp) return;
    const addTime = deal.add_time;
    if (!addTime) return;
    const day = addTime.substring(0, 10);
    if (day < startDate || day > endDate) return;
    const month = day.substring(0, 7);
    const stageOrder = STAGE_ORDER[deal.stage_id] || 0;
    const hasQualDate = !!deal[FIELD_QUALIFICACAO];
    const hasReunDate = !!deal[FIELD_REUNIAO];

    monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|mql`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|mql`) || 0) + 1);
    if (stageOrder >= SQL_MIN_ORDER || hasQualDate) {
      monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|sql`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|sql`) || 0) + 1);
    }
    if (stageOrder >= OPP_MIN_ORDER || hasReunDate) {
      monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|opp`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|opp`) || 0) + 1);
    }
    if (deal.status === "won") {
      monthly.set(`${month}|${canalGroup}|${emp}|${bairro}|won`, (monthly.get(`${month}|${canalGroup}|${emp}|${bairro}|won`) || 0) + 1);
    }
  }

  // Scan open deals
  let totalDeals = 0;
  let start = 0;
  while (true) {
    const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, {
      limit: "500", start: String(start),
    });
    if (!res.data || res.data.length === 0) break;
    totalDeals += res.data.length;
    for (const deal of res.data) countDeal(deal);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }

  // Scan won + lost deals (deduped)
  const seenDealIds = new Set<number>();
  for (const dealStatus of ["won", "lost"] as const) {
    for (const stageId of PIPELINE_STAGES) {
      let s = 0;
      let stoppedEarly = false;
      while (true) {
        const res = await pipedriveGet(apiToken, "/deals", {
          status: dealStatus, stage_id: String(stageId),
          sort: "add_time DESC", limit: "500", start: String(s),
        });
        if (!res.data || res.data.length === 0) break;
        for (const deal of res.data) {
          if (seenDealIds.has(deal.id)) continue;
          seenDealIds.add(deal.id);
          countDeal(deal);
        }
        if (dealStatus === "lost") {
          const oldest = res.data[res.data.length - 1]?.add_time?.substring(0, 10) || "";
          if (oldest && oldest < startDate) { stoppedEarly = true; break; }
        }
        if (!res.additional_data?.pagination?.more_items_in_collection) break;
        s += 500;
      }
      if (dealStatus === "lost" && stoppedEarly) break;
    }
  }
  totalDeals += seenDealIds.size;

  // Upsert (replace) for current + prev month
  const rows = Array.from(monthly.entries()).map(([key, count]) => {
    const [month, canal_group, empreendimento, bairro, tab] = key.split("|");
    return { month, canal_group, empreendimento, bairro, tab, count, synced_at: new Date().toISOString() };
  });

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("decor_monthly_counts")
      .upsert(rows, { onConflict: "month,empreendimento,tab" });
    if (upsertErr) console.error(`monthly-rollup upsert error:`, upsertErr.message);
  }

  console.log(`syncMonthlyRollup: ${totalDeals} deals → ${rows.length} monthly rows`);
  return { months: [prevMonth, curMonth], totalDeals, totalRows: rows.length };
}

// ---- Handler ----
Deno.serve(async (req) => {
  // DB_SCHEMA injected
  try {
    const __body = await req.clone().json().catch(() => ({}));
    DB_SCHEMA = __body?.__schema || "public";
  } catch { DB_SCHEMA = "public"; }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const startTime = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: DB_SCHEMA } });

    // Auth handled by Supabase gateway (--no-verify-jwt not set)

    // Get Pipedrive token from Vault
    const { data: tokenData } = await supabase.schema("public").rpc("vault_read_secret", { secret_name: "PIPEDRIVE_API_TOKEN" });
    const apiToken = tokenData?.trim();
    if (!apiToken) throw new Error("PIPEDRIVE_API_TOKEN not found in vault");

    // Parse mode
    let mode = "daily-open";
    let body: any = {};
    try {
      body = await req.json();
      if (body?.mode) mode = body.mode;
    } catch {}
    console.log(`sync-szs-dashboard mode=${mode}`);

    let result;
    switch (mode) {
      case "daily-open":
        // Open deals from pipeline endpoint (replaces counts)
        result = await syncDailyOpen(apiToken, supabase);
        break;
      case "daily-won":
        // Won deals via stage_id filter (merges with existing)
        result = await syncDailyByStatus(apiToken, supabase, "won");
        break;
      case "daily-lost":
        // Lost deals via stage_id filter (merges with existing)
        result = await syncDailyByStatus(apiToken, supabase, "lost");
        break;
      case "alignment":
        result = { rows: await syncAlignment(apiToken, supabase) };
        break;
      case "metas":
        result = await syncMetas(supabase);
        break;
      case "monthly-rollup":
        result = await syncMonthlyRollup(apiToken, supabase);
        break;
      case "backfill-monthly-clear":
        result = await backfillMonthlyClear(supabase);
        break;
      case "backfill-open-won":
        result = await backfillOpenWon(apiToken, supabase);
        break;
      case "backfill-lost-flows": {
        const startFrom = body?.start || 0;
        result = await backfillLostWithFlow(apiToken, supabase, startFrom);
        break;
      }
      case "debug-stages": {
        // Debug: scan a sample of deals and report stage_id distribution
        const stageDistOpen: Record<string, number> = {};
        const stageDistWon: Record<string, number> = {};
        const stageDistLost: Record<string, number> = {};
        let sampleOpen = 0, sampleWon = 0, sampleLost = 0;
        let mktOpen = 0, mktWon = 0, mktLost = 0;

        // Open deals
        let s = 0;
        while (true) {
          const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, { limit: "500", start: String(s) });
          if (!res.data || res.data.length === 0) break;
          for (const d of res.data) {
            if (d.pipeline_id !== PIPELINE_ID) continue;
            sampleOpen++;
            if (getCidade(d)) {
              mktOpen++;
              const sid = String(d.stage_id);
              stageDistOpen[sid] = (stageDistOpen[sid] || 0) + 1;
            }
          }
          if (!res.additional_data?.pagination?.more_items_in_collection) break;
          s += 500;
        }

        // Won deals (first 2000)
        const seenW = new Set<number>();
        for (const stageId of PIPELINE_STAGES) {
          let ws = 0;
          while (true) {
            const res = await pipedriveGet(apiToken, "/deals", { status: "won", stage_id: String(stageId), sort: "add_time DESC", limit: "500", start: String(ws) });
            if (!res.data || res.data.length === 0) break;
            for (const d of res.data) {
              if (seenW.has(d.id)) continue;
              seenW.add(d.id);
              if (d.pipeline_id !== PIPELINE_ID) continue;
              sampleWon++;
              if (getCidade(d)) {
                mktWon++;
                const sid = String(d.stage_id);
                stageDistWon[sid] = (stageDistWon[sid] || 0) + 1;
              }
            }
            if (!res.additional_data?.pagination?.more_items_in_collection) break;
            ws += 500;
          }
        }

        // Lost deals (first 5000, sorted by add_time DESC)
        const seenL = new Set<number>();
        for (const stageId of PIPELINE_STAGES) {
          let ls = 0;
          while (true) {
            const res = await pipedriveGet(apiToken, "/deals", { status: "lost", stage_id: String(stageId), sort: "add_time DESC", limit: "500", start: String(ls) });
            if (!res.data || res.data.length === 0) break;
            for (const d of res.data) {
              if (seenL.has(d.id)) continue;
              seenL.add(d.id);
              if (d.pipeline_id !== PIPELINE_ID) continue;
              sampleLost++;
              if (getCidade(d)) {
                mktLost++;
                const sid = String(d.stage_id);
                stageDistLost[sid] = (stageDistLost[sid] || 0) + 1;
              }
            }
            if (seenL.size >= 5000) break;
            if (!res.additional_data?.pagination?.more_items_in_collection) break;
            ls += 500;
          }
          if (seenL.size >= 5000) break;
        }

        result = {
          open: { total: sampleOpen, marketing: mktOpen, stages: stageDistOpen },
          won: { total: sampleWon, marketing: mktWon, stages: stageDistWon },
          lost: { total: sampleLost, marketing: mktLost, stages: stageDistLost },
        };
        break;
      }
      case "all": {
        // Full sync: open + won + alignment + metas (lost runs separately due to volume)
        const daily = await syncDailyOpen(apiToken, supabase);
        const won = await syncDailyByStatus(apiToken, supabase, "won");
        const alignment = await syncAlignment(apiToken, supabase);
        const metas = await syncMetas(supabase);
        result = { daily, won, alignment, metas };
        break;
      }
      case "snapshot": {
        // Daily snapshot of open deals by canal_group and stage
        const today = new Date().toISOString().substring(0, 10);
        const snapCounts: Record<string, { total: number; mql: number; sql: number; opp: number; won: number; ag_dados: number; contrato: number }> = {};
        let snapStart = 0;
        let snapTotal = 0;
        while (true) {
          const res = await pipedriveGet(apiToken, `/pipelines/${PIPELINE_ID}/deals`, { limit: "500", start: String(snapStart) });
          if (!res.data || res.data.length === 0) break;
          for (const deal of res.data) {
            if (deal.pipeline_id !== PIPELINE_ID) continue;
            if (String(deal.lost_reason || "").toLowerCase() === "duplicado/erro") continue;
            const cg = getCanalGroup(deal);
            if (!snapCounts[cg]) snapCounts[cg] = { total: 0, mql: 0, sql: 0, opp: 0, won: 0, ag_dados: 0, contrato: 0 };
            const c = snapCounts[cg];
            const so = STAGE_ORDER[deal.stage_id] || 0;
            c.total++;
            c.mql++;
            if (so >= SQL_MIN_ORDER) c.sql++;
            if (so >= OPP_MIN_ORDER) c.opp++;
            if (so === 11) c.ag_dados++;
            if (so === 12) c.contrato++;
            snapTotal++;
          }
          if (!res.additional_data?.pagination?.more_items_in_collection) break;
          snapStart += 500;
        }
        // Upsert rows
        const snapRows = Object.entries(snapCounts).map(([canal_group, c]) => ({
          date: today, canal_group, total_open: c.total, mql: c.mql, sql_count: c.sql,
          opp: c.opp, won: c.won, ag_dados: c.ag_dados, contrato: c.contrato,
          synced_at: new Date().toISOString(),
        }));
        if (snapRows.length > 0) {
          const { error: snapErr } = await supabase.from("decor_open_snapshots").upsert(snapRows, { onConflict: "date,canal_group" });
          if (snapErr) console.error("Snapshot upsert error:", snapErr.message);
        }
        result = { date: today, groups: snapRows.length, total: snapTotal };
        break;
      }
      default:
        return new Response(JSON.stringify({ success: false, error: `Unknown mode: ${mode}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const elapsed = Date.now() - startTime;
    console.log(`sync-szs-dashboard completed in ${elapsed}ms`);
    return new Response(JSON.stringify({ success: true, mode, result, elapsed_ms: elapsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-szs-dashboard fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
