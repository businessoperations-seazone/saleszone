import { squadEnv } from '@/lib/squad/env'

const BASE_URL = 'https://api.api4com.com/api/v1'

export interface Api4ComCall {
  id: string
  call_type: string
  started_at: string
  ended_at: string
  from: string
  to: string
  duration: number
  hangup_cause: string
  record_url: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
  BINA: string | null
  minute_price: number | null
  call_price: number | null
  metadata: { dealId?: string } | null
}

interface Api4ComResponse {
  data: Api4ComCall[]
  meta: {
    totalItemCount: number
    totalPageCount: number
    itemsPerPage: number
    currentPage: number
    nextPage: number | null
  }
}

export const PRESELLER_RAMAIS: Record<string, string> = {
  'Natália Saramago': '1150',
  'Jeniffer Correa': '1083',
  'Kamille Santos Gomes': '1090',
  'Larissa Marques': '1171',
  'Raynara Lopes': '1110',
  'Raquel Levi': '1102',
  'Karoane Izabela Soares': '1170',
  'Rubia Lorena Santos': '1149',
  'Luciana Patrício': '1151',
}

export const CLOSER_RAMAIS: Record<string, string> = {
  'Filipe Padoveze': '1137',
  'Luana Schaikoski': '1080',
  'Hellen Dias': '1148',
  'Priscila Perrone': '1119',
  'Priscila Pestana Perrone': '1119',
  'Ricardo Perrone': '1146',
  'Giovanna Araujo Zanchetta': '1121',
  'Gabriela Lemos': '1159',
  'Gabriela Alves Branco': '1082',
  'Samuel Barreto': '1158',
  'Willian Miranda': '1024',
  'Nevine Saratt': '1142',
  'Eduardo Henrique Albani': '1076',
  'Maria Carolina Rosário': '1160',
}

async function api4comFetch(url: string): Promise<Api4ComResponse> {
  if (!squadEnv.API4COM_TOKEN) {
    throw new Error('API4COM_TOKEN não configurado')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  const res = await fetch(url, {
    headers: { Authorization: squadEnv.API4COM_TOKEN },
    cache: 'no-store',
    signal: controller.signal,
  })
  clearTimeout(timeoutId)

  if (!res.ok) {
    throw new Error(`Api4Com error: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

export async function getCallsByExtension(
  extension: string,
  daysBack: number = 7
): Promise<{ calls: Api4ComCall[]; totalCount: number }> {
  if (!extension) return { calls: [], totalCount: 0 }

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - daysBack)
  const sinceStr = sinceDate.toISOString().split('T')[0]

  try {
    const url = `${BASE_URL}/calls?page=1&filter[limit]=200&filter[where][from]=${extension}&filter[where][started_at][gt]=${sinceStr}`
    const resp = await api4comFetch(url)
    return {
      calls: resp.data || [],
      totalCount: resp.meta?.totalItemCount || resp.data?.length || 0,
    }
  } catch (err) {
    console.error(`[api4com] getCallsByExtension(${extension}) error:`, err)
    return { calls: [], totalCount: 0 }
  }
}

export function calcCallMetrics(
  calls: Api4ComCall[],
  totalCount: number,
  daysBack: number = 7
) {
  if (totalCount === 0) {
    return {
      totalChamadas: 0, chamadasDia: 0, duracaoMedia: 0,
      duracaoMediaStr: '-', atendidas: 0, taxaAtendimento: 0, tempoTotalMin: 0,
    }
  }

  const atendidas = calls.filter(
    (c) => c.duration > 0 && c.hangup_cause !== 'NO_ANSWER' && c.hangup_cause !== 'ORIGINATOR_CANCEL'
  )
  const totalDuration = atendidas.reduce((sum, c) => sum + (c.duration || 0), 0)
  const avgDuration = atendidas.length > 0 ? Math.round(totalDuration / atendidas.length) : 0
  const taxaAtendimentoAmostra = calls.length > 0
    ? Math.round((atendidas.length / calls.length) * 100) : 0

  return {
    totalChamadas: totalCount,
    chamadasDia: Math.round((totalCount / daysBack) * 10) / 10,
    duracaoMedia: avgDuration,
    duracaoMediaStr: formatSeconds(avgDuration),
    atendidas: Math.round((taxaAtendimentoAmostra / 100) * totalCount),
    taxaAtendimento: taxaAtendimentoAmostra,
    tempoTotalMin: Math.round(totalDuration / 60),
  }
}

function formatSeconds(sec: number): string {
  if (sec === 0) return '-'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${min}m${s}s` : `${min}m`
}

export function findRamal(name: string): string {
  const allRamais = { ...PRESELLER_RAMAIS, ...CLOSER_RAMAIS }
  if (allRamais[name]) return allRamais[name]
  const firstName = name.split(' ')[0].toLowerCase()
  for (const [key, ramal] of Object.entries(allRamais)) {
    if (key.toLowerCase().includes(firstName) && ramal) return ramal
  }
  return ''
}
