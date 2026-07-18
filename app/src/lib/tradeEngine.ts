// Deadline deal-sheet engine.
//
// For every other franchise, computed entirely from data:
//  - sends: our tradeable players (expiring 2026 deals + aging 2027-28 vets),
//    ranked by the roto-point gain of re-optimizing THEIR lineup with the
//    player added — full positional math: the displaced starter can slide to
//    another eligible slot with a bench fill behind him, so a send's value
//    reflects their actual positional need, not just the head-to-head slot
//  - asks: their controlled dynasty assets (non-expiring, HKB-ranked young MLB
//    players and farm prospects), with the roto points it costs THEM now to
//    give each one up (lineup re-optimized without the player)
//  - holes: lineup slots where their roto-optimal starter projects well below
//    the league-median starter at that slot, plus SP/RP category gaps
//  - suggestion: the highest-HKB ask whose cost to them is covered by a small
//    package of our sends — verified with a single JOINT re-optimization per
//    side (all sends in, ask out), so overlapping positions don't double-count
//
// Every delta is "new optimal lineup vs baseline" under the same move set
// (reoptimizeLineup) and the same fixed opponent field, so numbers are
// apples-to-apples. Baselines are polished with that move set first so a
// candidate's delta never includes latent improvements unrelated to him.

import type { Player } from '@/types'
import { isExpiring } from './contracts'
import { computeStandings, fieldFor, type FranchiseStanding } from './rotoStandings'
import { POS_SLOTS, ALL_START_SLOTS, getBasePositions, isPitcherPos } from './lineup'
import { rawOf, type PointsField } from './categories'
import { reoptimizeLineup, type RosterEntry, type SlotAssignment } from './rotoLineup'

export interface TeamState {
  franchise: string // displayName
  standing: FranchiseStanding
  field: PointsField
  lineup: SlotAssignment // baseline lineup, polished under `field` with the trade-eval move set
  basePoints: number
}

export interface SendCandidate {
  player: Player
  deltaToThem: number // roto points their re-optimized lineup gains with this player added
  startsAt: string | null // slot he occupies in their new optimal lineup (null = doesn't start)
  replaces: string | null // the starter who drops out of their 23 (after slides settle)
  ourCost: number // roto points our re-optimized lineup loses without him
}

export interface AskCandidate {
  player: Player
  isFarm: boolean
  costToThem: number // roto points their re-optimized lineup loses giving this player up
  replacement: string | null // who enters their 23 to cover (after slides settle)
  ourGain: number // roto points our re-optimized lineup gains if added (0 for farm / no proj)
}

export interface DealSuggestion {
  sends: SendCandidate[]
  ask: AskCandidate
  buyerNet: number // their roto delta, one joint re-opt: sends in, ask out
  ourRotoDelta: number // our roto delta, one joint re-opt: ask in, sends out
  hkbNet: number // HKB value in minus HKB value out (expiring sends count 0 out)
}

export interface LineupHole {
  slot: string
  detail: string
}

export interface DealSheet {
  franchise: string // displayName
  rosRotoTotal: number
  rosRotoRank: number
  holes: LineupHole[]
  sends: SendCandidate[]
  asks: AskCandidate[]
  suggestion: DealSuggestion | null
}

// RosterEntry for a player joining a team he isn't on (a send into their
// roster, an ask into ours).
function entryOf(p: Player): RosterEntry | null {
  const proj = p.zipsRosProjection
  if (!proj) return null
  return {
    name: p.name,
    isPitcher: isPitcherPos(p.position),
    basePositions: getBasePositions(p.position),
    isFarm: false,
    fpts: proj.fpts,
    proj,
    raw: rawOf(proj),
  }
}

const starterSet = (assign: SlotAssignment): Set<string> =>
  new Set(ALL_START_SLOTS.map(s => assign[s]?.name).filter(Boolean) as string[])

// Roto impact of adding `p` to a team: re-optimize their lineup with him on
// the roster and diff against baseline. Reports where he'd start and which
// starter falls out of the 23 once slides settle.
function addImpact(p: Player, st: TeamState): { delta: number; startsAt: string | null; benched: string | null } {
  const entry = entryOf(p)
  if (!entry) return { delta: 0, startsAt: null, benched: null }
  const { assign, points } = reoptimizeLineup([...st.standing.entries, entry], st.lineup, st.field)
  let startsAt: string | null = null
  for (const slot of ALL_START_SLOTS) {
    if (assign[slot]?.name === p.name) {
      startsAt = slot
      break
    }
  }
  const after = starterSet(assign)
  const benched = [...starterSet(st.lineup)].find(n => !after.has(n)) ?? null
  return { delta: Math.max(0, points - st.basePoints), startsAt, benched }
}

// Roto points a team loses if `name` leaves the roster: re-optimize without
// him. Reports who enters the 23 to cover (after slides settle).
function removalImpact(name: string, st: TeamState): { cost: number; replacement: string | null } {
  if (!starterSet(st.lineup).has(name)) return { cost: 0, replacement: null } // bench/farm player: free to trade away
  const roster = st.standing.entries.filter(e => e.name !== name)
  const { assign, points } = reoptimizeLineup(roster, st.lineup, st.field)
  const before = starterSet(st.lineup)
  const replacement = [...starterSet(assign)].find(n => !before.has(n)) ?? null
  return { cost: Math.max(0, st.basePoints - points), replacement }
}

const isFarmPlayer = (p: Player) => p.hkbLevel !== null && p.hkbLevel !== 'MLB'

// Our tradeable pool: no control after 2026 (rentals — always sellable) plus
// aging vets on 2027-28 non-YP deals (the shed list's "shop now"/"listen"
// verdicts). Only players with a RoS projection: a send has to help a buyer.
export function isTradeable(p: Player): boolean {
  if (isFarmPlayer(p) || !p.zipsRosProjection) return false
  if (isExpiring(p)) return true
  if (/yp/i.test(p.contractType ?? '')) return false
  return p.contractEnds !== null && p.contractEnds <= 2028 && (p.age ?? 0) >= 30
}

// Their dynasty assets worth asking for: controlled beyond 2026, HKB-ranked,
// and either a farm prospect or a young (≤28) MLB player.
function isAskable(p: Player): boolean {
  if (isExpiring(p) || p.hkbValue == null) return false
  return isFarmPlayer(p) || (p.age !== null && p.age <= 28)
}

const SUGGESTION_MARGIN = 2 // the joint deal must gain them at least this many roto points
const MAX_PACKAGE = 3
// Dynasty price of a win-now roto point: a buyer will part with roughly this
// much HKB value per roto point our package adds to their lineup. Keeps the
// engine from suggesting two relievers for their franchise cornerstone.
const HKB_PER_ROTO_POINT = 250

export function buildDealSheets(
  players: Player[],
  ourFranchise: string
): { sheets: Map<string, DealSheet>; nTeams: number } {
  const byFr = new Map<string, Player[]>()
  for (const p of players) {
    if (!p.franchise || p.franchise === 'Free Agent' || p.status === 'FA' || p.isAvailable) continue
    if (!byFr.has(p.franchise)) byFr.set(p.franchise, [])
    byFr.get(p.franchise)!.push(p)
  }
  if (!byFr.has(ourFranchise) || byFr.size < 2) return { sheets: new Map(), nTeams: byFr.size }

  const standings = computeStandings(byFr)
  const states = new Map<string, TeamState>()
  for (const [fr, standing] of standings) {
    const field = fieldFor(standings, fr)
    // Polish the standings lineup under this team's own field with the same
    // move set trade evaluation uses, so every candidate diffs against a
    // baseline that is already a local optimum for that move set.
    const polished = reoptimizeLineup(standing.entries, standing.lineup, field)
    states.set(fr, { franchise: fr, standing, field, lineup: polished.assign, basePoints: polished.points })
  }
  const rosRank = new Map(
    [...standings.values()]
      .sort((a, b) => b.rotoTotal - a.rotoTotal)
      .map((s, i) => [s.franchise, i + 1])
  )
  const nTeams = standings.size

  // League-median starter FPTS per hitter slot, for hole detection
  const medianBySlot = new Map<string, number>()
  for (const slot of POS_SLOTS) {
    const vals = [...states.values()]
      .map(s => s.lineup[slot]?.fpts)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)
    if (vals.length) medianBySlot.set(slot, vals[Math.floor(vals.length / 2)])
  }

  const us = states.get(ourFranchise)!
  const tradeable = byFr.get(ourFranchise)!.filter(isTradeable)

  // Our cost of losing each tradeable player doesn't depend on the trade
  // partner — compute once.
  const ourRemoval = new Map(tradeable.map(p => [p.name, removalImpact(p.name, us)]))

  const sheets = new Map<string, DealSheet>()
  for (const [fr, st] of states) {
    if (fr === ourFranchise) continue

    const sends: SendCandidate[] = tradeable
      .map(p => {
        const add = addImpact(p, st)
        return {
          player: p,
          deltaToThem: add.delta,
          startsAt: add.startsAt,
          replaces: add.benched,
          ourCost: ourRemoval.get(p.name)!.cost,
        }
      })
      .sort(
        (a, b) =>
          b.deltaToThem - a.deltaToThem ||
          (b.player.zipsRosProjection?.fpts ?? 0) - (a.player.zipsRosProjection?.fpts ?? 0)
      )

    const asks: AskCandidate[] = byFr
      .get(fr)!
      .filter(isAskable)
      .sort((a, b) => (b.hkbValue ?? 0) - (a.hkbValue ?? 0))
      .slice(0, 10)
      .map(p => {
        const farm = isFarmPlayer(p)
        const { cost, replacement } = removalImpact(p.name, st)
        const ourGain = !farm && p.zipsRosProjection ? addImpact(p, us).delta : 0
        return { player: p, isFarm: farm, costToThem: cost, replacement, ourGain }
      })

    const holes: LineupHole[] = []
    for (const slot of POS_SLOTS) {
      const med = medianBySlot.get(slot)
      if (med == null || med <= 0) continue
      const occ = st.lineup[slot]
      if (!occ) holes.push({ slot, detail: 'empty' })
      else if (occ.fpts < 0.65 * med)
        holes.push({ slot, detail: `${occ.name} · ${Math.round(occ.fpts)} FPTS vs ${Math.round(med)} median` })
    }
    const r = st.standing.ranks
    if (r.qs >= nTeams - 3 && r.k >= nTeams - 3) holes.push({ slot: 'SP', detail: `QS #${r.qs} · K #${r.k}` })
    if (r.sv >= nTeams - 3 && r.hld >= nTeams - 3) holes.push({ slot: 'RP', detail: `SV #${r.sv} · HLD #${r.hld}` })

    // Suggestion: highest-HKB ask that is both covered win-now (send package
    // beats the ask's roto cost with margin) and affordable in dynasty terms
    // (ask HKB ≤ HKB_PER_ROTO_POINT × package roto gain). Cheap screen with
    // per-send deltas first; survivors get the real check — one joint lineup
    // re-optimization per side, so two sends fighting for the same slot (or
    // the ask's own slot freeing up for a send) are priced correctly.
    const posSends = sends.filter(s => s.deltaToThem > 0).slice(0, 5)
    let suggestion: DealSuggestion | null = null
    for (const ask of asks) {
      const needed = ask.costToThem + SUGGESTION_MARGIN
      const hkbAsk = ask.player.hkbValue ?? 0
      const pack: SendCandidate[] = []
      let sum = 0
      for (const s of posSends) {
        if (pack.length >= MAX_PACKAGE) break
        if (sum >= needed && hkbAsk <= HKB_PER_ROTO_POINT * sum) break
        pack.push(s)
        sum += s.deltaToThem
      }
      if (!(pack.length > 0 && sum >= needed && hkbAsk <= HKB_PER_ROTO_POINT * sum)) continue

      // Joint verification, their side: all sends in, ask out.
      const packEntries = pack.map(s => entryOf(s.player)).filter((e): e is RosterEntry => e !== null)
      const packGain =
        reoptimizeLineup([...st.standing.entries, ...packEntries], st.lineup, st.field).points - st.basePoints
      const buyerNet =
        reoptimizeLineup(
          [...st.standing.entries.filter(e => e.name !== ask.player.name), ...packEntries],
          st.lineup,
          st.field
        ).points - st.basePoints
      if (buyerNet < SUGGESTION_MARGIN || hkbAsk > HKB_PER_ROTO_POINT * Math.max(0, packGain)) continue

      // Our side: sends out, ask in (farm asks add nothing to the lineup now).
      const sendNames = new Set(pack.map(s => s.player.name))
      const ourRoster = us.standing.entries.filter(e => !sendNames.has(e.name))
      const askEntry = !ask.isFarm ? entryOf(ask.player) : null
      if (askEntry) ourRoster.push(askEntry)
      const ourRotoDelta = reoptimizeLineup(ourRoster, us.lineup, us.field).points - us.basePoints

      suggestion = {
        sends: pack,
        ask,
        buyerNet,
        ourRotoDelta,
        hkbNet:
          (ask.player.hkbValue ?? 0) -
          pack.reduce((t, s) => t + (isExpiring(s.player) ? 0 : s.player.hkbValue ?? 0), 0),
      }
      break
    }

    sheets.set(fr, {
      franchise: fr,
      rosRotoTotal: st.standing.rotoTotal,
      rosRotoRank: rosRank.get(fr) ?? 0,
      holes,
      sends,
      asks,
      suggestion,
    })
  }

  return { sheets, nTeams }
}
