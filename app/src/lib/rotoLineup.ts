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
  POS_SLOTS,
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
  classifyPitcherRole,
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
    const isPitcher = positions.includes('SP') || positions.includes('RP') || positions.includes('P')
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

export interface PitcherMixResult {
  sp: number
  rp: number
  points: number
  pitchers: RosterEntry[]
}

// Sweep every feasible SP/RP split of the 10 pitcher slots. Hitters are held
// fixed (pass their combined raw); for each mix the pitcher set is seeded with
// the top-FPTS pitchers of each role then hill-climbed with same-role swaps.
export function analyzePitcherMix(
  roster: RosterEntry[],
  hitterRaw: CatRaw,
  field: PointsField
): PitcherMixResult[] {
  const pitchers = roster.filter(e => e.isPitcher && !e.isFarm)
  const sps = pitchers.filter(p => classifyPitcherRole(p.proj) === 'SP').sort((a, b) => b.fpts - a.fpts)
  const rps = pitchers.filter(p => classifyPitcherRole(p.proj) === 'RP').sort((a, b) => b.fpts - a.fpts)

  const out: PitcherMixResult[] = []
  for (let rp = 0; rp <= Math.min(10, rps.length); rp++) {
    const sp = 10 - rp
    if (sp > sps.length) continue
    const chosen: RosterEntry[] = [...sps.slice(0, sp), ...rps.slice(0, rp)]
    let raw = chosen.reduce((a, e) => addRaw(a, e.raw), hitterRaw)
    let pts = rotoPointsVsField(finalize(raw), field)

    let guard = 0
    while (guard++ < 100) {
      let best: { idx: number; cand: RosterEntry; pts: number } | null = null
      const chosenNames = new Set(chosen.map(c => c.name))
      for (let i = 0; i < chosen.length; i++) {
        const pool = classifyPitcherRole(chosen[i].proj) === 'SP' ? sps : rps
        for (const cand of pool) {
          if (chosenNames.has(cand.name)) continue
          const nextPts = rotoPointsVsField(finalize(addRaw(subRaw(raw, chosen[i].raw), cand.raw)), field)
          if (nextPts > (best?.pts ?? pts)) best = { idx: i, cand, pts: nextPts }
        }
      }
      if (!best) break
      raw = addRaw(subRaw(raw, chosen[best.idx].raw), best.cand.raw)
      chosen[best.idx] = best.cand
      pts = best.pts
    }
    out.push({ sp, rp, points: pts, pitchers: chosen })
  }
  return out
}

export interface ReoptResult {
  assign: SlotAssignment
  points: number
}

// Re-optimize a lineup after a small roster change (player added, removed, or
// both), warm-starting from a previously optimal assignment. Two move types
// per hill-climb step:
//  (a) bench player into a slot, benching the occupant
//  (b) a hitter starter slides to another hitter slot he's eligible for
//      (benching that slot's occupant), and the best eligible bench player —
//      or nobody — fills the slot he left
// (b) is the positional chain a single swap can't express: "SS traded away →
// MI-eligible starter slides to SS → bench 2B bat fills MI". Pitcher slots are
// interchangeable, so slides only matter for hitters.
export function reoptimizeLineup(
  roster: RosterEntry[],
  base: SlotAssignment,
  field: PointsField
): ReoptResult {
  const byName = new Map(roster.map(r => [r.name, r]))
  const assign: SlotAssignment = {}
  for (const slot of ALL_START_SLOTS) {
    const occ = base[slot]
    // Drop starters no longer on the roster (the player being traded away)
    assign[slot] = occ ? byName.get(occ.name) ?? null : null
  }
  const starterNames = new Set(assignmentStarters(assign).map(e => e.name))

  let raw = assignmentRaw(assign)
  let pts = rotoPointsVsField(finalize(raw), field)

  // The roto effect of any move is "outE leaves the 23, inE joins" regardless
  // of which slots are involved — slots only gate legality. Cache per pair.
  const evalCache = new Map<string, number>()
  const evalSwap = (outE: RosterEntry | null, inE: RosterEntry | null): number => {
    const key = `${outE?.name ?? ''}|${inE?.name ?? ''}`
    let v = evalCache.get(key)
    if (v === undefined) {
      let next = raw
      if (outE) next = subRaw(next, outE.raw)
      if (inE) next = addRaw(next, inE.raw)
      v = rotoPointsVsField(finalize(next), field)
      evalCache.set(key, v)
    }
    return v
  }

  type Move =
    | { kind: 'swap'; slot: string; inE: RosterEntry; pts: number }
    | { kind: 'slide'; from: string; to: string; fill: RosterEntry | null; pts: number }

  let guard = 0
  while (guard++ < 60) {
    evalCache.clear()
    let best: Move | null = null
    const bench = roster.filter(r => !r.isFarm && !starterNames.has(r.name))

    // (a) bench player into a slot
    for (const slot of ALL_START_SLOTS) {
      const cur = assign[slot]
      const pitcherSlot = isPitcherSlot(slot)
      for (const cand of bench) {
        if (pitcherSlot) {
          if (!cand.isPitcher) continue
        } else {
          if (cand.isPitcher || !isEligibleForSlot(toLineupPlayer(cand), slot)) continue
        }
        const p = evalSwap(cur, cand)
        if (p > (best?.pts ?? pts) + 1e-9) best = { kind: 'swap', slot, inE: cand, pts: p }
      }
    }

    // (b) starter slide + bench fill of the vacated slot
    for (const from of POS_SLOTS) {
      const mover = assign[from]
      if (!mover) continue
      const moverLP = toLineupPlayer(mover)
      for (const to of POS_SLOTS) {
        if (to === from || !isEligibleForSlot(moverLP, to)) continue
        const out = assign[to] // benched by the slide (or empty slot)
        for (const fill of [null, ...bench]) {
          if (fill && (fill.isPitcher || !isEligibleForSlot(toLineupPlayer(fill), from))) continue
          const p = evalSwap(out, fill)
          if (p > (best?.pts ?? pts) + 1e-9) best = { kind: 'slide', from, to, fill, pts: p }
        }
      }
    }

    if (!best) break
    if (best.kind === 'swap') {
      const out = assign[best.slot]
      if (out) starterNames.delete(out.name)
      assign[best.slot] = best.inE
      starterNames.add(best.inE.name)
    } else {
      const mover = assign[best.from]!
      const out = assign[best.to]
      if (out) starterNames.delete(out.name)
      assign[best.to] = mover
      assign[best.from] = best.fill
      if (best.fill) starterNames.add(best.fill.name)
    }
    raw = assignmentRaw(assign)
    pts = best.pts
  }

  return { assign, points: pts }
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
