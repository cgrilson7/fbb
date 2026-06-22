// Roto-points-maximizing lineup optimizer.
//
// The 10 pitcher slots are interchangeable and hitter slots are position-
// constrained, so "best lineup" for a CATEGORY league is not the same as
// "highest total FPTS" — you must hold relievers for SV/HLD and may start a
// high-SB/AVG hitter over a slightly-higher-FPTS masher. This does a hill-climb
// from an FPTS-best seed, accepting any single swap that raises the team's roto
// points against a fixed opponent field.

import type { ZipsProjection } from '@/types'
import {
  ALL_START_SLOTS,
  isEligibleForSlot,
  isPitcherSlot,
  getBasePositions,
  type LineupPlayer,
  findOptimalLineup,
} from './lineup'
import {
  type CatRaw,
  type PointsField,
  emptyRaw,
  addRaw,
  subRaw,
  rawOf,
  finalize,
  rotoPointsVsField,
} from './categories'

export interface RosterEntry {
  name: string
  isPitcher: boolean
  basePositions: string[]
  isFarm: boolean
  fpts: number
  proj: ZipsProjection
  raw: CatRaw
}

export type SlotAssignment = Record<string, RosterEntry | null>

// Build optimizer roster entries from a franchise's players (those with a ROS
// projection). Farm players are kept (the seed/optimizer exclude them unless
// locked, matching findOptimalLineup).
export function buildRosterEntries(
  players: { name: string; position: string; hkbLevel: string | null; zipsRosProjection: ZipsProjection | null }[]
): RosterEntry[] {
  const out: RosterEntry[] = []
  for (const p of players) {
    const proj = p.zipsRosProjection
    if (!proj) continue
    const positions = p.position.split(',').map(s => s.trim())
    const isPitcher = positions.includes('SP') || positions.includes('RP')
    out.push({
      name: p.name,
      isPitcher,
      basePositions: getBasePositions(p.position),
      isFarm: p.hkbLevel !== null && p.hkbLevel !== 'MLB',
      fpts: proj.fpts,
      proj,
      raw: rawOf(proj),
    })
  }
  return out
}

function toLineupPlayer(r: RosterEntry): LineupPlayer {
  return {
    name: r.name,
    value: r.fpts,
    isFarm: r.isFarm,
    basePositions: r.basePositions,
    isPitcher: r.isPitcher,
    pitcherType: null,
  }
}

export function assignmentRaw(assign: SlotAssignment): CatRaw {
  let raw = emptyRaw()
  for (const slot of ALL_START_SLOTS) {
    const e = assign[slot]
    if (e) raw = addRaw(raw, e.raw)
  }
  return raw
}

export function assignmentStarters(assign: SlotAssignment): RosterEntry[] {
  return ALL_START_SLOTS.map(s => assign[s]).filter((e): e is RosterEntry => e !== null)
}

// Optimize a franchise's lineup for roto points against a fixed field.
export function optimizeRotoLineup(
  roster: RosterEntry[],
  locks: Record<string, string>,
  field: PointsField
): SlotAssignment {
  const byName = new Map(roster.map(r => [r.name, r]))

  // Seed with the FPTS-best valid lineup (handles position matching + locks)
  const seed = findOptimalLineup(roster.map(toLineupPlayer), locks)
  const assign: SlotAssignment = {}
  for (const slot of ALL_START_SLOTS) {
    const occ = seed[slot]
    assign[slot] = occ ? byName.get(occ.name) ?? null : null
  }

  const lockedSlotsSet = new Set(Object.keys(locks).filter(s => (ALL_START_SLOTS as readonly string[]).includes(s)))
  const starterNames = new Set(assignmentStarters(assign).map(e => e.name))

  let raw = assignmentRaw(assign)
  let curPts = rotoPointsVsField(finalize(raw), field)

  // Evaluate the roto points if `outEntry` (or nothing) in `slot` is replaced by `inEntry`
  const pointsAfter = (outEntry: RosterEntry | null, inEntry: RosterEntry): number => {
    const removed = outEntry ? outEntry.raw : emptyRaw()
    const next = addRaw(subRaw(raw, removed), inEntry.raw)
    return rotoPointsVsField(finalize(next), field)
  }

  let guard = 0
  // Hill-climb: repeatedly apply the single best improving swap
  while (guard++ < 200) {
    let best: { slot: string; inEntry: RosterEntry; delta: number } | null = null

    for (const slot of ALL_START_SLOTS) {
      if (lockedSlotsSet.has(slot)) continue
      const cur = assign[slot]
      const pitcherSlot = isPitcherSlot(slot)

      for (const cand of roster) {
        if (cand.isFarm) continue
        if (cand.name === cur?.name) continue
        if (starterNames.has(cand.name)) continue // already starting elsewhere
        // Eligibility
        if (pitcherSlot) {
          if (!cand.isPitcher) continue
        } else {
          if (cand.isPitcher) continue
          if (!isEligibleForSlot(toLineupPlayer(cand), slot)) continue
        }
        const delta = pointsAfter(cur, cand) - curPts
        if (delta > (best?.delta ?? 1e-9)) {
          best = { slot, inEntry: cand, delta }
        }
      }
    }

    if (!best) break
    const out = assign[best.slot]
    if (out) starterNames.delete(out.name)
    assign[best.slot] = best.inEntry
    starterNames.add(best.inEntry.name)
    raw = assignmentRaw(assign)
    curPts = rotoPointsVsField(finalize(raw), field)
  }

  return assign
}
