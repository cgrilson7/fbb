// League-wide ROS rotisserie standings — shared by the waiver and trade pages.
// Each franchise is given its roto-points-optimal lineup; franchises are then
// ranked in all 14 categories to produce roto points.

import type { Player } from '@/types'
import {
  buildRosterEntries,
  optimizeRotoLineup,
  assignmentRaw,
  assignmentStarters,
  type RosterEntry,
  type SlotAssignment,
} from './rotoLineup'
import {
  findOptimalLineup,
  ALL_START_SLOTS,
  type LineupPlayer,
} from './lineup'
import {
  type CatKey,
  type CatRaw,
  type CatTotals,
  emptyRaw,
  addRaw,
  finalize,
  buildField,
  rankFranchises,
} from './categories'

export interface FranchiseStanding {
  franchise: string
  entries: RosterEntry[]
  lineup: SlotAssignment
  raw: CatRaw
  totals: CatTotals
  ranks: Record<CatKey, number>
  points: Record<CatKey, number>
  rotoTotal: number
  rosterValue: number   // sum of every rostered player's ROS FPTS (depth)
  starterValue: number  // sum of the 23 starters' ROS FPTS
  surplus: number       // rosterValue - starterValue (non-starting depth)
  playerCount: number
}

function fptsBestRaw(entries: RosterEntry[]): CatRaw {
  const lp: LineupPlayer[] = entries.map(r => ({ name: r.name, value: r.fpts, isFarm: r.isFarm, basePositions: r.basePositions, isPitcher: r.isPitcher, pitcherType: null }))
  const seed = findOptimalLineup(lp, {})
  const byName = new Map(entries.map(r => [r.name, r]))
  let raw = emptyRaw()
  for (const slot of ALL_START_SLOTS) {
    const occ = seed[slot]
    if (occ) { const e = byName.get(occ.name); if (e) raw = addRaw(raw, e.raw) }
  }
  return raw
}

// Compute standings for the whole league. Pass a roster map keyed by franchise.
// Overriding one or two franchises' rosters (for a trade sim) just means passing
// a map with those entries swapped out.
export function computeStandings(rostersByFr: Map<string, Player[]>): Map<string, FranchiseStanding> {
  const entriesByFr = new Map<string, RosterEntry[]>()
  for (const [fr, ps] of rostersByFr) entriesByFr.set(fr, buildRosterEntries(ps))

  // FPTS-best field everyone optimizes against
  const t0 = new Map<string, CatTotals>()
  for (const [fr, e] of entriesByFr) t0.set(fr, finalize(fptsBestRaw(e)))

  const allFr = [...entriesByFr.keys()]
  const lineups = new Map<string, SlotAssignment>()
  const totalsByFr: Record<string, CatTotals> = {}
  for (const fr of allFr) {
    const field = buildField(allFr.filter(f => f !== fr).map(f => t0.get(f)!))
    const lineup = optimizeRotoLineup(entriesByFr.get(fr)!, {}, field)
    lineups.set(fr, lineup)
    totalsByFr[fr] = finalize(assignmentRaw(lineup))
  }

  const ranked = rankFranchises(totalsByFr)

  const out = new Map<string, FranchiseStanding>()
  for (const fr of allFr) {
    const entries = entriesByFr.get(fr)!
    const lineup = lineups.get(fr)!
    const starters = assignmentStarters(lineup)
    const rosterValue = entries.filter(e => !e.isFarm).reduce((s, e) => s + e.fpts, 0)
    const starterValue = starters.reduce((s, e) => s + e.fpts, 0)
    out.set(fr, {
      franchise: fr,
      entries,
      lineup,
      raw: assignmentRaw(lineup),
      totals: totalsByFr[fr],
      ranks: ranked[fr].ranks,
      points: ranked[fr].points,
      rotoTotal: ranked[fr].total,
      rosterValue,
      starterValue,
      surplus: rosterValue - starterValue,
      playerCount: entries.filter(e => !e.isFarm).length,
    })
  }
  return out
}

// Build the opponent field for one franchise from a standings map (for swap sims).
export function fieldFor(standings: Map<string, FranchiseStanding>, franchise: string) {
  const others = [...standings.values()].filter(s => s.franchise !== franchise).map(s => s.totals)
  return buildField(others)
}
