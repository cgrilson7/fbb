'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Search, ChevronUp, ChevronDown, X, Loader2, AlertTriangle, Ban, Check } from 'lucide-react'
import { FixedSizeList as List } from 'react-window'
import type { Player } from '@/types'

type PlayerType = 'all' | 'batter' | 'pitcher'
type SortField = 'adp' | 'name' | 'team' | 'position' | 'age' | 'hkbRank' | 'hkbValue'
type SortOrder = 'asc' | 'desc'
type StatusFilter = 'all' | 'available' | 'drafted' | 'unavailable'

interface PlayerRights {
  previousFranchise: string
  shortCode: string
  isRFA: boolean
  isHTD: boolean
}

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 44

const ASC_NATURAL: Record<string, boolean> = {
  adp: true, hkbRank: true, name: true, team: true, position: true, age: true,
}

export default function PoolPage() {
  const {
    players, freeAgentEntries, salaries, franchiseMappings,
    poolDrafted, poolUnavailable, togglePoolDrafted, togglePoolUnavailable,
    setPoolDrafted, setPoolUnavailable,
  } = usePlayerStore()
  const hasHydrated = useHydration()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('adp')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [playerType, setPlayerType] = useState<PlayerType>('all')
  const [positionFilter, setPositionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [rightsFilter, setRightsFilter] = useState<'all' | 'rfa' | 'htd'>('all')
  const [listHeight, setListHeight] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const available = window.innerHeight - rect.top - 24
        setListHeight(Math.max(300, available - HEADER_HEIGHT))
      }
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  const draftedSet = useMemo(() => new Set(poolDrafted), [poolDrafted])
  const unavailableSet = useMemo(() => new Set(poolUnavailable), [poolUnavailable])

  const freeAgencyNames = useMemo(() => {
    return new Set(freeAgentEntries.map(e => e.normalizedName))
  }, [freeAgentEntries])

  const hasFreeAgencyData = freeAgentEntries.length > 0

  const franchiseShortCodes = useMemo(() => {
    const map = new Map<string, string>()
    franchiseMappings.forEach(m => map.set(m.fullName, m.shortCode))
    return map
  }, [franchiseMappings])

  const rightsMap = useMemo(() => {
    const map = new Map<string, PlayerRights>()
    freeAgentEntries.forEach(e => {
      if (!e.isRFA && !e.hometownEligible) return
      map.set(e.normalizedName, {
        previousFranchise: e.previousFranchise,
        shortCode: franchiseShortCodes.get(e.previousFranchise) || e.previousFranchise,
        isRFA: e.isRFA,
        isHTD: e.hometownEligible,
      })
    })
    salaries.forEach(s => {
      if (map.has(s.normalizedName)) return
      if (s.contractEnds !== 2025) return
      const isRFA = s.contractStarts <= 2025
      const isHTD = s.contractStarts <= 2024
      if (!isRFA && !isHTD) return
      map.set(s.normalizedName, {
        previousFranchise: s.franchise,
        shortCode: franchiseShortCodes.get(s.franchise) || s.franchise,
        isRFA,
        isHTD,
      })
    })
    return map
  }, [freeAgentEntries, salaries, franchiseShortCodes])

  // Pool: available free agents not already claimed in free agency
  const poolPlayers = useMemo(() => {
    return players.filter(p => {
      if (!p.isAvailable) return false
      if (hasFreeAgencyData && freeAgencyNames.has(p.normalizedName)) return false
      return true
    })
  }, [players, freeAgencyNames, hasFreeAgencyData])

  // Compute ADP position ranks among ALL players (not just pool)
  const adpPositionRanks = useMemo(() => {
    // Group all players by position, rank by ADP
    const positionPlayers = new Map<string, { normalizedName: string; adp: number }[]>()
    players.forEach(p => {
      if (p.adp === null) return
      p.position.split(',').forEach(pos => {
        const trimmed = pos.trim()
        if (!trimmed) return
        if (!positionPlayers.has(trimmed)) positionPlayers.set(trimmed, [])
        positionPlayers.get(trimmed)!.push({ normalizedName: p.normalizedName, adp: p.adp! })
      })
    })
    // Sort each position group by ADP and assign ranks
    const rankMap = new Map<string, Map<string, number>>() // position -> (normalizedName -> rank)
    positionPlayers.forEach((plist, pos) => {
      plist.sort((a, b) => a.adp - b.adp)
      const posMap = new Map<string, number>()
      plist.forEach((p, i) => {
        // If player has multiple positions, keep first (best) rank per position
        if (!posMap.has(p.normalizedName)) {
          posMap.set(p.normalizedName, i + 1)
        }
      })
      rankMap.set(pos, posMap)
    })
    return rankMap
  }, [players])

  // Get the best (lowest) position rank for a player
  const getPositionRank = useCallback((p: Player): string => {
    const positions = p.position.split(',').map(s => s.trim()).filter(Boolean)
    const ranks: string[] = []
    for (const pos of positions) {
      const posMap = adpPositionRanks.get(pos)
      if (posMap) {
        const rank = posMap.get(p.normalizedName)
        if (rank !== undefined) {
          ranks.push(`${pos}${rank}`)
        }
      }
    }
    return ranks.join(', ') || '—'
  }, [adpPositionRanks])

  // ADP overall rank among all players
  const adpOverallRanks = useMemo(() => {
    const withAdp = players
      .filter(p => p.adp !== null)
      .sort((a, b) => a.adp! - b.adp!)
    const map = new Map<string, number>()
    withAdp.forEach((p, i) => {
      if (!map.has(p.normalizedName)) map.set(p.normalizedName, i + 1)
    })
    return map
  }, [players])

  const positions = useMemo(() => {
    const allPos = new Set<string>()
    poolPlayers.forEach(p => {
      p.position.split(',').forEach(pos => allPos.add(pos.trim()))
    })
    return Array.from(allPos).filter(Boolean).sort()
  }, [poolPlayers])

  const filteredPlayers = useMemo(() => {
    let result = [...poolPlayers]

    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.team.toLowerCase().includes(lower)
      )
    }

    if (playerType === 'batter') {
      result = result.filter(p => !p.zipsProjection || p.zipsProjection.type === 'batter')
    } else if (playerType === 'pitcher') {
      result = result.filter(p => !p.zipsProjection || p.zipsProjection.type === 'pitcher')
    }

    if (positionFilter) {
      result = result.filter(p =>
        p.position.split(',').some(pos => pos.trim() === positionFilter)
      )
    }

    if (statusFilter === 'available') {
      result = result.filter(p => !draftedSet.has(p.normalizedName) && !unavailableSet.has(p.normalizedName))
    } else if (statusFilter === 'drafted') {
      result = result.filter(p => draftedSet.has(p.normalizedName))
    } else if (statusFilter === 'unavailable') {
      result = result.filter(p => unavailableSet.has(p.normalizedName))
    }

    if (rightsFilter === 'rfa') {
      result = result.filter(p => rightsMap.get(p.normalizedName)?.isRFA)
    } else if (rightsFilter === 'htd') {
      result = result.filter(p => rightsMap.get(p.normalizedName)?.isHTD)
    }

    result.sort((a, b) => {
      let aVal: string | number | null
      let bVal: string | number | null

      aVal = a[sortField as keyof Player] as string | number | null
      bVal = b[sortField as keyof Player] as string | number | null

      if (aVal === null || aVal === undefined) aVal = sortOrder === 'asc' ? Infinity : -Infinity
      if (bVal === null || bVal === undefined) bVal = sortOrder === 'asc' ? Infinity : -Infinity

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      return sortOrder === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })

    return result
  }, [poolPlayers, search, sortField, sortOrder, playerType, positionFilter, statusFilter, rightsFilter, rightsMap, draftedSet, unavailableSet])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder(ASC_NATURAL[field] ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc'
      ? <ChevronUp className="w-4 h-4 inline ml-1" />
      : <ChevronDown className="w-4 h-4 inline ml-1" />
  }

  const clearFilters = () => {
    setSearch('')
    setPlayerType('all')
    setPositionFilter('')
    setStatusFilter('all')
    setRightsFilter('all')
  }

  const clearAllStatuses = () => {
    setPoolDrafted([])
    setPoolUnavailable([])
  }

  const hasFilters = search || playerType !== 'all' || positionFilter || statusFilter !== 'all' || rightsFilter !== 'all'

  const thClass = 'px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap'

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const p = filteredPlayers[index]
    if (!p) return null
    const rights = rightsMap.get(p.normalizedName)
    const isDrafted = draftedSet.has(p.normalizedName)
    const isUnavailable = unavailableSet.has(p.normalizedName)
    const overallRank = adpOverallRanks.get(p.normalizedName)
    const posRank = getPositionRank(p)

    const rowBg = isDrafted
      ? 'bg-green-50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-800'
      : isUnavailable
      ? 'bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800'
      : 'border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'

    const textClass = isUnavailable
      ? 'line-through text-red-400 dark:text-red-500'
      : isDrafted
      ? 'text-green-700 dark:text-green-300'
      : 'text-gray-600 dark:text-gray-400'

    const nameClass = isUnavailable
      ? 'line-through text-red-500 dark:text-red-400'
      : isDrafted
      ? 'text-green-800 dark:text-green-200 font-medium'
      : 'text-gray-900 dark:text-white font-medium'

    return (
      <div style={style} className={`flex items-center ${rowBg}`}>
        {/* Action buttons */}
        <div className="w-[70px] min-w-[70px] px-1 flex gap-0.5 items-center justify-center">
          <button
            onClick={() => togglePoolDrafted(p.normalizedName)}
            className={`p-1 rounded transition-colors ${
              isDrafted
                ? 'bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-100'
                : 'hover:bg-green-100 dark:hover:bg-green-800 text-gray-400 hover:text-green-600'
            }`}
            title={isDrafted ? 'Unmark drafted' : 'Mark as drafted'}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => togglePoolUnavailable(p.normalizedName)}
            className={`p-1 rounded transition-colors ${
              isUnavailable
                ? 'bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-100'
                : 'hover:bg-red-100 dark:hover:bg-red-800 text-gray-400 hover:text-red-600'
            }`}
            title={isUnavailable ? 'Unmark unavailable' : 'Mark as unavailable'}
          >
            <Ban className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* ADP */}
        <div className={`w-[55px] min-w-[55px] px-3 text-sm ${textClass}`}>
          {p.adp ?? '—'}
        </div>
        {/* Overall Rank */}
        <div className={`w-[50px] min-w-[50px] px-2 text-sm ${textClass}`}>
          {overallRank ?? '—'}
        </div>
        {/* Pos Rank */}
        <div className={`w-[100px] min-w-[100px] px-2 text-xs ${textClass} truncate`}>
          {posRank}
        </div>
        {/* Name */}
        <div className={`flex-1 min-w-[150px] px-3 text-sm ${nameClass} truncate`}>
          {p.name}
        </div>
        {/* Rights */}
        <div className="w-[100px] min-w-[100px] px-2 flex gap-1 items-center">
          {rights?.isRFA && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100" title={`RFA: ${rights.previousFranchise}`}>
              RFA {rights.shortCode}
            </span>
          )}
          {rights?.isHTD && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-800 dark:bg-teal-800 dark:text-teal-100" title={`Hometown Discount: ${rights.previousFranchise}`}>
              HTD {rights.shortCode}
            </span>
          )}
        </div>
        {/* Team */}
        <div className={`w-[50px] min-w-[50px] px-3 text-sm ${textClass}`}>{p.team}</div>
        {/* Position */}
        <div className={`w-[80px] min-w-[80px] px-3 text-sm ${textClass} truncate`}>{p.position}</div>
        {/* Age */}
        <div className={`w-[45px] min-w-[45px] px-3 text-sm ${textClass}`}>{p.age ?? '—'}</div>
        {/* HKB Rank */}
        <div className={`w-[60px] min-w-[60px] px-3 text-sm ${textClass}`}>{p.hkbRank ?? '—'}</div>
        {/* HKB Value */}
        <div className={`w-[60px] min-w-[60px] px-3 text-sm ${textClass}`}>{p.hkbValue?.toLocaleString() ?? '—'}</div>
      </div>
    )
  }, [filteredPlayers, rightsMap, draftedSet, unavailableSet, adpOverallRanks, getPositionRank, togglePoolDrafted, togglePoolUnavailable])

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
          No players loaded. Go to Upload page to load CSV files.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Player Pool
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-200 dark:bg-green-700 inline-block" /> {poolDrafted.length} drafted
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-200 dark:bg-red-700 inline-block" /> {poolUnavailable.length} unavailable
            </span>
            {(poolDrafted.length > 0 || poolUnavailable.length > 0) && (
              <button onClick={clearAllStatuses} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline ml-1">
                Reset all
              </button>
            )}
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filteredPlayers.length.toLocaleString()} players
          </span>
        </div>
      </div>

      {!hasFreeAgencyData && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-300">
            No free agency data loaded — showing all free agents. Upload free_agency.csv to exclude auctioned players.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {(['all', 'batter', 'pitcher'] as PlayerType[]).map(type => (
              <button
                key={type}
                onClick={() => setPlayerType(type)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  playerType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {type === 'all' ? 'All' : type === 'batter' ? 'Batters' : 'Pitchers'}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All positions</option>
            {positions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>

          {/* Status filter */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {([
              { value: 'all' as const, label: 'All' },
              { value: 'available' as const, label: 'Open' },
              { value: 'drafted' as const, label: 'Drafted' },
              { value: 'unavailable' as const, label: 'N/A' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === opt.value
                    ? opt.value === 'drafted' ? 'bg-green-600 text-white'
                      : opt.value === 'unavailable' ? 'bg-red-600 text-white'
                      : opt.value === 'available' ? 'bg-blue-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Rights filter */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {([
              { value: 'all' as const, label: 'All' },
              { value: 'rfa' as const, label: 'RFA' },
              { value: 'htd' as const, label: 'HTD' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setRightsFilter(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  rightsFilter === opt.value
                    ? opt.value === 'rfa' ? 'bg-purple-600 text-white'
                      : opt.value === 'htd' ? 'bg-teal-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div ref={containerRef} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {/* Header */}
        <div className="flex items-center bg-gray-50 dark:bg-gray-700" style={{ height: HEADER_HEIGHT }}>
          <div className="w-[70px] min-w-[70px] px-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
            Status
          </div>
          <div className={`w-[55px] min-w-[55px] ${thClass}`} onClick={() => handleSort('adp')}>
            ADP <SortIcon field="adp" />
          </div>
          <div className="w-[50px] min-w-[50px] px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
            Rk
          </div>
          <div className="w-[100px] min-w-[100px] px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
            Pos Rk
          </div>
          <div className={`flex-1 min-w-[150px] ${thClass}`} onClick={() => handleSort('name')}>
            Name <SortIcon field="name" />
          </div>
          <div className="w-[100px] min-w-[100px] px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
            Rights
          </div>
          <div className={`w-[50px] min-w-[50px] ${thClass}`} onClick={() => handleSort('team')}>
            Team <SortIcon field="team" />
          </div>
          <div className={`w-[80px] min-w-[80px] ${thClass}`} onClick={() => handleSort('position')}>
            Pos <SortIcon field="position" />
          </div>
          <div className={`w-[45px] min-w-[45px] ${thClass}`} onClick={() => handleSort('age')}>
            Age <SortIcon field="age" />
          </div>
          <div className={`w-[60px] min-w-[60px] ${thClass}`} onClick={() => handleSort('hkbRank')}>
            HKB <SortIcon field="hkbRank" />
          </div>
          <div className={`w-[60px] min-w-[60px] ${thClass}`} onClick={() => handleSort('hkbValue')}>
            Val <SortIcon field="hkbValue" />
          </div>
        </div>

        <List
          height={listHeight}
          itemCount={filteredPlayers.length}
          itemSize={ROW_HEIGHT}
          width="100%"
          overscanCount={20}
        >
          {Row}
        </List>
      </div>
    </div>
  )
}
