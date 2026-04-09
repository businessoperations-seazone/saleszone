import { put } from "@vercel/blob"

export type SlaRow = {
  id: number
  vertical: string
  nome: string
  status: boolean
  commercial_squad: string
  mql_intencoes: string[]
  mql_faixas: string[]
  mql_pagamentos: string[]
}

export type FormQuestion = { pergunta: string; opcoes: string[] }

export type SlaData = {
  rows: SlaRow[]
  forms: Record<string, FormQuestion[]>
}

export type SlaLogEntry = {
  ts: string
  user_name: string
  user_email: string
  vertical: string
  section: string
  action: string
  entity: string
  detail: string
}

// ─── Seed (espelho do SQL migration) ─────────────────────────────────────────

const I = ["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]
const P = ["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]
const F3 = ["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]
const F2 = ["R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]

const SEED: SlaData = {
  rows: [
    { id: 1,  vertical: "SZI",         nome: "Itacaré Spot",            status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
    { id: 2,  vertical: "SZI",         nome: "Vistas de Anitá II",      status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
    { id: 3,  vertical: "SZI",         nome: "Jurerê Spot II",          status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F2, mql_pagamentos: P },
    { id: 4,  vertical: "SZI",         nome: "Jurerê Spot III",         status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F2, mql_pagamentos: P },
    { id: 5,  vertical: "SZI",         nome: "Marista 144 Spot",        status: false, commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: ["R$ 100.001 a R$ 200.000 em até 54 meses", ...F3], mql_pagamentos: P },
    { id: 6,  vertical: "SZI",         nome: "Caraguá Spot",            status: false, commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
    { id: 7,  vertical: "SZI",         nome: "Ponta das Canas Spot II", status: true,  commercial_squad: "szi_01", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
    { id: 8,  vertical: "SZI",         nome: "Barra Grande Spot",       status: true,  commercial_squad: "szi_02", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
    { id: 9,  vertical: "SZI",         nome: "Natal Spot",              status: true,  commercial_squad: "szi_02", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
    { id: 10, vertical: "SZI",         nome: "Bonito Spot II",          status: true,  commercial_squad: "szi_02", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
    { id: 11, vertical: "SZI",         nome: "Novo Campeche Spot II",   status: true,  commercial_squad: "szi_02", mql_intencoes: I, mql_faixas: F3, mql_pagamentos: P },
    { id: 12, vertical: "Marketplace", nome: "Marketplace",             status: true,  commercial_squad: "",
      mql_intencoes: ["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"],
      mql_faixas: ["R$ 30.001 a R$ 50.000","R$ 50.001 a R$ 80.000","R$ 80.001 a R$ 150.000","Acima de R$ 150.000"],
      mql_pagamentos: [] },
    { id: 13, vertical: "Serviços", nome: "Seazone Serviços", status: true, commercial_squad: "",
      mql_intencoes: ["Sim","Não","Parcialmente mobiliado"],
      mql_faixas: ["Disponível imediatamente","Alugado com contrato anual","Em reforma / preparação","Já opera por temporada"],
      mql_pagamentos: ["Sim","Não","Não, mas estou disposto a instalar caso seja necessário"] },
  ],
  forms: {
    SZI: [
      { pergunta: "Você procura investimento ou para uso próprio?", opcoes: ["Investimento - renda com aluguel","Uso próprio - moradia","Uso próprio - uso esporádico","Investimento - valorização do imóvel"] },
      { pergunta: "Qual o valor total que você pretende investir dentro de 54 meses?", opcoes: ["R$ 50.000 a R$ 100.000 em até 54 meses","R$ 100.001 a R$ 200.000 em até 54 meses","R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses","À vista via PIX ou boleto"] },
      { pergunta: "Qual a forma de pagamento?", opcoes: ["À vista via PIX ou boleto","Parcelado via PIX ou boleto","Não tenho condição nessas opções"] },
    ],
    Marketplace: [
      { pergunta: "Você procura investimento ou para uso próprio?", opcoes: ["Investimento - renda com aluguel","Uso próprio - moradia","Uso próprio - uso esporádico","Investimento - valorização do imóvel"] },
      { pergunta: "Qual o valor de entrada que você tem hoje?", opcoes: ["Até R$ 30.000","R$ 30.001 a R$ 50.000","R$ 50.001 a R$ 80.000","R$ 80.001 a R$ 150.000","Acima de R$ 150.000"] },
    ],
    Serviços: [
      { pergunta: "O imóvel para locação é mobiliado?", opcoes: ["Sim","Não","Parcialmente mobiliado","Não tenho imóvel"] },
      { pergunta: "Qual a disponibilidade do imóvel para locação?", opcoes: ["Disponível imediatamente","Alugado com contrato anual","Em reforma / preparação","Não está disponível","Já opera por temporada"] },
      { pergunta: "O imóvel possui ar condicionado?", opcoes: ["Não, mas estou disposto a instalar caso seja necessário","Sim","Não"] },
    ],
  },
}

// ─── Helpers Blob ─────────────────────────────────────────────────────────────

const DATA_KEY = "sla-mql/data.json"
const LOG_KEY  = "sla-mql/log.json"
const BLOB_URL   = process.env.BLOB_URL               || ""
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN   || ""

async function fetchBlob<T>(path: string): Promise<T | null> {
  if (!BLOB_URL) return null
  try {
    const res = await fetch(`${BLOB_URL}/${path}`, {
      headers: BLOB_TOKEN ? { Authorization: `Bearer ${BLOB_TOKEN}` } : {},
      cache: "no-store",
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

async function writeBlob(path: string, data: unknown): Promise<void> {
  await put(path, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_TOKEN,
  })
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function readData(): Promise<SlaData> {
  const d = await fetchBlob<SlaData>(DATA_KEY)
  if (d?.rows?.length) return d
  await writeBlob(DATA_KEY, SEED)
  return SEED
}

export async function writeData(data: SlaData): Promise<void> {
  await writeBlob(DATA_KEY, data)
}

export async function readLog(): Promise<SlaLogEntry[]> {
  const d = await fetchBlob<{ entries: SlaLogEntry[] }>(LOG_KEY)
  return d?.entries ?? []
}

export async function appendLog(entries: SlaLogEntry[]): Promise<void> {
  if (entries.length === 0) return
  const existing = await readLog()
  await writeBlob(LOG_KEY, { entries: [...entries, ...existing].slice(0, 500) })
}
