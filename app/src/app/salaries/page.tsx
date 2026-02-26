'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { DollarSign, TrendingUp, Calendar, Loader2, ShieldOff, Shield } from 'lucide-react'
import { normalize } from '@/lib/normalize'

const MY_FRANCHISE = 'Colin Wilson & Greg Holmes'
const CURRENT_YEAR = 2026

// Salary cap per constitution Section 2.3: $150MM in 2024, +$10MM per year
const getSalaryCap = (year: number): number => {
  const baseCap = 150_000_000
  const yearsSince2024 = year - 2024
  return baseCap + (yearsSince2024 * 10_000_000)
}

const SALARY_CAP = getSalaryCap(CURRENT_YEAR) // $170MM for 2026

export default function SalariesPage() {
  const { salaries, players, franchiseMappings, salaryReliefDesignations, addSalaryRelief, removeSalaryRelief } = usePlayerStore()
  const hasHydrated = useHydration()
  const [selectedFranchise, setSelectedFranchise] = useState(MY_FRANCHISE)
  const [compareMode, setCompareMode] = useState(false)
  const [compareFranchise, setCompareFranchise] = useState('')

  // Get franchises
  const franchises = useMemo(() => {
    return franchiseMappings
      .filter(m => m.fullName !== 'Free Agent')
      .map(m => m.fullName)
      .sort()
  }, [franchiseMappings])

  // Get salary data for selected franchise
  const franchiseSalaries = useMemo(() => {
    return salaries.filter(s => s.franchise === selectedFranchise)
  }, [salaries, selectedFranchise])

  // Salary relief helpers for selected franchise
  const franchiseReliefDesignations = useMemo(() => {
    return salaryReliefDesignations.filter(d =>
      franchiseSalaries.some(s => s.normalizedName === d.normalizedName)
    )
  }, [salaryReliefDesignations, franchiseSalaries])

  const isRelieved = (normalizedName: string, year: number) =>
    salaryReliefDesignations.some(d => d.normalizedName === normalizedName && d.year === year)

  const reliefCountForYear = (year: number) =>
    franchiseReliefDesignations.filter(d => d.year === year).length

  const isMyFranchise = selectedFranchise === MY_FRANCHISE

  const toggleRelief = (contract: typeof franchiseSalaries[0], year: number) => {
    if (isRelieved(contract.normalizedName, year)) {
      removeSalaryRelief(contract.normalizedName, year)
    } else {
      if (reliefCountForYear(year) >= 3) return
      addSalaryRelief({
        playerName: contract.playerName,
        normalizedName: contract.normalizedName,
        year,
      })
    }
  }

  // Calculate year-by-year totals (excluding salary-relieved players)
  const yearlyTotals = useMemo(() => {
    const years = [2026, 2027, 2028, 2029, 2030, 2031]
    return years.map(year => {
      const total = franchiseSalaries.reduce((sum, s) => {
        if (isRelieved(s.normalizedName, year)) return sum
        return sum + (s.salaryByYear[year] || 0)
      }, 0)
      return { year, total }
    })
  }, [franchiseSalaries, salaryReliefDesignations])

  // Compare franchise data
  const compareSalaries = useMemo(() => {
    if (!compareFranchise) return []
    return salaries.filter(s => s.franchise === compareFranchise)
  }, [salaries, compareFranchise])

  const compareYearlyTotals = useMemo(() => {
    if (!compareFranchise) return []
    const years = [2026, 2027, 2028, 2029, 2030, 2031]
    return years.map(year => {
      const total = compareSalaries.reduce((sum, s) => {
        return sum + (s.salaryByYear[year] || 0)
      }, 0)
      return { year, total }
    })
  }, [compareSalaries, compareFranchise])

  // Expiring contracts (exclude players with no real contract end date)
  const expiringContracts = useMemo(() => {
    return franchiseSalaries
      .filter(s => s.contractEnds > 0 && (s.contractEnds === CURRENT_YEAR || s.contractEnds === CURRENT_YEAR + 1))
      .sort((a, b) => a.contractEnds - b.contractEnds)
  }, [franchiseSalaries])

  // Group by contract type
  const byContractType = useMemo(() => {
    const grouped: Record<string, typeof franchiseSalaries> = {}
    franchiseSalaries.forEach(s => {
      const type = s.contractType || 'Unknown'
      if (!grouped[type]) grouped[type] = []
      grouped[type].push(s)
    })
    return grouped
  }, [franchiseSalaries])

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  if (salaries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No salary data loaded. Go to Upload page to load salaries.csv.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Salary Dashboard
        </h1>
        <div className="flex items-center gap-4">
          <select
            value={selectedFranchise}
            onChange={(e) => setSelectedFranchise(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {franchises.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={compareMode}
              onChange={(e) => setCompareMode(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Compare</span>
          </label>
          {compareMode && (
            <select
              value={compareFranchise}
              onChange={(e) => setCompareFranchise(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Select franchise...</option>
              {franchises.filter(f => f !== selectedFranchise).map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">2026 Salary</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${yearlyTotals[0]?.total.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Cap Usage ({((yearlyTotals[0]?.total || 0) / SALARY_CAP * 100).toFixed(0)}%)
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${((yearlyTotals[0]?.total || 0) / 1_000_000).toFixed(1)}M / ${(SALARY_CAP / 1_000_000).toFixed(0)}M
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
              <Calendar className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Contracts</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {franchiseSalaries.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Salary Relief Counter */}
      {isMyFranchise && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Shield className="w-4 h-4 text-purple-500" />
          <span>
            Salary Relief ({CURRENT_YEAR}): <strong className="text-gray-900 dark:text-white">{reliefCountForYear(CURRENT_YEAR)}/3</strong> designations used
          </span>
        </div>
      )}

      {/* Year-by-Year Chart - Horizontal bars with year on Y-axis */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Salary by Year
        </h2>

        {(() => {
          // Calculate max for scaling - use 130% of highest year's cap
          const maxYearCap = getSalaryCap(2031)
          const maxSalary = Math.max(...yearlyTotals.map(y => y.total))
          const maxValue = Math.max(maxSalary, maxYearCap * 1.3)

          return (
            <div className="space-y-3">
              {yearlyTotals.map((item, i) => {
                const yearCap = getSalaryCap(item.year)
                const width = maxValue > 0 ? (item.total / maxValue) * 100 : 0
                const compareWidth = compareMode && compareYearlyTotals[i]
                  ? (compareYearlyTotals[i].total / maxValue) * 100
                  : 0
                const capPct = (item.total / yearCap * 100).toFixed(0)

                // Calculate threshold positions for this year's cap
                const threshold100 = (yearCap / maxValue) * 100
                const threshold110 = (yearCap * 1.1 / maxValue) * 100
                const threshold120 = (yearCap * 1.2 / maxValue) * 100

                return (
                  <div key={item.year} className="flex items-center gap-2">
                    <div className="w-[50px] text-right">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.year}</span>
                    </div>
                    <div className="flex-1 relative h-8">
                      {/* Background track with threshold markers */}
                      <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700 rounded">
                        {/* 100% marker */}
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-green-500 z-10"
                          style={{ left: `${threshold100}%` }}
                        >
                          <span className="absolute top-1/2 -translate-y-1/2 left-1 text-[10px] font-medium text-green-700 dark:text-green-400">
                            100%
                          </span>
                        </div>
                        {/* 110% marker */}
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-yellow-500 z-10"
                          style={{ left: `${threshold110}%` }}
                        >
                          <span className="absolute top-1/2 -translate-y-1/2 left-1 text-[10px] font-medium text-yellow-700 dark:text-yellow-400">
                            110%
                          </span>
                        </div>
                        {/* 120% marker */}
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-red-500 z-10"
                          style={{ left: `${threshold120}%` }}
                        >
                          <span className="absolute top-1/2 -translate-y-1/2 left-1 text-[10px] font-medium text-red-700 dark:text-red-400">
                            120%
                          </span>
                        </div>
                      </div>
                      {/* Salary bar */}
                      <div
                        className={`absolute top-0 bottom-0 rounded-r transition-all ${
                          item.total > yearCap * 1.2 ? 'bg-red-500/80 dark:bg-red-400/80' :
                          item.total > yearCap * 1.1 ? 'bg-yellow-500/80 dark:bg-yellow-400/80' :
                          item.total > yearCap ? 'bg-orange-500/80 dark:bg-orange-400/80' :
                          'bg-blue-500/80 dark:bg-blue-400/80'
                        }`}
                        style={{ width: `${width}%` }}
                        title={`$${item.total.toLocaleString()} (${capPct}% of $${(yearCap/1_000_000).toFixed(0)}M cap)`}
                      />
                      {compareMode && compareFranchise && (
                        <div
                          className="absolute top-6 h-2 bg-purple-500 dark:bg-purple-400 rounded-r transition-all"
                          style={{ width: `${compareWidth}%` }}
                          title={`$${compareYearlyTotals[i]?.total.toLocaleString()}`}
                        />
                      )}
                    </div>
                    <div className="w-[110px] text-right">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        ${(item.total / 1_000_000).toFixed(1)}M
                      </span>
                      <span className={`text-xs ml-1 font-medium ${
                        item.total > yearCap * 1.2 ? 'text-red-600 dark:text-red-400' :
                        item.total > yearCap * 1.1 ? 'text-yellow-600 dark:text-yellow-400' :
                        item.total > yearCap ? 'text-orange-600 dark:text-orange-400' :
                        'text-green-600 dark:text-green-400'
                      }`}>
                        ({capPct}%)
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 justify-center mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span className="text-gray-600 dark:text-gray-400">Under cap</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-500 rounded" />
            <span className="text-gray-600 dark:text-gray-400">100-110%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500 rounded" />
            <span className="text-gray-600 dark:text-gray-400">110-120%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded" />
            <span className="text-gray-600 dark:text-gray-400">Over 120%</span>
          </div>
          {compareMode && compareFranchise && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-purple-500 rounded" />
              <span className="text-gray-600 dark:text-gray-400">{compareFranchise}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring Contracts */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Expiring Contracts
            </h2>
          </div>
          <div className="p-4">
            {expiringContracts.length > 0 ? (
              <div className="space-y-2">
                {expiringContracts.map((contract, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center p-3 rounded-lg ${
                      contract.contractEnds === CURRENT_YEAR
                        ? 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-yellow-50 dark:bg-yellow-900/20'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {contract.playerName}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Expires {contract.contractEnds}
                      </p>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${(contract.salaryByYear[contract.contractEnds] || contract.salary).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                No expiring contracts
              </p>
            )}
          </div>
        </div>

        {/* Contract Types */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              By Contract Type
            </h2>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {Object.entries(byContractType).map(([type, contracts]) => {
                const total = contracts.reduce((sum, c) => sum + c.salary, 0)
                return (
                  <div key={type} className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{type}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {contracts.length} contracts
                      </p>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${total.toLocaleString()}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Full Contract List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            All Contracts
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Player</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Salary</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Years</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ends</th>
                {isMyFranchise && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Relief</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {franchiseSalaries.map((contract, i) => {
                const relieved = isRelieved(contract.normalizedName, CURRENT_YEAR)
                return (
                  <tr key={i} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    relieved ? 'bg-purple-50 dark:bg-purple-900/20 opacity-70' : ''
                  }`}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      <span className={relieved ? 'line-through' : ''}>
                        {contract.playerName}
                      </span>
                      {relieved && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100">
                          IR$
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {contract.contractType}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      ${contract.salary.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {contract.contractLength}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {contract.contractEnds}
                    </td>
                    {isMyFranchise && (
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => toggleRelief(contract, CURRENT_YEAR)}
                          disabled={!relieved && reliefCountForYear(CURRENT_YEAR) >= 3}
                          className={`p-1 rounded transition-colors ${
                            relieved
                              ? 'text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                              : reliefCountForYear(CURRENT_YEAR) >= 3
                              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                              : 'text-gray-400 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                          }`}
                          title={relieved ? 'Remove salary relief' : reliefCountForYear(CURRENT_YEAR) >= 3 ? '3/3 designations used' : 'Designate for salary relief'}
                        >
                          {relieved ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
