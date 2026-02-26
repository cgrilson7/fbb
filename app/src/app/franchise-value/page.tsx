'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Loader2, Trophy, Users, Hash } from 'lucide-react'
import Diamond from './Diamond'
import type { PositionCard } from './Diamond'

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

// Greedy lineup assignment with swap improvement.
// Fills all 13 position-player slots per Section 2.4 to maximize total HKB value.
function findOptimalLineup(
  allPlayers: LineupPlayer[]
): Record<string, LineupPlayer | null> {
  const posPlayers = allPlayers.filter(p => !p.isPitcher).sort((a, b) => b.value - a.value)
  const pitchers = allPlayers.filter(p => p.isPitcher).sort((a, b) => b.value - a.value)

  const POS_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTIL'] as const

  // Greedy pass: fill most-constrained slots first with best available player
  const eligible: Record<string, number[]> = {}
  for (const slot of POS_SLOTS) {
    eligible[slot] = posPlayers
      .map((p, i) => ({ i, ok: isEligibleForSlot(p, slot) }))
      .filter(x => x.ok)
      .map(x => x.i)
  }

  const sortedSlots = [...POS_SLOTS].sort(
    (a, b) => eligible[a].length - eligible[b].length
  )

  const assignment: Record<string, number | undefined> = {}
  const used = new Set<number>()

  for (const slot of sortedSlots) {
    const best = eligible[slot].find(i => !used.has(i))
    if (best !== undefined) {
      assignment[slot] = best
      used.add(best)
    }
  }

  // Swap improvement: try swapping any two assigned players to increase total value.
  // Also try moving an assigned player to a different slot and backfilling.
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < sortedSlots.length; i++) {
      for (let j = i + 1; j < sortedSlots.length; j++) {
        const slotA = sortedSlots[i], slotB = sortedSlots[j]
        const pA = assignment[slotA], pB = assignment[slotB]
        // Try swapping
        const aCanGoB = pA !== undefined && isEligibleForSlot(posPlayers[pA], slotB)
        const bCanGoA = pB !== undefined && isEligibleForSlot(posPlayers[pB], slotA)
        if (pA !== undefined && pB !== undefined && aCanGoB && bCanGoA) {
          // Swap is valid but same total — skip unless one slot was empty
          // (both filled swaps don't change total, but check if a higher-value
          // unassigned player could take a freed slot)
        }
        // Try: move player from slotA to slotB (if slotB empty or player in slotB
        // can go to slotA), then find best unassigned for slotA
        if (pA !== undefined && aCanGoB) {
          const oldB = pB
          const oldBCanGoA = oldB !== undefined ? isEligibleForSlot(posPlayers[oldB], slotA) : true
          if (oldBCanGoA) {
            // Temporarily free slotA, put A in B, put B in A
            const valBefore = (pA !== undefined ? posPlayers[pA].value : 0) + (pB !== undefined ? posPlayers[pB].value : 0)
            // After swap: A in slotB, oldB in slotA
            const valAfterSwap = posPlayers[pA].value + (oldB !== undefined ? posPlayers[oldB].value : 0)
            // But also: can we find a better player for slotA if we free it?
            used.delete(pA)
            if (oldB !== undefined) used.delete(oldB)
            const bestForA = eligible[slotA].find(idx => !used.has(idx) && idx !== pA)
            const valWithNewA = posPlayers[pA].value + (bestForA !== undefined ? posPlayers[bestForA].value : 0)
            if (valWithNewA > valBefore) {
              assignment[slotB] = pA
              assignment[slotA] = bestForA
              used.add(pA)
              if (bestForA !== undefined) used.add(bestForA)
              // oldB is now unassigned
              improved = true
              continue
            }
            // Restore
            used.add(pA)
            if (oldB !== undefined) used.add(oldB)
          }
        }
      }
    }
  }

  // Build result
  const result: Record<string, LineupPlayer | null> = {}
  for (const slot of POS_SLOTS) {
    result[slot] = assignment[slot] !== undefined ? posPlayers[assignment[slot]!] : null
  }

  // Pitchers: best 10 by value
  const topPitchers = pitchers.slice(0, 10)
  const pitcherValue = topPitchers.reduce((sum, p) => sum + p.value, 0)
  result['P'] = topPitchers.length > 0
    ? { name: `${topPitchers.length} pitchers`, value: pitcherValue, isFarm: false, basePositions: [], isPitcher: true, pitcherType: null }
    : null

  return result
}

type ValueMetric = 'hkb' | 'fpts'

export default function FranchiseValuePage() {
  const { players, franchiseMappings } = usePlayerStore()
  const hasHydrated = useHydration()
  const [selectedFranchise, setSelectedFranchise] = useState(MY_FRANCHISE)
  const [viewMode, setViewMode] = useState<'roster' | 'bestLineup' | 'depthChart'>('roster')
  const [valueMetric, setValueMetric] = useState<ValueMetric>('hkb')
  const [sortCol, setSortCol] = useState<string>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const metricLabel = valueMetric === 'hkb' ? 'HKB Value' : 'ZiPS FPTS'

  const franchises = useMemo(() => {
    return franchiseMappings
      .filter(m => m.fullName !== 'Free Agent')
      .map(m => m.fullName)
      .sort()
  }, [franchiseMappings])

  // Extract value from a player based on selected metric
  function getPlayerValue(p: typeof players[number]): number | null {
    if (valueMetric === 'fpts') return p.zipsProjection?.fpts ?? null
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
  const optimalLineups = useMemo(() => {
    if (viewMode !== 'bestLineup') return {}
    const lineups: Record<string, Record<string, LineupPlayer | null>> = {}
    franchises.forEach(f => {
      lineups[f] = findOptimalLineup(franchisePlayersByTeam[f] || [])
    })
    return lineups
  }, [viewMode, franchises, franchisePlayersByTeam])

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
              onClick={() => setViewMode('roster')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'roster'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              Full Roster
            </button>
            <button
              onClick={() => setViewMode('bestLineup')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'bestLineup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              Best Lineup
            </button>
            <button
              onClick={() => setViewMode('depthChart')}
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
          </div>
          <select
            value={selectedFranchise}
            onChange={(e) => setSelectedFranchise(e.target.value)}
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
          <Diamond positions={diamondPositions} mode={viewMode} />

          {/* DH + UTIL below diamond */}
          <div className="mt-2 flex justify-center gap-3">
            {/* DH */}
            {dhData.players.length > 0 && (
              <div className="w-[180px] bg-white dark:bg-gray-800 rounded-lg shadow p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-xs text-gray-700 dark:text-gray-200">DH</h3>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{dhData.totalValue.toFixed(0)}</span>
                    {leagueRanks[selectedFranchise]?.['DH'] != null && (
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold ${rankBadgeClass(leagueRanks[selectedFranchise]['DH'])}`}>
                        {leagueRanks[selectedFranchise]['DH']}
                      </span>
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
              </div>
            )}
            {/* UTIL (bestLineup only) */}
            {utilData && utilData.players.length > 0 && (
              <div className="w-[180px] bg-white dark:bg-gray-800 rounded-lg shadow p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-xs text-gray-700 dark:text-gray-200">UTIL</h3>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{utilData.totalValue.toFixed(0)}</span>
                    {leagueRanks[selectedFranchise]?.['UTIL'] != null && (
                      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[8px] font-bold ${rankBadgeClass(leagueRanks[selectedFranchise]['UTIL'])}`}>
                        {leagueRanks[selectedFranchise]['UTIL']}
                      </span>
                    )}
                  </div>
                </div>
                {utilData.players.map((p, i) => (
                  <div key={i} className="text-xs flex justify-between font-semibold text-gray-700 dark:text-gray-300">
                    <span className="truncate mr-1">{p.name}</span>
                    <span className="text-gray-400">{p.value.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
