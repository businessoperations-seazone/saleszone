// Configuração multi-pipeline para módulos squad (Pipedrive direto)
// Contém: pipeline configs, stage IDs, empreendimento mappings, squad definitions

export interface Squad {
  id: number
  name: string
  color: string
  marketing: string
  preVenda: string[]
  venda: string[]
  empreendimentos: string[]
  canais?: string[]
}

export interface PipelineConfig {
  id: number
  slug: string
  name: string
  shortName: string
  filterId: number
  stageIds: {
    MQL: number[]
    SQL: number[]
    OPP: number[]
    WON: number[]
  }
  nektTable: string | null
  squads: Squad[]
  empOptions: Record<number, string>
  groupBy: 'empreendimento' | 'canal'
}

// ─── Pipeline 28: Vendas Spot SZI ───────────────────────────────────────────

const SZI_SQUADS: Squad[] = [
  {
    id: 1, name: 'Squad 1', color: '#2563EB',
    marketing: 'Jean', preVenda: ['Carolina Maeda'], venda: ['Luana Schaikoski'],
    empreendimentos: ['Ponta das Canas Spot II', 'Marista 144 Spot', 'Jurerê Spot II', 'Jurerê Spot III', 'Vistas de Anitá II'],
  },
  {
    id: 2, name: 'Squad 2', color: '#F97316',
    marketing: 'Jean', preVenda: ['Jeniffer Correa'], venda: ['Filipe Padoveze'],
    empreendimentos: ['Natal Spot', 'Novo Campeche Spot II', 'Caraguá Spot'],
  },
  {
    id: 3, name: 'Squad 3', color: '#10B981',
    marketing: 'Jean', preVenda: ['Karoane Izabela Soares'], venda: ['Hellen Dias'],
    empreendimentos: ['Itacaré Spot', 'Bonito Spot II', 'Barra Grande Spot'],
  },
]

const SZI_EMP_OPTIONS: Record<number, string> = {
  4109: 'Ponta das Canas Spot II', 3467: 'Itacaré Spot', 2935: 'Marista 144 Spot',
  4495: 'Natal Spot', 4655: 'Novo Campeche Spot II', 3416: 'Caraguá Spot', 3451: 'Bonito Spot II',
  3333: 'Jurerê Spot II', 4586: 'Jurerê Spot III', 3478: 'Barra Grande Spot', 637: 'Vistas de Anitá II',
}

// ─── Pipeline 14: Comercial SZS ────────────────────────────────────────────

const SZS_SQUADS: Squad[] = [
  {
    id: 1, name: 'Marketing', color: '#10B981',
    marketing: 'Raquel', preVenda: ['Joyce'], venda: ['Gabi Lemos'], empreendimentos: [],
  },
  {
    id: 2, name: 'Parceiros', color: '#8B5CF6',
    marketing: 'Raynara', preVenda: ['Raynara Lopes'], venda: ['Gabriela Branco'], empreendimentos: [],
  },
  {
    id: 3, name: 'Expansão', color: '#F59E0B',
    marketing: 'Larissa', preVenda: ['Larissa Marques'], venda: ['Giovanna Zanchetta'], empreendimentos: [],
  },
]

const SZS_EMP_OPTIONS: Record<number, string> = {}

// ─── Pipeline 37: Marketplace ───────────────────────────────────────────────

const MKT_SQUADS: Squad[] = [
  {
    id: 1, name: 'Marketplace', color: '#0EA5E9',
    marketing: '', preVenda: ['Karoane Izabela Soares', 'Karoline Borges'], venda: [],
    empreendimentos: [
      'Foz Spot', 'Rosa Sul Spot', 'Cachoeira Beach Spot', 'Meireles Spot',
      'Ilha do Campeche II Spot', 'Ingleses Spot', 'Bonito Spot', 'Santinho Spot',
      'Japaratinga Spot', 'Ponta das Canas Spot', 'Canasvieiras Spot', 'Penha Spot',
      'Jurerê Beach Spot', 'Sul da Ilha Spot',
    ],
  },
]

const MKT_EMP_OPTIONS: Record<number, string> = {
  4056: 'Foz Spot', 463: 'Rosa Sul Spot', 3266: 'Cachoeira Beach Spot', 3158: 'Meireles Spot',
  3201: 'Ilha do Campeche II Spot', 464: 'Ingleses Spot', 3303: 'Bonito Spot', 3298: 'Santinho Spot',
  466: 'Japaratinga Spot', 3489: 'Ponta das Canas Spot', 2573: 'Canasvieiras Spot', 490: 'Penha Spot',
  2904: 'Jurerê Beach Spot', 2868: 'Sul da Ilha Spot', 506: 'Jurerê Spot', 504: 'Rosa Spot',
  505: 'Lagoa Spot', 462: 'Barra Spot', 465: 'Urubici Spot', 492: 'Aguardando definição',
}

// ─── Pipeline 44: Comercial Decor ───────────────────────────────────────────

const DECOR_SQUADS: Squad[] = [
  {
    id: 1, name: 'Decor', color: '#EC4899',
    marketing: '', preVenda: [], venda: [],
    empreendimentos: [
      'Aguardando definição', 'Marista 144 Spot', 'Batel Spot', 'Canas Beach Spot',
      'Urubici Spot II', 'Meireles Spot', 'Rosa Sul Spot', 'Japaratinga Spot',
      'Canasvieiras Spot', 'Foz Spot', 'Jurerê Spot II', 'Santo Antônio Spot',
      'Bonito Spot II', 'Trancoso Spot', 'Campeche Spot',
    ],
  },
]

const DECOR_EMP_OPTIONS: Record<number, string> = {
  492: 'Aguardando definição', 2935: 'Marista 144 Spot', 2840: 'Batel Spot',
  4090: 'Canas Beach Spot', 2526: 'Urubici Spot II', 3158: 'Meireles Spot',
  463: 'Rosa Sul Spot', 466: 'Japaratinga Spot', 2573: 'Canasvieiras Spot',
  4056: 'Foz Spot', 3333: 'Jurerê Spot II', 3119: 'Santo Antônio Spot',
  3451: 'Bonito Spot II', 1171: 'Trancoso Spot', 2324: 'Campeche Spot',
  3298: 'Santinho Spot', 3201: 'Ilha do Campeche II Spot', 2904: 'Jurerê Beach Spot',
  490: 'Penha Spot', 464: 'Ingleses Spot', 504: 'Rosa Spot', 3489: 'Ponta das Canas Spot',
}

// ─── Registro ──────────────────────────────────────────────────────────────

export const PIPELINES: PipelineConfig[] = [
  {
    id: 28, slug: 'szi', name: 'Vendas Spot SZI', shortName: 'SZI', filterId: 584738,
    stageIds: { MQL: [184, 186, 338], SQL: [346, 339, 187], OPP: [340, 208, 312, 313, 311], WON: [191, 192] },
    nektTable: 'facebook_ads_szi_adsinsights', squads: SZI_SQUADS, empOptions: SZI_EMP_OPTIONS, groupBy: 'empreendimento',
  },
  {
    id: 14, slug: 'szs', name: 'Comercial SZS', shortName: 'SZS', filterId: 584739,
    stageIds: { MQL: [70, 71, 72], SQL: [345, 341, 73], OPP: [342, 151, 74, 75], WON: [152, 76] },
    nektTable: 'facebook_ads_szs_adsinsights', squads: SZS_SQUADS, empOptions: SZS_EMP_OPTIONS, groupBy: 'canal',
  },
  {
    id: 37, slug: 'mktp', name: 'Marketplace', shortName: 'Marketplace', filterId: 584740,
    stageIds: { MQL: [336, 335, 334], SQL: [347, 333, 284], OPP: [337, 274, 308, 309], WON: [393, 305, 271] },
    nektTable: 'facebook_ads_mktplace_adsinsights', squads: MKT_SQUADS, empOptions: MKT_EMP_OPTIONS, groupBy: 'empreendimento',
  },
  {
    id: 44, slug: 'decor', name: 'Comercial Decor', shortName: 'Decor', filterId: 584741,
    stageIds: { MQL: [348, 349, 350], SQL: [351, 352, 353], OPP: [354, 355, 358, 357], WON: [356, 359] },
    nektTable: null, squads: DECOR_SQUADS, empOptions: DECOR_EMP_OPTIONS, groupBy: 'empreendimento',
  },
]

export const DEFAULT_PIPELINE_SLUG = 'szi'

export function getPipeline(slug: string): PipelineConfig {
  return PIPELINES.find(p => p.slug === slug) || PIPELINES[0]
}

export const PIPEDRIVE_EMPREENDIMENTO_FIELD = '6d565fd4fce66c16da078f520a685fa2fa038272'
export const PIPEDRIVE_DATA_REUNIAO_FIELD = 'bfafc352c5c6f2edbaa41bf6d1c6daa825fc9c16'
export const PIPEDRIVE_CANAL_FIELD = '93b3ada8b94bd1fc4898a25754d6bcac2713f835'

export const CANAL_OPTIONS: Record<string, string> = {
  '1748': 'Expansão', '623': 'Cliente SZN', '3142': 'Colaborador Seazone',
  '583': 'Indicação Franquia', '10': 'Indicação Clientes', '543': 'Indicação Colaborador',
  '582': 'Indicação Corretor', '830': 'Indicação Embaixador', '622': 'Indicação Hóspede',
  '2876': 'Indicação Parceiros', '12': 'Marketing', '804': 'Portais de imóveis',
  '276': 'Prospecção Ativa', '3189': 'Spot Seazone', '3408': 'Prospecção Instagram',
  '3409': 'Prospecção LinkedIn', '3429': 'Prospecção ativa - IA', '3434': 'Prospecção CNAEs',
  '3446': 'Lista Prospecção Ativa', '4009': 'Eventos', '4550': 'Marketing POC', '4551': 'Mônica',
}

export function getCanalLabel(optionId: string | number | null | undefined): string {
  if (!optionId) return 'Sem canal'
  return CANAL_OPTIONS[String(optionId)] || `Canal ${optionId}`
}

export const PIPEDRIVE_RD_CAMPANHA_FIELD = 'e446c37fb126d0a122ae3a1d2f6a5b5716038731'

export function getSquads(slug: string): Squad[] {
  return getPipeline(slug).squads
}

export function getEmpToSquad(slug: string): Record<string, number> {
  const map: Record<string, number> = {}
  for (const sq of getPipeline(slug).squads) {
    for (const emp of sq.empreendimentos) map[emp] = sq.id
  }
  return map
}

export function getEmpOptions(slug: string): Record<number, string> {
  return getPipeline(slug).empOptions
}
