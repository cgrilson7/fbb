'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import {
  Search,
  X,
  ArrowLeftRight,
  Loader2,
  Trash2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Scale,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react'
import type { Player, SalaryEntry } from '@/types'
import { computeStandings } from '@/lib/rotoStandings'
import { remainingContract } from '@/lib/contracts'
import TradeRotoImpact from './TradeRotoImpact'
import TargetFinder from './TargetFinder'
import LeagueSurplus from './LeagueSurplus'

const MY_FRANCHISE = 'Colin Wilson & Greg Holmes'
const MY_STATUS = 'C&G'
const CURRENT_YEAR = 2026
const CAP_YEARS = [2026, 2027, 2028, 2029, 2030]

const getSalaryCap = (year: number) => 150_000_000 + (year - 2024) * 10_000_000

function formatMoney(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    const formatted = m >= 10 ? `$${m.toFixed(1)}M` : `$${m.toFixed(1)}M`
    return value < 0 ? `-${formatted}` : formatted
  }
  if (abs >= 1_000) {
    return value < 0 ? `-$${(abs / 1_000).toFixed(0)}K` : `$${(abs / 1_000).toFixed(0)}K`
  }
  return value < 0 ? `-$${abs}` : `$${abs}`
}

function formatMoneyCompact(value: number): string {
  if (value === 0) return '$0'
  return formatMoney(value)
}

function getContractSummary(player: Player): string {
  const c = remainingContract(player)
  if (c.yearsRemaining === 0) return player.contractType ? `${player.contractType} · expiring` : '—'
  const type = player.contractType ? `${player.contractType} ` : ''
  return `${type}${c.yearsRemaining}yr · ${formatMoney(c.aav)}/yr`
}

function getZipsFpts(player: Player): number | null {
  const proj = player.zipsDcProjection || player.zipsProjection
  return proj?.fpts ?? null
}

function getZipsWar(player: Player): number | null {
  const proj = player.zipsDcProjection || player.zipsProjection
  return proj?.war ?? null
}

function capPctClass(spent: number, cap: number): string {
  const pct = spent / cap
  if (pct > 1.2) return 'text-red-600 dark:text-red-400 font-semibold'
  if (pct > 1.1) return 'text-orange-600 dark:text-orange-400'
  if (pct > 1.0) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

function capBgClass(spent: number, cap: number): string {
  const pct = spent / cap
  if (pct > 1.2) return 'bg-red-50 dark:bg-red-900/20'
  if (pct > 1.1) return 'bg-orange-50 dark:bg-orange-900/20'
  if (pct > 1.0) return 'bg-yellow-50 dark:bg-yellow-900/20'
  return ''
}

export default function TradePage() {
  const { players, salaries, franchiseMappings } = usePlayerStore()
  const hasHydrated = useHydration()
  const [myTeamPlayers, setMyTeamPlayers] = useState<Player[]>([])
  const [theirTeamPlayers, setTheirTeamPlayers] = useState<Player[]>([])
  const [selectedFranchise, setSelectedFranchise] = useState<string>('')
  const [search, setSearch] = useState('')
  const [searchSide, setSearchSide] = useState<'my' | 'their' | null>(null)
  const [cashConsideration, setCashConsideration] = useState<number>(0) // in raw dollars, positive = you send
  const mySearchRef = useRef<HTMLInputElement>(null)
  const theirSearchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        // Don't close if clicking inside search inputs
        if (
          mySearchRef.current?.contains(e.target as Node) ||
          theirSearchRef.current?.contains(e.target as Node)
        )
          return
        setSearchSide(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Franchises (excluding FA and yourself)
  const franchises = useMemo(() => {
    return franchiseMappings
      .filter(m => m.fullName !== 'Free Agent' && m.fullName !== MY_FRANCHISE)
      .map(m => m.fullName)
      .sort()
  }, [franchiseMappings])

  // Get the short code for the selected franchise
  const theirStatusCode = useMemo(() => {
    const mapping = franchiseMappings.find(m => m.fullName === selectedFranchise)
    return mapping?.shortCode || ''
  }, [selectedFranchise, franchiseMappings])

  // Rosters
  const myRoster = useMemo(() => {
    return players.filter(p => p.franchise === MY_FRANCHISE || p.status === MY_STATUS)
  }, [players])

  const theirRoster = useMemo(() => {
    if (!selectedFranchise) return []
    return players.filter(p => p.franchise === selectedFranchise || p.status === theirStatusCode)
  }, [players, selectedFranchise, theirStatusCode])

  // Search results
  const searchResults = useMemo(() => {
    if (!search || !searchSide) return []
    const roster = searchSide === 'my' ? myRoster : theirRoster
    const alreadyAdded = searchSide === 'my' ? myTeamPlayers : theirTeamPlayers
    const lower = search.toLowerCase()
    return roster
      .filter(
        p =>
          p.name.toLowerCase().includes(lower) && !alreadyAdded.find(tp => tp.id === p.id)
      )
      .slice(0, 12)
  }, [search, searchSide, myRoster, theirRoster, myTeamPlayers, theirTeamPlayers])

  // Totals
  const myTotalHkb = myTeamPlayers.reduce((sum, p) => sum + (p.hkbValue || 0), 0)
  const theirTotalHkb = theirTeamPlayers.reduce((sum, p) => sum + (p.hkbValue || 0), 0)

  const myTotalFpts = myTeamPlayers.reduce((sum, p) => sum + (getZipsFpts(p) || 0), 0)
  const theirTotalFpts = theirTeamPlayers.reduce((sum, p) => sum + (getZipsFpts(p) || 0), 0)

  const myTotalWar = myTeamPlayers.reduce((sum, p) => sum + (getZipsWar(p) || 0), 0)
  const theirTotalWar = theirTeamPlayers.reduce((sum, p) => sum + (getZipsWar(p) || 0), 0)

  const myTotal2026Salary = myTeamPlayers.reduce(
    (sum, p) => sum + (p.salaryByYear[CURRENT_YEAR] || 0),
    0
  )
  const theirTotal2026Salary = theirTeamPlayers.reduce(
    (sum, p) => sum + (p.salaryByYear[CURRENT_YEAR] || 0),
    0
  )

  const myTotalContractValue = myTeamPlayers.reduce(
    (sum, p) => sum + Object.values(p.salaryByYear).reduce((s, v) => s + v, 0),
    0
  )
  const theirTotalContractValue = theirTeamPlayers.reduce(
    (sum, p) => sum + Object.values(p.salaryByYear).reduce((s, v) => s + v, 0),
    0
  )

  // Cap impact calculation
  const capImpact = useMemo(() => {
    // Get all salary entries for each franchise
    const mySalaries = salaries.filter(s => s.franchise === MY_STATUS || s.franchise === MY_FRANCHISE)
    const theirSalaries = selectedFranchise
      ? salaries.filter(s => s.franchise === theirStatusCode || s.franchise === selectedFranchise)
      : []

    return CAP_YEARS.map(year => {
      const cap = getSalaryCap(year)

      // Current totals
      const myCurrentTotal = mySalaries.reduce((sum, s) => sum + (s.salaryByYear[year] || 0), 0)
      const theirCurrentTotal = theirSalaries.reduce(
        (sum, s) => sum + (s.salaryByYear[year] || 0),
        0
      )

      // Deltas from traded players
      const myOutgoing = myTeamPlayers.reduce(
        (sum, p) => sum + (p.salaryByYear[year] || 0),
        0
      )
      const myIncoming = theirTeamPlayers.reduce(
        (sum, p) => sum + (p.salaryByYear[year] || 0),
        0
      )
      const theirOutgoing = theirTeamPlayers.reduce(
        (sum, p) => sum + (p.salaryByYear[year] || 0),
        0
      )
      const theirIncoming = myTeamPlayers.reduce(
        (sum, p) => sum + (p.salaryByYear[year] || 0),
        0
      )

      // Cash applied to 2026 only
      const cashAdj = year === CURRENT_YEAR ? cashConsideration : 0

      const myAfter = myCurrentTotal - myOutgoing + myIncoming + cashAdj
      const theirAfter = theirCurrentTotal - theirOutgoing + theirIncoming - cashAdj

      return {
        year,
        cap,
        myCurrent: myCurrentTotal,
        myAfter,
        myChange: myAfter - myCurrentTotal,
        theirCurrent: theirCurrentTotal,
        theirAfter,
        theirChange: theirAfter - theirCurrentTotal,
      }
    })
  }, [salaries, myTeamPlayers, theirTeamPlayers, cashConsideration, selectedFranchise, theirStatusCode])

  const addPlayer = useCallback(
    (player: Player, side: 'my' | 'their') => {
      if (side === 'my') {
        setMyTeamPlayers(prev => [...prev, player])
      } else {
        setTheirTeamPlayers(prev => [...prev, player])
      }
      setSearch('')
      setSearchSide(null)
    },
    []
  )

  const removePlayer = useCallback((playerId: string, side: 'my' | 'their') => {
    if (side === 'my') {
      setMyTeamPlayers(prev => prev.filter(p => p.id !== playerId))
    } else {
      setTheirTeamPlayers(prev => prev.filter(p => p.id !== playerId))
    }
  }, [])

  const clearTrade = useCallback(() => {
    setMyTeamPlayers([])
    setTheirTeamPlayers([])
    setCashConsideration(0)
  }, [])

  const hasTradePieces = myTeamPlayers.length > 0 || theirTeamPlayers.length > 0 || cashConsideration !== 0

  const [activeTab, setActiveTab] = useState<'impact' | 'targets' | 'surplus'>('impact')

  // Rosters keyed by franchise + league-wide ROS rotisserie standings (shared by all tabs)
  const rostersByFr = useMemo(() => {
    const valid = new Set(franchiseMappings.map(f => f.fullName).filter(n => n && n !== 'Free Agent'))
    const m = new Map<string, Player[]>()
    for (const p of players) {
      if (!p.franchise || !valid.has(p.franchise) || p.isAvailable) continue
      if (!m.has(p.franchise)) m.set(p.franchise, [])
      m.get(p.franchise)!.push(p)
    }
    return m
  }, [players, franchiseMappings])

  const baseStandings = useMemo(() => computeStandings(rostersByFr), [rostersByFr])

  // Verdict
  const verdict = useMemo(() => {
    if (myTeamPlayers.length === 0 && theirTeamPlayers.length === 0) return null
    const hkbDiff = theirTotalHkb - myTotalHkb
    const fptsDiff = theirTotalFpts - myTotalFpts
    const salaryDiff = myTotal2026Salary - theirTotal2026Salary // positive = you shed salary

    let score = 0
    if (hkbDiff > 50) score += 2
    else if (hkbDiff > 10) score += 1
    else if (hkbDiff < -50) score -= 2
    else if (hkbDiff < -10) score -= 1

    if (fptsDiff > 100) score += 1
    else if (fptsDiff < -100) score -= 1

    // Salary savings are good
    if (salaryDiff > 5_000_000) score += 1
    else if (salaryDiff < -5_000_000) score -= 1

    if (score >= 3) return { text: 'Strong win for you', color: 'text-green-600 dark:text-green-400' }
    if (score >= 2) return { text: 'Favorable for you', color: 'text-green-600 dark:text-green-400' }
    if (score >= 1) return { text: 'Slight edge for you', color: 'text-green-500 dark:text-green-400' }
    if (score === 0) return { text: 'Roughly even trade', color: 'text-gray-600 dark:text-gray-400' }
    if (score >= -1) return { text: 'Slight edge for them', color: 'text-yellow-600 dark:text-yellow-400' }
    if (score >= -2) return { text: 'Favorable for them', color: 'text-red-500 dark:text-red-400' }
    return { text: 'Strong win for them', color: 'text-red-600 dark:text-red-400' }
  }, [myTeamPlayers, theirTeamPlayers, myTotalHkb, theirTotalHkb, myTotalFpts, theirTotalFpts, myTotal2026Salary, theirTotal2026Salary])

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

  const theirFranchiseShort = selectedFranchise
    ? selectedFranchise.length > 20
      ? selectedFranchise.split(' ')[0]
      : selectedFranchise
    : 'Their Team'

  return (
    <div className="space-y-6">
      {/* Header + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trade Analyzer</h1>
        <div className="flex items-center gap-4">
          {/* Cash consideration */}
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
              Cash ({cashConsideration >= 0 ? 'you send' : 'they send'}):
            </label>
            <input
              type="number"
              value={cashConsideration / 100_000}
              onChange={e => setCashConsideration(Number(e.target.value) * 100_000)}
              step={1}
              className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right"
              placeholder="0"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">x $100K</span>
          </div>
          {cashConsideration !== 0 && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              = {formatMoney(Math.abs(cashConsideration))}
            </span>
          )}
          {hasTradePieces && (
            <button
              onClick={clearTrade}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
        {([['impact', 'Trade Impact'], ['targets', 'Target Finder'], ['surplus', 'League Surplus']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2 text-sm font-medium ${activeTab === key ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>{label}</button>
        ))}
      </div>

      {activeTab === 'impact' && (<>
      {/* Two-column player search + add */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Team Search */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
              {MY_FRANCHISE} (You)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {myRoster.length} players on roster
            </p>
          </div>
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={mySearchRef}
                type="text"
                placeholder="Add player from your team..."
                value={searchSide === 'my' ? search : ''}
                onChange={e => {
                  setSearch(e.target.value)
                  setSearchSide('my')
                }}
                onFocus={() => setSearchSide('my')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              {searchSide === 'my' && searchResults.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto"
                >
                  {searchResults.map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player, 'my')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between gap-2"
                    >
                      <span className="text-gray-900 dark:text-white truncate">
                        {player.name}
                      </span>
                      <span className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                        <span>{player.position}</span>
                        <span>{player.hkbValue?.toLocaleString() ?? '—'}</span>
                        <span>
                          {player.salaryByYear[CURRENT_YEAR]
                            ? formatMoney(player.salaryByYear[CURRENT_YEAR])
                            : '—'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected players chips */}
            <div className="flex flex-wrap gap-2 min-h-[40px]">
              {myTeamPlayers.map(player => (
                <span
                  key={player.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded-full text-sm"
                >
                  {player.name}
                  <button
                    onClick={() => removePlayer(player.id, 'my')}
                    className="hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              {myTeamPlayers.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-1">
                  Search to add players you are sending
                </p>
              )}
            </div>
            <RosterBrowse
              roster={myRoster}
              addedPlayerIds={new Set(myTeamPlayers.map(p => p.id))}
              onAdd={player => addPlayer(player, 'my')}
              colorClass="blue"
            />
          </div>
        </div>

        {/* Their Team Search */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <select
              value={selectedFranchise}
              onChange={e => {
                setSelectedFranchise(e.target.value)
                setTheirTeamPlayers([])
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Select trading partner...</option>
              {franchises.map(franchise => (
                <option key={franchise} value={franchise}>
                  {franchise}
                </option>
              ))}
            </select>
            {selectedFranchise && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {theirRoster.length} players on roster
              </p>
            )}
          </div>
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={theirSearchRef}
                type="text"
                placeholder={
                  selectedFranchise ? 'Add player from their team...' : 'Select a franchise first'
                }
                value={searchSide === 'their' ? search : ''}
                onChange={e => {
                  setSearch(e.target.value)
                  setSearchSide('their')
                }}
                onFocus={() => setSearchSide('their')}
                disabled={!selectedFranchise}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {searchSide === 'their' && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {searchResults.map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player, 'their')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between gap-2"
                    >
                      <span className="text-gray-900 dark:text-white truncate">
                        {player.name}
                      </span>
                      <span className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                        <span>{player.position}</span>
                        <span>{player.hkbValue?.toLocaleString() ?? '—'}</span>
                        <span>
                          {player.salaryByYear[CURRENT_YEAR]
                            ? formatMoney(player.salaryByYear[CURRENT_YEAR])
                            : '—'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 min-h-[40px]">
              {theirTeamPlayers.map(player => (
                <span
                  key={player.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 rounded-full text-sm"
                >
                  {player.name}
                  <button
                    onClick={() => removePlayer(player.id, 'their')}
                    className="hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              {theirTeamPlayers.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-1">
                  {selectedFranchise ? 'Search to add players you are receiving' : 'Select a franchise above'}
                </p>
              )}
            </div>
            {selectedFranchise && (
              <RosterBrowse
                roster={theirRoster}
                addedPlayerIds={new Set(theirTeamPlayers.map(p => p.id))}
                onAdd={player => addPlayer(player, 'their')}
                colorClass="purple"
              />
            )}
          </div>
        </div>
      </div>

      {/* Per-Franchise Detail Tables */}
      {hasTradePieces && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* You Send */}
          <PlayerDetailTable
            title="You Send"
            players={myTeamPlayers}
            colorClass="blue"
            cashConsideration={cashConsideration > 0 ? cashConsideration : 0}
            cashLabel={cashConsideration > 0 ? `Cash to ${theirFranchiseShort}` : undefined}
          />
          {/* You Receive */}
          <PlayerDetailTable
            title="You Receive"
            players={theirTeamPlayers}
            colorClass="purple"
            cashConsideration={cashConsideration < 0 ? Math.abs(cashConsideration) : 0}
            cashLabel={cashConsideration < 0 ? `Cash from ${theirFranchiseShort}` : undefined}
          />
        </div>
      )}

      {/* Cap Impact Analysis */}
      {hasTradePieces && selectedFranchise && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Cap Impact Analysis
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-400 font-medium">
                    Year
                  </th>
                  <th className="px-3 py-3 text-right text-gray-500 dark:text-gray-400 font-medium">
                    Cap
                  </th>
                  <th
                    colSpan={3}
                    className="px-3 py-3 text-center text-blue-600 dark:text-blue-400 font-medium border-l border-gray-200 dark:border-gray-700"
                  >
                    Your Franchise
                  </th>
                  <th
                    colSpan={3}
                    className="px-3 py-3 text-center text-purple-600 dark:text-purple-400 font-medium border-l border-gray-200 dark:border-gray-700"
                  >
                    {theirFranchiseShort}
                  </th>
                </tr>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                  <th className="px-4 py-2" />
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">
                    Current
                  </th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                    After
                  </th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                    Change
                  </th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">
                    Current
                  </th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                    After
                  </th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {capImpact.map(row => (
                  <tr
                    key={row.year}
                    className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-750"
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">
                      {row.year}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                      {formatMoney(row.cap)}
                    </td>
                    {/* Your side */}
                    <td className="px-3 py-2.5 text-right border-l border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                      {formatMoney(row.myCurrent)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${capPctClass(row.myAfter, row.cap)} ${capBgClass(row.myAfter, row.cap)}`}
                    >
                      {formatMoney(row.myAfter)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <ChangeCell value={row.myChange} invert />
                    </td>
                    {/* Their side */}
                    <td className="px-3 py-2.5 text-right border-l border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                      {formatMoney(row.theirCurrent)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium ${capPctClass(row.theirAfter, row.cap)} ${capBgClass(row.theirAfter, row.cap)}`}
                    >
                      {formatMoney(row.theirAfter)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <ChangeCell value={row.theirChange} invert />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trade Summary Card */}
      {hasTradePieces && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-5">
            <Scale className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Trade Summary</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {/* Dynasty Value */}
            <SummaryMetric
              label="Dynasty Value (HKB)"
              myValue={myTotalHkb.toLocaleString()}
              theirValue={theirTotalHkb.toLocaleString()}
              diff={theirTotalHkb - myTotalHkb}
              formatDiff={v => (v > 0 ? '+' : '') + v.toLocaleString()}
              positiveIsGood
            />
            {/* Production */}
            <SummaryMetric
              label="ZiPS FPTS"
              myValue={myTotalFpts.toFixed(0)}
              theirValue={theirTotalFpts.toFixed(0)}
              diff={theirTotalFpts - myTotalFpts}
              formatDiff={v => (v > 0 ? '+' : '') + v.toFixed(0)}
              positiveIsGood
            />
            {/* 2026 Salary */}
            <SummaryMetric
              label="2026 Salary"
              myValue={formatMoney(myTotal2026Salary)}
              theirValue={formatMoney(theirTotal2026Salary)}
              diff={myTotal2026Salary - theirTotal2026Salary}
              formatDiff={v => (v > 0 ? '+' : '') + formatMoney(v)}
              positiveIsGood={false}
            />
            {/* Total Contract Value */}
            <SummaryMetric
              label="Total Contract $"
              myValue={formatMoney(myTotalContractValue)}
              theirValue={formatMoney(theirTotalContractValue)}
              diff={myTotalContractValue - theirTotalContractValue}
              formatDiff={v => (v > 0 ? '+' : '') + formatMoney(v)}
              positiveIsGood={false}
            />
          </div>

          {/* Cash consideration line */}
          {cashConsideration !== 0 && (
            <div className="text-center mb-4 text-sm text-gray-600 dark:text-gray-400">
              {cashConsideration > 0
                ? `You send ${formatMoney(cashConsideration)} cash to ${theirFranchiseShort}`
                : `${theirFranchiseShort} sends ${formatMoney(Math.abs(cashConsideration))} cash to you`}
            </div>
          )}

          {/* Verdict */}
          {verdict && (
            <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Verdict</p>
              <p className={`text-xl font-bold ${verdict.color}`}>{verdict.text}</p>
            </div>
          )}
        </div>
      )}

      {/* ROS rotisserie standings impact */}
      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <TradeRotoImpact
          rostersByFr={rostersByFr}
          baseStandings={baseStandings}
          myFranchise={MY_FRANCHISE}
          theirFranchise={selectedFranchise}
          myRoster={myRoster}
          theirRoster={theirRoster}
          give={myTeamPlayers}
          get={theirTeamPlayers}
        />
      </div>
      </>)}

      {activeTab === 'targets' && (
        <TargetFinder players={players} baseStandings={baseStandings} myFranchise={MY_FRANCHISE} />
      )}
      {activeTab === 'surplus' && (
        <LeagueSurplus rostersByFr={rostersByFr} baseStandings={baseStandings} myFranchise={MY_FRANCHISE} />
      )}
    </div>
  )
}

// --- Sub-components ---

function PlayerDetailTable({
  title,
  players,
  colorClass,
  cashConsideration,
  cashLabel,
}: {
  title: string
  players: Player[]
  colorClass: 'blue' | 'purple'
  cashConsideration: number
  cashLabel?: string
}) {
  const borderColor =
    colorClass === 'blue'
      ? 'border-blue-200 dark:border-blue-800'
      : 'border-purple-200 dark:border-purple-800'
  const headerBg =
    colorClass === 'blue'
      ? 'bg-blue-50 dark:bg-blue-900/30'
      : 'bg-purple-50 dark:bg-purple-900/30'
  const titleColor =
    colorClass === 'blue'
      ? 'text-blue-700 dark:text-blue-400'
      : 'text-purple-700 dark:text-purple-400'

  const total2026 = players.reduce((s, p) => s + (p.salaryByYear[CURRENT_YEAR] || 0), 0)
  const totalHkb = players.reduce((s, p) => s + (p.hkbValue || 0), 0)
  const totalFpts = players.reduce((s, p) => s + (getZipsFpts(p) || 0), 0)
  const totalWar = players.reduce((s, p) => s + (getZipsWar(p) || 0), 0)

  if (players.length === 0 && !cashLabel) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow border ${borderColor}`}>
        <div className={`px-4 py-3 ${headerBg} rounded-t-lg`}>
          <h3 className={`font-semibold ${titleColor}`}>{title}</h3>
        </div>
        <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
          No players added yet
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow border ${borderColor} overflow-hidden`}>
      <div className={`px-4 py-3 ${headerBg}`}>
        <h3 className={`font-semibold ${titleColor}`}>{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
              <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">
                Player
              </th>
              <th className="px-2 py-2 text-center text-gray-500 dark:text-gray-400 font-medium">
                Pos
              </th>
              <th className="px-2 py-2 text-center text-gray-500 dark:text-gray-400 font-medium">
                Age
              </th>
              <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">
                2026 Sal
              </th>
              <th className="px-2 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">
                Contract
              </th>
              <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">
                HKB Rk
              </th>
              <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">
                HKB Val
              </th>
              <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">
                FP Rk
              </th>
              <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">
                FPTS
              </th>
              <th className="px-2 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">
                WAR
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map(player => {
              const fpts = getZipsFpts(player)
              const war = getZipsWar(player)
              return (
                <tr
                  key={player.id}
                  className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-750"
                >
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {player.name}
                  </td>
                  <td className="px-2 py-2 text-center text-gray-600 dark:text-gray-400">
                    {player.position}
                  </td>
                  <td className="px-2 py-2 text-center text-gray-600 dark:text-gray-400">
                    {player.age ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">
                    {player.salaryByYear[CURRENT_YEAR]
                      ? formatMoney(player.salaryByYear[CURRENT_YEAR])
                      : '—'}
                  </td>
                  <td className="px-2 py-2 text-left text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                    {getContractSummary(player)}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-600 dark:text-gray-400">
                    {player.hkbRank ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-medium text-gray-900 dark:text-white">
                    {player.hkbValue?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-600 dark:text-gray-400">
                    {player.fpRank ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">
                    {fpts != null ? fpts.toFixed(0) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">
                    {war != null ? war.toFixed(1) : '—'}
                  </td>
                </tr>
              )
            })}
            {/* Cash row */}
            {cashLabel && cashConsideration > 0 && (
              <tr className="border-b border-gray-100 dark:border-gray-700/50 bg-green-50/50 dark:bg-green-900/10">
                <td
                  colSpan={3}
                  className="px-3 py-2 font-medium text-green-700 dark:text-green-400 italic"
                >
                  {cashLabel}
                </td>
                <td className="px-2 py-2 text-right text-green-700 dark:text-green-400 font-medium">
                  {formatMoney(cashConsideration)}
                </td>
                <td colSpan={6} />
              </tr>
            )}
            {/* Totals */}
            {players.length > 0 && (
              <tr className="bg-gray-50 dark:bg-gray-750 font-semibold">
                <td colSpan={3} className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                  Totals
                </td>
                <td className="px-2 py-2.5 text-right text-gray-900 dark:text-white">
                  {formatMoney(total2026)}
                </td>
                <td className="px-2 py-2.5" />
                <td className="px-2 py-2.5" />
                <td className="px-2 py-2.5 text-right text-gray-900 dark:text-white">
                  {totalHkb.toLocaleString()}
                </td>
                <td className="px-2 py-2.5" />
                <td className="px-2 py-2.5 text-right text-gray-900 dark:text-white">
                  {totalFpts.toFixed(0)}
                </td>
                <td className="px-2 py-2.5 text-right text-gray-900 dark:text-white">
                  {totalWar.toFixed(1)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChangeCell({ value, invert = false }: { value: number; invert?: boolean }) {
  if (value === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>
  }
  // For salary: spending less = good (invert), so negative change is green when invert is true
  const isGood = invert ? value < 0 : value > 0
  const color = isGood
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'
  const Icon = isGood ? TrendingDown : TrendingUp
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      {invert ? (
        value < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />
      ) : (
        value > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />
      )}
      {formatMoneyCompact(Math.abs(value))}
    </span>
  )
}

type SortKey = 'name' | 'position' | 'age' | 'hkbValue' | 'fpts' | 'salary'
type SortDir = 'asc' | 'desc'

function RosterBrowse({
  roster,
  addedPlayerIds,
  onAdd,
  colorClass,
}: {
  roster: Player[]
  addedPlayerIds: Set<string>
  onAdd: (player: Player) => void
  colorClass: 'blue' | 'purple'
}) {
  const [expanded, setExpanded] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('hkbValue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filter, setFilter] = useState('')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    let list = roster.filter(p => !addedPlayerIds.has(p.id))
    if (filter) {
      const lower = filter.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(lower))
    }
    return list.sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      switch (sortKey) {
        case 'name':
          av = a.name; bv = b.name
          return sortDir === 'asc' ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string)
        case 'position':
          av = a.position || ''; bv = b.position || ''
          return sortDir === 'asc' ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string)
        case 'age':
          av = a.age ?? 999; bv = b.age ?? 999; break
        case 'hkbValue':
          av = a.hkbValue ?? -999; bv = b.hkbValue ?? -999; break
        case 'fpts':
          av = getZipsFpts(a) ?? -999; bv = getZipsFpts(b) ?? -999; break
        case 'salary':
          av = a.salaryByYear[CURRENT_YEAR] || 0; bv = b.salaryByYear[CURRENT_YEAR] || 0; break
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [roster, addedPlayerIds, filter, sortKey, sortDir])

  const borderColor = colorClass === 'blue' ? 'border-blue-200 dark:border-blue-800' : 'border-purple-200 dark:border-purple-800'
  const chevronColor = colorClass === 'blue' ? 'text-blue-500' : 'text-purple-500'

  const SortHeader = ({ label, col, align = 'left' }: { label: string; col: SortKey; align?: string }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none whitespace-nowrap text-${align}`}
    >
      {label}
      {sortKey === col && (
        <span className="ml-0.5 text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>
      )}
    </th>
  )

  return (
    <div className={`border-t ${borderColor}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <span>Browse roster ({roster.length - addedPlayerIds.size})</span>
        {expanded ? (
          <ChevronUp className={`w-4 h-4 ${chevronColor}`} />
        ) : (
          <ChevronDown className={`w-4 h-4 ${chevronColor}`} />
        )}
      </button>
      {expanded && (
        <div>
          <div className="px-3 pb-2">
            <input
              type="text"
              placeholder="Filter players..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-750">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="w-8 px-1 py-1.5" />
                  <SortHeader label="Player" col="name" />
                  <SortHeader label="Pos" col="position" align="center" />
                  <SortHeader label="Age" col="age" align="center" />
                  <SortHeader label="HKB" col="hkbValue" align="right" />
                  <SortHeader label="FPTS" col="fpts" align="right" />
                  <SortHeader label="2026 Sal" col="salary" align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(player => {
                  const fpts = getZipsFpts(player)
                  return (
                    <tr
                      key={player.id}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-750"
                    >
                      <td className="px-1 py-1">
                        <button
                          onClick={() => onAdd(player)}
                          className={`p-0.5 rounded transition-colors ${
                            colorClass === 'blue'
                              ? 'hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-500 hover:text-blue-700'
                              : 'hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-500 hover:text-purple-700'
                          }`}
                          title="Add to trade"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td className="px-2 py-1 text-gray-900 dark:text-white whitespace-nowrap">
                        {player.name}
                      </td>
                      <td className="px-2 py-1 text-center text-gray-600 dark:text-gray-400">
                        {player.position}
                      </td>
                      <td className="px-2 py-1 text-center text-gray-600 dark:text-gray-400">
                        {player.age ?? '—'}
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-gray-900 dark:text-white">
                        {player.hkbValue?.toLocaleString() ?? '—'}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-700 dark:text-gray-300">
                        {fpts != null ? fpts.toFixed(0) : '—'}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-600 dark:text-gray-400">
                        {player.salaryByYear[CURRENT_YEAR]
                          ? formatMoney(player.salaryByYear[CURRENT_YEAR])
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-gray-400 dark:text-gray-500">
                      {filter ? 'No matching players' : 'No players available'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryMetric({
  label,
  myValue,
  theirValue,
  diff,
  formatDiff,
  positiveIsGood,
}: {
  label: string
  myValue: string
  theirValue: string
  diff: number
  formatDiff: (v: number) => string
  positiveIsGood: boolean
}) {
  const isGood = positiveIsGood ? diff > 0 : diff < 0
  const isNeutral = diff === 0
  const diffColor = isNeutral
    ? 'text-gray-500 dark:text-gray-400'
    : isGood
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400'

  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
        {label}
      </p>
      <div className="flex items-center justify-center gap-4 mb-1">
        <div>
          <p className="text-xs text-blue-500 dark:text-blue-400">Send</p>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{myValue}</p>
        </div>
        <ArrowLeftRight className="w-4 h-4 text-gray-400 shrink-0" />
        <div>
          <p className="text-xs text-purple-500 dark:text-purple-400">Get</p>
          <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{theirValue}</p>
        </div>
      </div>
      <p className={`text-sm font-medium ${diffColor}`}>
        {formatDiff(diff)}
      </p>
    </div>
  )
}
