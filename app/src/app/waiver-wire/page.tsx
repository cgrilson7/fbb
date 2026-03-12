'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Loader2, Lock, ChevronDown, ChevronRight } from 'lucide-react'
import type { Player } from '@/types'
import {
  POS_SLOTS,
  type LineupPlayer,
  getBasePositions,
  isEligibleForSlot,
  findOptimalLineup,
} from '@/lib/lineup'

const MY_FRANCHISE = 'Colin Wilson & Greg Holmes'

type ValueMetric = 'hkb' | 'fpts' | 'fpRank'
type ZipsSource = 'zips' | 'zipsDc'
type AvailFilter = 'all' | 'fa' | 'waivers'
type TypeFilter = 'all' | 'batters' | 'pitchers'

interface WaiverCandidate {
  player: Player
  lineupPlayer: LineupPlayer
  bestUpgrade: { slot: string; delta: number; replaces: string | null } | null
  allSlots: { slot: string; delta: number; currentOccupant: string | null; isLocked: boolean }[]
}

export default function WaiverWirePage() {
  const { players, franchiseMappings, lockedSlots, lockedSlotsFranchise, lockedSlotsMetric } = usePlayerStore()
  const hasHydrated = useHydration()

  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<string>('all')
  const [availFilter, setAvailFilter] = useState<AvailFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [valueMetric, setValueMetric] = useState<ValueMetric>('hkb')
  const [upgradesOnly, setUpgradesOnly] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<string>('bestUpgrade')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [zipsSource, setZipsSource] = useState<ZipsSource>('zips')

  // Use the franchise/metric from the store locks if set, else default
  const activeFranchise = lockedSlotsFranchise || MY_FRANCHISE
  // Parse stored metric which may be "fpts:zips" or "fpts:zipsDc"
  const parsedStoreMetric = (() => {
    if (!lockedSlotsMetric) return null
    if (lockedSlotsMetric.startsWith('fpts')) return 'fpts' as ValueMetric
    if (lockedSlotsMetric === 'hkb' || lockedSlotsMetric === 'fpRank') return lockedSlotsMetric as ValueMetric
    return null
  })()
  const parsedStoreZipsSource = (() => {
    if (!lockedSlotsMetric) return null
    if (lockedSlotsMetric === 'fpts:zipsDc') return 'zipsDc' as ZipsSource
    if (lockedSlotsMetric.startsWith('fpts')) return 'zips' as ZipsSource
    return null
  })()
  const effectiveMetric = parsedStoreMetric ?? valueMetric
  const effectiveZipsSource = parsedStoreZipsSource ?? zipsSource

  function getPlayerValue(p: typeof players[number]): number | null {
    if (effectiveMetric === 'fpts') {
      const proj = effectiveZipsSource === 'zipsDc' ? p.zipsDcProjection : p.zipsProjection
      return proj?.fpts ?? null
    }
    if (effectiveMetric === 'fpRank') return p.fpRank != null ? 301 - p.fpRank : null
    return p.hkbValue
  }

  const zipsLabel = effectiveZipsSource === 'zipsDc' ? 'ZiPS DC' : 'ZiPS'
  const metricLabel = effectiveMetric === 'hkb' ? 'HKB Value' : effectiveMetric === 'fpts' ? `${zipsLabel} FPTS` : 'FP Rank Value'

  // Build lineup players for the active franchise
  const franchisePlayers = useMemo(() => {
    return players
      .filter(p => p.franchise === activeFranchise)
      .map(p => {
        const value = getPlayerValue(p)
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
        } as LineupPlayer
      })
      .filter((p): p is LineupPlayer => p !== null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, activeFranchise, effectiveMetric, effectiveZipsSource])

  // Compute optimal lineup with current locks
  const optimalLineup = useMemo(() => {
    return findOptimalLineup(franchisePlayers, lockedSlots)
  }, [franchisePlayers, lockedSlots])

  // Top 10 pitchers for pitcher comparison
  const topPitchers = useMemo(() => {
    return franchisePlayers
      .filter(p => p.isPitcher && !p.isFarm)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [franchisePlayers])

  // Available positions for filter
  const positionOptions = ['all', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'SP', 'RP']

  // Build waiver candidates
  const candidates = useMemo(() => {
    const available = players.filter(p => {
      if (!p.isAvailable) return false
      if (availFilter === 'fa' && p.isWaiver) return false
      if (availFilter === 'waivers' && !p.isWaiver) return false
      return true
    })

    return available.map(p => {
      const value = getPlayerValue(p)
      if (value === null || value === undefined) return null

      const posStr = p.position
      const positions = posStr.split(',').map(s => s.trim())
      const isPitcher = positions.includes('SP') || positions.includes('RP')
      const lp: LineupPlayer = {
        name: p.name,
        value,
        isFarm: false,
        basePositions: getBasePositions(posStr),
        isPitcher,
        pitcherType: positions.includes('SP') ? 'SP' : positions.includes('RP') ? 'RP' : null,
      }

      // For pitchers: compare against weakest of top 10
      if (isPitcher) {
        const weakest = topPitchers.length >= 10 ? topPitchers[9] : topPitchers[topPitchers.length - 1]
        const delta = weakest ? value - weakest.value : value
        const replaces = weakest?.name ?? null
        return {
          player: p,
          lineupPlayer: lp,
          bestUpgrade: { slot: 'P', delta, replaces },
          allSlots: [{ slot: 'P', delta, currentOccupant: replaces, isLocked: false }],
        } as WaiverCandidate
      }

      // For position players: check each eligible slot
      const allSlots: WaiverCandidate['allSlots'] = []
      let bestUpgrade: WaiverCandidate['bestUpgrade'] = null

      for (const slot of POS_SLOTS) {
        if (!isEligibleForSlot(lp, slot)) continue
        const current = optimalLineup[slot]
        const isLocked = slot in lockedSlots
        const currentValue = current?.value ?? 0
        const delta = value - currentValue
        allSlots.push({
          slot,
          delta,
          currentOccupant: current?.name ?? null,
          isLocked,
        })
        // Only consider unlocked slots for best upgrade
        if (!isLocked && (bestUpgrade === null || delta > bestUpgrade.delta)) {
          bestUpgrade = { slot, delta, replaces: current?.name ?? null }
        }
      }

      if (allSlots.length === 0) return null

      return { player: p, lineupPlayer: lp, bestUpgrade, allSlots } as WaiverCandidate
    }).filter((c): c is WaiverCandidate => c !== null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, availFilter, effectiveMetric, effectiveZipsSource, optimalLineup, lockedSlots, topPitchers])

  // Filter and sort
  const filteredCandidates = useMemo(() => {
    let result = candidates

    // Search filter
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.player.name.toLowerCase().includes(q) ||
        c.player.team.toLowerCase().includes(q)
      )
    }

    // Batter/pitcher filter
    if (typeFilter === 'batters') {
      result = result.filter(c => !c.lineupPlayer.isPitcher)
    } else if (typeFilter === 'pitchers') {
      result = result.filter(c => c.lineupPlayer.isPitcher)
    }

    // Position filter
    if (posFilter !== 'all') {
      result = result.filter(c => {
        if (posFilter === 'OF') {
          return c.lineupPlayer.basePositions.some(p => ['LF', 'CF', 'RF'].includes(p))
        }
        if (posFilter === 'SP' || posFilter === 'RP') {
          return c.lineupPlayer.pitcherType === posFilter
        }
        return c.lineupPlayer.basePositions.includes(posFilter)
      })
    }

    // Upgrades only
    if (upgradesOnly) {
      result = result.filter(c => c.bestUpgrade && c.bestUpgrade.delta > 0)
    }

    // Sort
    result.sort((a, b) => {
      let aVal: number, bVal: number
      switch (sortCol) {
        case 'name':
          return sortDir === 'asc' ? a.player.name.localeCompare(b.player.name) : b.player.name.localeCompare(a.player.name)
        case 'value':
          aVal = a.lineupPlayer.value
          bVal = b.lineupPlayer.value
          break
        case 'age':
          aVal = a.player.age ?? 99
          bVal = b.player.age ?? 99
          break
        case 'bestUpgrade':
        default:
          aVal = a.bestUpgrade?.delta ?? -9999
          bVal = b.bestUpgrade?.delta ?? -9999
          break
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })

    return result
  }, [candidates, search, typeFilter, posFilter, upgradesOnly, sortCol, sortDir])

  const toggleExpand = (name: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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

  const lockedCount = Object.keys(lockedSlots).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Waiver Wire
        </h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {activeFranchise} &middot; {metricLabel}
          {lockedCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Lock className="w-3 h-3" />
              {lockedCount} locked
            </span>
          )}
        </div>
      </div>

      {lockedCount === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
          Tip: Lock starters on the Value page (Best Lineup mode) to exclude them from upgrade calculations here.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-800 rounded-lg shadow p-3">
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-48"
        />

        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          {(['all', 'batters', 'pitchers'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {t === 'all' ? 'All' : t === 'batters' ? 'Batters' : 'Pitchers'}
            </button>
          ))}
        </div>

        <select
          value={posFilter}
          onChange={e => setPosFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          {positionOptions.map(p => (
            <option key={p} value={p}>{p === 'all' ? 'All Positions' : p}</option>
          ))}
        </select>

        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          {(['all', 'fa', 'waivers'] as const).map(f => (
            <button
              key={f}
              onClick={() => setAvailFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                availFilter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {f === 'all' ? 'All' : f === 'fa' ? 'FA Only' : 'Waivers'}
            </button>
          ))}
        </div>

        {!lockedSlotsMetric && (
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {(['hkb', 'fpts', 'fpRank'] as const).map(m => (
              <button
                key={m}
                onClick={() => setValueMetric(m)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  valueMetric === m
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {m === 'hkb' ? 'HKB' : m === 'fpts' ? 'ZiPS' : 'FP Rank'}
              </button>
            ))}
          </div>
        )}

        {effectiveMetric === 'fpts' && !parsedStoreZipsSource && (
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {(['zips', 'zipsDc'] as const).map(s => (
              <button
                key={s}
                onClick={() => setZipsSource(s)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  effectiveZipsSource === s
                    ? 'bg-teal-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {s === 'zips' ? 'ZiPS' : 'ZiPS DC'}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={upgradesOnly}
            onChange={e => setUpgradesOnly(e.target.checked)}
            className="rounded"
          />
          Upgrades only
        </label>

        <span className="text-sm text-gray-400 ml-auto">
          {filteredCandidates.length} players
        </span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="w-8 px-2 py-3"></th>
                {[
                  { key: 'name', label: 'Player' },
                  { key: 'team', label: 'Team' },
                  { key: 'pos', label: 'Pos' },
                  { key: 'age', label: 'Age' },
                  { key: 'value', label: 'Value' },
                  { key: 'bestUpgrade', label: 'Best Upgrade' },
                  { key: 'replaces', label: 'Replaces' },
                  { key: 'slot', label: 'Slot' },
                  { key: 'waiver', label: 'Status' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none whitespace-nowrap"
                  >
                    {col.label}
                    {sortCol === col.key && (sortDir === 'desc' ? ' \u25BC' : ' \u25B2')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredCandidates.slice(0, 200).map(c => {
                const isExpanded = expandedRows.has(c.player.name)
                const upgrade = c.bestUpgrade
                const deltaColor = upgrade
                  ? upgrade.delta > 0
                    ? 'text-green-600 dark:text-green-400 font-semibold'
                    : upgrade.delta < 0
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-gray-500'
                  : 'text-gray-400'

                return (
                  <tr key={c.player.id} className="group">
                    <td className="px-2 py-2">
                      <button
                        onClick={() => toggleExpand(c.player.name)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {c.player.name}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{c.player.team}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{c.player.position}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{c.player.age ?? '—'}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white">
                      {c.lineupPlayer.value.toFixed(0)}
                    </td>
                    <td className={`px-3 py-2 text-sm ${deltaColor}`}>
                      {upgrade ? `${upgrade.delta >= 0 ? '+' : ''}${upgrade.delta.toFixed(0)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {upgrade?.replaces ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                      {upgrade?.slot ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {c.player.isWaiver ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                          W {c.player.waiverDay ? `(${c.player.waiverDay})` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          FA
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {/* Expanded detail rows */}
              {filteredCandidates.slice(0, 200).map(c => {
                if (!expandedRows.has(c.player.name)) return null
                return (
                  <tr key={`${c.player.id}-detail`} className="bg-gray-50 dark:bg-gray-750">
                    <td></td>
                    <td colSpan={9} className="px-3 py-2">
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          All eligible slot comparisons:
                        </div>
                        {c.allSlots.map(s => (
                          <div key={s.slot} className="flex items-center gap-3">
                            <span className="w-10 font-medium text-gray-700 dark:text-gray-300">{s.slot}</span>
                            {s.isLocked && <Lock className="w-3 h-3 text-amber-500" />}
                            <span className={
                              s.delta > 0
                                ? 'text-green-600 dark:text-green-400 font-semibold'
                                : s.delta < 0
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-gray-500'
                            }>
                              {s.delta >= 0 ? '+' : ''}{s.delta.toFixed(0)}
                            </span>
                            <span className="text-gray-400">
                              vs {s.currentOccupant ?? 'empty'} ({(s.delta + c.lineupPlayer.value - s.delta).toFixed(0)})
                            </span>
                            {s.isLocked && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">locked</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredCandidates.length > 200 && (
          <div className="p-3 text-center text-sm text-gray-400">
            Showing first 200 of {filteredCandidates.length} results
          </div>
        )}
      </div>
    </div>
  )
}
