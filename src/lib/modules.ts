// Module configuration for multi-product dashboard (SZI, MKTP, SZS)

export interface SquadDef {
  id: number;
  name: string;
  marketing: string;
  preVenda: string;
  venda: string;
  empreendimentos: readonly string[];
  canalIds?: readonly number[];
  canal_group?: string; // SZS only: maps to szs_daily_counts.canal_group
}

export interface ModuleConfig {
  id: string;                    // "szi" | "mktp" | "szs"
  label: string;                 // "Investimentos" | "Marketplace" | "Serviços"
  shortLabel: string;            // "SZI" | "MKTP" | "SZS"
  pipelineId: number;            // Pipedrive pipeline ID
  metaAdsAccountId: string;      // Meta Ads account ID
  squads: readonly SquadDef[];
  closers: readonly string[];    // V_COLS equivalent
  presellers: readonly string[]; // PV_COLS equivalent
  squadCloserMap: Record<number, number[]>; // SQUAD_V_MAP equivalent
  tablePrefix: string;           // "squad" | "mktp" | "szs"
  apiBase: string;               // "/api/dashboard" | "/api/mktp"
  syncFunctions: string[];       // sync function keys for handleRefresh
}

// --- SZI (Investimentos) — current/default module ---

const SZI_SQUADS: readonly SquadDef[] = [
  {
    id: 1,
    name: "Squad 1",
    marketing: "Jean",
    preVenda: "Carolina Maeda",
    venda: "Luana Schaikoski",
    empreendimentos: ["Ponta das Canas Spot II", "Marista 144 Spot", "Jurerê Spot II", "Jurerê Spot III", "Vistas de Anitá II"],
  },
  {
    id: 2,
    name: "Squad 2",
    marketing: "Jean",
    preVenda: "Jeniffer Correa",
    venda: "Filipe Padoveze",
    empreendimentos: ["Natal Spot", "Novo Campeche Spot II", "Caraguá Spot"],
  },
  {
    id: 3,
    name: "Squad 3",
    marketing: "Jean",
    preVenda: "Karoane Izabela Soares",
    venda: "Hellen Dias",
    empreendimentos: ["Itacaré Spot", "Bonito Spot II", "Barra Grande Spot"],
  },
] as const;

const SZI_CONFIG: ModuleConfig = {
  id: "szi",
  label: "Investimentos",
  shortLabel: "SZI",
  pipelineId: 28,
  metaAdsAccountId: "act_205286032338340",
  squads: SZI_SQUADS,
  closers: ["Luana Schaikoski", "Filipe Padoveze", "Hellen Dias"],
  presellers: ["Carolina Maeda", "Jeniffer Correa", "Karoane Izabela Soares"],
  squadCloserMap: {
    1: [0],    // Luana Schaikoski
    2: [1],    // Filipe Padoveze
    3: [2],    // Hellen Dias
  },
  tablePrefix: "squad",
  apiBase: "/api/dashboard",
  syncFunctions: ["dashboard-light", "meta-ads", "deals-light", "calendar", "presales", "baserow"],
};

// --- MKTP (Marketplace) — single squad, no squad grouping ---

const MKTP_SQUADS: readonly SquadDef[] = [
  {
    id: 1,
    name: "Marketplace",
    marketing: "Rodrigo Guirado",
    preVenda: "Karoane Izabela Soares",
    venda: "Nevine Saratt",
    empreendimentos: [], // TODO: populate with MKTP empreendimentos (all non-active/closed groups)
  },
] as const;

const MKTP_CONFIG: ModuleConfig = {
  id: "mktp",
  label: "Marketplace",
  shortLabel: "MKTP",
  pipelineId: 37,
  metaAdsAccountId: "act_799783985155825",
  squads: MKTP_SQUADS,
  closers: ["Nevine Saratt", "Willian Miranda"],
  presellers: ["Karoline Borges"],
  squadCloserMap: {
    1: [0, 1], // Nevine Saratt, Willian Miranda
  },
  tablePrefix: "mktp",
  apiBase: "/api/mktp",
  syncFunctions: ["mktp-dashboard-light", "mktp-meta-ads", "mktp-deals-light", "mktp-calendar", "mktp-presales"],
};

// --- Decor (Comercial Decor) — single squad, no Meta Ads ---

const DECOR_SQUADS: readonly SquadDef[] = [
  {
    id: 1,
    name: "Decor",
    marketing: "",
    preVenda: "Rubia Lorena Santos",
    venda: "",
    empreendimentos: [
      "Aguardando definição", "Marista 144 Spot", "Batel Spot", "Canas Beach Spot",
      "Urubici Spot II", "Meireles Spot", "Rosa Sul Spot", "Japaratinga Spot",
      "Canasvieiras Spot", "Foz Spot", "Jurerê Spot II", "Santo Antônio Spot",
      "Bonito Spot II", "Trancoso Spot", "Campeche Spot",
    ],
  },
] as const;

const DECOR_CONFIG: ModuleConfig = {
  id: "decor",
  label: "Decor",
  shortLabel: "Decor",
  pipelineId: 44,
  metaAdsAccountId: "",
  squads: DECOR_SQUADS,
  closers: [],
  presellers: ["Rubia Lorena Santos"],
  squadCloserMap: {},
  tablePrefix: "decor",
  apiBase: "/api/decor",
  syncFunctions: ["decor-presales", "decor-deals-light"],
};

// --- SZS (Serviços) — 3 squads by canal ---

const SZS_SQUADS: readonly SquadDef[] = [
  {
    id: 1,
    name: "Marketing",
    marketing: "Raquel",
    preVenda: "Joyce",
    venda: "Gabi Lemos",
    canal_group: "Marketing",
    empreendimentos: [],
  },
  {
    id: 2,
    name: "Parceiros",
    marketing: "Raynara",
    preVenda: "Raynara Lopes",
    venda: "Gabriela Branco",
    canal_group: "Parceiros",
    empreendimentos: [],
  },
  {
    id: 3,
    name: "Expansão",
    marketing: "Larissa",
    preVenda: "Larissa Marques",
    venda: "Giovanna Zanchetta",
    canal_group: "Expansão",
    empreendimentos: [],
  },
] as const;

const SZS_CONFIG: ModuleConfig = {
  id: "szs",
  label: "Serviços",
  shortLabel: "SZS",
  pipelineId: 14,
  metaAdsAccountId: "act_721191188358261",
  squads: SZS_SQUADS,
  closers: ["Gabi Lemos", "Gabriela Branco", "Giovanna Zanchetta"],
  presellers: ["Raquel", "Joyce", "Raynara Lopes", "Larissa Marques"],
  squadCloserMap: { 1: [0], 2: [1], 3: [2] },
  tablePrefix: "szs",
  apiBase: "/api/szs",
  syncFunctions: ["szs-dashboard-light", "szs-meta-ads", "szs-deals-light", "szs-calendar", "szs-presales"],
};

// --- Registry ---

export const MODULES: Record<string, ModuleConfig> = {
  szi: SZI_CONFIG,
  mktp: MKTP_CONFIG,
  szs: SZS_CONFIG,
  decor: DECOR_CONFIG,
};

export const MODULE_IDS = Object.keys(MODULES);
export const DEFAULT_MODULE = "szi";

export function getModuleConfig(id: string): ModuleConfig {
  return MODULES[id] ?? MODULES[DEFAULT_MODULE];
}
