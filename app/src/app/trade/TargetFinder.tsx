'use client'

import { useMemo, useState } from 'react'
import type { Player } from '@/types'
import { type FranchiseStanding, fieldFor } from '@/lib/rotoStandings'
import {
  POS_SLOTS, PITCHER_SLOTS, isEligibleForSlot, getBasePositions, type LineupPlayer,
} from '@/lib/lineup'
import {
  LEAGUE_CATEGORIES, type CatKey, emptyRaw, addRaw, subRaw, rawOf, finalize, rankInField,
} from '@/lib/categories'
import type { RosterEntry } from '@/lib/rotoLineup'
import { remainingContract, contractCompact, contractByYearStr } from '@/lib/contracts'

// Default emphasis = your stated needs: stolen bases, volume RP (SV/HLD + ERA via
// innings), elite SP (QS/K/ERA).
const DEFAULT_EMPHASIS: CatKey[] = ['sb', 'k', 'qs', 'sv', 'hld', 'era']

export default function TargetFinder({ players, baseStandings, myFranchise }: {
  players: Player[]
  baseStandings: Map<string, FranchiseStanding>
  myFranchise: string
}) {
  const [emphasis, setEmphasis] = useState<Set<CatKey>>(new Set(DEFAULT_EMPHASIS))
  const [type, setType] = useState<'all' | 'batters' | 'pitchers'>('pitchers')
  const [search, setSearch] = useState('')

  const toggleCat = (k: CatKey) => setEmphasis(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  // Per-candidate roto impact on MY lineup (independent of emphasis)
  const scored = useMemo(() => {
    const mine = baseStandings.get(myFranchise)
    if (!mine) return []
    const field = fieldFor(baseStandings, myFranchise)
    const baseRaw = mine.raw
    const bySlot = mine.lineup

    const out = players.map(p => {
      if (!p.zipsRosProjection) return null
      if (!p.franchise || p.franchise === myFranchise || p.franchise === 'Free Agent') return null
      if (p.isAvailable) return null
      const proj = p.zipsRosProjection
      const positions = p.position.split(',').map(s => s.trim())
      const isPitcher = positions.includes('SP') || positions.includes('RP') || positions.includes('P')
      const candLP: LineupPlayer = { name: p.name, value: proj.fpts, isFarm: false, basePositions: getBasePositions(p.position), isPitcher, pitcherType: null }
      const slots = (isPitcher ? PITCHER_SLOTS : POS_SLOTS).filter(s => isPitcher || isEligibleForSlot(candLP, s))
      if (slots.length === 0) return null
      let replaced: RosterEntry | null = null
      const empty = slots.find(s => !bySlot[s])
      if (!empty) for (const s of slots) { const occ = bySlot[s]; if (occ && (!replaced || occ.fpts < replaced.fpts)) replaced = occ }
      const newRaw = addRaw(subRaw(baseRaw, replaced ? replaced.raw : emptyRaw()), rawOf(proj))
      const newTotals = finalize(newRaw)

      const catDelta = {} as Record<CatKey, number>
      let rotoDelta = 0
      for (const cat of LEAGUE_CATEGORIES) {
        const before = rankInField(cat.key, mine.totals[cat.key], field).points
        const after = rankInField(cat.key, newTotals[cat.key], field).points
        catDelta[cat.key] = after - before
        rotoDelta += after - before
      }
      return { player: p, proj, isPitcher, catDelta, rotoDelta, replaced }
    }).filter(Boolean) as { player: Player; proj: NonNullable<Player['zipsRosProjection']>; isPitcher: boolean; catDelta: Record<CatKey, number>; rotoDelta: number; replaced: RosterEntry | null }[]
    return out
  }, [players, baseStandings, myFranchise])

  const ranked = useMemo(() => {
    let r = scored.filter(c => type === 'all' ? true : c.isPitcher === (type === 'pitchers'))
    if (search) { const q = search.toLowerCase(); r = r.filter(c => c.player.name.toLowerCase().includes(q) || (c.player.franchise || '').toLowerCase().includes(q)) }
    const fit = (c: typeof scored[number]) => LEAGUE_CATEGORIES.reduce((s, cat) => emphasis.has(cat.key) ? s + c.catDelta[cat.key] : s, 0)
    return [...r].map(c => ({ ...c, fit: fit(c) })).sort((a, b) => b.fit - a.fit || b.rotoDelta - a.rotoDelta).slice(0, 80)
  }, [scored, type, search, emphasis])

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">Emphasize categories (your needs):</div>
        <div className="flex flex-wrap gap-1.5">
          {LEAGUE_CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => toggleCat(cat.key)}
              className={`px-2 py-0.5 rounded text-xs font-medium border ${emphasis.has(cat.key)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600'}`}>
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search player / owner..." className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-48" />
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {(['pitchers', 'batters', 'all'] as const).map(t => (
              <button key={t} onClick={() => setType(t)} className={`px-3 py-1.5 text-sm font-medium ${type === t ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{t === 'all' ? 'All' : t === 'pitchers' ? 'Pitchers' : 'Batters'}</button>
            ))}
          </div>
          <span className="text-xs text-gray-400 ml-auto">{ranked.length} targets</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Target</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Owner</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fit</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Roto Δ</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ROS line</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contract</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {ranked.map(c => {
              const pr = c.proj
              const line = c.isPitcher
                ? `${(pr.ip ?? 0).toFixed(0)} IP · ${pr.qs ?? 0} QS · ${pr.sv ?? 0} SV · ${pr.hld ?? 0} HLD · ${pr.k ?? 0} K · ${(pr.era ?? 0).toFixed(2)} ERA`
                : `${pr.hr ?? 0} HR · ${pr.sb ?? 0} SB · ${pr.r ?? 0} R · ${pr.rbi ?? 0} RBI · ${(pr.avg ?? 0).toFixed(3).replace(/^0/, '')} AVG`
              const ct = remainingContract(c.player)
              return (
                <tr key={c.player.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-2 py-1.5"><span className="font-medium text-gray-900 dark:text-gray-100">{c.player.name}</span> <span className="text-xs text-gray-400">{c.player.position}</span></td>
                  <td className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">{c.player.franchise}</td>
                  <td className={`px-2 py-1.5 text-center font-bold tabular-nums ${c.fit > 0 ? 'text-green-600 dark:text-green-400' : c.fit < 0 ? 'text-red-500' : 'text-gray-400'}`}>{c.fit > 0 ? '+' : ''}{c.fit}</td>
                  <td className={`px-2 py-1.5 text-center tabular-nums ${c.rotoDelta > 0 ? 'text-green-600 dark:text-green-400' : c.rotoDelta < 0 ? 'text-red-500' : 'text-gray-400'}`}>{c.rotoDelta > 0 ? '+' : ''}{c.rotoDelta}</td>
                  <td className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{line}</td>
                  <td className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" title={contractByYearStr(ct)}>{contractCompact(ct)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400"><b>Fit</b> = roto points gained in your emphasized categories if acquired (swapped for your weakest eligible starter). <b>Roto Δ</b> = net across all 14 cats.</p>
    </div>
  )
}
