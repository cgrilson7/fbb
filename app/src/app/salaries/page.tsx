'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { DollarSign, TrendingUp, Calendar } from 'lucide-react'

const MY_FRANCHISE = 'Colin Wilson & Greg Holmes'
const CURRENT_YEAR = 2026
const SALARY_CAP = 400 // Adjust based on league rules

export default function SalariesPage() {
  const { salaries, players, franchiseMappings } = usePlayerStore()
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

  // Calculate year-by-year totals
  const yearlyTotals = useMemo(() => {
    const years = [2026, 2027, 2028, 2029, 2030, 2031]
    return years.map(year => {
      const total = franchiseSalaries.reduce((sum, s) => {
        return sum + (s.salaryByYear[year] || 0)
      }, 0)
      return { year, total }
    })
  }, [franchiseSalaries])

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

  // Expiring contracts
  const expiringContracts = useMemo(() => {
    return franchiseSalaries
      .filter(s => s.contractEnds === CURRENT_YEAR || s.contractEnds === CURRENT_YEAR + 1)
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Cap Space</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${(SALARY_CAP - (yearlyTotals[0]?.total || 0)).toLocaleString()}
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

      {/* Year-by-Year Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Salary by Year
        </h2>
        <div className="flex items-end gap-4 h-48">
          {yearlyTotals.map((item, i) => {
            const maxTotal = Math.max(...yearlyTotals.map(y => y.total), SALARY_CAP)
            const height = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0
            const compareHeight = compareMode && compareYearlyTotals[i]
              ? (compareYearlyTotals[i].total / maxTotal) * 100
              : 0

            return (
              <div key={item.year} className="flex-1 flex flex-col items-center">
                <div className="flex gap-1 items-end h-40 w-full justify-center">
                  <div
                    className="bg-blue-500 dark:bg-blue-400 rounded-t w-1/2 max-w-[40px] transition-all"
                    style={{ height: `${height}%` }}
                    title={`$${item.total.toLocaleString()}`}
                  />
                  {compareMode && compareFranchise && (
                    <div
                      className="bg-purple-500 dark:bg-purple-400 rounded-t w-1/2 max-w-[40px] transition-all"
                      style={{ height: `${compareHeight}%` }}
                      title={`$${compareYearlyTotals[i]?.total.toLocaleString()}`}
                    />
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{item.year}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  ${(item.total / 1000).toFixed(0)}k
                </p>
              </div>
            )
          })}
        </div>
        {compareMode && compareFranchise && (
          <div className="flex gap-4 justify-center mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{selectedFranchise}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{compareFranchise}</span>
            </div>
          </div>
        )}
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
                      ${contract.salary.toLocaleString()}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {franchiseSalaries.map((contract, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {contract.playerName}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
