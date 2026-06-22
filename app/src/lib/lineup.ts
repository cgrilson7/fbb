// Shared lineup utilities used by franchise-value and waiver-wire pages

// Standard 8 field positions
export const BASE_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const

// Best Lineup mode: actual roster slots from constitution Section 2.4.
// 'P' is a synthetic lump slot (sum of the 10 pitchers) kept for the league
// summary table; individual lockable pitcher slots are PITCHER_SLOTS below.
export const LINEUP_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTIL', 'P'] as const

// Position-player slots (no pitcher)
export const POS_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTIL'] as const

// 10 individual pitcher slots (constitution = 10 generic Pitchers, no SP/RP split)
export const PITCHER_SLOTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'] as const

// Every individually-fillable starting slot: 13 hitters + 10 pitchers = 23
export const ALL_START_SLOTS = [...POS_SLOTS, ...PITCHER_SLOTS] as const

export function isPitcherSlot(slot: string): boolean {
  return slot === 'P' || /^P\d+$/.test(slot)
}

// Which base positions make a player eligible for each lineup slot
export const SLOT_ELIGIBILITY: Record<string, string[]> = {
  C:    ['C'],
  '1B': ['1B'],
  '2B': ['2B'],
  '3B': ['3B'],
  SS:   ['SS'],
  MI:   ['SS', '2B'],            // middle infielder
  CI:   ['1B', '3B'],            // corner infielder
  LF:   ['LF'],
  CF:   ['CF'],
  RF:   ['RF'],
  OF:   ['LF', 'CF', 'RF'],     // any outfielder
  DH:   ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],  // any position player
  UTIL: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],  // any player
}

export interface LineupPlayer {
  name: string
  value: number
  isFarm: boolean
  basePositions: string[]
  isPitcher: boolean
  pitcherType: 'SP' | 'RP' | null
}

// Expand a player's position string into base field positions they can play
export function getBasePositions(posStr: string): string[] {
  const raw = posStr.split(',').map(p => p.trim())
  const result = new Set<string>()
  for (const p of raw) {
    if ((BASE_POSITIONS as readonly string[]).includes(p)) result.add(p)
    if (p === 'MI') { result.add('SS'); result.add('2B') }
    if (p === 'CI') { result.add('1B'); result.add('3B') }
    if (p === 'OF') { result.add('LF'); result.add('CF'); result.add('RF') }
    if (p === 'DH' || p === 'UTIL') {
      result.add('DH')
    }
  }
  return Array.from(result)
}

// Map a player's position string to a primary display position
export function getPrimaryPosition(posStr: string): string {
  const positions = posStr.split(',').map(p => p.trim())
  if (positions.includes('SP')) return 'SP'
  if (positions.includes('RP')) return 'RP'
  for (const fp of BASE_POSITIONS) {
    if (positions.includes(fp)) return fp
  }
  if (positions.includes('MI')) return 'SS'
  if (positions.includes('CI')) return '1B'
  if (positions.includes('OF')) return 'LF'
  if (positions.includes('UTIL') || positions.includes('DH')) return 'DH'
  return 'DH'
}

// Check if a player is eligible for a lineup slot
export function isEligibleForSlot(player: LineupPlayer, slot: string): boolean {
  if (isPitcherSlot(slot)) return player.isPitcher
  const eligible = SLOT_ELIGIBILITY[slot]
  if (!eligible) return false
  if (slot === 'DH' || slot === 'UTIL') {
    return !player.isPitcher && player.basePositions.length > 0
  }
  return player.basePositions.some(bp => eligible.includes(bp))
}

// Try to find an augmenting path to place playerIdx into some slot
function augment(
  playerIdx: number,
  players: LineupPlayer[],
  slots: readonly string[],
  slotMatch: Record<string, number>,
  visited: Set<string>
): boolean {
  const player = players[playerIdx]
  for (const slot of slots) {
    if (visited.has(slot)) continue
    if (!isEligibleForSlot(player, slot)) continue
    visited.add(slot)
    if (slotMatch[slot] < 0 || augment(slotMatch[slot], players, slots, slotMatch, visited)) {
      slotMatch[slot] = playerIdx
      return true
    }
  }
  return false
}

// Maximum weight bipartite matching via augmenting paths (Kuhn's algorithm).
// Players are processed in decreasing value order.
export function findOptimalLineup(
  allPlayers: LineupPlayer[],
  locks: Record<string, string> = {}
): Record<string, LineupPlayer | null> {
  const lockedNames = new Set(Object.values(locks))
  const posPlayers = allPlayers
    .filter(p => !p.isPitcher && (!p.isFarm || lockedNames.has(p.name)))
    .sort((a, b) => b.value - a.value)
  const pitchers = allPlayers
    .filter(p => p.isPitcher && (!p.isFarm || lockedNames.has(p.name)))
    .sort((a, b) => b.value - a.value)

  const slotMatch: Record<string, number> = {}
  for (const slot of POS_SLOTS) slotMatch[slot] = -1

  // Pre-assign locked players
  const lockedPlayerIndices = new Set<number>()
  for (const [slot, playerName] of Object.entries(locks)) {
    if (slot === 'P') continue
    const idx = posPlayers.findIndex(p => p.name === playerName)
    if (idx >= 0) {
      slotMatch[slot] = idx
      lockedPlayerIndices.add(idx)
    }
  }

  // Process each non-locked player in decreasing value order
  for (let pi = 0; pi < posPlayers.length; pi++) {
    if (lockedPlayerIndices.has(pi)) continue
    const availableSlots = POS_SLOTS.filter(s => !(s in locks))
    const visited = new Set<string>()
    for (const s of POS_SLOTS) {
      if (s in locks) visited.add(s)
    }
    augment(pi, posPlayers, availableSlots, slotMatch, visited)
  }

  const result: Record<string, LineupPlayer | null> = {}
  for (const slot of POS_SLOTS) {
    result[slot] = slotMatch[slot] >= 0 ? posPlayers[slotMatch[slot]] : null
  }

  // Pitchers: honor P-slot locks, then fill remaining slots with best available
  // by value. All P slots are interchangeable, so a lock just pins that pitcher
  // into the 10.
  const usedPitchers = new Set<string>()
  const pSlotResult: Record<string, LineupPlayer | null> = {}
  for (const slot of PITCHER_SLOTS) {
    const lockedName = locks[slot]
    if (lockedName) {
      const p = pitchers.find(pp => pp.name === lockedName && !usedPitchers.has(pp.name))
      if (p) {
        pSlotResult[slot] = p
        usedPitchers.add(p.name)
      }
    }
  }
  const remainingPitchers = pitchers.filter(p => !usedPitchers.has(p.name))
  let ri = 0
  for (const slot of PITCHER_SLOTS) {
    if (pSlotResult[slot]) continue
    pSlotResult[slot] = ri < remainingPitchers.length ? remainingPitchers[ri++] : null
  }
  for (const slot of PITCHER_SLOTS) result[slot] = pSlotResult[slot] ?? null

  // Synthetic lump slot for the league summary table
  const chosenPitchers = PITCHER_SLOTS.map(s => pSlotResult[s]).filter((p): p is LineupPlayer => p !== null)
  const pitcherValue = chosenPitchers.reduce((sum, p) => sum + p.value, 0)
  result['P'] = chosenPitchers.length > 0
    ? { name: `${chosenPitchers.length} pitchers`, value: pitcherValue, isFarm: false, basePositions: [], isPitcher: true, pitcherType: null }
    : null

  return result
}

// Build LineupPlayer from a raw player record
export function toLineupPlayer(p: {
  name: string
  position: string
  hkbLevel: string | null
}, getValue: (p: { name: string; position: string; hkbLevel: string | null }) => number | null): LineupPlayer | null {
  const value = getValue(p)
  if (value === null || value === undefined) return null
  const posStr = p.position
  const positions = posStr.split(',').map(s => s.trim())
  const isPitcher = positions.includes('SP') || positions.includes('RP')
  return {
    name: p.name,
    value,
    isFarm: p.hkbLevel !== null && p.hkbLevel !== 'MLB',
    basePositions: getBasePositions(posStr),
    isPitcher,
    pitcherType: positions.includes('SP') ? 'SP' : positions.includes('RP') ? 'RP' : null,
  }
}
