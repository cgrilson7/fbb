'use client'

// Trade-target finder by HKB dynasty value: young MLB players, top farm
// prospects, and buy-low candidates (high dynasty value, low RoS production).
// Expiring contracts (contractEnds 2026) are always excluded — a rental has no
// dynasty value to acquire — except planned HTD keeps (Ceddanne Rafaela).

import { useState, useMemo } from 'react'
import type { Player } from '@/types'
import { isExpiring } from '@/lib/contracts'

const OUR_FRANCHISE = 'Colin Wilson & Greg Holmes'

export default function TargetsSection({ players }: { players: Player[] }) {
  const [youngAge, setYoungAge] = useState(26)

  const data = useMemo(() => {
    const pool = players.filter(p => p.hkbValue != null && !isExpiring(p))

    const young = pool
      .filter(p => p.hkbLevel === 'MLB' && p.age != null && p.age <= youngAge)
      .sort((a, b) => (b.hkbValue ?? 0) - (a.hkbValue ?? 0))
      .slice(0, 50)

    const prospects = pool
      .filter(p => p.hkbLevel !== null && p.hkbLevel !== 'MLB')
      .sort((a, b) => (b.hkbValue ?? 0) - (a.hkbValue ?? 0))
      .slice(0, 50)

    // Buy-low: percentile of HKB value minus percentile of RoS FPTS within the
    // MLB pool. Missing RoS projection counts as 0 FPTS (injured stars surface
    // at the top — they cost a contender nothing this season).
    const mlb = pool.filter(p => p.hkbLevel === 'MLB')
    const pctOf = (sorted: Player[]) => {
      const m = new Map<string, number>()
      sorted.forEach((p, i) => m.set(p.id, sorted.length > 1 ? i / (sorted.length - 1) : 0))
      return m
    }
    const hkbPct = pctOf([...mlb].sort((a, b) => (a.hkbValue ?? 0) - (b.hkbValue ?? 0)))
    const rosPct = pctOf([...mlb].sort((a, b) => (a.zipsRosProjection?.fpts ?? 0) - (b.zipsRosProjection?.fpts ?? 0)))
    const buyLow = mlb
      .filter(p => (p.hkbRank ?? Infinity) <= 300)
      .map(p => ({ p, gap: (hkbPct.get(p.id) ?? 0) - (rosPct.get(p.id) ?? 0) }))
      .filter(x => x.gap > 0.05)
      .sort((a, b) => b.gap - a.gap || (b.p.hkbValue ?? 0) - (a.p.hkbValue ?? 0))
      .slice(0, 40)

    return { young, prospects, buyLow }
  }, [players, youngAge])

  const frLabel = (p: Player) => (p.isAvailable ? 'FA' : p.franchise ?? '—')
  const rowClass = (p: Player) =>
    p.franchise === OUR_FRANCHISE && !p.isAvailable
      ? 'bg-blue-50 dark:bg-blue-900/20 font-medium'
      : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
  const frCell = (p: Player) => (
    <td className={`px-2 py-1.5 text-xs whitespace-nowrap ${p.isAvailable ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
      {frLabel(p)}
    </td>
  )
  const contractCell = (p: Player) => (
    <td className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
      {p.contractEnds ? `thru '${String(p.contractEnds).slice(2)}` : '—'}
    </td>
  )
  const th = (h: string) => (
    <th key={h} className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">{h}</th>
  )

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Acquisition targets — by HKB dynasty value</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Young MLB players, top farm prospects, and buy-low candidates whose dynasty value far outstrips their rest-of-season
        production. Expiring 2026 contracts are excluded (nothing to acquire) except planned HTD keeps.
        Our rows highlighted blue; <span className="text-green-600 dark:text-green-400 font-medium">FA</span> = unrostered (free to add — prospects don&apos;t even count against the cap).
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Young MLB players */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Young MLB players</h3>
              <p className="text-xs text-gray-400 mt-0.5">MLB level, top 50 by HKB value</p>
            </div>
            <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
              Age ≤
              <select
                value={youngAge}
                onChange={e => setYoungAge(Number(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {[23, 24, 25, 26, 27, 28].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                <tr>{['#', 'Player', 'Age', 'Franchise', 'HKB Rk', 'HKB Val', 'Contract', 'RoS FPTS'].map(th)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {data.young.map((p, i) => (
                  <tr key={p.id} className={rowClass(p)}>
                    <td className="px-2 py-1.5 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="text-gray-900 dark:text-white">{p.name}</span>
                      <span className="text-gray-400 ml-1.5 text-xs">{p.position} · {p.team}</span>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">{p.age}</td>
                    {frCell(p)}
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">#{p.hkbRank}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold text-gray-900 dark:text-white">{p.hkbValue}</td>
                    {contractCell(p)}
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">{p.zipsRosProjection ? p.zipsRosProjection.fpts.toFixed(0) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top prospects by HKB */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top prospects</h3>
            <p className="text-xs text-gray-400 mt-0.5">Farm level (not yet MLB per HKB/debut data), top 50 by HKB value</p>
          </div>
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                <tr>{['#', 'Player', 'Age', 'Level', 'Franchise', 'HKB Rk', 'HKB Val', 'Prospect Rk'].map(th)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {data.prospects.map((p, i) => (
                  <tr key={p.id} className={rowClass(p)}>
                    <td className="px-2 py-1.5 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="text-gray-900 dark:text-white">{p.name}</span>
                      <span className="text-gray-400 ml-1.5 text-xs">{p.position} · {p.team}</span>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">{p.age ?? '—'}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400">{p.hkbLevel}</td>
                    {frCell(p)}
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">#{p.hkbRank}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold text-gray-900 dark:text-white">{p.hkbValue}</td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">{p.prospectRank ? `#${p.prospectRank}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Buy-low: high HKB, low RoS */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden xl:col-span-2">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">High HKB, low RoS — buy-low candidates</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Top-300 HKB MLB players whose HKB percentile most exceeds their RoS FPTS percentile. Injured or blocked players
              with no RoS projection surface at the top — they cost a contender nothing this season.
            </p>
          </div>
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                <tr>{['#', 'Player', 'Age', 'Franchise', 'HKB Rk', 'HKB Val', 'Contract', 'RoS FPTS', 'Value Gap'].map(th)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {data.buyLow.map(({ p, gap }, i) => (
                  <tr key={p.id} className={rowClass(p)}>
                    <td className="px-2 py-1.5 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="text-gray-900 dark:text-white">{p.name}</span>
                      <span className="text-gray-400 ml-1.5 text-xs">{p.position} · {p.team}</span>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">{p.age ?? '—'}</td>
                    {frCell(p)}
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">#{p.hkbRank}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold text-gray-900 dark:text-white">{p.hkbValue}</td>
                    {contractCell(p)}
                    <td className="px-2 py-1.5 tabular-nums text-gray-600 dark:text-gray-400">
                      {p.zipsRosProjection ? p.zipsRosProjection.fpts.toFixed(0) : <span className="text-red-500 dark:text-red-400 text-xs font-medium">no proj</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex px-1.5 rounded text-xs font-bold ${gap >= 0.4 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : gap >= 0.2 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                        +{Math.round(gap * 100)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
