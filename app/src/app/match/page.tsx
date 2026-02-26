'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { findBestMatches } from '@/lib/normalize'
import { Check, X, AlertTriangle, Link2, Loader2 } from 'lucide-react'

export default function MatchPage() {
  const { unmatchedPlayers, hkbPlayers, addNameMapping, clearUnmatched, joinData } = usePlayerStore()
  const hasHydrated = useHydration()
  const [selectedUnmatched, setSelectedUnmatched] = useState<number | null>(null)

  // Lazily compute fuzzy match candidates only on this page
  const unmatchedWithCandidates = useMemo(() => {
    if (unmatchedPlayers.length === 0 || hkbPlayers.length === 0) return unmatchedPlayers

    const hkbCandidates = hkbPlayers.map(h => ({ name: h.name, normalizedName: h.normalizedName }))

    return unmatchedPlayers.map(player => {
      if (player.candidates.length > 0) return player
      const candidates = findBestMatches(player.name, hkbCandidates)
      return { ...player, candidates }
    })
  }, [unmatchedPlayers, hkbPlayers])

  const handleConfirmMatch = (sourceName: string, targetName: string) => {
    addNameMapping({
      source: sourceName,
      target: targetName,
      confirmedBy: 'user'
    })
    clearUnmatched(sourceName)
    joinData()
    setSelectedUnmatched(null)
  }

  const handleSkip = (name: string) => {
    clearUnmatched(name)
    setSelectedUnmatched(null)
  }

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  if (unmatchedWithCandidates.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Match Reconciliation
        </h1>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-8 text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-green-800 dark:text-green-300">
            All players matched!
          </p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
            No unmatched players found between data sources.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Match Reconciliation
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {unmatchedWithCandidates.length} players need review
        </span>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            Some players could not be automatically matched between data sources.
            Review the suggestions below and confirm or skip each match.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unmatched List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Unmatched Players
            </h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[600px] overflow-auto">
            {unmatchedWithCandidates.map((player, index) => (
              <button
                key={`${player.name}-${index}`}
                onClick={() => setSelectedUnmatched(index)}
                className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  selectedUnmatched === index ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {player.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Source: {player.source}
                    </p>
                  </div>
                  {player.candidates.length > 0 && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 px-2 py-1 rounded">
                      {player.candidates.length} suggestions
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Match Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Match Candidates
            </h2>
          </div>
          {selectedUnmatched !== null && unmatchedWithCandidates[selectedUnmatched] ? (
            <div className="p-4">
              <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">Looking for match for:</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {unmatchedWithCandidates[selectedUnmatched].name}
                </p>
              </div>

              {unmatchedWithCandidates[selectedUnmatched].candidates.length > 0 ? (
                <div className="space-y-3">
                  {unmatchedWithCandidates[selectedUnmatched].candidates.map((candidate, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Link2 className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {candidate.name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {(candidate.score * 100).toFixed(0)}% match
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleConfirmMatch(
                          unmatchedWithCandidates[selectedUnmatched].name,
                          candidate.name
                        )}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        Confirm
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No close matches found
                </p>
              )}

              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => handleSkip(unmatchedWithCandidates[selectedUnmatched].name)}
                  className="w-full px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Skip (no match exists)
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Select a player to see match candidates
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
