// Rest-of-season roto category math for the 12/14-team league.
// Categories (constitution Section 3): 7 batting + 7 pitching = 14.

import type { ZipsProjection } from '@/types'

export interface LeagueCategory {
  key: CatKey
  label: string
  group: 'bat' | 'pit'
  lowerBetter: boolean
  decimals: number
}

export const LEAGUE_CATEGORIES: LeagueCategory[] = [
  { key: 'r',   label: 'R',    group: 'bat', lowerBetter: false, decimals: 0 },
  { key: 'hr',  label: 'HR',   group: 'bat', lowerBetter: false, decimals: 0 },
  { key: 'rbi', label: 'RBI',  group: 'bat', lowerBetter: false, decimals: 0 },
  { key: 'sb',  label: 'SB',   group: 'bat', lowerBetter: false, decimals: 0 },
  { key: 'avg', label: 'AVG',  group: 'bat', lowerBetter: false, decimals: 3 },
  { key: 'obp', label: 'OBP',  group: 'bat', lowerBetter: false, decimals: 3 },
  { key: 'slg', label: 'SLG',  group: 'bat', lowerBetter: false, decimals: 3 },
  { key: 'k',   label: 'K',    group: 'pit', lowerBetter: false, decimals: 0 },
  { key: 'qs',  label: 'QS',   group: 'pit', lowerBetter: false, decimals: 0 },
  { key: 'sv',  label: 'SV',   group: 'pit', lowerBetter: false, decimals: 0 },
  { key: 'hld', label: 'HLD',  group: 'pit', lowerBetter: false, decimals: 0 },
  { key: 'era', label: 'ERA',  group: 'pit', lowerBetter: true,  decimals: 2 },
  { key: 'bb9', label: 'BB/9', group: 'pit', lowerBetter: true,  decimals: 2 },
  { key: 'hip', label: 'H/IP', group: 'pit', lowerBetter: true,  decimals: 2 },
]

export type PitcherRole = 'SP' | 'RP'

// Classify a pitcher's rest-of-season role from the projection itself, not from
// (often stale) Fantrax SP/RP eligibility. Hybrid GS + IP:
//  - mostly starts (GS ≥ half of G) → SP
//  - mostly relief with saves/holds → RP
//  - otherwise lean on QS, then fall back to an IP cutoff
export function classifyPitcherRole(p: ZipsProjection): PitcherRole {
  const g = p.g ?? 0
  const gs = p.gs ?? 0
  const sv = p.sv ?? 0
  const hld = p.hld ?? 0
  const qs = p.qs ?? 0
  const ip = p.ip ?? 0
  if (g > 0) {
    const startShare = gs / g
    if (startShare >= 0.5) return 'SP'
    if (startShare <= 0.2 && sv + hld > 0) return 'RP'
  }
  if (qs >= 3) return 'SP'
  if (sv + hld > 0) return 'RP'
  return ip >= 40 ? 'SP' : 'RP'
}

export type CatKey =
  | 'r' | 'hr' | 'rbi' | 'sb' | 'avg' | 'obp' | 'slg'
  | 'k' | 'qs' | 'sv' | 'hld' | 'era' | 'bb9' | 'hip'

// Raw accumulators — kept so rate stats can be re-weighted after a swap
// without rebuilding the whole lineup.
export interface CatRaw {
  // batting counting
  r: number; hr: number; rbi: number; sb: number
  // batting rate components
  ab: number; hits: number; tb: number; obNum: number; obDen: number
  // pitching counting
  k: number; qs: number; sv: number; hld: number
  // pitching rate components
  ip: number; er: number; bbP: number; hA: number
}

// Finalized, displayable category line
export type CatTotals = Record<CatKey, number>

export function emptyRaw(): CatRaw {
  return {
    r: 0, hr: 0, rbi: 0, sb: 0,
    ab: 0, hits: 0, tb: 0, obNum: 0, obDen: 0,
    k: 0, qs: 0, sv: 0, hld: 0,
    ip: 0, er: 0, bbP: 0, hA: 0,
  }
}

// Raw contribution of a single projection (batter or pitcher)
export function rawOf(p: ZipsProjection): CatRaw {
  const raw = emptyRaw()
  if (p.type === 'batter') {
    raw.r = p.r ?? 0
    raw.hr = p.hr ?? 0
    raw.rbi = p.rbi ?? 0
    raw.sb = p.sb ?? 0
    const ab = p.ab ?? 0
    const h = p.h ?? 0
    const bb = p.bb ?? 0
    const hbp = p.hbp ?? 0
    const sf = p.sf ?? 0
    const singles = p.singles ?? 0
    const doubles = p.doubles ?? 0
    const triples = p.triples ?? 0
    const hr = p.hr ?? 0
    raw.ab = ab
    raw.hits = h
    raw.tb = singles + 2 * doubles + 3 * triples + 4 * hr
    raw.obNum = h + bb + hbp
    raw.obDen = ab + bb + hbp + sf
  } else {
    raw.k = p.k ?? 0
    raw.qs = p.qs ?? 0
    raw.sv = p.sv ?? 0
    raw.hld = p.hld ?? 0
    raw.ip = p.ip ?? 0
    raw.er = p.er ?? 0
    raw.bbP = p.bbPitching ?? 0
    raw.hA = p.hAllowed ?? 0
  }
  return raw
}

export function addRaw(a: CatRaw, b: CatRaw): CatRaw {
  return {
    r: a.r + b.r, hr: a.hr + b.hr, rbi: a.rbi + b.rbi, sb: a.sb + b.sb,
    ab: a.ab + b.ab, hits: a.hits + b.hits, tb: a.tb + b.tb, obNum: a.obNum + b.obNum, obDen: a.obDen + b.obDen,
    k: a.k + b.k, qs: a.qs + b.qs, sv: a.sv + b.sv, hld: a.hld + b.hld,
    ip: a.ip + b.ip, er: a.er + b.er, bbP: a.bbP + b.bbP, hA: a.hA + b.hA,
  }
}

export function subRaw(a: CatRaw, b: CatRaw): CatRaw {
  return {
    r: a.r - b.r, hr: a.hr - b.hr, rbi: a.rbi - b.rbi, sb: a.sb - b.sb,
    ab: a.ab - b.ab, hits: a.hits - b.hits, tb: a.tb - b.tb, obNum: a.obNum - b.obNum, obDen: a.obDen - b.obDen,
    k: a.k - b.k, qs: a.qs - b.qs, sv: a.sv - b.sv, hld: a.hld - b.hld,
    ip: a.ip - b.ip, er: a.er - b.er, bbP: a.bbP - b.bbP, hA: a.hA - b.hA,
  }
}

export function aggregateRaw(projs: ZipsProjection[]): CatRaw {
  return projs.reduce((acc, p) => addRaw(acc, rawOf(p)), emptyRaw())
}

// Convert raw accumulators into the 14 displayable category values
export function finalize(raw: CatRaw): CatTotals {
  return {
    r: raw.r, hr: raw.hr, rbi: raw.rbi, sb: raw.sb,
    avg: raw.ab > 0 ? raw.hits / raw.ab : 0,
    obp: raw.obDen > 0 ? raw.obNum / raw.obDen : 0,
    slg: raw.ab > 0 ? raw.tb / raw.ab : 0,
    k: raw.k, qs: raw.qs, sv: raw.sv, hld: raw.hld,
    era: raw.ip > 0 ? (9 * raw.er) / raw.ip : 0,
    bb9: raw.ip > 0 ? (9 * raw.bbP) / raw.ip : 0,
    hip: raw.ip > 0 ? raw.hA / raw.ip : 0,
  }
}

export function aggregateCategories(projs: ZipsProjection[]): CatTotals {
  return finalize(aggregateRaw(projs))
}

// A fixed "field" of opponent category values, used to score one team's roto
// points without re-ranking the whole league each time.
export interface PointsField {
  othersByCat: Record<CatKey, number[]>
  n: number // total teams in the league (others + 1)
}

export function buildField(othersTotals: CatTotals[]): PointsField {
  const othersByCat = {} as Record<CatKey, number[]>
  for (const cat of LEAGUE_CATEGORIES) {
    othersByCat[cat.key] = othersTotals.map(t => t[cat.key])
  }
  return { othersByCat, n: othersTotals.length + 1 }
}

// Total roto points for a team with `totals`, scored against a fixed field.
// Rate stats of 0 are treated as worst.
export function rotoPointsVsField(totals: CatTotals, field: PointsField): number {
  let pts = 0
  for (const cat of LEAGUE_CATEGORIES) {
    const v = totals[cat.key]
    let better = 0
    for (const ov of field.othersByCat[cat.key]) {
      if (cat.lowerBetter) {
        const a = v === 0 ? Number.POSITIVE_INFINITY : v
        const b = ov === 0 ? Number.POSITIVE_INFINITY : ov
        if (b < a) better++
      } else if (ov > v) {
        better++
      }
    }
    pts += field.n - better // points = n - rank + 1, rank = better + 1
  }
  return pts
}

// Rank (1 = best) and points for a single category value vs the field.
export function rankInField(catKey: CatKey, v: number, field: PointsField): { rank: number; points: number } {
  const cat = LEAGUE_CATEGORIES.find(c => c.key === catKey)!
  let better = 0
  for (const ov of field.othersByCat[catKey]) {
    if (cat.lowerBetter) {
      const a = v === 0 ? Number.POSITIVE_INFINITY : v
      const b = ov === 0 ? Number.POSITIVE_INFINITY : ov
      if (b < a) better++
    } else if (ov > v) {
      better++
    }
  }
  return { rank: better + 1, points: field.n - better }
}

export interface FranchiseRank {
  ranks: Record<CatKey, number>   // 1 = best
  points: Record<CatKey, number>  // roto points: N for 1st … 1 for last
  total: number                   // sum of points across all 14 categories
}

// Rank every franchise in every category. A franchise with no IP/AB in a
// category (rate = 0) is treated as worst for that category.
export function rankFranchises(
  byFranchise: Record<string, CatTotals>
): Record<string, FranchiseRank> {
  const codes = Object.keys(byFranchise)
  const n = codes.length
  const out: Record<string, FranchiseRank> = {}
  for (const c of codes) {
    out[c] = { ranks: {} as Record<CatKey, number>, points: {} as Record<CatKey, number>, total: 0 }
  }

  for (const cat of LEAGUE_CATEGORIES) {
    // Rate stats of 0 mean "no contribution" → always worst, regardless of lowerBetter
    const valOf = (c: string) => {
      const v = byFranchise[c][cat.key]
      if (cat.lowerBetter && v === 0) return Number.POSITIVE_INFINITY
      return v
    }
    const sorted = [...codes].sort((a, b) =>
      cat.lowerBetter ? valOf(a) - valOf(b) : valOf(b) - valOf(a)
    )
    sorted.forEach((c, i) => {
      const rank = i + 1
      out[c].ranks[cat.key] = rank
      out[c].points[cat.key] = n - i // 1st → n points, last → 1
    })
  }

  for (const c of codes) {
    out[c].total = LEAGUE_CATEGORIES.reduce((s, cat) => s + out[c].points[cat.key], 0)
  }
  return out
}
