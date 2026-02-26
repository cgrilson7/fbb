'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Loader2, Trophy, Users, Hash } from 'lucide-react'
import Diamond from './Diamond'
import type { PositionCard, SlotCandidate } from './Diamond'

const MY_FRANCHISE = 'Colin Wilson & Greg Holmes'

// Standard 8 field positions (for roster mode grouping)
const BASE_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const

// Roster mode: group players by primary position
const ROSTER_DISPLAY_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'] as const

// Best Lineup mode: actual roster slots from constitution Section 2.4
// C, 1B, 2B, 3B, SS, MI, CI, LF, CF, RF, OF, DH, UTIL, 10x P
const LINEUP_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTIL', 'P'] as const
// Slots shown on the diamond SVG (field positions only)
const DIAMOND_LINEUP_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF'] as const

// Which base positions make a player eligible for each lineup slot
const SLOT_ELIGIBILITY: Record<string, string[]> = {
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
  UTIL: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],  // any player (pitchers could too, but value-wise always a hitter)
}

// Map a player's position string to a primary display position (for roster mode)
function getPrimaryPosition(posStr: string): string {
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

// Expand a player's position string into base field positions they can play
function getBasePositions(posStr: string): string[] {
  const raw = posStr.split(',').map(p => p.trim())
  const result = new Set<string>()
  for (const p of raw) {
    if ((BASE_POSITIONS as readonly string[]).includes(p)) result.add(p)
    if (p === 'MI') { result.add('SS'); result.add('2B') }
    if (p === 'CI') { result.add('1B'); result.add('3B') }
    if (p === 'OF') { result.add('LF'); result.add('CF'); result.add('RF') }
    if (p === 'DH' || p === 'UTIL') {
      // DH/UTIL-only players can fill DH/UTIL slots
      result.add('DH')
    }
  }
  return Array.from(result)
}

interface LineupPlayer {
  name: string
  value: number
  isFarm: boolean
  basePositions: string[]  // base positions this player can play
  isPitcher: boolean
  pitcherType: 'SP' | 'RP' | null
}

// Check if a player is eligible for a lineup slot
function isEligibleForSlot(player: LineupPlayer, slot: string): boolean {
  const eligible = SLOT_ELIGIBILITY[slot]
  if (!eligible) return false
  // DH and UTIL: any non-pitcher with at least one base position
  if (slot === 'DH' || slot === 'UTIL') {
    return !player.isPitcher && player.basePositions.length > 0
  }
  return player.basePositions.some(bp => eligible.includes(bp))
}

// Try to find an augmenting path to place playerIdx into some slot.
// Returns true if the player was successfully placed.
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
    // If slot is empty or the current occupant can be moved elsewhere
    if (slotMatch[slot] < 0 || augment(slotMatch[slot], players, slots, slotMatch, visited)) {
      slotMatch[slot] = playerIdx
      return true
    }
  }
  return false
}

// Maximum weight bipartite matching via augmenting paths (Kuhn's algorithm).
// Players are processed in decreasing value order. Since player values are
// independent of which slot they fill, this produces an optimal assignment
// that maximizes total value across all 13 position-player slots per Section 2.4.
function findOptimalLineup(
  allPlayers: LineupPlayer[],
  locks: Record<string, string> = {}
): Record<string, LineupPlayer | null> {
  // Exclude farm/minors players — they can't be auto-assigned (but locked farm players are kept)
  const lockedNames = new Set(Object.values(locks))
  const posPlayers = allPlayers
    .filter(p => !p.isPitcher && (!p.isFarm || lockedNames.has(p.name)))
    .sort((a, b) => b.value - a.value)
  const pitchers = allPlayers.filter(p => p.isPitcher && !p.isFarm).sort((a, b) => b.value - a.value)

  const POS_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTIL'] as const

  // slotMatch[slot] = index into posPlayers of the assigned player, or -1
  const slotMatch: Record<string, number> = {}
  for (const slot of POS_SLOTS) slotMatch[slot] = -1

  // Pre-assign locked players before running the algorithm
  const lockedPlayerIndices = new Set<number>()
  for (const [slot, playerName] of Object.entries(locks)) {
    if (slot === 'P') continue // pitcher locks not supported
    const idx = posPlayers.findIndex(p => p.name === playerName)
    if (idx >= 0) {
      slotMatch[slot] = idx
      lockedPlayerIndices.add(idx)
    }
  }

  // Process each non-locked player in decreasing value order
  for (let pi = 0; pi < posPlayers.length; pi++) {
    if (lockedPlayerIndices.has(pi)) continue
    // Skip slots already locked
    const availableSlots = POS_SLOTS.filter(s => !(s in locks))
    const visited = new Set<string>()
    // Add locked slots to visited so they won't be bumped
    for (const s of POS_SLOTS) {
      if (s in locks) visited.add(s)
    }
    augment(pi, posPlayers, availableSlots, slotMatch, visited)
  }

  // Build result
  const result: Record<string, LineupPlayer | null> = {}
  for (const slot of POS_SLOTS) {
    result[slot] = slotMatch[slot] >= 0 ? posPlayers[slotMatch[slot]] : null
  }

  // Pitchers: best 10 by value
  const topPitchers = pitchers.slice(0, 10)
  const pitcherValue = topPitchers.reduce((sum, p) => sum + p.value, 0)
  result['P'] = topPitchers.length > 0
    ? { name: `${topPitchers.length} pitchers`, value: pitcherValue, isFarm: false, basePositions: [], isPitcher: true, pitcherType: null }
    : null

  return result
}

type ValueMetric = 'hkb' | 'fpts' | 'fpRank'

export default function FranchiseValuePage() {
  const { players, franchiseMappings } = usePlayerStore()
  const hasHydrated = useHydration()
  const [selectedFranchise, setSelectedFranchise] = useState(MY_FRANCHISE)
  const [viewMode, setViewMode] = useState<'roster' | 'bestLineup' | 'depthChart'>('roster')
  const [valueMetric, setValueMetric] = useState<ValueMetric>('hkb')
  const [sortCol, setSortCol] = useState<string>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [lockedSlots, setLockedSlots] = useState<Record<string, string>>({})

  // Clear locks when switching franchise or view mode
  const handleFranchiseChange = (f: string) => {
    setSelectedFranchise(f)
    setLockedSlots({})
  }
  const handleViewModeChange = (mode: 'roster' | 'bestLineup' | 'depthChart') => {
    setViewMode(mode)
    setLockedSlots({})
  }

  const metricLabel = valueMetric === 'hkb' ? 'HKB Value' : valueMetric === 'fpts' ? 'ZiPS FPTS' : 'FP Rank Value'

  const franchises = useMemo(() => {
    return franchiseMappings
      .filter(m => m.fullName !== 'Free Agent')
      .map(m => m.fullName)
      .sort()
  }, [franchiseMappings])

  // Extract value from a player based on selected metric
  function getPlayerValue(p: typeof players[number]): number | null {
    if (valueMetric === 'fpts') return p.zipsProjection?.fpts ?? null
    if (valueMetric === 'fpRank') return p.fpRank != null ? 301 - p.fpRank : null
    return p.hkbValue
  }

  // Pre-process all franchise players with eligibility data
  const franchisePlayersByTeam = useMemo(() => {
    const map: Record<string, LineupPlayer[]> = {}
    franchises.forEach(f => { map[f] = [] })
    players.forEach(p => {
      if (!p.franchise || !map[p.franchise]) return
      const value = getPlayerValue(p)
      if (value === null || value === undefined) return
      const posStr = p.position
      const positions = posStr.split(',').map(s => s.trim())
      const isPitcher = positions.includes('SP') || positions.includes('RP')
      map[p.franchise].push({
        name: p.name,
        value,
        isFarm: p.hkbLevel !== null && p.hkbLevel !== 'MLB',
        basePositions: getBasePositions(posStr),
        isPitcher,
        pitcherType: positions.includes('SP') ? 'SP' : positions.includes('RP') ? 'RP' : null,
      })
    })
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, franchises, valueMetric])

  // Build per-franchise, per-position value aggregation (roster mode)
  const franchiseData = useMemo(() => {
    const data: Record<string, Record<string, { players: { name: string; value: number; isFarm: boolean }[]; totalValue: number }>> = {}

    franchises.forEach(f => {
      data[f] = {}
      ROSTER_DISPLAY_POSITIONS.forEach(pos => {
        data[f][pos] = { players: [], totalValue: 0 }
      })
    })

    players.forEach(p => {
      const franchise = p.franchise
      if (!franchise || !data[franchise]) return
      const value = getPlayerValue(p)
      if (value === null || value === undefined) return

      const pos = getPrimaryPosition(p.position)
      const bucket = data[franchise][pos]
      if (!bucket) return

      const isFarm = p.hkbLevel !== null && p.hkbLevel !== 'MLB'
      bucket.players.push({ name: p.name, value, isFarm })
      bucket.totalValue += value
    })

    Object.values(data).forEach(fp => {
      Object.values(fp).forEach(bucket => {
        bucket.players.sort((a, b) => b.value - a.value)
      })
    })

    return data
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, franchises, valueMetric])

  // Compute optimal lineups for all franchises (best lineup mode)
  // Selected franchise uses lockedSlots; others use no locks
  const optimalLineups = useMemo(() => {
    if (viewMode !== 'bestLineup') return {}
    const lineups: Record<string, Record<string, LineupPlayer | null>> = {}
    franchises.forEach(f => {
      const locks = f === selectedFranchise ? lockedSlots : {}
      lineups[f] = findOptimalLineup(franchisePlayersByTeam[f] || [], locks)
    })
    return lineups
  }, [viewMode, franchises, franchisePlayersByTeam, selectedFranchise, lockedSlots])

  // Build depth chart data: all players at every eligible base position
  const depthChartData = useMemo(() => {
    if (viewMode !== 'depthChart') return {}
    const result: Record<string, Record<string, { players: { name: string; value: number; isFarm: boolean }[]; totalValue: number }>> = {}
    franchises.forEach(f => {
      result[f] = {}
      BASE_POSITIONS.forEach(pos => {
        const eligible = (franchisePlayersByTeam[f] || [])
          .filter(p => !p.isPitcher && p.basePositions.includes(pos))
          .sort((a, b) => b.value - a.value)
        result[f][pos] = {
          players: eligible.map(p => ({ name: p.name, value: p.value, isFarm: p.isFarm })),
          totalValue: eligible.reduce((sum, p) => sum + p.value, 0),
        }
      })
    })
    return result
  }, [viewMode, franchises, franchisePlayersByTeam])

  // Pitcher sidebar data for selected franchise
  const pitcherData = useMemo(() => {
    const teamPlayers = franchisePlayersByTeam[selectedFranchise] || []
    const pitchers = teamPlayers.filter(p => p.isPitcher).sort((a, b) => b.value - a.value)
    if (viewMode === 'bestLineup') {
      const top10 = pitchers.slice(0, 10)
      return {
        players: top10.map(p => ({ name: p.name, value: p.value, isFarm: p.isFarm, type: p.pitcherType })),
        totalValue: top10.reduce((sum, p) => sum + p.value, 0),
      }
    }
    // roster and depthChart modes show all pitchers
    return {
      players: pitchers.map(p => ({ name: p.name, value: p.value, isFarm: p.isFarm, type: p.pitcherType })),
      totalValue: pitchers.reduce((sum, p) => sum + p.value, 0),
    }
  }, [franchisePlayersByTeam, selectedFranchise, viewMode])

  // The active display positions depend on mode
  const displayPositions = viewMode === 'bestLineup' ? LINEUP_SLOTS : viewMode === 'depthChart' ? ROSTER_DISPLAY_POSITIONS : ROSTER_DISPLAY_POSITIONS

  // Compute league ranks per position — adapts to view mode
  const leagueRanks = useMemo(() => {
    const ranks: Record<string, Record<string, number>> = {}

    const positionsToRank = viewMode === 'bestLineup' ? LINEUP_SLOTS : ROSTER_DISPLAY_POSITIONS

    positionsToRank.forEach(pos => {
      const sorted = franchises
        .map(f => {
          let value: number
          if (viewMode === 'bestLineup') {
            value = optimalLineups[f]?.[pos]?.value ?? 0
          } else if (viewMode === 'depthChart') {
            value = depthChartData[f]?.[pos]?.totalValue ?? franchiseData[f]?.[pos]?.totalValue ?? 0
          } else {
            value = franchiseData[f]?.[pos]?.totalValue ?? 0
          }
          return { franchise: f, value }
        })
        .sort((a, b) => b.value - a.value)

      sorted.forEach((entry, i) => {
        if (!ranks[entry.franchise]) ranks[entry.franchise] = {}
        ranks[entry.franchise][pos] = i + 1
      })
    })

    // Total ranks — depth chart uses deduplicated totals (each player counted once)
    const totalSorted = franchises
      .map(f => {
        let value: number
        if (viewMode === 'bestLineup') {
          value = (LINEUP_SLOTS as readonly string[]).reduce((sum, pos) => sum + (optimalLineups[f]?.[pos]?.value ?? 0), 0)
        } else if (viewMode === 'depthChart') {
          // Deduplicate: sum each player's value once, not per-position
          const teamPlayers = franchisePlayersByTeam[f] || []
          value = teamPlayers.filter(p => !p.isPitcher).reduce((sum, p) => sum + p.value, 0)
            + teamPlayers.filter(p => p.isPitcher).reduce((sum, p) => sum + p.value, 0)
        } else {
          value = Object.values(franchiseData[f] || {}).reduce((sum, b) => sum + b.totalValue, 0)
        }
        return { franchise: f, value }
      })
      .sort((a, b) => b.value - a.value)
    totalSorted.forEach((entry, i) => {
      if (!ranks[entry.franchise]) ranks[entry.franchise] = {}
      ranks[entry.franchise]['total'] = i + 1
    })

    return ranks
  }, [franchiseData, optimalLineups, depthChartData, franchisePlayersByTeam, franchises, viewMode])

  // Diamond position cards for selected franchise
  const diamondPositions = useMemo(() => {
    const result: Record<string, PositionCard> = {}

    if (viewMode === 'bestLineup') {
      const lineup = optimalLineups[selectedFranchise] || {}
      DIAMOND_LINEUP_SLOTS.forEach(slot => {
        const player = lineup[slot]
        result[slot] = {
          position: slot,
          players: player ? [{ name: player.name, value: player.value, isFarm: player.isFarm }] : [],
          totalValue: player?.value ?? 0,
          leagueRank: leagueRanks[selectedFranchise]?.[slot] ?? null,
          totalFranchises: franchises.length,
        }
      })
    } else if (viewMode === 'depthChart') {
      BASE_POSITIONS.forEach(pos => {
        const bucket = depthChartData[selectedFranchise]?.[pos]
        result[pos] = {
          position: pos,
          players: bucket?.players ?? [],
          totalValue: bucket?.totalValue ?? 0,
          leagueRank: leagueRanks[selectedFranchise]?.[pos] ?? null,
          totalFranchises: franchises.length,
        }
      })
    } else {
      BASE_POSITIONS.forEach(pos => {
        const bucket = franchiseData[selectedFranchise]?.[pos]
        result[pos] = {
          position: pos,
          players: bucket?.players ?? [],
          totalValue: bucket?.totalValue ?? 0,
          leagueRank: leagueRanks[selectedFranchise]?.[pos] ?? null,
          totalFranchises: franchises.length,
        }
      })
    }

    return result
  }, [viewMode, franchiseData, depthChartData, optimalLineups, selectedFranchise, leagueRanks, franchises.length])

  // DH + UTIL data (shown below diamond in bestLineup mode)
  const dhData = useMemo(() => {
    if (viewMode === 'bestLineup') {
      const dh = optimalLineups[selectedFranchise]?.['DH']
      return { players: dh ? [{ name: dh.name, value: dh.value, isFarm: dh.isFarm }] : [], totalValue: dh?.value ?? 0 }
    }
    if (viewMode === 'depthChart') {
      // Show players whose only base position is DH (not eligible for any field position)
      const dhOnly = (franchisePlayersByTeam[selectedFranchise] || [])
        .filter(p => !p.isPitcher && p.basePositions.length === 1 && p.basePositions[0] === 'DH')
        .sort((a, b) => b.value - a.value)
      return {
        players: dhOnly.map(p => ({ name: p.name, value: p.value, isFarm: p.isFarm })),
        totalValue: dhOnly.reduce((sum, p) => sum + p.value, 0),
      }
    }
    return franchiseData[selectedFranchise]?.['DH'] ?? { players: [], totalValue: 0 }
  }, [viewMode, franchiseData, optimalLineups, franchisePlayersByTeam, selectedFranchise])

  const utilData = useMemo(() => {
    if (viewMode !== 'bestLineup') return null
    const util = optimalLineups[selectedFranchise]?.['UTIL']
    return { players: util ? [{ name: util.name, value: util.value, isFarm: util.isFarm }] : [], totalValue: util?.value ?? 0 }
  }, [viewMode, optimalLineups, selectedFranchise])

  // Summary stats
  const totalValue = useMemo(() => {
    if (viewMode === 'bestLineup') {
      return (LINEUP_SLOTS as readonly string[]).reduce((sum, pos) => sum + (optimalLineups[selectedFranchise]?.[pos]?.value ?? 0), 0)
    }
    if (viewMode === 'depthChart') {
      // Deduplicated: each player counted once
      return (franchisePlayersByTeam[selectedFranchise] || []).reduce((sum, p) => sum + p.value, 0)
    }
    return Object.values(franchiseData[selectedFranchise] || {}).reduce((sum, b) => sum + b.totalValue, 0)
  }, [viewMode, franchiseData, optimalLineups, franchisePlayersByTeam, selectedFranchise])

  const playerCount = useMemo(() => {
    if (viewMode === 'bestLineup') {
      // Count filled slots (P counts as up to 10)
      let count = 0
      for (const slot of LINEUP_SLOTS) {
        if (slot === 'P') {
          const pitchers = (franchisePlayersByTeam[selectedFranchise] || []).filter(p => p.isPitcher)
          count += Math.min(pitchers.length, 10)
        } else if (optimalLineups[selectedFranchise]?.[slot] != null) {
          count++
        }
      }
      return count
    }
    if (viewMode === 'depthChart') {
      return (franchisePlayersByTeam[selectedFranchise] || []).length
    }
    return Object.values(franchiseData[selectedFranchise] || {}).reduce((sum, b) => sum + b.players.length, 0)
  }, [viewMode, franchiseData, optimalLineups, franchisePlayersByTeam, selectedFranchise])

  // Lock/unlock handler for diamond slots
  const handleToggleLock = (slot: string) => {
    setLockedSlots(prev => {
      const next = { ...prev }
      if (slot in next) {
        delete next[slot]
      } else {
        const player = optimalLineups[selectedFranchise]?.[slot]
        if (player && player.name) {
          next[slot] = player.name
        }
      }
      return next
    })
  }

  // Assign a player to a slot (locks them there)
  const handleAssignToSlot = (playerName: string, slot: string) => {
    setLockedSlots(prev => {
      const next = { ...prev }
      // Remove player from any other locked slot
      for (const [s, name] of Object.entries(next)) {
        if (name === playerName) delete next[s]
      }
      next[slot] = playerName
      return next
    })
  }

  // Bench & farm data for selected franchise (bestLineup mode)
  const benchFarmData = useMemo(() => {
    if (viewMode !== 'bestLineup') return { bench: [] as LineupPlayer[], farm: [] as LineupPlayer[], extraPitchers: [] as LineupPlayer[] }
    const teamPlayers = franchisePlayersByTeam[selectedFranchise] || []
    const lineup = optimalLineups[selectedFranchise] || {}

    // Collect names of players in the lineup
    const lineupNames = new Set<string>()
    for (const slot of ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTIL'] as const) {
      const p = lineup[slot]
      if (p) lineupNames.add(p.name)
    }

    // Top 10 pitchers are in the lineup
    const allPitchers = teamPlayers.filter(p => p.isPitcher && !p.isFarm).sort((a, b) => b.value - a.value)
    const top10Pitchers = new Set(allPitchers.slice(0, 10).map(p => p.name))

    const bench: LineupPlayer[] = []
    const farm: LineupPlayer[] = []
    const extraPitchers: LineupPlayer[] = []

    for (const p of teamPlayers) {
      if (p.isPitcher) {
        if (!p.isFarm && !top10Pitchers.has(p.name)) {
          extraPitchers.push(p)
        } else if (p.isFarm) {
          farm.push(p)
        }
      } else {
        if (lineupNames.has(p.name)) continue
        if (p.isFarm) {
          farm.push(p)
        } else {
          bench.push(p)
        }
      }
    }

    bench.sort((a, b) => b.value - a.value)
    farm.sort((a, b) => b.value - a.value)
    extraPitchers.sort((a, b) => b.value - a.value)

    return { bench, farm, extraPitchers }
  }, [viewMode, franchisePlayersByTeam, optimalLineups, selectedFranchise])

  // Get eligible slots for a bench/farm player (for assign dropdown)
  const getEligibleSlots = (player: LineupPlayer): string[] => {
    const POS_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTIL'] as const
    return POS_SLOTS.filter(slot => isEligibleForSlot(player, slot))
  }

  // Eligible candidates for each diamond slot (for reassign dropdown)
  const slotCandidates = useMemo(() => {
    if (viewMode !== 'bestLineup') return {}
    const teamPlayers = franchisePlayersByTeam[selectedFranchise] || []
    const lineup = optimalLineups[selectedFranchise] || {}
    const POS_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTIL'] as const

    // Current occupant name per slot
    const currentOccupants = new Map<string, string>()
    for (const slot of POS_SLOTS) {
      const p = lineup[slot]
      if (p) currentOccupants.set(slot, p.name)
    }

    const result: Record<string, { name: string; value: number }[]> = {}
    for (const slot of POS_SLOTS) {
      const currentName = currentOccupants.get(slot)
      const eligible = teamPlayers
        .filter(p => !p.isPitcher && isEligibleForSlot(p, slot) && p.name !== currentName)
        .sort((a, b) => b.value - a.value)
        .map(p => ({ name: p.name, value: p.value }))
      result[slot] = eligible
    }
    return result
  }, [viewMode, franchisePlayersByTeam, optimalLineups, selectedFranchise])

  // Comparison table data
  const comparisonRows = useMemo(() => {
    return franchises.map(f => {
      const posValues: Record<string, number> = {}
      let total = 0
      ;(displayPositions as readonly string[]).forEach(pos => {
        let val: number
        if (viewMode === 'bestLineup') {
          val = optimalLineups[f]?.[pos]?.value ?? 0
        } else if (viewMode === 'depthChart') {
          val = depthChartData[f]?.[pos]?.totalValue ?? franchiseData[f]?.[pos]?.totalValue ?? 0
        } else {
          val = franchiseData[f]?.[pos]?.totalValue ?? 0
        }
        posValues[pos] = val
        total += val
      })
      // Depth chart: use deduplicated total instead of summing per-position (which double-counts multi-pos)
      if (viewMode === 'depthChart') {
        total = (franchisePlayersByTeam[f] || []).reduce((sum, p) => sum + p.value, 0)
      }
      return { franchise: f, total, posValues, totalRank: leagueRanks[f]?.['total'] ?? 0 }
    }).sort((a, b) => {
      const aVal = sortCol === 'total' ? a.total : sortCol === 'franchise' ? 0 : (a.posValues[sortCol] ?? 0)
      const bVal = sortCol === 'total' ? b.total : sortCol === 'franchise' ? 0 : (b.posValues[sortCol] ?? 0)
      if (sortCol === 'franchise') {
        return sortDir === 'asc' ? a.franchise.localeCompare(b.franchise) : b.franchise.localeCompare(a.franchise)
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })
  }, [franchises, franchiseData, depthChartData, optimalLineups, franchisePlayersByTeam, leagueRanks, sortCol, sortDir, viewMode, displayPositions])

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No player data loaded. Go to Upload page to load CSV files.
        </p>
      </div>
    )
  }

  const rankBadgeClass = (rank: number | undefined | null) => {
    if (rank == null) return ''
    return rank === 1 ? 'bg-green-500' : rank <= 3 ? 'bg-blue-500' : 'bg-gray-400'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Franchise Value
        </h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => handleViewModeChange('roster')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'roster'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              Full Roster
            </button>
            <button
              onClick={() => handleViewModeChange('bestLineup')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'bestLineup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              Best Lineup
            </button>
            <button
              onClick={() => handleViewModeChange('depthChart')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'depthChart'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              Depth Chart
            </button>
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => setValueMetric('hkb')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                valueMetric === 'hkb'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              HKB
            </button>
            <button
              onClick={() => setValueMetric('fpts')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                valueMetric === 'fpts'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              ZiPS FPTS
            </button>
            <button
              onClick={() => setValueMetric('fpRank')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                valueMetric === 'fpRank'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              FP Rank
            </button>
          </div>
          <select
            value={selectedFranchise}
            onChange={(e) => handleFranchiseChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {franchises.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      {viewMode === 'bestLineup' && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Optimal lineup per Section 2.4: C, 1B, 2B, 3B, SS, MI, CI, LF, CF, RF, OF, DH, UTIL + 10 Pitchers. Multi-position players assigned to maximize total value.
        </p>
      )}
      {viewMode === 'depthChart' && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Full organizational depth at each position. Multi-position players appear at every eligible position.
        </p>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Trophy className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {viewMode === 'bestLineup' ? `Lineup ${metricLabel}` : viewMode === 'depthChart' ? `Org ${metricLabel}` : `Total ${metricLabel}`}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalValue.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {viewMode === 'bestLineup' ? 'Roster Spots Filled' : viewMode === 'depthChart' ? 'Total Players' : `Players with ${metricLabel}`}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {playerCount}{viewMode === 'bestLineup' ? ' / 23' : ''}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <Hash className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">League Rank</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                #{leagueRanks[selectedFranchise]?.['total'] ?? '—'} of {franchises.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Diamond + Pitcher Sidebar */}
      <div className="grid grid-cols-[200px_1fr] gap-4">
        {/* Pitchers Sidebar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-700 dark:text-gray-200">
              {viewMode === 'bestLineup' ? 'P (10)' : `Pitchers (${pitcherData.players.length})`}
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                {pitcherData.totalValue.toFixed(0)}
              </span>
              {viewMode === 'bestLineup' && leagueRanks[selectedFranchise]?.['P'] != null && (
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold ${rankBadgeClass(leagueRanks[selectedFranchise]['P'])}`}>
                  {leagueRanks[selectedFranchise]['P']}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            {pitcherData.players.map((p, i) => (
              <div key={i} className={`text-xs flex justify-between items-center ${p.isFarm ? 'italic text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'} ${i === 0 && !p.isFarm ? 'font-semibold' : ''}`}>
                <span className="truncate mr-1 flex items-center gap-1">
                  {p.name}
                  <span className={`text-[9px] px-1 rounded ${p.type === 'SP' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}`}>
                    {p.type}
                  </span>
                </span>
                <span className="text-gray-400 shrink-0">{p.value.toFixed(0)}</span>
              </div>
            ))}
            {pitcherData.players.length === 0 && <p className="text-xs text-gray-400">No pitchers</p>}
          </div>
        </div>

        {/* Diamond + DH/UTIL */}
        <div>
          <Diamond positions={diamondPositions} mode={viewMode} lockedSlots={lockedSlots} onToggleLock={viewMode === 'bestLineup' ? handleToggleLock : undefined} slotCandidates={slotCandidates} onAssignToSlot={viewMode === 'bestLineup' ? handleAssignToSlot : undefined} />

          {/* DH + UTIL below diamond */}
          <div className="mt-2 flex justify-center gap-3">
            {/* DH */}
            {(dhData.players.length > 0 || viewMode === 'bestLineup') && (
              <div className={`w-[180px] rounded-lg shadow p-2.5 ${
                viewMode === 'bestLineup' && 'DH' in lockedSlots
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500'
                  : 'bg-white dark:bg-gray-800'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-xs text-gray-700 dark:text-gray-200">DH</h3>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{dhData.totalValue.toFixed(0)}</span>
                    {leagueRanks[selectedFranchise]?.['DH'] != null && (
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold ${rankBadgeClass(leagueRanks[selectedFranchise]['DH'])}`}>
                        {leagueRanks[selectedFranchise]['DH']}
                      </span>
                    )}
                    {viewMode === 'bestLineup' && dhData.players.length > 0 && (
                      <button onClick={() => handleToggleLock('DH')} className={`w-4 h-4 flex items-center justify-center ${
                        'DH' in lockedSlots ? 'text-amber-600' : 'text-gray-300 hover:text-gray-500'
                      }`} title={'DH' in lockedSlots ? 'Unlock' : 'Lock'}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {'DH' in lockedSlots ? (<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>) : (<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>)}
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {dhData.players.slice(0, viewMode === 'bestLineup' ? 1 : 3).map((p, i) => (
                  <div key={i} className={`text-xs flex justify-between ${p.isFarm ? 'italic text-gray-400' : 'text-gray-700 dark:text-gray-300'} ${viewMode === 'bestLineup' || i === 0 ? 'font-semibold' : ''}`}>
                    <span className="truncate mr-1">{p.name}</span>
                    <span className="text-gray-400">{p.value.toFixed(0)}</span>
                  </div>
                ))}
                {!viewMode.startsWith('best') && dhData.players.length > 3 && (
                  <div className="text-[10px] text-gray-400">+{dhData.players.length - 3} more</div>
                )}
                {viewMode === 'bestLineup' && (slotCandidates['DH'] || []).length > 0 && (
                  <select
                    className="mt-1 w-full text-[10px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    value=""
                    onChange={(e) => { if (e.target.value) handleAssignToSlot(e.target.value, 'DH') }}
                  >
                    <option value="">{dhData.players.length > 0 ? 'Reassign...' : 'Assign...'}</option>
                    {(slotCandidates['DH'] || []).map(c => (
                      <option key={c.name} value={c.name}>{c.name} ({c.value.toFixed(0)})</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {/* UTIL (bestLineup only) */}
            {utilData && (utilData.players.length > 0 || viewMode === 'bestLineup') && (
              <div className={`w-[180px] rounded-lg shadow p-2.5 ${
                'UTIL' in lockedSlots
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-500'
                  : 'bg-white dark:bg-gray-800'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-xs text-gray-700 dark:text-gray-200">UTIL</h3>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{utilData.totalValue.toFixed(0)}</span>
                    {leagueRanks[selectedFranchise]?.['UTIL'] != null && (
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold ${rankBadgeClass(leagueRanks[selectedFranchise]['UTIL'])}`}>
                        {leagueRanks[selectedFranchise]['UTIL']}
                      </span>
                    )}
                    {utilData.players.length > 0 && (
                      <button onClick={() => handleToggleLock('UTIL')} className={`w-4 h-4 flex items-center justify-center ${
                        'UTIL' in lockedSlots ? 'text-amber-600' : 'text-gray-300 hover:text-gray-500'
                      }`} title={'UTIL' in lockedSlots ? 'Unlock' : 'Lock'}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {'UTIL' in lockedSlots ? (<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>) : (<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>)}
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {utilData.players.map((p, i) => (
                  <div key={i} className="text-xs flex justify-between font-semibold text-gray-700 dark:text-gray-300">
                    <span className="truncate mr-1">{p.name}</span>
                    <span className="text-gray-400">{p.value.toFixed(0)}</span>
                  </div>
                ))}
                {(slotCandidates['UTIL'] || []).length > 0 && (
                  <select
                    className="mt-1 w-full text-[10px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    value=""
                    onChange={(e) => { if (e.target.value) handleAssignToSlot(e.target.value, 'UTIL') }}
                  >
                    <option value="">{utilData.players.length > 0 ? 'Reassign...' : 'Assign...'}</option>
                    {(slotCandidates['UTIL'] || []).map(c => (
                      <option key={c.name} value={c.name}>{c.name} ({c.value.toFixed(0)})</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Bench & Farm (bestLineup mode only) */}
          {viewMode === 'bestLineup' && (benchFarmData.bench.length > 0 || benchFarmData.farm.length > 0 || benchFarmData.extraPitchers.length > 0) && (
            <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Bench */}
                {benchFarmData.bench.length > 0 && (
                  <div>
                    <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200 mb-2">
                      Bench ({benchFarmData.bench.length})
                    </h3>
                    <div className="space-y-1">
                      {benchFarmData.bench.map((p, i) => (
                        <div key={i} className="text-xs flex items-center justify-between gap-1">
                          <span className="truncate text-gray-700 dark:text-gray-300 font-medium">{p.name}</span>
                          <span className="text-gray-400 shrink-0">{p.value.toFixed(0)}</span>
                          <span className="text-[9px] text-gray-400 shrink-0">{p.basePositions.join(',')}</span>
                          <select
                            className="text-[10px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 shrink-0"
                            value=""
                            onChange={(e) => { if (e.target.value) handleAssignToSlot(p.name, e.target.value) }}
                          >
                            <option value="">Assign</option>
                            {getEligibleSlots(p).map(slot => (
                              <option key={slot} value={slot}>{slot}{slot in lockedSlots ? ' (locked)' : ''}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extra Pitchers */}
                {benchFarmData.extraPitchers.length > 0 && (
                  <div>
                    <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200 mb-2">
                      Extra Pitchers ({benchFarmData.extraPitchers.length})
                    </h3>
                    <div className="space-y-1">
                      {benchFarmData.extraPitchers.map((p, i) => (
                        <div key={i} className="text-xs flex items-center justify-between gap-1">
                          <span className="truncate text-gray-700 dark:text-gray-300">{p.name}</span>
                          <span className={`text-[9px] px-1 rounded ${p.pitcherType === 'SP' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}`}>
                            {p.pitcherType}
                          </span>
                          <span className="text-gray-400 shrink-0">{p.value.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Farm */}
                {benchFarmData.farm.length > 0 && (
                  <div>
                    <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200 mb-2">
                      Farm ({benchFarmData.farm.length})
                    </h3>
                    <div className="space-y-1">
                      {benchFarmData.farm.map((p, i) => (
                        <div key={i} className="text-xs flex items-center justify-between gap-1 italic text-gray-400 dark:text-gray-500">
                          <span className="truncate">{p.name}</span>
                          <span className="shrink-0">{p.value.toFixed(0)}</span>
                          {!p.isPitcher && p.basePositions.length > 0 && (
                            <>
                              <span className="text-[9px] shrink-0">{p.basePositions.join(',')}</span>
                              <select
                                className="text-[10px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0 not-italic"
                                value=""
                                onChange={(e) => { if (e.target.value) handleAssignToSlot(p.name, e.target.value) }}
                              >
                                <option value="">Assign</option>
                                {getEligibleSlots(p).map(slot => (
                                  <option key={slot} value={slot}>{slot}{slot in lockedSlots ? ' (locked)' : ''}</option>
                                ))}
                              </select>
                            </>
                          )}
                          {p.isPitcher && (
                            <span className={`text-[9px] px-1 rounded not-italic ${p.pitcherType === 'SP' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}`}>
                              {p.pitcherType}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {Object.keys(lockedSlots).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {Object.keys(lockedSlots).length} slot{Object.keys(lockedSlots).length > 1 ? 's' : ''} locked
                  </span>
                  <button
                    onClick={() => setLockedSlots({})}
                    className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    Clear all locks
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* League Comparison Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            League Comparison {viewMode === 'bestLineup' ? '(Best Lineup)' : viewMode === 'depthChart' ? '(Depth Chart)' : ''}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {[
                  { key: 'franchise', label: 'Franchise' },
                  { key: 'total', label: 'Total' },
                  ...(displayPositions as readonly string[]).map(p => ({ key: p, label: p })),
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none whitespace-nowrap"
                  >
                    {col.label}
                    {sortCol === col.key && (sortDir === 'desc' ? ' \u25BC' : ' \u25B2')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {comparisonRows.map(row => (
                <tr
                  key={row.franchise}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    row.franchise === selectedFranchise ? 'bg-blue-50 dark:bg-blue-900/20 font-medium' : ''
                  }`}
                >
                  <td className="px-2 py-2 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                    {row.franchise}
                  </td>
                  <td className="px-2 py-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {row.total.toFixed(0)}
                  </td>
                  {(displayPositions as readonly string[]).map(pos => {
                    const val = row.posValues[pos] ?? 0
                    const rank = leagueRanks[row.franchise]?.[pos]
                    return (
                      <td key={pos} className="px-2 py-2 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <span>{val > 0 ? val.toFixed(0) : '—'}</span>
                          {rank != null && rank <= 3 && (
                            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold ${
                              rank === 1 ? 'bg-green-500' : 'bg-blue-500'
                            }`}>
                              {rank}
                            </span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
