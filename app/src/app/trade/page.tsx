'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { Search, Plus, X, ArrowLeftRight } from 'lucide-react'
import type { Player } from '@/types'

const MY_FRANCHISE = 'Colin Wilson & Greg Holmes'

export default function TradePage() {
  const { players, franchiseMappings } = usePlayerStore()
  const [myTeamPlayers, setMyTeamPlayers] = useState<Player[]>([])
  const [theirTeamPlayers, setTheirTeamPlayers] = useState<Player[]>([])
  const [selectedFranchise, setSelectedFranchise] = useState<string>('')
  const [search, setSearch] = useState('')
  const [searchSide, setSearchSide] = useState<'my' | 'their' | null>(null)

  // Get franchises (excluding FA)
  const franchises = useMemo(() => {
    return franchiseMappings
      .filter(m => m.fullName !== 'Free Agent')
      .map(m => m.fullName)
      .sort()
  }, [franchiseMappings])

  // Get my team's roster
  const myRoster = useMemo(() => {
    return players.filter(p => p.franchise === MY_FRANCHISE || p.status === 'C&G')
  }, [players])

  // Get other team's roster
  const theirRoster = useMemo(() => {
    if (!selectedFranchise) return []
    const mapping = franchiseMappings.find(m => m.fullName === selectedFranchise)
    if (!mapping) return []
    return players.filter(p => p.franchise === selectedFranchise || p.status === mapping.shortCode)
  }, [players, selectedFranchise, franchiseMappings])

  // Search results
  const searchResults = useMemo(() => {
    if (!search || !searchSide) return []
    const roster = searchSide === 'my' ? myRoster : theirRoster
    const lower = search.toLowerCase()
    return roster.filter(p =>
      p.name.toLowerCase().includes(lower) &&
      !(searchSide === 'my' ? myTeamPlayers : theirTeamPlayers).find(tp => tp.id === p.id)
    ).slice(0, 10)
  }, [search, searchSide, myRoster, theirRoster, myTeamPlayers, theirTeamPlayers])

  // Trade values
  const myTotalValue = myTeamPlayers.reduce((sum, p) => sum + (p.hkbValue || 0), 0)
  const theirTotalValue = theirTeamPlayers.reduce((sum, p) => sum + (p.hkbValue || 0), 0)
  const valueDiff = myTotalValue - theirTotalValue

  const addPlayer = (player: Player, side: 'my' | 'their') => {
    if (side === 'my') {
      setMyTeamPlayers(prev => [...prev, player])
    } else {
      setTheirTeamPlayers(prev => [...prev, player])
    }
    setSearch('')
    setSearchSide(null)
  }

  const removePlayer = (playerId: string, side: 'my' | 'their') => {
    if (side === 'my') {
      setMyTeamPlayers(prev => prev.filter(p => p.id !== playerId))
    } else {
      setTheirTeamPlayers(prev => prev.filter(p => p.id !== playerId))
    }
  }

  const clearTrade = () => {
    setMyTeamPlayers([])
    setTheirTeamPlayers([])
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Trade Analyzer
        </h1>
        {(myTeamPlayers.length > 0 || theirTeamPlayers.length > 0) && (
          <button
            onClick={clearTrade}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          >
            Clear trade
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Team */}
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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Add player from your team..."
                value={searchSide === 'my' ? search : ''}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSearchSide('my')
                }}
                onFocus={() => setSearchSide('my')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              {searchSide === 'my' && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {searchResults.map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player, 'my')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between"
                    >
                      <span className="text-gray-900 dark:text-white">{player.name}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {player.hkbValue?.toLocaleString() ?? '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected players */}
            <div className="space-y-2 min-h-[120px]">
              {myTeamPlayers.map(player => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{player.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {player.position} • {player.team}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      {player.hkbValue?.toLocaleString() ?? '—'}
                    </span>
                    <button
                      onClick={() => removePlayer(player.id, 'my')}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {myTeamPlayers.length === 0 && (
                <p className="text-center text-gray-400 dark:text-gray-500 py-8">
                  Search to add players
                </p>
              )}
            </div>

            {/* Total */}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Total HKB Value:</span>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {myTotalValue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Their Team */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <select
              value={selectedFranchise}
              onChange={(e) => {
                setSelectedFranchise(e.target.value)
                setTheirTeamPlayers([])
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Select trading partner...</option>
              {franchises.filter(f => f !== MY_FRANCHISE).map(franchise => (
                <option key={franchise} value={franchise}>{franchise}</option>
              ))}
            </select>
            {selectedFranchise && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {theirRoster.length} players on roster
              </p>
            )}
          </div>

          <div className="p-4 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={selectedFranchise ? "Add player from their team..." : "Select a franchise first"}
                value={searchSide === 'their' ? search : ''}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSearchSide('their')
                }}
                onFocus={() => setSearchSide('their')}
                disabled={!selectedFranchise}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {searchSide === 'their' && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {searchResults.map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player, 'their')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between"
                    >
                      <span className="text-gray-900 dark:text-white">{player.name}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {player.hkbValue?.toLocaleString() ?? '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected players */}
            <div className="space-y-2 min-h-[120px]">
              {theirTeamPlayers.map(player => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{player.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {player.position} • {player.team}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                      {player.hkbValue?.toLocaleString() ?? '—'}
                    </span>
                    <button
                      onClick={() => removePlayer(player.id, 'their')}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {theirTeamPlayers.length === 0 && (
                <p className="text-center text-gray-400 dark:text-gray-500 py-8">
                  {selectedFranchise ? 'Search to add players' : 'Select a franchise above'}
                </p>
              )}
            </div>

            {/* Total */}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Total HKB Value:</span>
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">
                  {theirTotalValue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Summary */}
      {(myTeamPlayers.length > 0 || theirTeamPlayers.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">You give</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {myTotalValue.toLocaleString()}
              </p>
            </div>
            <ArrowLeftRight className="w-8 h-8 text-gray-400" />
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">You get</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {theirTotalValue.toLocaleString()}
              </p>
            </div>
            <div className="border-l border-gray-200 dark:border-gray-700 pl-8 ml-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Net value</p>
              <p className={`text-2xl font-bold ${
                valueDiff > 0 ? 'text-red-600 dark:text-red-400' : valueDiff < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'
              }`}>
                {valueDiff > 0 ? '-' : valueDiff < 0 ? '+' : ''}{Math.abs(valueDiff).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {valueDiff > 0 ? 'Giving up value' : valueDiff < 0 ? 'Gaining value' : 'Even trade'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
