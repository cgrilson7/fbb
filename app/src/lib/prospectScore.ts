// Aggregate prospect score (0-100), computed separately for batters and pitchers.
//
// Three components, each normalized to 0-100 and blended by COMPONENT_WEIGHTS:
//
//   perf   — MiLB production to date plus age relative to the level, both
//            z-scored against the *same level* and then discounted by that
//            level's difficulty. Raw rate stats are not comparable across
//            levels: DSL hitters average a 1.02 BB/K while AA hitters average
//            0.55, so a "good" BB/K only means something relative to the
//            player's peers. Baselines come from the loaded data rather than
//            being hardcoded, so they track whatever season is uploaded.
//            Age carries real weight because production alone badly undersells
//            teenagers holding their own against much older competition — the
//            consensus #1 prospect is usually a 19-year-old posting a merely
//            good line in AA, which reads as unremarkable until you price in
//            that the average AA bat is 23.
//   expert — scouting consensus: FanGraphs FV, MLB Pipeline Top 100, Keith Law
//            Top 50, HKB dynasty rank. Whichever exist are averaged by source
//            weight. Coverage is thin — only ~23% of batters and ~17% of
//            pitchers appear on any list — so an absent ranking is treated as
//            *missing data*, not as a bad grade: the component drops out and
//            the remaining weights renormalize. A charging 19-year-old nobody
//            has written up yet is exactly who this table should surface, and
//            penalizing him for the silence would cap him below every ranked
//            name no matter what he does on the field.
//   eta    — how soon the player helps. Missing ETAs are inferred from level.
//
// Everything below is a tunable constant; the blend is intentionally simple so
// the number stays explainable when it disagrees with a ranking list.

import type { FGMinorsBatter, FGMinorsPitcher } from '@/types'

export const COMPONENT_WEIGHTS = { perf: 0.40, expert: 0.40, eta: 0.20 }

// Same ladder as the prospects page. Lower = higher level.
const LEVEL_ORDER: Record<string, number> = {
  AAA: 1, AA: 2, 'A+': 3, A: 4, 'A-': 5, Rk: 6, CPX: 7, DSL: 8, FCL: 9,
}

// How much credit a given z-score earns at each level. Dominating the DSL as a
// 17-year-old is real but far weaker evidence than the same line at AAA.
const LEVEL_WEIGHT: Record<string, number> = {
  AAA: 1.0, AA: 0.95, 'A+': 0.80, A: 0.70, 'A-': 0.60, Rk: 0.45, CPX: 0.45, DSL: 0.35, FCL: 0.45,
}
const DEFAULT_LEVEL_WEIGHT = 0.5

// Sample-size shrinkage: a z-score from 40 PA is mostly noise, so it is pulled
// toward the level average. perf *= n / (n + K). At K=150 PA a full season
// (~500 PA) retains 77% of its signal and a 50-PA cameo retains 25%.
const PA_SHRINK = 150
const IP_SHRINK = 40

// Metric weights within the *production* half of perf; each set sums to 1.
const BATTER_METRIC_WEIGHTS = { wrcPlus: 0.60, bbk: 0.40 }
const PITCHER_METRIC_WEIGHTS = { kMinusBb: 0.55, xfip: 0.30, whip: 0.15 }

// How perf splits between what the player did and how young he did it for.
// Production is sample-shrunk; age is not, since a 19-year-old in AA is 19
// regardless of how many plate appearances he has taken.
const PRODUCTION_SHARE = 0.72
const AGE_SHARE = 0.28

// Being young for the level is a top-end signal, but the tail gets noisy — a
// 16-year-old listed at a full-season level is usually a data error, not a
// phenom. Cap the contribution either way.
const MAX_AGE_Z = 3

// Age is asymmetric in prospect evaluation and a plain z-score misses it. Being
// old for the level is a much stronger negative than being equivalently young is
// a positive: a 27-year-old raking in AAA is org depth padding a stat line
// against younger competition, not a prospect, and without this he outranks real
// teenagers on production alone. Applied only to the old-for-level side.
const OLD_FOR_LEVEL_PENALTY = 1.8

// A level needs this many players before its own baseline is trusted; below it
// the pooled all-levels baseline is used instead.
const MIN_LEVEL_SAMPLE = 15

// Scouting sources, by how much they move the expert component.
const EXPERT_SOURCE_WEIGHTS = { fv: 1.0, mlbPipeline: 0.9, klaw: 0.9, hkb: 0.7 }

// Floor for a player who *is* in the HKB universe but ranked very deep. Being
// listed at all should never score below being unlisted, and without a floor
// the exponential decay sends #1600 to ~2, which would make coverage itself a
// penalty.
const HKB_FLOOR = 10

const FV_SCORE: Record<number, number> = {
  80: 100, 75: 100, 70: 100, 65: 95, 60: 88, 55: 78, 50: 66, 45: 50, 40: 35, 35: 25,
}

const ETA_SCORE: Record<number, number> = {
  2026: 100, 2027: 88, 2028: 72, 2029: 54, 2030: 38,
}
const ETA_SCORE_FLOOR = 25

// Used when no source lists an ETA: assume roughly one level per year from the
// player's current level.
const LEVEL_IMPLIED_ETA: Record<string, number> = {
  AAA: 2027, AA: 2028, 'A+': 2029, A: 2030, 'A-': 2030, Rk: 2031, CPX: 2031, DSL: 2031, FCL: 2031,
}
const DEFAULT_IMPLIED_ETA = 2031

export function topLevel(level: string): string {
  const parts = level.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  return parts.reduce((best, lv) => ((LEVEL_ORDER[lv] ?? 99) < (LEVEL_ORDER[best] ?? 99) ? lv : best))
}

/** Expert-ranking inputs, joined onto a prospect by the caller. */
export interface ExpertInputs {
  fvGrade: number | null
  mlbRank: number | null
  klawRank: number | null
  hkbRank: number | null
  eta: number | null
}

export interface ProspectScore {
  score: number
  perf: number
  /** Years younger than the level average; negative = old for the level. */
  ageVsLevel: number
  /** null when no scouting source covers the player; weight is redistributed. */
  expert: number | null
  etaScore: number
  /** ETA actually used — inferred from level when no source lists one. */
  etaUsed: number
  etaInferred: boolean
  /** Covered by no scouting source; scored on performance and ETA alone. */
  unranked: boolean
  /** Fraction of the raw z-score retained after sample-size shrinkage. */
  reliability: number
}

interface Baseline { mean: number; sd: number }

// Standard normal CDF (Abramowitz & Stegun 7.1.26 via tanh approximation),
// used to turn a z-score into a 0-100 percentile.
function zToPercentile(z: number): number {
  const cdf = 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z ** 3)))
  return clamp(cdf * 100, 0, 100)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function baselineOf(values: number[]): Baseline {
  if (values.length === 0) return { mean: 0, sd: 1 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  // A degenerate spread would make every z infinite; fall back to no signal.
  return { mean, sd: Math.sqrt(variance) || 1 }
}

/**
 * Per-level mean/sd for one metric, with a pooled fallback for thin levels.
 * Non-finite values (FanGraphs emits them for zero-denominator rate stats) are
 * dropped so one 0-IP line cannot poison a level's baseline.
 */
function levelBaselines<T>(
  rows: T[],
  levelOf: (r: T) => string,
  valueOf: (r: T) => number,
): { byLevel: Map<string, Baseline>; pooled: Baseline } {
  const grouped = new Map<string, number[]>()
  const all: number[] = []
  for (const r of rows) {
    const v = valueOf(r)
    if (!Number.isFinite(v)) continue
    const lv = levelOf(r)
    if (!grouped.has(lv)) grouped.set(lv, [])
    grouped.get(lv)!.push(v)
    all.push(v)
  }
  const pooled = baselineOf(all)
  const byLevel = new Map<string, Baseline>()
  for (const [lv, vals] of grouped) {
    byLevel.set(lv, vals.length >= MIN_LEVEL_SAMPLE ? baselineOf(vals) : pooled)
  }
  return { byLevel, pooled }
}

function zOf(value: number, lv: string, b: { byLevel: Map<string, Baseline>; pooled: Baseline }): number {
  if (!Number.isFinite(value)) return 0
  const { mean, sd } = b.byLevel.get(lv) ?? b.pooled
  return (value - mean) / sd
}

/** Batter BB/K, guarding the zero-strikeout case. */
function bbkOf(p: FGMinorsBatter): number {
  return p.kPct > 0 ? p.bbPct / p.kPct : NaN
}

/** Returns null when no source covers the player — the caller drops the component. */
function expertScore(e: ExpertInputs): number | null {
  const parts: Array<{ score: number; weight: number }> = []

  if (e.fvGrade != null) {
    // Round to the nearest half-grade the FV scale actually uses.
    const rounded = Math.round(e.fvGrade / 5) * 5
    parts.push({ score: FV_SCORE[rounded] ?? (e.fvGrade >= 70 ? 100 : 25), weight: EXPERT_SOURCE_WEIGHTS.fv })
  }
  // Top-100 lists: #1 → 100, #100 → ~50. Being listed at all is most of the signal.
  if (e.mlbRank != null) {
    parts.push({ score: clamp(100 - (e.mlbRank - 1) * 0.5, 50, 100), weight: EXPERT_SOURCE_WEIGHTS.mlbPipeline })
  }
  if (e.klawRank != null) {
    parts.push({ score: clamp(100 - (e.klawRank - 1) * 0.5, 50, 100), weight: EXPERT_SOURCE_WEIGHTS.klaw })
  }
  // HKB ranks the whole dynasty universe (~1700 deep), so it decays much faster
  // than a top-100 list: #1 → 100, #100 → 78, #400 → 37, #1000 → 8.
  if (e.hkbRank != null) {
    parts.push({ score: clamp(100 * Math.exp(-e.hkbRank / 400), HKB_FLOOR, 100), weight: EXPERT_SOURCE_WEIGHTS.hkb })
  }

  if (parts.length === 0) return null
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0)
  return parts.reduce((a, p) => a + p.score * p.weight, 0) / totalWeight
}

function etaComponent(eta: number | null, level: string): { score: number; used: number; inferred: boolean } {
  const inferred = eta == null
  const used = eta ?? LEVEL_IMPLIED_ETA[level] ?? DEFAULT_IMPLIED_ETA
  return { score: ETA_SCORE[used] ?? ETA_SCORE_FLOOR, used, inferred }
}

/**
 * Combine sample-shrunk production with age-for-level into a single perf
 * percentile. `ageZ` is already oriented so that positive = young for the level.
 */
function perfPercentile(productionZ: number, reliability: number, ageZ: number, levelWeight: number): number {
  const weightedAge = ageZ < 0 ? ageZ * OLD_FOR_LEVEL_PENALTY : ageZ
  const z = (productionZ * PRODUCTION_SHARE * reliability + weightedAge * AGE_SHARE) * levelWeight
  return zToPercentile(z)
}

/**
 * Weighted blend over the components that exist. When scouting is absent the
 * expert weight is redistributed across perf and ETA rather than filled with a
 * penalty value, so an unranked player is judged on what we can actually
 * observe and stays reachable to the top of the board.
 */
function blend(perf: number, expert: number | null, eta: number): number {
  const parts: Array<[number, number]> = [
    [perf, COMPONENT_WEIGHTS.perf],
    [eta, COMPONENT_WEIGHTS.eta],
  ]
  if (expert != null) parts.push([expert, COMPONENT_WEIGHTS.expert])
  const totalWeight = parts.reduce((a, [, w]) => a + w, 0)
  return parts.reduce((a, [v, w]) => a + v * w, 0) / totalWeight
}

/**
 * Score every batter. Baselines come from `batters` itself, so pass the full
 * (unfiltered) population — scoring a filtered subset would re-center the
 * league average on that subset.
 */
export function scoreBatters(
  batters: FGMinorsBatter[],
  expertOf: (p: FGMinorsBatter) => ExpertInputs,
): Map<string, ProspectScore> {
  const lvOf = (p: FGMinorsBatter) => topLevel(p.level)
  const wrcBase = levelBaselines(batters, lvOf, p => p.wrcPlus)
  const bbkBase = levelBaselines(batters, lvOf, bbkOf)
  const ageBase = levelBaselines(batters, lvOf, p => p.age)

  const out = new Map<string, ProspectScore>()
  for (const p of batters) {
    const lv = lvOf(p)
    const productionZ =
      zOf(p.wrcPlus, lv, wrcBase) * BATTER_METRIC_WEIGHTS.wrcPlus +
      zOf(bbkOf(p), lv, bbkBase) * BATTER_METRIC_WEIGHTS.bbk

    // Negated: a below-average age is a *positive* signal.
    const ageZ = clamp(-zOf(p.age, lv, ageBase), -MAX_AGE_Z, MAX_AGE_Z)
    const reliability = p.pa / (p.pa + PA_SHRINK)
    const perf = perfPercentile(productionZ, reliability, ageZ, LEVEL_WEIGHT[lv] ?? DEFAULT_LEVEL_WEIGHT)

    const e = expertOf(p)
    const expert = expertScore(e)
    const { score: etaScore, used: etaUsed, inferred: etaInferred } = etaComponent(e.eta, lv)

    out.set(p.playerId, {
      score: blend(perf, expert, etaScore),
      perf,
      ageVsLevel: (ageBase.byLevel.get(lv) ?? ageBase.pooled).mean - p.age,
      expert, etaScore, etaUsed, etaInferred, unranked: expert == null, reliability,
    })
  }
  return out
}

/** Score every pitcher. Same contract as scoreBatters — pass the full population. */
export function scorePitchers(
  pitchers: FGMinorsPitcher[],
  expertOf: (p: FGMinorsPitcher) => ExpertInputs,
): Map<string, ProspectScore> {
  const lvOf = (p: FGMinorsPitcher) => topLevel(p.level)
  const kbbBase = levelBaselines(pitchers, lvOf, p => p.kMinusBbPct)
  const xfipBase = levelBaselines(pitchers, lvOf, p => p.xfip)
  const whipBase = levelBaselines(pitchers, lvOf, p => p.whip)
  const ageBase = levelBaselines(pitchers, lvOf, p => p.age)

  const out = new Map<string, ProspectScore>()
  for (const p of pitchers) {
    const lv = lvOf(p)
    // xFIP and WHIP are negated: lower is better, and z must point the same way
    // for every metric before they can be summed.
    const productionZ =
      zOf(p.kMinusBbPct, lv, kbbBase) * PITCHER_METRIC_WEIGHTS.kMinusBb -
      zOf(p.xfip, lv, xfipBase) * PITCHER_METRIC_WEIGHTS.xfip -
      zOf(p.whip, lv, whipBase) * PITCHER_METRIC_WEIGHTS.whip

    const ageZ = clamp(-zOf(p.age, lv, ageBase), -MAX_AGE_Z, MAX_AGE_Z)
    const reliability = p.ip / (p.ip + IP_SHRINK)
    const perf = perfPercentile(productionZ, reliability, ageZ, LEVEL_WEIGHT[lv] ?? DEFAULT_LEVEL_WEIGHT)

    const e = expertOf(p)
    const expert = expertScore(e)
    const { score: etaScore, used: etaUsed, inferred: etaInferred } = etaComponent(e.eta, lv)

    out.set(p.playerId, {
      score: blend(perf, expert, etaScore),
      perf,
      ageVsLevel: (ageBase.byLevel.get(lv) ?? ageBase.pooled).mean - p.age,
      expert, etaScore, etaUsed, etaInferred, unranked: expert == null, reliability,
    })
  }
  return out
}
