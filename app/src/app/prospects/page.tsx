'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react'

type ProspectType = 'all' | 'batting' | 'pitching'
type SortField = 'name' | 'team' | 'level' | 'age' | 'hkbRank' | 'hkbValue' | 'fvGrade' | 'fvRank' |
  'mlbRank' | 'klawRank' | 'eta' | 'rankTrend' |
  'pa' | 'avg' | 'obp' | 'slg' | 'ops' | 'iso' | 'wrcPlus' | 'bbPct' | 'kPct' |
  'ip' | 'era' | 'fip' | 'xfip' | 'whip' | 'k9' | 'bb9' | 'kMinusBbPct' | 'franchise'
type SortOrder = 'asc' | 'desc'

const LEVEL_ORDER: Record<string, number> = {
  'AAA': 1, 'AA': 2, 'A+': 3, 'A': 4, 'A-': 5, 'Rk': 6, 'CPX': 7, 'DSL': 8, 'FCL': 9
}

function getLevelBadgeColor(level: string): string {
  if (level === 'AAA') return 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100'
  if (level === 'AA') return 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
  if (level === 'A+') return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
  if (level === 'A' || level === 'A-') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
  return 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
}

// FanGraphs aggregates a season into one row; `Level` is a comma-joined list of
// every level played (e.g. "AA,AAA"). Treat the highest level reached as the
// player's current level — that's the relevant one for prospect evaluation.
function getLevelParts(level: string): string[] {
  return level.split(',').map(s => s.trim()).filter(Boolean)
}

function topLevel(level: string): string {
  const parts = getLevelParts(level)
  if (parts.length === 0) return ''
  return parts.reduce((best, lv) => (LEVEL_ORDER[lv] ?? 99) < (LEVEL_ORDER[best] ?? 99) ? lv : best)
}

export default function ProspectsPage() {
  const { fgMinorsBatters, fgMinorsPitchers, players, hkbPlayers, fvRankings, prospectRankings, franchiseMappings, mlbDebuted } = usePlayerStore()
  const hasHydrated = useHydration()
  const [search, setSearch] = useState('')
  const [prospectType, setProspectType] = useState<ProspectType>('all')
  const [levelFilter, setLevelFilter] = useState('')
  const [minPa, setMinPa] = useState('')
  const [minIp, setMinIp] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [franchiseFilter, setFranchiseFilter] = useState('')
  const [showAvailableOnly, setShowAvailableOnly] = useState(false)
  const [showRankedOnly, setShowRankedOnly] = useState(false)
  const [sortField, setSortField] = useState<SortField>('wrcPlus')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Anyone with an MLB appearance (ever) is no longer a prospect — this drops
  // both past debuts and MLB vets on rehab assignments. Exact FG PlayerId match.
  const debutedIds = useMemo(() => new Set(mlbDebuted.map(d => d.playerId)), [mlbDebuted])

  const enrichedProspects = useMemo(() => {
    const allProspects = [
      ...fgMinorsBatters.map(p => ({ ...p, type: 'batting' as const })),
      ...fgMinorsPitchers.map(p => ({ ...p, type: 'pitching' as const }))
    ].filter(p => !debutedIds.has(p.playerId))

    const playerMap = new Map(players.map(p => [p.normalizedName, p]))
    const hkbMap = new Map(hkbPlayers.map(p => [p.normalizedName, p]))
    const fvMap = new Map(fvRankings.map(p => [p.normalizedName, p]))
    const rankingMap = new Map(prospectRankings.map(p => [p.normalizedName, p]))
    const franchiseMap = new Map(franchiseMappings.map(m => [m.shortCode, m.fullName]))

    return allProspects.map(prospect => {
      const player = playerMap.get(prospect.normalizedName)
      const hkb = hkbMap.get(prospect.normalizedName)
      const fv = fvMap.get(prospect.normalizedName)
      const ranking = rankingMap.get(prospect.normalizedName)
      const status = player?.status ?? 'FA'
      const franchise = franchiseMap.get(status) || status
      // Positive = climbed the MLB Pipeline Top 100 since preseason (or entered it)
      const rankTrend = ranking?.mlbRank != null
        ? (ranking.mlbPreseasonRank ?? 101) - ranking.mlbRank
        : null

      return {
        ...prospect,
        currentLevel: topLevel(prospect.level),
        isAvailable: player?.isAvailable ?? true,
        status,
        franchise,
        hkbRank: hkb?.rank ?? null,
        hkbValue: hkb?.value ?? null,
        fvGrade: fv?.fv ?? null,
        fvRank: fv?.rank ?? null,
        fvETA: fv?.eta ?? null,
        fvPosition: fv?.position ?? null,
        mlbRank: ranking?.mlbRank ?? null,
        mlbPreseasonRank: ranking?.mlbPreseasonRank ?? null,
        klawRank: ranking?.klawRank ?? null,
        eta: ranking?.eta ?? fv?.eta ?? null,
        rankTrend,
      }
    })
  }, [fgMinorsBatters, fgMinorsPitchers, debutedIds, players, hkbPlayers, fvRankings, prospectRankings, franchiseMappings])

  const levels = useMemo(() => {
    const allLevels = new Set(enrichedProspects.map(p => p.currentLevel).filter(Boolean))
    return Array.from(allLevels).sort((a, b) => (LEVEL_ORDER[a] ?? 99) - (LEVEL_ORDER[b] ?? 99))
  }, [enrichedProspects])

  const teams = useMemo(() => {
    const allTeams = new Set(enrichedProspects.map(p => p.team).filter(Boolean))
    return Array.from(allTeams).sort()
  }, [enrichedProspects])

  const franchises = useMemo(() => {
    const allFranchises = new Set(enrichedProspects.map(p => p.franchise).filter(f => f && f !== 'Unknown' && f !== 'Free Agent'))
    return Array.from(allFranchises).sort()
  }, [enrichedProspects])

  const filteredProspects = useMemo(() => {
    let result = [...enrichedProspects]

    if (prospectType !== 'all') {
      result = result.filter(p => p.type === prospectType)
    }

    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.team.toLowerCase().includes(lower)
      )
    }

    if (levelFilter) {
      result = result.filter(p => p.currentLevel === levelFilter)
    }

    const minPaNum = minPa ? parseInt(minPa, 10) : 0
    if (minPaNum > 0) {
      result = result.filter(p => p.type !== 'batting' || (p as typeof p & { pa: number }).pa >= minPaNum)
    }

    const minIpNum = minIp ? parseFloat(minIp) : 0
    if (minIpNum > 0) {
      result = result.filter(p => p.type !== 'pitching' || (p as typeof p & { ip: number }).ip >= minIpNum)
    }

    if (teamFilter) {
      result = result.filter(p => p.team === teamFilter)
    }

    if (franchiseFilter) {
      result = result.filter(p => p.franchise === franchiseFilter)
    }

    if (showAvailableOnly) {
      result = result.filter(p => p.isAvailable)
    }

    if (showRankedOnly) {
      result = result.filter(p => p.mlbRank !== null || p.klawRank !== null)
    }

    result.sort((a, b) => {
      let aVal: string | number | null = null
      let bVal: string | number | null = null

      switch (sortField) {
        case 'name': aVal = a.name; bVal = b.name; break
        case 'team': aVal = a.team; bVal = b.team; break
        case 'level': aVal = LEVEL_ORDER[a.currentLevel] ?? 99; bVal = LEVEL_ORDER[b.currentLevel] ?? 99; break
        case 'franchise': aVal = a.franchise; bVal = b.franchise; break
        case 'age': aVal = a.age; bVal = b.age; break
        case 'hkbRank': aVal = a.hkbRank; bVal = b.hkbRank; break
        case 'hkbValue': aVal = a.hkbValue; bVal = b.hkbValue; break
        case 'mlbRank': aVal = a.mlbRank; bVal = b.mlbRank; break
        case 'klawRank': aVal = a.klawRank; bVal = b.klawRank; break
        case 'eta': aVal = a.eta; bVal = b.eta; break
        case 'rankTrend': aVal = a.rankTrend; bVal = b.rankTrend; break
        case 'fvGrade': aVal = a.fvGrade; bVal = b.fvGrade; break
        case 'fvRank': aVal = a.fvRank; bVal = b.fvRank; break
        // Batting stats
        case 'pa': aVal = a.type === 'batting' ? (a as typeof a & { pa: number }).pa : null; bVal = b.type === 'batting' ? (b as typeof b & { pa: number }).pa : null; break
        case 'avg': aVal = a.type === 'batting' ? (a as typeof a & { avg: number }).avg : null; bVal = b.type === 'batting' ? (b as typeof b & { avg: number }).avg : null; break
        case 'obp': aVal = a.type === 'batting' ? (a as typeof a & { obp: number }).obp : null; bVal = b.type === 'batting' ? (b as typeof b & { obp: number }).obp : null; break
        case 'slg': aVal = a.type === 'batting' ? (a as typeof a & { slg: number }).slg : null; bVal = b.type === 'batting' ? (b as typeof b & { slg: number }).slg : null; break
        case 'ops': aVal = a.type === 'batting' ? (a as typeof a & { ops: number }).ops : null; bVal = b.type === 'batting' ? (b as typeof b & { ops: number }).ops : null; break
        case 'iso': aVal = a.type === 'batting' ? (a as typeof a & { iso: number }).iso : null; bVal = b.type === 'batting' ? (b as typeof b & { iso: number }).iso : null; break
        case 'wrcPlus': aVal = a.type === 'batting' ? (a as typeof a & { wrcPlus: number }).wrcPlus : null; bVal = b.type === 'batting' ? (b as typeof b & { wrcPlus: number }).wrcPlus : null; break
        case 'bbPct':
          if (a.type === 'batting') aVal = (a as typeof a & { bbPct: number }).bbPct
          else if (a.type === 'pitching') aVal = (a as typeof a & { bbPct: number }).bbPct
          if (b.type === 'batting') bVal = (b as typeof b & { bbPct: number }).bbPct
          else if (b.type === 'pitching') bVal = (b as typeof b & { bbPct: number }).bbPct
          break
        case 'kPct':
          if (a.type === 'batting') aVal = (a as typeof a & { kPct: number }).kPct
          else if (a.type === 'pitching') aVal = (a as typeof a & { kPct: number }).kPct
          if (b.type === 'batting') bVal = (b as typeof b & { kPct: number }).kPct
          else if (b.type === 'pitching') bVal = (b as typeof b & { kPct: number }).kPct
          break
        // Pitching stats
        case 'ip': aVal = a.type === 'pitching' ? (a as typeof a & { ip: number }).ip : null; bVal = b.type === 'pitching' ? (b as typeof b & { ip: number }).ip : null; break
        case 'era': aVal = a.type === 'pitching' ? (a as typeof a & { era: number }).era : null; bVal = b.type === 'pitching' ? (b as typeof b & { era: number }).era : null; break
        case 'fip': aVal = a.type === 'pitching' ? (a as typeof a & { fip: number }).fip : null; bVal = b.type === 'pitching' ? (b as typeof b & { fip: number }).fip : null; break
        case 'xfip': aVal = a.type === 'pitching' ? (a as typeof a & { xfip: number }).xfip : null; bVal = b.type === 'pitching' ? (b as typeof b & { xfip: number }).xfip : null; break
        case 'whip': aVal = a.type === 'pitching' ? (a as typeof a & { whip: number }).whip : null; bVal = b.type === 'pitching' ? (b as typeof b & { whip: number }).whip : null; break
        case 'k9': aVal = a.type === 'pitching' ? (a as typeof a & { k9: number }).k9 : null; bVal = b.type === 'pitching' ? (b as typeof b & { k9: number }).k9 : null; break
        case 'bb9': aVal = a.type === 'pitching' ? (a as typeof a & { bb9: number }).bb9 : null; bVal = b.type === 'pitching' ? (b as typeof b & { bb9: number }).bb9 : null; break
        case 'kMinusBbPct': aVal = a.type === 'pitching' ? (a as typeof a & { kMinusBbPct: number }).kMinusBbPct : null; bVal = b.type === 'pitching' ? (b as typeof b & { kMinusBbPct: number }).kMinusBbPct : null; break
      }

      if (aVal === null) aVal = sortOrder === 'asc' ? Infinity : -Infinity
      if (bVal === null) bVal = sortOrder === 'asc' ? Infinity : -Infinity

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })

    return result
  }, [enrichedProspects, prospectType, search, levelFilter, minPa, minIp, teamFilter, franchiseFilter, showAvailableOnly, showRankedOnly, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      const descFields = ['hkbValue', 'fvGrade', 'rankTrend', 'pa', 'avg', 'obp', 'slg', 'ops', 'iso', 'wrcPlus', 'ip', 'k9', 'kPct', 'kMinusBbPct']
      const ascFields = ['era', 'fip', 'xfip', 'whip', 'bb9', 'bbPct', 'hkbRank', 'fvRank', 'mlbRank', 'klawRank', 'eta', 'age', 'level']
      if (descFields.includes(field)) setSortOrder('desc')
      else if (ascFields.includes(field)) setSortOrder('asc')
      else setSortOrder('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc' ? <ChevronUp className="w-4 h-4 inline ml-1" /> : <ChevronDown className="w-4 h-4 inline ml-1" />
  }

  const clearFilters = () => {
    setSearch('')
    setShowAvailableOnly(false)
    setShowRankedOnly(false)
    setLevelFilter('')
    setMinPa('')
    setMinIp('')
    setTeamFilter('')
    setFranchiseFilter('')
  }

  const hasFilters = search || showAvailableOnly || showRankedOnly || levelFilter || minPa || minIp || teamFilter || franchiseFilter

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  if (fgMinorsBatters.length === 0 && fgMinorsPitchers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No MiLB stats loaded. Upload fangraphs_minors_batters.csv and fangraphs_minors_pitchers.csv.
        </p>
      </div>
    )
  }

  const thClass = "px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MiLB Stats</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filteredProspects.length.toLocaleString()} players
          {mlbDebuted.length > 0 && (
            <span title="Anyone with an MLB appearance (any year) is excluded via mlb_debuted.csv — including vets on rehab assignments">
              {' '}· {(fgMinorsBatters.length + fgMinorsPitchers.length - enrichedProspects.length).toLocaleString()} MLB-debuted hidden
            </span>
          )}
        </span>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {(['all', 'batting', 'pitching'] as const).map(type => (
              <button
                key={type}
                onClick={() => setProspectType(type)}
                className={`px-4 py-2 text-sm font-medium capitalize ${prospectType === type ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
              >
                {type}
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
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">All levels</option>
            {levels.map(level => <option key={level} value={level}>{level}</option>)}
          </select>

          {(prospectType === 'all' || prospectType === 'batting') && (
            <input
              type="number"
              min="0"
              placeholder="Min PA"
              value={minPa}
              onChange={(e) => setMinPa(e.target.value)}
              className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          )}

          {(prospectType === 'all' || prospectType === 'pitching') && (
            <input
              type="number"
              min="0"
              placeholder="Min IP"
              value={minIp}
              onChange={(e) => setMinIp(e.target.value)}
              className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          )}

          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">All orgs</option>
            {teams.map(team => <option key={team} value={team}>{team}</option>)}
          </select>

          <select value={franchiseFilter} onChange={(e) => setFranchiseFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option value="">All franchises</option>
            {franchises.map(f => <option key={f} value={f}>{f}</option>)}
          </select>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showAvailableOnly} onChange={(e) => setShowAvailableOnly(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Available only</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showRankedOnly} onChange={(e) => setShowRankedOnly(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Top 100 only</span>
          </label>

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className={thClass} onClick={() => handleSort('hkbRank')}>HKB <SortIcon field="hkbRank" /></th>
                <th className={thClass} onClick={() => handleSort('mlbRank')} title="MLB Pipeline Top 100">MLB100 <SortIcon field="mlbRank" /></th>
                <th className={thClass} onClick={() => handleSort('rankTrend')} title="MLB Pipeline rank change since preseason (▲ = rising)">Trend <SortIcon field="rankTrend" /></th>
                <th className={thClass} onClick={() => handleSort('klawRank')} title="Keith Law Top 100 (The Athletic)">KLaw <SortIcon field="klawRank" /></th>
                <th className={thClass} onClick={() => handleSort('fvGrade')}>FV <SortIcon field="fvGrade" /></th>
                <th className={thClass} onClick={() => handleSort('name')}>Name <SortIcon field="name" /></th>
                <th className={thClass} onClick={() => handleSort('team')}>Org <SortIcon field="team" /></th>
                <th className={thClass} onClick={() => handleSort('level')}>Level <SortIcon field="level" /></th>
                <th className={thClass} onClick={() => handleSort('eta')} title="Projected MLB debut year (MLB Pipeline ETA, FanGraphs fallback)">ETA <SortIcon field="eta" /></th>
                <th className={thClass} onClick={() => handleSort('age')}>Age <SortIcon field="age" /></th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Type</th>
                {(prospectType === 'all' || prospectType === 'batting') && (
                  <>
                    <th className={thClass} onClick={() => handleSort('pa')}>PA <SortIcon field="pa" /></th>
                    <th className={thClass} onClick={() => handleSort('wrcPlus')}>wRC+ <SortIcon field="wrcPlus" /></th>
                    <th className={thClass} onClick={() => handleSort('ops')}>OPS <SortIcon field="ops" /></th>
                    <th className={thClass} onClick={() => handleSort('avg')}>AVG <SortIcon field="avg" /></th>
                    <th className={thClass} onClick={() => handleSort('iso')}>ISO <SortIcon field="iso" /></th>
                    <th className={thClass} onClick={() => handleSort('bbPct')}>BB% <SortIcon field="bbPct" /></th>
                    <th className={thClass} onClick={() => handleSort('kPct')}>K% <SortIcon field="kPct" /></th>
                  </>
                )}
                {(prospectType === 'all' || prospectType === 'pitching') && (
                  <>
                    <th className={thClass} onClick={() => handleSort('ip')}>IP <SortIcon field="ip" /></th>
                    <th className={thClass} onClick={() => handleSort('era')}>ERA <SortIcon field="era" /></th>
                    <th className={thClass} onClick={() => handleSort('fip')}>FIP <SortIcon field="fip" /></th>
                    <th className={thClass} onClick={() => handleSort('xfip')}>xFIP <SortIcon field="xfip" /></th>
                    <th className={thClass} onClick={() => handleSort('kMinusBbPct')}>K-BB% <SortIcon field="kMinusBbPct" /></th>
                    <th className={thClass} onClick={() => handleSort('whip')}>WHIP <SortIcon field="whip" /></th>
                  </>
                )}
                <th className={thClass} onClick={() => handleSort('hkbValue')}>Value <SortIcon field="hkbValue" /></th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredProspects.slice(0, 200).map((p, i) => (
                <tr key={`${p.playerId}-${i}`} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${p.isAvailable ? 'bg-green-50 dark:bg-green-900/20' : ''}`}>
                  <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{p.hkbRank ?? '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-900 dark:text-white tabular-nums font-medium">{p.mlbRank ?? '—'}</td>
                  <td className="px-3 py-2 text-sm tabular-nums whitespace-nowrap">
                    {p.rankTrend === null ? (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    ) : p.mlbPreseasonRank === null ? (
                      <span className="text-green-600 dark:text-green-400 font-semibold">NEW</span>
                    ) : p.rankTrend > 0 ? (
                      <span className="text-green-600 dark:text-green-400 font-semibold">▲{p.rankTrend}</span>
                    ) : p.rankTrend < 0 ? (
                      <span className="text-red-500 font-medium">▼{Math.abs(p.rankTrend)}</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">=</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-900 dark:text-white tabular-nums">{p.klawRank ?? '—'}</td>
                  <td className="px-3 py-2 text-sm font-medium">
                    {p.fvGrade ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${p.fvGrade >= 60 ? 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100' : p.fvGrade >= 50 ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100' : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100'}`}>
                        {p.fvGrade}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">{p.name}</td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{p.team}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getLevelBadgeColor(p.currentLevel)}`}>
                      {p.currentLevel || '—'}
                    </span>
                    {getLevelParts(p.level).length > 1 && (
                      <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                        {getLevelParts(p.level).filter(lv => lv !== p.currentLevel).join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm tabular-nums">
                    {p.eta === null ? (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    ) : (
                      <span className={p.eta <= 2026 ? 'text-green-600 dark:text-green-400 font-semibold' : p.eta === 2027 ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}>{p.eta}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{p.age}</td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${p.type === 'batting' ? 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100' : 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'}`}>
                      {p.type === 'batting' ? 'BAT' : 'P'}
                    </span>
                  </td>
                  {(prospectType === 'all' || prospectType === 'batting') && (
                    <>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'batting' ? (p as typeof p & { pa: number }).pa : '—'}</td>
                      <td className="px-3 py-2 text-sm tabular-nums font-medium">{p.type === 'batting' ? <span className={(p as typeof p & { wrcPlus: number }).wrcPlus >= 120 ? 'text-green-600 dark:text-green-400' : (p as typeof p & { wrcPlus: number }).wrcPlus < 80 ? 'text-red-500' : 'text-gray-900 dark:text-white'}>{(p as typeof p & { wrcPlus: number }).wrcPlus.toFixed(0)}</span> : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'batting' ? (p as typeof p & { ops: number }).ops.toFixed(3) : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'batting' ? (p as typeof p & { avg: number }).avg.toFixed(3) : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'batting' ? (p as typeof p & { iso: number }).iso.toFixed(3) : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'batting' ? ((p as typeof p & { bbPct: number }).bbPct * 100).toFixed(1) + '%' : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'batting' ? ((p as typeof p & { kPct: number }).kPct * 100).toFixed(1) + '%' : '—'}</td>
                    </>
                  )}
                  {(prospectType === 'all' || prospectType === 'pitching') && (
                    <>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'pitching' ? (p as typeof p & { ip: number }).ip.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-sm tabular-nums font-medium">{p.type === 'pitching' ? <span className={(p as typeof p & { era: number }).era <= 3.00 ? 'text-green-600 dark:text-green-400' : (p as typeof p & { era: number }).era > 5.00 ? 'text-red-500' : 'text-gray-900 dark:text-white'}>{(p as typeof p & { era: number }).era.toFixed(2)}</span> : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'pitching' ? (p as typeof p & { fip: number }).fip.toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'pitching' ? (p as typeof p & { xfip: number }).xfip.toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-sm tabular-nums">{p.type === 'pitching' ? <span className={(p as typeof p & { kMinusBbPct: number }).kMinusBbPct >= 0.15 ? 'text-green-600 dark:text-green-400' : (p as typeof p & { kMinusBbPct: number }).kMinusBbPct < 0.05 ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}>{((p as typeof p & { kMinusBbPct: number }).kMinusBbPct * 100).toFixed(1)}%</span> : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 tabular-nums">{p.type === 'pitching' ? (p as typeof p & { whip: number }).whip.toFixed(2) : '—'}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{p.hkbValue?.toLocaleString() ?? '—'}</td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${p.isAvailable ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100'}`}>
                      {p.isAvailable ? 'FA' : p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredProspects.length > 200 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
            Showing 200 of {filteredProspects.length.toLocaleString()} players
          </div>
        )}
      </div>
    </div>
  )
}
