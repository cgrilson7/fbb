'use client'

import { useState, useMemo, useEffect } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Loader2, Trophy, Users, Hash } from 'lucide-react'
import Diamond from './Diamond'
import type { PositionCard, SlotCandidate } from './Diamond'
import type { Player } from '@/types'
import {
  BASE_POSITIONS,
  LINEUP_SLOTS,
  POS_SLOTS,
  PITCHER_SLOTS,
  ALL_START_SLOTS,
  SLOT_ELIGIBILITY,
  type LineupPlayer,
  getBasePositions,
  getPrimaryPosition,
  isEligibleForSlot,
  findOptimalLineup,
} from '@/lib/lineup'
import { computeStandings, fieldFor } from '@/lib/rotoStandings'
import { isExpiring } from '@/lib/contracts'
import {
  LEAGUE_CATEGORIES,
  classifyPitcherRole,
  emptyRaw,
  addRaw,
  subRaw,
  finalize,
  rotoPointsVsField,
  rankInField,
} from '@/lib/categories'
import {
  optimizeRotoLineup,
  assignmentRaw,
  analyzePitcherMix,
  type RosterEntry,
  type SlotAssignment,
} from '@/lib/rotoLineup'

const MY_FRANCHISE = 'Colin Wilson & Greg Holmes'

// Roster mode: group players by primary position
const ROSTER_DISPLAY_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'] as const

// Slots shown on the diamond SVG (field positions only)
const DIAMOND_LINEUP_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'LF', 'CF', 'RF', 'OF'] as const

type ValueMetric = 'hkb' | 'fpts' | 'fpRank'
type ZipsSource = 'zips' | 'zipsDc' | 'zipsRos'
type ViewMode = 'roster' | 'bestLineup' | 'depthChart' | 'rosCategories' | 'distributions'
type LineupBasis = 'roto' | 'metric'

function entryToLineupPlayer(e: RosterEntry): LineupPlayer {
  return {
    name: e.name,
    value: e.fpts,
    isFarm: e.isFarm,
    basePositions: e.basePositions,
    isPitcher: e.isPitcher,
    pitcherType: e.isPitcher ? classifyPitcherRole(e.proj) : null,
  }
}

function catFmt(v: number, decimals: number): string {
  if (decimals === 0) return Math.round(v).toString()
  const s = v.toFixed(decimals)
  return decimals === 3 ? s.replace(/^0/, '') : s
}

function catRankClass(rank: number, n: number): string {
  const pct = (rank - 1) / Math.max(1, n - 1)
  if (pct <= 0.2) return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
  if (pct <= 0.45) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  if (pct <= 0.7) return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
}

export default function FranchiseValuePage() {
  const { players, franchiseMappings, lockedSlots, lockedSlotsFranchise, lockedSlotsMetric, setLockedSlots, clearLockedSlots, setLockedSlotsMeta } = usePlayerStore()
  const hasHydrated = useHydration()
  const [selectedFranchise, setSelectedFranchise] = useState(MY_FRANCHISE)
  const [viewMode, setViewMode] = useState<ViewMode>('roster')
  const [valueMetric, setValueMetric] = useState<ValueMetric>('hkb')
  const [zipsSource, setZipsSource] = useState<ZipsSource>('zips')
  const [lineupBasis, setLineupBasis] = useState<LineupBasis>('roto')
  const [excludeExpiring, setExcludeExpiring] = useState(true)
  const [sortCol, setSortCol] = useState<string>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Sync locked slots metadata when franchise or metric changes
  useEffect(() => {
    if (viewMode === 'bestLineup') {
      // Clear locks if franchise or metric changed from what was stored
      if (lockedSlotsFranchise && lockedSlotsFranchise !== selectedFranchise) {
        clearLockedSlots()
      }
      // 'roto:ros' matches the waiver page's key, so a lineup locked here
      // carries over there (and vice versa)
      const currentMetricKey = lineupBasis === 'roto' ? 'roto:ros' : valueMetric === 'fpts' ? `fpts:${zipsSource}` : valueMetric
      if (lockedSlotsMetric && lockedSlotsMetric !== currentMetricKey) {
        clearLockedSlots()
      }
      setLockedSlotsMeta(selectedFranchise, currentMetricKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFranchise, valueMetric, zipsSource, viewMode, lineupBasis])

  // Clear locks when switching franchise or view mode
  const handleFranchiseChange = (f: string) => {
    setSelectedFranchise(f)
    clearLockedSlots()
  }
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    clearLockedSlots()
  }

  const zipsLabel = zipsSource === 'zipsDc' ? 'ZiPS DC' : zipsSource === 'zipsRos' ? 'RoS DC' : 'ZiPS'
  const rotoLineupActive = viewMode === 'bestLineup' && lineupBasis === 'roto'
  // Expiring-contract exclusion applies to dynasty-value views only — RoS roto
  // views keep rentals because they still play this season
  const expiringFilterActive = excludeExpiring && viewMode !== 'rosCategories' && !rotoLineupActive
  const metricLabel = rotoLineupActive ? 'RoS DC FPTS' : valueMetric === 'hkb' ? 'HKB Value' : valueMetric === 'fpts' ? `${zipsLabel} FPTS` : 'FP Rank Value'

  const franchises = useMemo(() => {
    return franchiseMappings
      .filter(m => m.fullName !== 'Free Agent')
      .map(m => m.fullName)
      .sort()
  }, [franchiseMappings])

  // Extract value from a player based on selected metric
  function getPlayerValue(p: typeof players[number]): number | null {
    // Roto-optimized best lineup always displays RoS Depth Charts FPTS
    if (rotoLineupActive) return p.zipsRosProjection?.fpts ?? null
    if (valueMetric === 'fpts') {
      const proj = zipsSource === 'zipsDc' ? p.zipsDcProjection : zipsSource === 'zipsRos' ? p.zipsRosProjection : p.zipsProjection
      return proj?.fpts ?? null
    }
    if (valueMetric === 'fpRank') return p.fpRank != null ? 301 - p.fpRank : null
    return p.hkbValue
  }

  // Pre-process all franchise players with eligibility data
  const franchisePlayersByTeam = useMemo(() => {
    const map: Record<string, LineupPlayer[]> = {}
    franchises.forEach(f => { map[f] = [] })
    players.forEach(p => {
      if (!p.franchise || !map[p.franchise]) return
      if (expiringFilterActive && isExpiring(p)) return
      const value = getPlayerValue(p)
      if (value === null || value === undefined) return
      const posStr = p.position
      const positions = posStr.split(',').map(s => s.trim())
      const isPitcher = positions.includes('SP') || positions.includes('RP') || positions.includes('P')
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
  }, [players, franchises, valueMetric, zipsSource, rotoLineupActive, expiringFilterActive])

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
      if (expiringFilterActive && isExpiring(p)) return
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
  }, [players, franchises, valueMetric, zipsSource, rotoLineupActive, expiringFilterActive])

  // League-wide roto standings (RoS Depth Charts, roto-optimal lineups).
  // Needed by the RoS Categories view and the roto-based Best Lineup view.
  const rotoStandingsMap = useMemo(() => {
    if (viewMode !== 'rosCategories' && !rotoLineupActive) return null
    const valid = new Set(franchises)
    const m = new Map<string, Player[]>()
    for (const p of players) {
      if (!p.franchise || !valid.has(p.franchise) || p.isAvailable) continue
      if (!m.has(p.franchise)) m.set(p.franchise, [])
      m.get(p.franchise)!.push(p)
    }
    return computeStandings(m)
  }, [viewMode, rotoLineupActive, players, franchises])

  // Selected franchise's roto lineup, honoring slot locks
  const selectedRotoAssign = useMemo((): SlotAssignment | null => {
    if (!rotoLineupActive || !rotoStandingsMap) return null
    const st = rotoStandingsMap.get(selectedFranchise)
    if (!st) return null
    if (Object.keys(lockedSlots).length === 0) return st.lineup
    return optimizeRotoLineup(st.entries, lockedSlots, fieldFor(rotoStandingsMap, selectedFranchise))
  }, [rotoLineupActive, rotoStandingsMap, selectedFranchise, lockedSlots])

  // Compute optimal lineups for all franchises (best lineup mode).
  // Roto basis: lineups come from the roto-points optimizer (RoS DC data);
  // Metric basis: value-maximizing assignment for the selected metric.
  // Selected franchise uses lockedSlots; others use no locks.
  const optimalLineups = useMemo(() => {
    if (viewMode !== 'bestLineup') return {}
    const lineups: Record<string, Record<string, LineupPlayer | null>> = {}
    if (lineupBasis === 'roto' && rotoStandingsMap) {
      franchises.forEach(f => {
        const assign = f === selectedFranchise && selectedRotoAssign ? selectedRotoAssign : rotoStandingsMap.get(f)?.lineup
        const rec: Record<string, LineupPlayer | null> = {}
        if (assign) {
          for (const slot of ALL_START_SLOTS) {
            const e = assign[slot]
            rec[slot] = e ? entryToLineupPlayer(e) : null
          }
          // Synthetic lump slot, same shape findOptimalLineup produces
          const chosen = PITCHER_SLOTS.map(s => assign[s]).filter((e): e is RosterEntry => !!e)
          rec['P'] = chosen.length > 0
            ? { name: `${chosen.length} pitchers`, value: chosen.reduce((s, e) => s + e.fpts, 0), isFarm: false, basePositions: [], isPitcher: true, pitcherType: null }
            : null
        }
        lineups[f] = rec
      })
      return lineups
    }
    franchises.forEach(f => {
      const locks = f === selectedFranchise ? lockedSlots : {}
      lineups[f] = findOptimalLineup(franchisePlayersByTeam[f] || [], locks)
    })
    return lineups
  }, [viewMode, lineupBasis, rotoStandingsMap, selectedRotoAssign, franchises, franchisePlayersByTeam, selectedFranchise, lockedSlots])

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

  // Distribution data: all franchises as rows, bucketed by metric, sorted by avg
  const distributionData = useMemo(() => {
    if (viewMode !== 'distributions') return null

    const RANK_BUCKETS = [
      { label: '1-15', min: 1, max: 15 },
      { label: '16-50', min: 16, max: 50 },
      { label: '51-100', min: 51, max: 100 },
      { label: '101-150', min: 101, max: 150 },
      { label: '151-200', min: 151, max: 200 },
      { label: '201-300', min: 201, max: 300 },
      { label: '301-400', min: 301, max: 400 },
      { label: '400+', min: 401, max: Infinity },
    ]

    // HKB uses rank buckets (same as ECR/ADP)

    type FranchiseRow = { franchise: string; counts: number[]; avg: number; total: number; isSelected: boolean }
    type TableData = { title: string; subtitle: string; bucketLabels: string[]; rows: FranchiseRow[]; lowerIsBetter: boolean }

    function buildRankTable(
      title: string,
      subtitle: string,
      getValue: (p: typeof players[number]) => number | null,
      lowerIsBetter: boolean
    ): TableData {
      const buckets = RANK_BUCKETS
      const byFranchise: Record<string, { counts: number[]; values: number[] }> = {}
      franchises.forEach(f => { byFranchise[f] = { counts: buckets.map(() => 0), values: [] } })

      // Deduplicate by name within franchise (e.g. Ohtani as batter + pitcher) — keep best rank
      const bestByName: Record<string, Record<string, number>> = {} // franchise -> name -> best value
      players.forEach(p => {
        if (!p.franchise || !byFranchise[p.franchise]) return
        if (expiringFilterActive && isExpiring(p)) return
        const v = getValue(p)
        if (v == null) return
        if (!bestByName[p.franchise]) bestByName[p.franchise] = {}
        const prev = bestByName[p.franchise][p.name]
        if (prev == null || (lowerIsBetter ? v < prev : v > prev)) {
          bestByName[p.franchise][p.name] = v
        }
      })

      Object.entries(bestByName).forEach(([f, names]) => {
        Object.values(names).forEach(v => {
          const idx = buckets.findIndex(b => v >= b.min && v <= b.max)
          if (idx === -1) return
          byFranchise[f].counts[idx]++
          byFranchise[f].values.push(v)
        })
      })

      const rows: FranchiseRow[] = franchises.map(f => {
        const d = byFranchise[f]
        const avg = d.values.length > 0 ? d.values.reduce((a, b) => a + b, 0) / d.values.length : lowerIsBetter ? Infinity : -Infinity
        return { franchise: f, counts: d.counts, avg, total: d.values.length, isSelected: f === selectedFranchise }
      })

      rows.sort((a, b) => lowerIsBetter ? a.avg - b.avg : b.avg - a.avg)

      return { title, subtitle, bucketLabels: buckets.map(b => b.label), rows, lowerIsBetter }
    }

    return [
      buildRankTable('FantasyPros Dynasty ECR', 'Sorted by avg ECR (lower = better)', p => p.fpRank, true),
      buildRankTable('Fantrax ADP', 'Sorted by avg ADP (lower = better)', p => p.adp, true),
      buildRankTable('HKB Dynasty Rank', 'Sorted by avg HKB rank (lower = better)', p => p.hkbRank, true),
    ]
  }, [viewMode, players, franchises, selectedFranchise, expiringFilterActive])

  // Projected RoS roto standings sorted for the RoS Categories view
  const rosStandings = useMemo(() => {
    if (viewMode !== 'rosCategories' || !rotoStandingsMap) return null
    return [...rotoStandingsMap.values()].sort((a, b) => b.rotoTotal - a.rotoTotal)
  }, [viewMode, rotoStandingsMap])

  // 14-category totals + ranks + roto points for the selected roto lineup
  const rotoCatPanel = useMemo(() => {
    if (!rotoLineupActive || !selectedRotoAssign || !rotoStandingsMap) return null
    const field = fieldFor(rotoStandingsMap, selectedFranchise)
    const totals = finalize(assignmentRaw(selectedRotoAssign))
    return { totals, field, points: rotoPointsVsField(totals, field), n: rotoStandingsMap.size }
  }, [rotoLineupActive, selectedRotoAssign, rotoStandingsMap, selectedFranchise])

  // Pitching plan: optimal SP/RP mix sweep + marginal roto value per pitcher
  const pitchingAnalysis = useMemo(() => {
    if (!rotoLineupActive || !selectedRotoAssign || !rotoStandingsMap) return null
    const st = rotoStandingsMap.get(selectedFranchise)
    if (!st) return null
    const field = fieldFor(rotoStandingsMap, selectedFranchise)

    let hitterRaw = emptyRaw()
    for (const slot of POS_SLOTS) {
      const e = selectedRotoAssign[slot]
      if (e) hitterRaw = addRaw(hitterRaw, e.raw)
    }
    const mixes = analyzePitcherMix(st.entries, hitterRaw, field)

    const lineupRaw = assignmentRaw(selectedRotoAssign)
    const basePts = rotoPointsVsField(finalize(lineupRaw), field)
    const inLineup = new Set(PITCHER_SLOTS.map(s => selectedRotoAssign[s]?.name).filter((n): n is string => !!n))

    const marginal = st.entries
      .filter(e => e.isPitcher && !e.isFarm)
      .map(p => {
        let m: number
        if (inLineup.has(p.name)) {
          // Value of holding: points lost if removed outright
          m = basePts - rotoPointsVsField(finalize(subRaw(lineupRaw, p.raw)), field)
        } else {
          // Value of adding: best single swap into the 10
          m = -Infinity
          for (const slot of PITCHER_SLOTS) {
            const occ = selectedRotoAssign[slot]
            const raw = addRaw(occ ? subRaw(lineupRaw, occ.raw) : lineupRaw, p.raw)
            m = Math.max(m, rotoPointsVsField(finalize(raw), field) - basePts)
          }
          if (m === -Infinity) m = 0
        }
        return { entry: p, role: classifyPitcherRole(p.proj), inLineup: inLineup.has(p.name), marginal: m }
      })
      .sort((a, b) => b.marginal - a.marginal)

    const currentMix = {
      sp: marginal.filter(x => x.inLineup && x.role === 'SP').length,
      rp: marginal.filter(x => x.inLineup && x.role === 'RP').length,
    }
    const bestMix = mixes.length > 0 ? mixes.reduce((a, b) => (b.points > a.points ? b : a)) : null

    return { mixes, marginal, basePts, currentMix, bestMix }
  }, [rotoLineupActive, selectedRotoAssign, rotoStandingsMap, selectedFranchise])

  // Pitcher sidebar data for selected franchise
  const pitcherData = useMemo(() => {
    const teamPlayers = franchisePlayersByTeam[selectedFranchise] || []
    const pitchers = teamPlayers.filter(p => p.isPitcher).sort((a, b) => b.value - a.value)
    if (viewMode === 'bestLineup') {
      // Read the chosen 10 from the lineup's P slots (in roto mode this can
      // differ from the top 10 by value)
      const lineup = optimalLineups[selectedFranchise] || {}
      const chosen = PITCHER_SLOTS.map(s => lineup[s]).filter((p): p is LineupPlayer => !!p)
        .sort((a, b) => b.value - a.value)
      return {
        players: chosen.map(p => ({ name: p.name, value: p.value, isFarm: p.isFarm, type: p.pitcherType })),
        totalValue: chosen.reduce((sum, p) => sum + p.value, 0),
      }
    }
    // roster and depthChart modes show all pitchers
    return {
      players: pitchers.map(p => ({ name: p.name, value: p.value, isFarm: p.isFarm, type: p.pitcherType })),
      totalValue: pitchers.reduce((sum, p) => sum + p.value, 0),
    }
  }, [franchisePlayersByTeam, selectedFranchise, viewMode, optimalLineups])

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
          count += PITCHER_SLOTS.filter(s => optimalLineups[selectedFranchise]?.[s] != null).length
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
    const next = { ...lockedSlots }
    if (slot in next) {
      delete next[slot]
    } else {
      const player = optimalLineups[selectedFranchise]?.[slot]
      if (player && player.name) {
        next[slot] = player.name
      }
    }
    setLockedSlots(next)
  }

  // Assign a player to a slot (locks them there)
  const handleAssignToSlot = (playerName: string, slot: string) => {
    const next = { ...lockedSlots }
    // Remove player from any other locked slot
    for (const [s, name] of Object.entries(next)) {
      if (name === playerName) delete next[s]
    }
    next[slot] = playerName
    setLockedSlots(next)
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

    // Chosen pitchers come from the lineup's P slots (roto mode may skip a
    // higher-FPTS arm for category reasons)
    const top10Pitchers = new Set(
      PITCHER_SLOTS.map(s => lineup[s]?.name).filter((n): n is string => !!n)
    )

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
            <button
              onClick={() => handleViewModeChange('rosCategories')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'rosCategories'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              RoS Categories
            </button>
            <button
              onClick={() => handleViewModeChange('distributions')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'distributions'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              Distributions
            </button>
          </div>
          {viewMode === 'bestLineup' && (
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['roto', 'metric'] as const).map(b => (
                <button
                  key={b}
                  onClick={() => { setLineupBasis(b); clearLockedSlots() }}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    lineupBasis === b
                      ? 'bg-green-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {b === 'roto' ? 'Roto Points (RoS)' : 'Metric Value'}
                </button>
              ))}
            </div>
          )}
          {!rotoLineupActive && <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
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
              {zipsLabel} FPTS
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
          </div>}
          {!rotoLineupActive && valueMetric === 'fpts' && (
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['zips', 'zipsDc', 'zipsRos'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setZipsSource(s)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    zipsSource === s
                      ? 'bg-teal-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {s === 'zips' ? 'ZiPS' : s === 'zipsDc' ? 'ZiPS DC' : 'RoS DC'}
                </button>
              ))}
            </div>
          )}
          {viewMode !== 'rosCategories' && !rotoLineupActive && (
            <label
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap cursor-pointer"
              title="Hide players whose contract ends in 2026 (rentals, final-year YP deals, in-season pickups) — no dynasty value beyond this season. Ceddanne Rafaela is kept (planned Hometown Discount)."
            >
              <input
                type="checkbox"
                checked={excludeExpiring}
                onChange={(e) => setExcludeExpiring(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Excl. expiring
            </label>
          )}
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
          {rotoLineupActive
            ? 'Roto-optimal lineup: C, 1B, 2B, 3B, SS, MI, CI, LF, CF, RF, OF, DH, UTIL + 10 Pitchers, chosen to maximize projected roto points across all 14 league categories (RoS Depth Charts projections, every opponent also at its roto-optimal lineup). Player values shown are RoS DC FPTS.'
            : 'Optimal lineup per Section 2.4: C, 1B, 2B, 3B, SS, MI, CI, LF, CF, RF, OF, DH, UTIL + 10 Pitchers. Multi-position players assigned to maximize total value.'}
        </p>
      )}
      {viewMode === 'depthChart' && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Full organizational depth at each position. Multi-position players appear at every eligible position.
        </p>
      )}
      {viewMode === 'rosCategories' && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Projected rest-of-season roto standings using FanGraphs RoS Depth Charts projections. Every franchise fields its
          roto-optimal 23-man lineup (13 hitters + 10 pitchers), then teams are ranked in all 14 league categories —
          points = {franchises.length} for 1st down to 1 for last.
        </p>
      )}

      {/* Summary Cards */}
      {viewMode !== 'rosCategories' && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>}

      {/* RoS Category Standings View */}
      {viewMode === 'rosCategories' && rosStandings && (() => {
        const n = rosStandings.length
        const selected = rosStandings.find(s => s.franchise === selectedFranchise)
        const selRank = selected ? rosStandings.indexOf(selected) + 1 : null
        const maxPts = n * LEAGUE_CATEGORIES.length
        const batCats = LEAGUE_CATEGORIES.filter(c => c.group === 'bat')
        const pitCats = LEAGUE_CATEGORIES.filter(c => c.group === 'pit')
        return (
          <div className="space-y-4">
            {/* Summary cards for selected franchise */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <Trophy className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Projected Roto Points</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selected ? selected.rotoTotal : '—'} <span className="text-sm font-normal text-gray-400">/ {maxPts}</span>
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">Projected RoS Finish</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">#{selRank ?? '—'} of {n}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gap to Leader</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selected ? (rosStandings[0].rotoTotal - selected.rotoTotal === 0 ? 'Leading' : `-${rosStandings[0].rotoTotal - selected.rotoTotal} pts`) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* League-wide category standings table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Projected RoS Category Standings</h2>
                <p className="text-xs text-gray-400 mt-0.5">Each cell: projected value with category rank. Green = top of league, red = bottom.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Franchise</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400 uppercase">Pts</th>
                      {[...batCats, ...pitCats].map(cat => (
                        <th key={cat.key} className="px-1.5 py-2 text-center font-medium text-gray-500 dark:text-gray-400 uppercase">{cat.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {rosStandings.map((s, i) => (
                      <tr key={s.franchise} className={s.franchise === selectedFranchise ? 'bg-blue-50 dark:bg-blue-900/20 font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}>
                        <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-1.5 text-gray-900 dark:text-white whitespace-nowrap">
                          {s.franchise.length > 26 ? s.franchise.slice(0, 24) + '…' : s.franchise}
                        </td>
                        <td className="px-2 py-1.5 text-center font-bold text-gray-900 dark:text-white tabular-nums">{s.rotoTotal}</td>
                        {[...batCats, ...pitCats].map(cat => (
                          <td key={cat.key} className="px-1.5 py-1.5 text-center">
                            <div className="tabular-nums text-gray-700 dark:text-gray-300">{catFmt(s.totals[cat.key], cat.decimals)}</div>
                            <div className={`mt-0.5 inline-flex items-center justify-center px-1 rounded text-[10px] font-bold ${catRankClass(s.ranks[cat.key], n)}`}>
                              #{s.ranks[cat.key]}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected franchise: strengths & weaknesses */}
            {selected && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{selectedFranchise} — category detail</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {[batCats, pitCats].map((group, gi) => (
                        <tr key={gi} className="align-top">
                          {group.map(cat => (
                            <td key={cat.key} className="px-2 py-1.5 text-center border-r border-gray-100 dark:border-gray-700/50 last:border-0">
                              <div className="text-[10px] uppercase tracking-wide text-gray-400">{cat.label}</div>
                              <div className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{catFmt(selected.totals[cat.key], cat.decimals)}</div>
                              <div className={`mt-0.5 inline-flex items-center justify-center px-1.5 rounded text-[10px] font-bold ${catRankClass(selected.ranks[cat.key], n)}`}>
                                #{selected.ranks[cat.key]} · {selected.points[cat.key]} pts
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Distributions View */}
      {viewMode === 'distributions' && distributionData && (
        <div className="space-y-6">
          {distributionData.map((table, ti) => (
            <div key={ti} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-0.5">{table.title}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{table.subtitle}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-1.5 px-2 text-gray-500 dark:text-gray-400 font-medium sticky left-0 bg-white dark:bg-gray-800">#</th>
                      <th className="text-left py-1.5 px-2 text-gray-500 dark:text-gray-400 font-medium sticky left-6 bg-white dark:bg-gray-800">Franchise</th>
                      {table.bucketLabels.map((label, i) => (
                        <th key={i} className="text-center py-1.5 px-2 text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">{label}</th>
                      ))}
                      <th className="text-center py-1.5 px-2 text-gray-500 dark:text-gray-400 font-medium">N</th>
                      <th className="text-center py-1.5 px-2 text-gray-500 dark:text-gray-400 font-medium">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, ri) => {
                      // Find max count per column across all franchises for heat-map
                      const colMaxes = table.bucketLabels.map((_, ci) => Math.max(...table.rows.map(r => r.counts[ci])))
                      return (
                        <tr key={ri} className={`border-b border-gray-100 dark:border-gray-700/50 ${row.isSelected ? 'font-semibold' : ''}`}>
                          <td className={`py-1.5 px-2 sticky left-0 ${row.isSelected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800'}`}>{ri + 1}</td>
                          <td className={`py-1.5 px-2 sticky left-6 whitespace-nowrap ${row.isSelected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800'}`}>
                            {row.franchise.length > 24 ? row.franchise.slice(0, 22) + '...' : row.franchise}
                          </td>
                          {row.counts.map((count, ci) => {
                            const max = colMaxes[ci]
                            const intensity = max > 0 ? count / max : 0
                            // For rank-based (lower is better): more players in low buckets = green
                            // For HKB (higher is better): more players in high buckets = green
                            // Use a simple green intensity based on count relative to column max
                            const bgStyle = count > 0 ? { backgroundColor: `rgba(34, 197, 94, ${intensity * 0.3})` } : undefined
                            return (
                              <td key={ci} className={`text-center py-1.5 px-1.5 tabular-nums ${count > 0 ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`} style={bgStyle}>
                                {count || '-'}
                              </td>
                            )
                          })}
                          <td className="text-center py-1.5 px-2 text-gray-500 dark:text-gray-400 tabular-nums">{row.total}</td>
                          <td className="text-center py-1.5 px-2 tabular-nums font-medium text-gray-700 dark:text-gray-300">
                            {row.avg === Infinity || row.avg === -Infinity ? '-' : row.avg.toFixed(1)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RoS category facts for the roto-optimal lineup */}
      {rotoLineupActive && rotoCatPanel && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Projected RoS categories — this lineup</h2>
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Roto points </span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{rotoCatPanel.points}</span>
              <span className="text-gray-400"> / {rotoCatPanel.n * LEAGUE_CATEGORIES.length}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {[LEAGUE_CATEGORIES.filter(c => c.group === 'bat'), LEAGUE_CATEGORIES.filter(c => c.group === 'pit')].map((group, gi) => (
                  <tr key={gi} className="align-top">
                    {group.map(cat => {
                      const v = rotoCatPanel.totals[cat.key]
                      const { rank } = rankInField(cat.key, v, rotoCatPanel.field)
                      return (
                        <td key={cat.key} className="px-2 py-1.5 text-center border-r border-gray-100 dark:border-gray-700/50 last:border-0">
                          <div className="text-[10px] uppercase tracking-wide text-gray-400">{cat.label}</div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{catFmt(v, cat.decimals)}</div>
                          <div className={`mt-0.5 inline-flex items-center justify-center px-1.5 rounded text-[10px] font-bold ${catRankClass(rank, rotoCatPanel.n)}`}>#{rank}</div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Diamond + Pitcher Sidebar */}
      {viewMode !== 'distributions' && viewMode !== 'rosCategories' && <div className="grid grid-cols-[200px_1fr] gap-4">
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
                    onClick={() => clearLockedSlots()}
                    className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    Clear all locks
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>}

      {/* Pitching plan: optimal SP/RP mix + best arms on roster */}
      {rotoLineupActive && pitchingAnalysis && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Pitching plan — SP/RP mix
              <span className="ml-2 text-xs font-normal text-gray-400">
                each mix re-optimizes the 10 pitcher slots (hitters fixed); current lineup: {pitchingAnalysis.currentMix.sp} SP / {pitchingAnalysis.currentMix.rp} RP
              </span>
            </h2>
            <div className="mt-2 overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 dark:text-gray-400">
                    <th className="text-left pr-4 py-1 font-medium">Mix</th>
                    <th className="text-right pr-4 py-1 font-medium">Roto Pts</th>
                    <th className="text-right pr-4 py-1 font-medium">Δ vs lineup</th>
                    <th className="text-left py-1 font-medium">Pitchers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {pitchingAnalysis.mixes.map(mix => {
                    const isBest = pitchingAnalysis.bestMix && mix.sp === pitchingAnalysis.bestMix.sp && mix.rp === pitchingAnalysis.bestMix.rp
                    const isCurrent = mix.sp === pitchingAnalysis.currentMix.sp && mix.rp === pitchingAnalysis.currentMix.rp
                    const d = mix.points - pitchingAnalysis.basePts
                    return (
                      <tr key={`${mix.sp}-${mix.rp}`} className={isBest ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                        <td className="pr-4 py-1 whitespace-nowrap text-gray-900 dark:text-gray-100">
                          {mix.sp} SP / {mix.rp} RP
                          {isBest && <span className="ml-1.5 text-[10px] px-1 rounded bg-green-600 text-white font-bold">OPTIMAL</span>}
                          {isCurrent && <span className="ml-1.5 text-[10px] px-1 rounded bg-blue-600 text-white font-bold">CURRENT</span>}
                        </td>
                        <td className="pr-4 py-1 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">{mix.points}</td>
                        <td className={`pr-4 py-1 text-right tabular-nums ${d > 0 ? 'text-green-600 dark:text-green-400' : d < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                          {d > 0 ? '+' : ''}{d}
                        </td>
                        <td className="py-1 text-xs text-gray-500 dark:text-gray-400">
                          {[...mix.pitchers].sort((a, b) => b.fpts - a.fpts).map(p => p.name.split(' ').slice(-1)[0]).join(', ')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            {(['SP', 'RP'] as const).map(role => {
              const list = pitchingAnalysis.marginal.filter(x => x.role === role)
              return (
                <div key={role}>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    {role === 'SP' ? 'Starters' : 'Relievers'} on roster ({list.length})
                    <span className="ml-2 text-xs font-normal text-gray-400">by marginal roto value vs this lineup</span>
                  </h3>
                  <div className="space-y-0.5">
                    {list.length === 0 && <div className="text-xs text-gray-400">none</div>}
                    {list.map(x => (
                      <div key={x.entry.name} className="flex items-center justify-between text-xs gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`truncate ${x.inLineup ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>{x.entry.name}</span>
                          {x.inLineup && <span className="text-[9px] px-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-bold shrink-0">IN</span>}
                        </span>
                        <span className="text-gray-400 tabular-nums flex gap-2 shrink-0">
                          <span className="w-11 text-right">{(x.entry.proj.ip ?? 0).toFixed(0)} IP</span>
                          {role === 'SP'
                            ? <span className="w-10 text-right">{x.entry.proj.qs ?? 0} QS</span>
                            : <span className="w-16 text-right">{x.entry.proj.sv ?? 0} SV/{x.entry.proj.hld ?? 0} HD</span>}
                          <span className="w-9 text-right">{(x.entry.proj.era ?? 0).toFixed(2)}</span>
                          <span className="w-8 text-right">{x.entry.proj.k ?? 0} K</span>
                          <span className={`w-9 text-right font-bold ${x.marginal > 0 ? 'text-green-600 dark:text-green-400' : x.marginal < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                            {x.inLineup ? '' : '+'}{x.marginal}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400">
            IN = in the current roto-optimal 10. Marginal value: for lineup arms, roto points lost if dropped outright; for others, best roto-point gain from a single swap into the 10.
          </p>
        </div>
      )}

      {/* League Comparison Table */}
      {viewMode !== 'distributions' && viewMode !== 'rosCategories' && <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
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
      </div>}
    </div>
  )
}
