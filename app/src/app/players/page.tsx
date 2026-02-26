'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react'
import { FixedSizeList as List } from 'react-window'
import type { Player } from '@/types'

type SortField = 'name' | 'hkbRank' | 'hkbPosRank' | 'hkbValue' | 'fpRank' | 'age' | 'team' | 'position' | 'status' | 'zipsWar' | 'zipsFpts' | 'zipsFptsRate'
type SortOrder = 'asc' | 'desc'

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 44

// Column widths as Tailwind-compatible flex values
const COL_STYLES = {
  rank: 'w-[70px] min-w-[70px]',
  name: 'flex-1 min-w-[160px]',
  team: 'w-[60px] min-w-[60px]',
  pos: 'w-[80px] min-w-[80px]',
  age: 'w-[50px] min-w-[50px]',
  hkbVal: 'w-[80px] min-w-[80px]',
  fpRank: 'w-[70px] min-w-[70px]',
  zipsWar: 'w-[80px] min-w-[80px]',
  zipsFpts: 'w-[90px] min-w-[90px]',
  status: 'w-[70px] min-w-[70px]',
}

export default function PlayersPage() {
  const { players, hkbPlayers, salaryReliefDesignations } = usePlayerStore()
  const hasHydrated = useHydration()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('hkbRank')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [showAvailableOnly, setShowAvailableOnly] = useState(false)
  const [positionFilter, setPositionFilter] = useState<string>('')
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [listHeight, setListHeight] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  // Dynamically size the list to fill available space
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        // Leave some padding at the bottom
        const available = window.innerHeight - rect.top - 24
        setListHeight(Math.max(300, available - HEADER_HEIGHT))
      }
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  // Get unique positions and teams for filters
  const positions = useMemo(() => {
    const allPos = new Set<string>()
    players.forEach(p => {
      p.position.split(',').forEach(pos => allPos.add(pos.trim()))
    })
    return Array.from(allPos).filter(Boolean).sort()
  }, [players])

  const teams = useMemo(() => {
    const allTeams = new Set(players.map(p => p.team).filter(Boolean))
    return Array.from(allTeams).sort()
  }, [players])

  // Compute positional HKB ranks: for each position, rank HKB players by overall rank
  const positionalHkbRanks = useMemo(() => {
    const ranksByPos = new Map<string, Map<string, number>>()
    if (!positionFilter || hkbPlayers.length === 0) return ranksByPos

    const playersAtPos = hkbPlayers
      .filter(h => h.positions.split(',').some(p => p.trim() === positionFilter))
      .sort((a, b) => a.rank - b.rank)

    const posMap = new Map<string, number>()
    playersAtPos.forEach((h, i) => posMap.set(h.normalizedName, i + 1))
    ranksByPos.set(positionFilter, posMap)

    return ranksByPos
  }, [hkbPlayers, positionFilter])

  // Salary relief lookup for current year
  const relievedNames = useMemo(() => {
    const CURRENT_YEAR = 2026
    return new Set(
      salaryReliefDesignations
        .filter(d => d.year === CURRENT_YEAR)
        .map(d => d.normalizedName)
    )
  }, [salaryReliefDesignations])

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let result = [...players]

    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.team.toLowerCase().includes(lower)
      )
    }

    if (showAvailableOnly) {
      result = result.filter(p => p.isAvailable)
    }

    if (positionFilter) {
      result = result.filter(p =>
        p.position.split(',').some(pos => pos.trim() === positionFilter)
      )
    }

    if (teamFilter) {
      result = result.filter(p => p.team === teamFilter)
    }

    const posRankMap = positionFilter ? positionalHkbRanks.get(positionFilter) : null

    const getSpecialField = (p: typeof result[0], field: SortField): number | null => {
      if (field === 'zipsWar') return p.zipsProjection?.war ?? null
      if (field === 'zipsFpts') return p.zipsProjection?.fpts ?? null
      if (field === 'zipsFptsRate') return p.zipsProjection?.fptsRate ?? null
      if (field === 'hkbPosRank') return posRankMap?.get(p.normalizedName) ?? null
      if (field === 'fpRank') return p.fpRank
      return null
    }

    const isSpecialField = (f: SortField) => f.startsWith('zips') || f === 'hkbPosRank' || f === 'fpRank'

    result.sort((a, b) => {
      let aVal: string | number | null = isSpecialField(sortField) ? getSpecialField(a, sortField) : a[sortField as keyof typeof a] as string | number | null
      let bVal: string | number | null = isSpecialField(sortField) ? getSpecialField(b, sortField) : b[sortField as keyof typeof b] as string | number | null

      if (aVal === null || aVal === undefined) aVal = sortOrder === 'asc' ? Infinity : -Infinity
      if (bVal === null || bVal === undefined) bVal = sortOrder === 'asc' ? Infinity : -Infinity

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      return sortOrder === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })

    return result
  }, [players, search, sortField, sortOrder, showAvailableOnly, positionFilter, teamFilter, positionalHkbRanks])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
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
    setShowAvailableOnly(false)
    setPositionFilter('')
    setTeamFilter('')
  }

  const hasFilters = search || showAvailableOnly || positionFilter || teamFilter

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const player = filteredPlayers[index]
    if (!player) return null

    const rowBg = player.isAvailable
      ? 'bg-green-50 dark:bg-green-900/20'
      : player.franchise === 'Colin Wilson & Greg Holmes'
      ? 'bg-blue-50 dark:bg-blue-900/20'
      : ''

    return (
      <div
        style={style}
        className={`flex items-center border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${rowBg}`}
      >
        <div className={`${COL_STYLES.rank} px-4 text-sm text-gray-900 dark:text-white truncate`}>
          {positionFilter
            ? (positionalHkbRanks.get(positionFilter)?.get(player.normalizedName) ?? '—')
            : (player.hkbRank ?? '—')}
        </div>
        <div className={`${COL_STYLES.name} px-4 text-sm font-medium text-gray-900 dark:text-white truncate`}>
          {player.name}
          {relievedNames.has(player.normalizedName) && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100">
              IR$
            </span>
          )}
        </div>
        <div className={`${COL_STYLES.team} px-4 text-sm text-gray-600 dark:text-gray-400 truncate`}>
          {player.team}
        </div>
        <div className={`${COL_STYLES.pos} px-4 text-sm text-gray-600 dark:text-gray-400 truncate`}>
          {player.position}
        </div>
        <div className={`${COL_STYLES.age} px-4 text-sm text-gray-600 dark:text-gray-400 truncate`}>
          {player.age ?? '—'}
        </div>
        <div className={`${COL_STYLES.hkbVal} px-4 text-sm text-gray-600 dark:text-gray-400 truncate`}>
          {player.hkbValue?.toLocaleString() ?? '—'}
        </div>
        <div className={`${COL_STYLES.fpRank} px-4 text-sm text-purple-600 dark:text-purple-400 truncate`}>
          {player.fpRank ?? '—'}
        </div>
        <div className={`${COL_STYLES.zipsWar} px-4 text-sm text-gray-600 dark:text-gray-400 truncate`}>
          {player.zipsProjection?.war?.toFixed(1) ?? '—'}
        </div>
        <div className={`${COL_STYLES.zipsFpts} px-4 text-sm text-gray-600 dark:text-gray-400 truncate`}>
          {player.zipsProjection?.fpts?.toFixed(0) ?? '—'}
        </div>
        <div className={`${COL_STYLES.status} px-4 text-sm`}>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            player.isAvailable
              ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
              : player.franchise === 'Colin Wilson & Greg Holmes'
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
          }`}>
            {player.isAvailable ? 'FA' : player.status}
          </span>
        </div>
      </div>
    )
  }, [filteredPlayers, positionFilter, positionalHkbRanks, relievedNames])

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
          Player Database
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filteredPlayers.length.toLocaleString()} players
        </span>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-center">
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAvailableOnly}
              onChange={(e) => setShowAvailableOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Available only</span>
          </label>

          <select
            value={positionFilter}
            onChange={(e) => {
              setPositionFilter(e.target.value)
              if (e.target.value) {
                setSortField('hkbPosRank')
                setSortOrder('asc')
              } else {
                setSortField('hkbRank')
                setSortOrder('asc')
              }
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All positions</option>
            {positions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>

          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All teams</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>

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

      {/* Virtualized Table */}
      <div ref={containerRef} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {/* Header */}
        <div className="flex items-center bg-gray-50 dark:bg-gray-700" style={{ height: HEADER_HEIGHT }}>
          <div
            className={`${COL_STYLES.rank} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort(positionFilter ? 'hkbPosRank' : 'hkbRank')}
          >
            {positionFilter ? `${positionFilter} Rk` : 'HKB Rk'} <SortIcon field={positionFilter ? 'hkbPosRank' : 'hkbRank'} />
          </div>
          <div
            className={`${COL_STYLES.name} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('name')}
          >
            Name <SortIcon field="name" />
          </div>
          <div
            className={`${COL_STYLES.team} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('team')}
          >
            Team <SortIcon field="team" />
          </div>
          <div
            className={`${COL_STYLES.pos} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('position')}
          >
            Pos <SortIcon field="position" />
          </div>
          <div
            className={`${COL_STYLES.age} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('age')}
          >
            Age <SortIcon field="age" />
          </div>
          <div
            className={`${COL_STYLES.hkbVal} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('hkbValue')}
          >
            HKB Val <SortIcon field="hkbValue" />
          </div>
          <div
            className={`${COL_STYLES.fpRank} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('fpRank')}
          >
            FP Rk <SortIcon field="fpRank" />
          </div>
          <div
            className={`${COL_STYLES.zipsWar} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('zipsWar')}
          >
            ZiPS WAR <SortIcon field="zipsWar" />
          </div>
          <div
            className={`${COL_STYLES.zipsFpts} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('zipsFpts')}
          >
            ZiPS FPTS <SortIcon field="zipsFpts" />
          </div>
          <div
            className={`${COL_STYLES.status} px-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600`}
            onClick={() => handleSort('status')}
          >
            Status <SortIcon field="status" />
          </div>
        </div>

        {/* Virtualized Rows */}
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
