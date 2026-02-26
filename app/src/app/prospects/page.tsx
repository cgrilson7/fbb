'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react'

type ProspectType = 'all' | 'batting' | 'pitching'
type SortField = 'rank' | 'fullName' | 'team' | 'age' | 'level' | 'hkbRank' | 'hkbValue' | 'fvGrade' | 'fvRank' | 'avg' | 'ops' | 'homeRuns' | 'stolenBases' | 'era' | 'whip' | 'strikeOuts' | 'franchise'
type SortOrder = 'asc' | 'desc'

export default function ProspectsPage() {
  const { battingProspects, pitchingProspects, players, hkbPlayers, fvRankings, franchiseMappings } = usePlayerStore()
  const hasHydrated = useHydration()
  const [search, setSearch] = useState('')
  const [prospectType, setProspectType] = useState<ProspectType>('all')
  const [levelFilter, setLevelFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [franchiseFilter, setFranchiseFilter] = useState('')
  const [showAvailableOnly, setShowAvailableOnly] = useState(false)
  const [sortField, setSortField] = useState<SortField>('hkbRank')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // Combine prospects with availability and HKB data, filtering out MLB-level players
  const enrichedProspects = useMemo(() => {
    const allProspects = [
      ...battingProspects.map(p => ({ ...p, type: 'batting' as const })),
      ...pitchingProspects.map(p => ({ ...p, type: 'pitching' as const }))
    ]

    // Create lookup maps
    const playerMap = new Map(players.map(p => [p.normalizedName, p]))
    const hkbMap = new Map(hkbPlayers.map(p => [p.normalizedName, p]))
    const fvMap = new Map(fvRankings.map(p => [p.normalizedName, p]))
    const franchiseMap = new Map(franchiseMappings.map(m => [m.shortCode, m.fullName]))

    return allProspects
      .filter(p => {
        // Filter out explicit MLB level
        if (p.level === 'MLB') return false
        // Filter out players whose HKB data marks them as MLB
        const hkb = hkbMap.get(p.normalizedName)
        if (hkb?.level === 'MLB') return false
        // Filter out players whose FV data marks them as MLB
        const fv = fvMap.get(p.normalizedName)
        if (fv?.highestLevel === 'MLB') return false
        return true
      })
      .map(prospect => {
        const player = playerMap.get(prospect.normalizedName)
        const hkb = hkbMap.get(prospect.normalizedName)
        const fv = fvMap.get(prospect.normalizedName)

        // Clean up "ALL (X)" level labels to show "Multi (X)"
        const cleanLevel = prospect.level.startsWith('ALL')
          ? prospect.level.replace('ALL', 'Multi')
          : prospect.level

        const status = player?.status ?? 'Unknown'
        const franchise = franchiseMap.get(status) || status

        return {
          ...prospect,
          level: cleanLevel,
          isAvailable: player?.isAvailable ?? true,
          status,
          franchise,
          hkbRank: hkb?.rank ?? null,
          hkbValue: hkb?.value ?? null,
          fvGrade: fv?.fv ?? null,
          fvRank: fv?.rank ?? null,
          fvETA: fv?.eta ?? null,
          fvHighestLevel: fv?.highestLevel ?? null,
          fvPosition: fv?.position ?? null,
        }
      })
  }, [battingProspects, pitchingProspects, players, hkbPlayers, fvRankings, franchiseMappings])

  // Get unique levels and teams
  const levels = useMemo(() => {
    const allLevels = new Set(enrichedProspects.map(p => p.level).filter(Boolean))
    return Array.from(allLevels).sort()
  }, [enrichedProspects])

  const teams = useMemo(() => {
    const allTeams = new Set(enrichedProspects.map(p => p.team).filter(Boolean))
    return Array.from(allTeams).sort()
  }, [enrichedProspects])

  const franchises = useMemo(() => {
    const allFranchises = new Set(enrichedProspects.map(p => p.franchise).filter(f => f && f !== 'Unknown' && f !== 'Free Agent' && !f.includes('<small>')))
    return Array.from(allFranchises).sort()
  }, [enrichedProspects])

  // Filter and sort prospects
  const filteredProspects = useMemo(() => {
    let result = [...enrichedProspects]

    // Type filter
    if (prospectType !== 'all') {
      result = result.filter(p => p.type === prospectType)
    }

    // Search filter
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(p =>
        p.fullName.toLowerCase().includes(lower) ||
        p.team.toLowerCase().includes(lower)
      )
    }

    // Level filter
    if (levelFilter) {
      result = result.filter(p => p.level === levelFilter)
    }

    // Team filter
    if (teamFilter) {
      result = result.filter(p => p.team === teamFilter)
    }

    // Franchise filter
    if (franchiseFilter) {
      result = result.filter(p => p.franchise === franchiseFilter)
    }

    // Available only
    if (showAvailableOnly) {
      result = result.filter(p => p.isAvailable)
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number | null = null
      let bVal: string | number | null = null

      // Handle different fields
      switch (sortField) {
        case 'fullName':
          aVal = a.fullName
          bVal = b.fullName
          break
        case 'team':
          aVal = a.team
          bVal = b.team
          break
        case 'level':
          aVal = a.level
          bVal = b.level
          break
        case 'franchise':
          aVal = a.franchise
          bVal = b.franchise
          break
        case 'rank':
          aVal = a.rank
          bVal = b.rank
          break
        case 'age':
          aVal = a.age
          bVal = b.age
          break
        case 'hkbRank':
          aVal = a.hkbRank
          bVal = b.hkbRank
          break
        case 'hkbValue':
          aVal = a.hkbValue
          bVal = b.hkbValue
          break
        case 'fvGrade':
          aVal = a.fvGrade
          bVal = b.fvGrade
          break
        case 'fvRank':
          aVal = a.fvRank
          bVal = b.fvRank
          break
        case 'avg':
          aVal = a.type === 'batting' ? (a as typeof a & { avg: number }).avg : null
          bVal = b.type === 'batting' ? (b as typeof b & { avg: number }).avg : null
          break
        case 'ops':
          aVal = a.type === 'batting' ? (a as typeof a & { ops: number }).ops : null
          bVal = b.type === 'batting' ? (b as typeof b & { ops: number }).ops : null
          break
        case 'homeRuns':
          aVal = a.type === 'batting' ? (a as typeof a & { homeRuns: number }).homeRuns : null
          bVal = b.type === 'batting' ? (b as typeof b & { homeRuns: number }).homeRuns : null
          break
        case 'stolenBases':
          aVal = a.type === 'batting' ? (a as typeof a & { stolenBases: number }).stolenBases : null
          bVal = b.type === 'batting' ? (b as typeof b & { stolenBases: number }).stolenBases : null
          break
        case 'era':
          aVal = a.type === 'pitching' ? (a as typeof a & { era: number }).era : null
          bVal = b.type === 'pitching' ? (b as typeof b & { era: number }).era : null
          break
        case 'whip':
          aVal = a.type === 'pitching' ? (a as typeof a & { whip: number }).whip : null
          bVal = b.type === 'pitching' ? (b as typeof b & { whip: number }).whip : null
          break
        case 'strikeOuts':
          aVal = a.type === 'pitching' ? (a as typeof a & { strikeOuts: number }).strikeOuts : null
          bVal = b.type === 'pitching' ? (b as typeof b & { strikeOuts: number }).strikeOuts : null
          break
      }

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
  }, [enrichedProspects, prospectType, search, levelFilter, teamFilter, franchiseFilter, showAvailableOnly, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      // Default to desc for value stats, asc for ranks
      setSortOrder(['hkbValue', 'fvGrade', 'ops', 'avg', 'homeRuns', 'stolenBases', 'strikeOuts'].includes(field) ? 'desc' : 'asc')
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
    setLevelFilter('')
    setTeamFilter('')
    setFranchiseFilter('')
  }

  const hasFilters = search || showAvailableOnly || levelFilter || teamFilter || franchiseFilter

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  if (battingProspects.length === 0 && pitchingProspects.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No prospects loaded. Go to Upload page to load batting_prospects.csv and pitching_prospects.csv.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Prospect Scout
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filteredProspects.length.toLocaleString()} prospects
        </span>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Type toggle */}
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {(['all', 'batting', 'pitching'] as const).map(type => (
              <button
                key={type}
                onClick={() => setProspectType(type)}
                className={`px-4 py-2 text-sm font-medium capitalize ${
                  prospectType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search prospects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Level filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All levels</option>
            {levels.map(level => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>

          {/* Team filter */}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All orgs</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>

          {/* Franchise filter */}
          <select
            value={franchiseFilter}
            onChange={(e) => setFranchiseFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All franchises</option>
            {franchises.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          {/* Available only */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAvailableOnly}
              onChange={(e) => setShowAvailableOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Available only</span>
          </label>

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
                  HKB <SortIcon field="hkbRank" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('fvGrade')}
                >
                  FV <SortIcon field="fvGrade" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('fvRank')}
                >
                  FV Rk <SortIcon field="fvRank" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('fullName')}
                >
                  Name <SortIcon field="fullName" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('team')}
                >
                  Org <SortIcon field="team" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('level')}
                >
                  Level <SortIcon field="level" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('age')}
                >
                  Age <SortIcon field="age" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  ETA
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Pos
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('rank')}
                >
                  Org Rk <SortIcon field="rank" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                {(prospectType === 'all' || prospectType === 'batting') && (
                  <>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('avg')}
                    >
                      AVG <SortIcon field="avg" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('ops')}
                    >
                      OPS <SortIcon field="ops" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('homeRuns')}
                    >
                      HR <SortIcon field="homeRuns" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('stolenBases')}
                    >
                      SB <SortIcon field="stolenBases" />
                    </th>
                  </>
                )}
                {(prospectType === 'all' || prospectType === 'pitching') && (
                  <>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('era')}
                    >
                      ERA <SortIcon field="era" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('whip')}
                    >
                      WHIP <SortIcon field="whip" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => handleSort('strikeOuts')}
                    >
                      K <SortIcon field="strikeOuts" />
                    </th>
                  </>
                )}
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('hkbValue')}
                >
                  Value <SortIcon field="hkbValue" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('franchise')}
                >
                  Franchise <SortIcon field="franchise" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredProspects.slice(0, 100).map((prospect, i) => (
                <tr
                  key={`${prospect.playerId}-${i}`}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    prospect.isAvailable
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {prospect.hkbRank ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {prospect.fvGrade ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                        prospect.fvGrade >= 60
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100'
                          : prospect.fvGrade >= 50
                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
                      }`}>
                        {prospect.fvGrade}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.fvRank ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {prospect.fullName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.team}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.level}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.age}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.fvETA ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.fvPosition ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.rank}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      prospect.type === 'batting'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
                    }`}>
                      {prospect.type === 'batting' ? 'BAT' : 'P'}
                    </span>
                  </td>
                  {(prospectType === 'all' || prospectType === 'batting') && (
                    <>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {prospect.type === 'batting' ? (prospect as typeof prospect & { avg: number }).avg?.toFixed(3) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {prospect.type === 'batting' ? (prospect as typeof prospect & { ops: number }).ops?.toFixed(3) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {prospect.type === 'batting' ? (prospect as typeof prospect & { homeRuns: number }).homeRuns : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {prospect.type === 'batting' ? (prospect as typeof prospect & { stolenBases: number }).stolenBases : '—'}
                      </td>
                    </>
                  )}
                  {(prospectType === 'all' || prospectType === 'pitching') && (
                    <>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {prospect.type === 'pitching' ? (prospect as typeof prospect & { era: number }).era?.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {prospect.type === 'pitching' ? (prospect as typeof prospect & { whip: number }).whip?.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {prospect.type === 'pitching' ? (prospect as typeof prospect & { strikeOuts: number }).strikeOuts : '—'}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.hkbValue?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      prospect.isAvailable
                        ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
                    }`}>
                      {prospect.isAvailable ? 'FA' : prospect.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {prospect.isAvailable ? '' : prospect.franchise}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredProspects.length > 100 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
            Showing 100 of {filteredProspects.length.toLocaleString()} prospects
          </div>
        )}
      </div>
    </div>
  )
}
