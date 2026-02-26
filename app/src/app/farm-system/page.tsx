'use client'

import { Fragment, useMemo, useState } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react'

type SortField = 'franchise' | 'totalValue' | 'avgValue' | 'prospectCount' | 'topProspectValue' | 'fvTotal' | 'avgFV'
type SortOrder = 'asc' | 'desc'

interface FarmProspect {
  name: string
  normalizedName: string
  hkbRank: number | null
  hkbValue: number | null
  fvGrade: number | null
  fvRank: number | null
  fvETA: number | null
  fvPosition: string | null
  team: string
  age: number
  level: string
  type: 'batting' | 'pitching'
}

interface FarmRanking {
  franchise: string
  shortCode: string
  prospects: FarmProspect[]
  totalValue: number
  avgValue: number
  prospectCount: number
  topProspectValue: number
  topProspectName: string
  fvTotal: number
  avgFV: number
  fvCount: number
}

export default function FarmSystemPage() {
  const { battingProspects, pitchingProspects, players, hkbPlayers, fvRankings, franchiseMappings } = usePlayerStore()
  const hasHydrated = useHydration()
  const [sortField, setSortField] = useState<SortField>('totalValue')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [expandedFranchise, setExpandedFranchise] = useState<string | null>(null)

  const farmRankings = useMemo(() => {
    const hkbMap = new Map(hkbPlayers.map(p => [p.normalizedName, p]))
    const fvMap = new Map(fvRankings.map(p => [p.normalizedName, p]))
    const playerMap = new Map(players.map(p => [p.normalizedName, p]))
    const franchiseMap = new Map(franchiseMappings.map(m => [m.shortCode, m.fullName]))

    // Build all prospects with their owner info
    const allProspects = [
      ...battingProspects.map(p => ({ ...p, type: 'batting' as const })),
      ...pitchingProspects.map(p => ({ ...p, type: 'pitching' as const }))
    ]

    // Group by franchise
    const byFranchise = new Map<string, FarmProspect[]>()

    for (const prospect of allProspects) {
      // Filter out MLB-level
      if (prospect.level === 'MLB') continue
      const hkb = hkbMap.get(prospect.normalizedName)
      if (hkb?.level === 'MLB') continue
      const fv = fvMap.get(prospect.normalizedName)
      if (fv?.highestLevel === 'MLB') continue

      const player = playerMap.get(prospect.normalizedName)
      const status = player?.status ?? 'FA'
      if (status === 'FA') continue // Skip free agents

      const franchise = franchiseMap.get(status) || status

      const farmProspect: FarmProspect = {
        name: prospect.fullName,
        normalizedName: prospect.normalizedName,
        hkbRank: hkb?.rank ?? null,
        hkbValue: hkb?.value ?? null,
        fvGrade: fv?.fv ?? null,
        fvRank: fv?.rank ?? null,
        fvETA: fv?.eta ?? null,
        fvPosition: fv?.position ?? null,
        team: prospect.team,
        age: prospect.age,
        level: prospect.level.startsWith('ALL') ? prospect.level.replace('ALL', 'Multi') : prospect.level,
        type: prospect.type,
      }

      if (!byFranchise.has(franchise)) {
        byFranchise.set(franchise, [])
      }
      byFranchise.get(franchise)!.push(farmProspect)
    }

    // Also include FV-ranked prospects not in batting/pitching prospect lists
    for (const fv of fvRankings) {
      if (fv.highestLevel === 'MLB') continue
      const player = playerMap.get(fv.normalizedName)
      const status = player?.status ?? 'FA'
      if (status === 'FA') continue

      const franchise = franchiseMap.get(status) || status
      const existing = byFranchise.get(franchise)
      if (existing?.some(p => p.normalizedName === fv.normalizedName)) continue

      const hkb = hkbMap.get(fv.normalizedName)

      const farmProspect: FarmProspect = {
        name: fv.name,
        normalizedName: fv.normalizedName,
        hkbRank: hkb?.rank ?? null,
        hkbValue: hkb?.value ?? null,
        fvGrade: fv.fv,
        fvRank: fv.rank,
        fvETA: fv.eta,
        fvPosition: fv.position,
        team: fv.team,
        age: fv.age ?? 0,
        level: fv.highestLevel,
        type: fv.position === 'SP' || fv.position === 'RP' ? 'pitching' : 'batting',
      }

      if (!byFranchise.has(franchise)) {
        byFranchise.set(franchise, [])
      }
      byFranchise.get(franchise)!.push(farmProspect)
    }

    // Calculate rankings
    const rankings: FarmRanking[] = []
    const shortCodeMap = new Map(franchiseMappings.map(m => [m.fullName, m.shortCode]))

    for (const [franchise, prospects] of byFranchise) {
      if (franchise === 'Free Agent' || franchise === 'Unknown' || franchise.includes('<small>')) continue

      // Sort prospects by HKB value descending
      prospects.sort((a, b) => (b.hkbValue ?? 0) - (a.hkbValue ?? 0))

      const hkbValues = prospects.filter(p => p.hkbValue !== null).map(p => p.hkbValue!)
      const fvGrades = prospects.filter(p => p.fvGrade !== null).map(p => p.fvGrade!)

      const totalValue = hkbValues.reduce((sum, v) => sum + v, 0)
      const topProspect = prospects[0]

      rankings.push({
        franchise,
        shortCode: shortCodeMap.get(franchise) || franchise,
        prospects,
        totalValue,
        avgValue: hkbValues.length > 0 ? totalValue / hkbValues.length : 0,
        prospectCount: prospects.length,
        topProspectValue: topProspect?.hkbValue ?? 0,
        topProspectName: topProspect?.name ?? '',
        fvTotal: fvGrades.reduce((sum, v) => sum + v, 0),
        avgFV: fvGrades.length > 0 ? fvGrades.reduce((sum, v) => sum + v, 0) / fvGrades.length : 0,
        fvCount: fvGrades.length,
      })
    }

    // Sort
    rankings.sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortOrder === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })

    return rankings
  }, [battingProspects, pitchingProspects, players, hkbPlayers, fvRankings, franchiseMappings, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder(field === 'franchise' ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc'
      ? <ChevronUp className="w-4 h-4 inline ml-1" />
      : <ChevronDown className="w-4 h-4 inline ml-1" />
  }

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  if (battingProspects.length === 0 && pitchingProspects.length === 0 && fvRankings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No prospect data loaded. Upload batting/pitching prospects or FV rankings on the Upload page.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Farm System Rankings
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {farmRankings.length} franchises
        </span>
      </div>

      {/* Rankings table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-8">
                  #
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('franchise')}
                >
                  Franchise <SortIcon field="franchise" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('totalValue')}
                >
                  Total HKB <SortIcon field="totalValue" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('avgValue')}
                >
                  Avg HKB <SortIcon field="avgValue" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('fvTotal')}
                >
                  FV Sum <SortIcon field="fvTotal" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('avgFV')}
                >
                  Avg FV <SortIcon field="avgFV" />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => handleSort('prospectCount')}
                >
                  Count <SortIcon field="prospectCount" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Top Prospect
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {farmRankings.map((ranking, i) => (
                <Fragment key={ranking.franchise}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => setExpandedFranchise(
                      expandedFranchise === ranking.franchise ? null : ranking.franchise
                    )}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {ranking.franchise}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                      {ranking.totalValue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {Math.round(ranking.avgValue).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                      {ranking.fvTotal > 0 ? ranking.fvTotal : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {ranking.fvCount > 0 ? ranking.avgFV.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {ranking.prospectCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {ranking.topProspectName}
                      {ranking.topProspectValue > 0 && (
                        <span className="ml-1 text-gray-400">({ranking.topProspectValue.toLocaleString()})</span>
                      )}
                    </td>
                  </tr>
                  {expandedFranchise === ranking.franchise && (
                    <tr>
                      <td colSpan={8} className="px-4 py-2 bg-gray-50 dark:bg-gray-900">
                        <table className="w-full">
                          <thead>
                            <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                              <th className="px-3 py-2 text-left">Name</th>
                              <th className="px-3 py-2 text-left">HKB Rk</th>
                              <th className="px-3 py-2 text-left">HKB Val</th>
                              <th className="px-3 py-2 text-left">FV</th>
                              <th className="px-3 py-2 text-left">FV Rk</th>
                              <th className="px-3 py-2 text-left">Pos</th>
                              <th className="px-3 py-2 text-left">Org</th>
                              <th className="px-3 py-2 text-left">Level</th>
                              <th className="px-3 py-2 text-left">Age</th>
                              <th className="px-3 py-2 text-left">ETA</th>
                              <th className="px-3 py-2 text-left">Type</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {ranking.prospects.map((p, j) => (
                              <tr key={`${p.normalizedName}-${j}`} className="text-sm">
                                <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-white">{p.name}</td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{p.hkbRank ?? '—'}</td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{p.hkbValue?.toLocaleString() ?? '—'}</td>
                                <td className="px-3 py-1.5">
                                  {p.fvGrade ? (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                                      p.fvGrade >= 60
                                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100'
                                        : p.fvGrade >= 50
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100'
                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
                                    }`}>
                                      {p.fvGrade}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{p.fvRank ?? '—'}</td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{p.fvPosition ?? '—'}</td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{p.team}</td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{p.level}</td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{p.age}</td>
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{p.fvETA ?? '—'}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                    p.type === 'batting'
                                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-100'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
                                  }`}>
                                    {p.type === 'batting' ? 'BAT' : 'P'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
