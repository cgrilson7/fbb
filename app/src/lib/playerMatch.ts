// Name-collision-aware joining between the Fantrax player universe (all.csv)
// and per-player rows from other sources (HKB, salaries, FP/FV rankings).
//
// The old joins were Map<normalizedName, entry>, so any two players sharing a
// name collided: the FA 1B prospect Jared Jones inherited the HKB rank of
// Steve's SP Jared Jones, both rostered Max Muncys got whichever HKB row was
// parsed last, etc. Here each source row is assigned to at most ONE player —
// the best fit by role (pitcher/batter), team, and age — and players that
// lose the assignment get no match instead of a wrong one.

import { ownerNameToCode } from './franchises'
import type { SalaryEntry } from '@/types'

/** Minimal view of an all.csv player needed for matching. */
export interface MatchablePlayer {
  id: string
  normalizedName: string // after user name-mappings are applied
  team: string
  position: string
  age: number | null
  status: string
}

export interface EntryTraits {
  team?: string
  positions?: string
  age?: number | null
}

// Team abbreviations differ across sources (HKB uses AZ/CWS, Fantrax ARI/CHW)
const TEAM_ALIASES: Record<string, string> = {
  AZ: 'ARI',
  CWS: 'CHW',
  WAS: 'WSH',
  SFG: 'SF',
  SDP: 'SD',
  TBR: 'TB',
  KCR: 'KC',
  OAK: 'ATH',
}

export function canonTeam(team: string | undefined | null): string {
  const t = (team || '').toUpperCase().trim()
  if (!t || t === 'FA' || t === '(N/A)' || t === 'N/A') return ''
  return TEAM_ALIASES[t] || t
}

const PITCHER_TOKENS = new Set(['P', 'SP', 'RP'])

function posTokens(positions: string): string[] {
  // strip FantasyPros positional-rank suffixes ("SP3", "DH1")
  return positions
    .split(/[,/]/)
    .map(s => s.trim().toUpperCase().replace(/\d+$/, ''))
    .filter(Boolean)
}

export function hasPitcherRole(positions: string): boolean {
  return posTokens(positions).some(t => PITCHER_TOKENS.has(t))
}

export function hasBatterRole(positions: string): boolean {
  // UT/UTIL and any fielding/DH slot count as batter
  return posTokens(positions).some(t => !PITCHER_TOKENS.has(t))
}

/** Score how well an entry fits a player. Negative = disqualified. */
function scorePair(p: MatchablePlayer, t: EntryTraits): number {
  let score = 0
  if (t.positions) {
    const roleOverlap =
      (hasPitcherRole(p.position) && hasPitcherRole(t.positions)) ||
      (hasBatterRole(p.position) && hasBatterRole(t.positions))
    if (!roleOverlap) return -1
    score += 4
  }
  const pTeam = canonTeam(p.team)
  const eTeam = canonTeam(t.team)
  if (pTeam && eTeam && pTeam === eTeam) score += 4
  if (p.age != null && t.age != null) {
    score += Math.max(0, 2 - Math.abs(p.age - Math.floor(t.age)))
  }
  // On otherwise-equal fits, the rostered copy is the one the entry refers to
  if (p.status !== 'FA') score += 0.5
  return score
}

/**
 * Assign entries to players by normalized name, at most one entry per player
 * and one player per entry. Unambiguous names (one player, one entry) match
 * directly, preserving old behavior; ambiguous names are resolved greedily by
 * role/team/age score, and role conflicts never match.
 */
export function assignEntries<T extends { normalizedName: string }>(
  players: MatchablePlayer[],
  entries: T[],
  traits: (e: T) => EntryTraits,
): Map<string, T> {
  const playersByName = new Map<string, MatchablePlayer[]>()
  for (const p of players) {
    const list = playersByName.get(p.normalizedName)
    if (list) list.push(p)
    else playersByName.set(p.normalizedName, [p])
  }

  const entriesByName = new Map<string, T[]>()
  for (const e of entries) {
    const list = entriesByName.get(e.normalizedName)
    if (list) list.push(e)
    else entriesByName.set(e.normalizedName, [e])
  }

  const result = new Map<string, T>()
  for (const [name, es] of entriesByName) {
    const ps = playersByName.get(name)
    if (!ps) continue
    if (ps.length === 1 && es.length === 1) {
      result.set(ps[0].id, es[0])
      continue
    }
    // Greedy best-score pairing
    const pairs: { p: MatchablePlayer; e: T; score: number }[] = []
    for (const p of ps) {
      for (const e of es) {
        const score = scorePair(p, traits(e))
        if (score >= 0) pairs.push({ p, e, score })
      }
    }
    pairs.sort((a, b) => b.score - a.score)
    const usedPlayers = new Set<string>()
    const usedEntries = new Set<T>()
    for (const { p, e } of pairs) {
      if (usedPlayers.has(p.id) || usedEntries.has(e)) continue
      usedPlayers.add(p.id)
      usedEntries.add(e)
      result.set(p.id, e)
    }
  }
  return result
}

/**
 * Assign salary contracts to players. Contracts carry a franchise owner, so
 * the owner's status code is the primary disambiguator; but contracts follow
 * players through trades while salaries.csv can lag, so a name-unique
 * contract still matches its sole player even when franchises disagree.
 * Dropped contracts (dead cap rows) never attach.
 */
export function assignSalaries(
  players: MatchablePlayer[],
  salaries: SalaryEntry[],
): Map<string, SalaryEntry> {
  const playersByName = new Map<string, MatchablePlayer[]>()
  for (const p of players) {
    const list = playersByName.get(p.normalizedName)
    if (list) list.push(p)
    else playersByName.set(p.normalizedName, [p])
  }

  const result = new Map<string, SalaryEntry>()
  const claimed = new Set<string>()
  for (const s of salaries) {
    if (s.dropDate) continue
    const ps = (playersByName.get(s.normalizedName) || []).filter(p => !claimed.has(p.id))
    if (ps.length === 0) continue
    const ownerCode = ownerNameToCode(s.franchise)
    // 1) exact owner match, 2) any rostered copy (trade lag), 3) sole copy
    const match =
      ps.find(p => ownerCode !== null && p.status === ownerCode) ??
      ps.find(p => p.status !== 'FA') ??
      (ps.length === 1 ? ps[0] : undefined)
    if (match) {
      result.set(match.id, s)
      claimed.add(match.id)
    }
  }
  return result
}
