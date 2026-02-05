'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { Search, Filter, ChevronUp, ChevronDown, X } from 'lucide-react'

type SortField = 'name' | 'hkbRank' | 'hkbValue' | 'age' | 'team' | 'position' | 'status'
type SortOrder = 'asc' | 'desc'

export default function PlayersPage() {
  const { players } = usePlayerStore()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('hkbRank')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [showAvailableOnly, setShowAvailableOnly] = useState(false)
  const [positionFilter, setPositionFilter] = useState<string>('')
  const [teamFilter, setTeamFilter] = useState<string>('')

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

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let result = [...players]

    // Search filter
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.team.toLowerCase().includes(lower)
      )
    }

    // Available only filter
    if (showAvailableOnly) {
      result = result.filter(p => p.isAvailable)
    }

    // Position filter
    if (positionFilter) {
      result = result.filter(p =>
        p.position.split(',').some(pos => pos.trim() === positionFilter)
      )
    }

    // Team filter
    if (teamFilter) {
      result = result.filter(p => p.team === teamFilter)
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number | null = a[sortField]
      let bVal: string | number | null = b[sortField]

      // Handle nulls
      if (aVal === null) aVal = sortOrder === 'asc' ? Infinity : -Infinity
      if (bVal === null) bVal = sortOrder === 'asc' ? Infinity : -Infinity

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
  }, [players, search, sortField, sortOrder, showAvailableOnly, positionFilter, teamFilter])

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
          {/* Search */}
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

          {/* Available only */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAvailableOnly}
              onChange={(e) => setShowAvailableOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Available only</span>
          </label>

          {/* Position filter */}
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

          {/* Team filter */}
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

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('hkbRank')}
                >
                  HKB Rk <SortIcon field="hkbRank" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('name')}
                >
                  Name <SortIcon field="name" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('team')}
                >
                  Team <SortIcon field="team" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('position')}
                >
                  Pos <SortIcon field="position" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('age')}
                >
                  Age <SortIcon field="age" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('hkbValue')}
                >
                  HKB Val <SortIcon field="hkbValue" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('status')}
                >
                  Status <SortIcon field="status" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPlayers.slice(0, 100).map((player) => (
                <tr
                  key={player.id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    player.isAvailable
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : player.franchise === 'Colin Wilson & Greg Holmes'
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {player.hkbRank ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {player.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {player.team}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {player.position}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {player.age ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {player.hkbValue?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      player.isAvailable
                        ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                        : player.franchise === 'Colin Wilson & Greg Holmes'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
                    }`}>
                      {player.isAvailable ? 'FA' : player.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredPlayers.length > 100 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
            Showing 100 of {filteredPlayers.length.toLocaleString()} players
          </div>
        )}
      </div>
    </div>
  )
}
