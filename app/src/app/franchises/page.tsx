'use client'

import { useState } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Check, Edit2, Save, X, Loader2 } from 'lucide-react'

export default function FranchisesPage() {
  const { franchiseMappings, setFranchiseMapping, players } = usePlayerStore()
  const hasHydrated = useHydration()
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // Count players per franchise
  const playerCounts = players.reduce((acc, player) => {
    const key = player.status
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const handleEdit = (shortCode: string, currentFullName: string) => {
    setEditingCode(shortCode)
    setEditValue(currentFullName)
  }

  const handleSave = (shortCode: string) => {
    setFranchiseMapping({
      shortCode,
      fullName: editValue,
      confirmed: true
    })
    setEditingCode(null)
  }

  const handleCancel = () => {
    setEditingCode(null)
    setEditValue('')
  }

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Franchise Mapping
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Maps abbreviated status codes from all.csv to full franchise names in salaries.csv
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Full Franchise Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Players
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {franchiseMappings.map((mapping) => (
              <tr key={mapping.shortCode} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                    {mapping.shortCode}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {editingCode === mapping.shortCode ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full px-3 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <span className="text-gray-900 dark:text-white">
                      {mapping.fullName}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {playerCounts[mapping.shortCode] || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {mapping.confirmed ? (
                    <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                      <Check className="w-4 h-4" />
                      Confirmed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400 text-sm">
                      Unconfirmed
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {editingCode === mapping.shortCode ? (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleSave(mapping.shortCode)}
                        className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancel}
                        className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(mapping.shortCode, mapping.fullName)}
                      className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Note:</strong> Franchise mappings are pre-populated based on your league.
          Edit any mapping that doesn't match your salaries.csv file. Changes are saved automatically to localStorage.
        </p>
      </div>
    </div>
  )
}
