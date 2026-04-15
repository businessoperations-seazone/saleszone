import type { NektRow, AdPerformance, AdStatus, Checkpoint, Tier, Tendencia, VerticalConfig } from "./adsTypes"
import { VERTICAL_CONFIGS, DEFAULT_CONFIG } from "./adsTypes"

function getConfig(vertical: string): VerticalConfig {
  return VERTICAL_CONFIGS[vertical] || DEFAULT_CONFIG
}

function lerp(value: number, min: number, max: number, maxPts: number): number {
  if (value <= min) return maxPts
  if (value >= max) return 0
  return ((max - value) / (max - min)) * maxPts
}

function getCheckpoint(dias: number, cfg: VerticalConfig): Checkpoint {
  const cp = cfg.checkpoints
  if (dias < cp.mql) return `Day ${cp.mql}`
  if (dias < cp.sql) return `Day ${cp.sql}`
  if (dias < cp.opp) return `Day ${cp.opp}`
  return `Day ${cp.won}`
}

function getConfidence(spend: number, mql: number): number {
  let factor = 1.0
  if (spend < 200) factor = 0.05
  else if (spend < 500) factor = 0.3
  else if (spend < 1000) factor = 0.6
  if (mql < 5) factor *= 0.4
  return factor
}

function speedBonus(dias: number, checkpoint: number, maxBonus: number): number {
  if (dias >= checkpoint || checkpoint <= 0) return 0
  return ((checkpoint - dias) / checkpoint) * maxBonus
}

function computeLayeredScore(
  r: NektRow,
  cost_per_mql: number,
  cost_per_sql: number,
  cost_per_opp: number,
  cost_per_won: number,
  cfg: VerticalConfig
): { score: number; tier: Tier; speed_bonus: number } {
  const cp = cfg.checkpoints
  const s = cfg.scoring

  if (r.won > 0 && isFinite(cost_per_won)) {
    let score = 1000
    score += lerp(cost_per_won, s.won_meta, s.won_teto, 400)
    const wonRate = r.opp > 0 ? r.won / r.opp : 0
    score += wonRate * 200
    const sb = speedBonus(r.dias_ativos, cp.won, 200)
    score += sb
    return { score, tier: "WON", speed_bonus: sb }
  }

  if (r.opp > 0 && isFinite(cost_per_opp)) {
    let score = 0
    score += lerp(cost_per_opp, s.opp_meta, s.opp_teto, 300)
    const oppRate = r.sql > 0 ? r.opp / r.sql : 0
    score += Math.min(1, oppRate / s.taxa_sql_opp) * 150
    const sb = speedBonus(r.dias_ativos, cp.opp, 100)
    score += sb
    return { score, tier: "OPP", speed_bonus: sb }
  }

  if (r.sql > 0 && isFinite(cost_per_sql)) {
    let score = 0
    score += lerp(cost_per_sql, s.sql_meta, s.sql_teto, 200)
    const sqlRate = r.mql > 0 ? r.sql / r.mql : 0
    score += Math.min(1, sqlRate / s.taxa_mql_sql) * 100
    const sb = speedBonus(r.dias_ativos, cp.sql, 50)
    score += sb
    return { score, tier: "SQL", speed_bonus: sb }
  }

  if (r.mql > 0 && isFinite(cost_per_mql)) {
    let score = lerp(cost_per_mql, s.mql_meta, s.mql_teto, 100)
    const sb = speedBonus(r.dias_ativos, cp.mql, 25)
    score += sb
    return { score, tier: "MQL", speed_bonus: sb }
  }

  return { score: 0, tier: "SEM_DADOS", speed_bonus: 0 }
}

function evaluateStatus(
  r: NektRow,
  cost_per_mql: number,
  cost_per_sql: number,
  cost_per_opp: number,
  cost_per_won: number,
  cfg: VerticalConfig
): AdStatus {
  const cp = cfg.checkpoints
  const s = cfg.scoring

  // Regra 0 — Spend Cap (prioridade máxima)
  const spendCap = cfg.spendCap ?? Infinity
  if (r.spend >= spendCap && r.won === 0) return "PAUSAR"

  if (r.won > 0 && isFinite(cost_per_won)) {
    if (cost_per_won <= s.won_meta) return "MANTER"
    if (cost_per_won <= s.won_teto) return "MONITORAR"
    return "PAUSAR"
  }

  if (r.opp > 0 && isFinite(cost_per_opp)) {
    const oppCostOk = cost_per_opp <= s.opp_meta
    const rateSqlOpp = r.sql > 0 ? r.opp / r.sql : 0
    const oppRateOk = r.sql < 3 || rateSqlOpp >= s.taxa_sql_opp
    if (oppCostOk && oppRateOk) return "MANTER"
    return "PAUSAR"
  }

  // Guard global de spend mínimo — sem WON/OPP e sem gasto suficiente, não há dados para decidir
  if (r.spend < (cfg.spendMinMql ?? 0)) return "AGUARDAR"

  if (r.dias_ativos < cp.mql) {
    // Alerta antecipado: custo/MQL acima de 3x o benchmark antes do primeiro checkpoint → MONITORAR
    if (isFinite(cost_per_mql) && cost_per_mql > s.mql_meta * 3 && r.spend >= 100) return "MONITORAR"
    return "AGUARDAR"
  }

  const rate_mql_sql = r.mql > 0 ? r.sql / r.mql : 0
  const rate_sql_opp = r.sql > 0 ? r.opp / r.sql : 0

  if (r.dias_ativos < cp.sql) {
    // Passou o checkpoint sem nenhum MQL → PAUSAR
    if (r.mql === 0) return "PAUSAR"
    // Pausa apenas se AMBOS estiverem ruins (AND): custo/MQL alto E taxa MQL→SQL baixa
    const rateOk = r.mql < 3 || rate_mql_sql >= s.taxa_mql_sql
    const costOk = cost_per_mql <= s.mql_meta
    if (costOk && rateOk) return "MANTER"
    if (!costOk && !rateOk) return "PAUSAR"
    return "MONITORAR"  // só um ruim
  }

  if (r.dias_ativos < cp.opp) {
    // Passou o checkpoint SQL sem nenhum MQL → PAUSAR (igual ao bloco anterior)
    if (r.mql === 0) return "PAUSAR"
    // Avalia custo: se tem SQL usa custo/SQL; se sql=0, usa custo/MQL como proxy
    const costOk = r.sql > 0 ? cost_per_sql <= s.sql_meta : cost_per_mql <= s.mql_meta
    const rateOk = r.sql < 3 || rate_sql_opp >= s.taxa_sql_opp
    const mqlAlsoHigh = isFinite(cost_per_mql) && cost_per_mql > s.mql_meta
    if (costOk && rateOk) return "MANTER"
    if (!costOk && !rateOk) return "PAUSAR"
    if (!costOk && rateOk) return mqlAlsoHigh ? "PAUSAR" : "MONITORAR"
    return "MONITORAR"
  }

  // Day OPP+ sem OPP → PAUSAR (checkpoint expirou)
  return "PAUSAR"
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function computePerformanceRolling(rows: NektRow[]): AdPerformance[] {
  if (rows.length === 0) return []

  const byAd = new Map<string, NektRow[]>()
  for (const r of rows) {
    if (!byAd.has(r.ad_id)) byAd.set(r.ad_id, [])
    byAd.get(r.ad_id)!.push(r)
  }

  let maxDateStr = ""
  for (const r of rows) {
    if (r.date > maxDateStr) maxDateStr = r.date
  }

  const cutoff7d = offsetDate(maxDateStr, -7)
  const cutoff14d = offsetDate(maxDateStr, -14)

  const sumKey = (arr: NektRow[], key: keyof NektRow): number =>
    arr.reduce((s, r) => s + (Number(r[key]) || 0), 0)

  return Array.from(byAd.values()).map(adRows => {
    const base = adRows.reduce((a, b) => b.dias_ativos > a.dias_ativos ? b : a)
    const cfg = getConfig(base.vertical)
    const bm = cfg.benchmarks

    const rows7d = adRows.filter(r => r.date > cutoff7d)
    const rows14d = adRows.filter(r => r.date > cutoff14d)
    const rows8_14 = adRows.filter(r => r.date > cutoff14d && r.date <= cutoff7d)

    const spend_7d = sumKey(rows7d, "spend")
    const mql_7d = sumKey(rows7d, "mql")
    const sql_14d = sumKey(rows14d, "sql")
    const spend_14d = sumKey(rows14d, "spend")
    const spend_8_14 = sumKey(rows8_14, "spend")
    const mql_8_14 = sumKey(rows8_14, "mql")

    const spend_total = sumKey(adRows, "spend")
    const mql_total = sumKey(adRows, "mql")
    const sql_total = sumKey(adRows, "sql")
    const opp_total = sumKey(adRows, "opp")
    const won_total = sumKey(adRows, "won")

    const use7d = spend_7d > 0
    const eff_mql = use7d ? mql_7d : mql_total
    const eff_spend_mql = use7d ? spend_7d : spend_total

    const eff_sql = sql_14d > 0 ? sql_14d : sql_total
    const eff_spend_sql = sql_14d > 0 ? spend_14d : spend_total

    const cost_per_mql = eff_mql > 0 ? eff_spend_mql / eff_mql : Infinity
    const cost_per_sql = eff_sql > 0 ? eff_spend_sql / eff_sql : Infinity
    const cost_per_opp = opp_total > 0 ? spend_total / opp_total : Infinity
    const cost_per_won = won_total > 0 ? spend_total / won_total : Infinity
    const cost_per_mql_total = mql_total > 0 ? spend_total / mql_total : 0

    let tendencia: Tendencia = "SEM_DADOS"
    if (mql_7d >= 1 && mql_8_14 >= 1 && spend_7d > 0 && spend_8_14 > 0) {
      const cost_current = spend_7d / mql_7d
      const cost_prev = spend_8_14 / mql_8_14
      if (cost_current > cost_prev * 1.20) tendencia = "DEGRADANDO"
      else if (cost_current < cost_prev * 0.85) tendencia = "MELHORANDO"
      else tendencia = "ESTÁVEL"
    } else if (mql_7d >= 1) {
      tendencia = "ESTÁVEL"
    }

    const hybridRow: NektRow = {
      ...base,
      mql: eff_mql,
      sql: eff_sql,
      opp: opp_total,
      won: won_total,
      spend: eff_spend_mql,
    }

    const { score: rawScore, tier, speed_bonus: sb } = computeLayeredScore(
      hybridRow, cost_per_mql, cost_per_sql, cost_per_opp, cost_per_won, cfg
    )

    const confidence = getConfidence(eff_spend_mql, eff_mql)
    const score = rawScore * confidence

    const checkpoint_atual = getCheckpoint(base.dias_ativos, cfg)
    const original_status = evaluateStatus(
      hybridRow,
      isFinite(cost_per_mql) ? cost_per_mql : Infinity,
      cost_per_sql,
      cost_per_opp,
      cost_per_won,
      cfg
    )

    // Spend cap absoluto
    const spendCap = cfg.spendCap ?? Infinity
    const pausedBySpendCap = spend_total >= spendCap && won_total === 0

    let ad_status: AdStatus = pausedBySpendCap ? "PAUSAR" : original_status
    if (!pausedBySpendCap && tendencia !== "SEM_DADOS" && original_status !== "AGUARDAR") {
      if (original_status === "MANTER" && tendencia === "DEGRADANDO") ad_status = "MONITORAR"
      else if (original_status === "PAUSAR" && tendencia === "MELHORANDO") ad_status = "MONITORAR"
    }

    // Fase pós-OPP: a partir do dia seguinte ao checkpoint, rolling MQL/SQL caro → PAUSAR
    // +1 porque no dia exato do checkpoint ainda é normal não ter OPP
    const postOppPhase = base.dias_ativos >= cfg.checkpoints.opp + 1
    if (postOppPhase && !pausedBySpendCap && ad_status !== "PAUSAR" && ad_status !== "AGUARDAR" && spend_total < (cfg.spendCap ?? Infinity)) {
      const mqlRollingBad = isFinite(cost_per_mql) && cost_per_mql > cfg.scoring.mql_meta
      const sqlRollingBad = isFinite(cost_per_sql) && cost_per_sql > cfg.scoring.sql_meta
      if (mqlRollingBad || sqlRollingBad) ad_status = "PAUSAR"
    }

    return {
      ...base,
      mql: mql_total,
      sql: sql_total,
      opp: opp_total,
      won: won_total,
      spend: spend_total,
      cost_per_mql: isFinite(cost_per_mql) ? cost_per_mql : 0,
      cost_per_sql: isFinite(cost_per_sql) ? cost_per_sql : 0,
      cost_per_opp: isFinite(cost_per_opp) ? cost_per_opp : 0,
      cost_per_won: isFinite(cost_per_won) ? cost_per_won : 0,
      cost_per_mql_total,
      score: Math.round(score * 100) / 100,
      speed_bonus: Math.round(sb * confidence * 100) / 100,
      benchmark_vs_mql: isFinite(cost_per_mql) && cost_per_mql > 0 ? cost_per_mql / bm.cost_per_mql : 0,
      benchmark_vs_sql: cost_per_sql > 0 && isFinite(cost_per_sql) ? cost_per_sql / bm.cost_per_sql : 0,
      benchmark_vs_opp: cost_per_opp > 0 && isFinite(cost_per_opp) ? cost_per_opp / bm.cost_per_opp : 0,
      benchmark_vs_won: cost_per_won > 0 && isFinite(cost_per_won) ? cost_per_won / bm.cost_per_won : 0,
      ad_status,
      checkpoint_atual,
      tier,
      tendencia,
      mql_7d,
      spend_7d,
    }
  }).sort((a, b) => b.score - a.score)
}
