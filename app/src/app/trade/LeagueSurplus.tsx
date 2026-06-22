'use client'

import { useMemo, useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Player } from '@/types'
import { type FranchiseStanding } from '@/lib/rotoStandings'
import { assignmentStarters } from '@/lib/rotoLineup'
import { classifyPitcherRole } from '@/lib/categories'
import { remainingContract, contractCompact, contractByYearStr } from '@/lib/contracts'

export default function LeagueSurplus({ rostersByFr, baseStandings, myFranchise }: {
  rostersByFr: Map<string, Player[]>
  baseStandings: Map<string, FranchiseStanding>
  myFranchise: string
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (f: string) => setOpen(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n })

  const rows = useMemo(() => {
    const list = [...baseStandings.values()]
    const byRoto = [...list].sort((a, b) => b.rotoTotal - a.rotoTotal)
    const rotoRank = new Map(byRoto.map((s, i) => [s.franchise, i + 1]))
    const bySurplus = [...list].sort((a, b) => b.surplus - a.surplus)
    const surplusRank = new Map(bySurplus.map((s, i) => [s.franchise, i + 1]))
    const n = list.length

    return list.map(s => {
      const rr = rotoRank.get(s.franchise)!
      const sr = surplusRank.get(s.franchise)!
      // "Seller": lots of bench depth (top-half surplus) but poor standing (bottom half)
      const isSeller = sr <= n / 2 && rr > n / 2
      // sort key: reward high surplus + bad standing
      const sellerScore = s.surplus * (rr / n)
      return { s, rotoRank: rr, surplusRank: sr, isSeller, sellerScore, n }
    }).sort((a, b) => b.sellerScore - a.sellerScore)
  }, [baseStandings])

  const playerByName = useMemo(() => {
    const m = new Map<string, Map<string, Player>>()
    for (const [fr, ps] of rostersByFr) { const inner = new Map<string, Player>(); ps.forEach(p => inner.set(p.name, p)); m.set(fr, inner) }
    return m
  }, [rostersByFr])

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">Teams with surplus depth (talent beyond their best 23) but a poor ROS standing — your most motivated trade partners. <span className="text-amber-600 dark:text-amber-400 font-medium">Highlighted = glut + losing.</span></p>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="w-6"></th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Franchise</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Roto Pts</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Standing</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Starters val</th>
              <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bench surplus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {rows.map(({ s, rotoRank, isSeller, n }) => {
              const isOpen = open.has(s.franchise)
              const isMe = s.franchise === myFranchise
              const starters = new Set(assignmentStarters(s.lineup).map(e => e.name))
              const surplusPlayers = s.entries.filter(e => !e.isFarm && !starters.has(e.name)).sort((a, b) => b.fpts - a.fpts)
              return (
                <Fragment key={s.franchise}>
                  <tr className={`${isSeller ? 'bg-amber-50 dark:bg-amber-900/20' : ''} ${isMe ? 'opacity-60' : ''} hover:bg-gray-50 dark:hover:bg-gray-700/30`}>
                    <td className="pl-2"><button onClick={() => toggle(s.franchise)} className="text-gray-400 hover:text-gray-600">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button></td>
                    <td className="px-2 py-1.5 font-medium text-gray-900 dark:text-gray-100">{s.franchise}{isMe && <span className="text-xs text-gray-400"> (you)</span>}{isSeller && <span className="ml-1.5 text-[10px] px-1 rounded bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">SELLER</span>}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-gray-700 dark:text-gray-300">{s.rotoTotal}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-gray-500">#{rotoRank} of {n}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{Math.round(s.starterValue)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${isSeller ? 'text-amber-700 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>{Math.round(s.surplus)}</td>
                  </tr>
                  {isOpen && (
                    <tr key={`${s.franchise}-d`} className="bg-gray-50 dark:bg-gray-700/30">
                      <td></td>
                      <td colSpan={5} className="px-3 py-2">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bench / surplus assets (not in their best 23):</div>
                        {surplusPlayers.length === 0 && <div className="text-xs text-gray-400">No surplus depth.</div>}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5">
                          {surplusPlayers.slice(0, 14).map(e => {
                            const pl = playerByName.get(s.franchise)?.get(e.name)
                            const ct = pl ? remainingContract(pl) : null
                            const pr = e.proj
                            const role = e.isPitcher ? classifyPitcherRole(pr) : null
                            const line = e.isPitcher
                              ? `${(pr.ip ?? 0).toFixed(0)}IP ${pr.qs ?? 0}QS ${pr.sv ?? 0}SV ${pr.hld ?? 0}HLD ${pr.k ?? 0}K`
                              : `${pr.hr ?? 0}HR ${pr.sb ?? 0}SB ${pr.r ?? 0}R ${(pr.avg ?? 0).toFixed(3).replace(/^0/, '')}`
                            return (
                              <div key={e.name} className="flex items-center justify-between text-xs gap-2">
                                <span className="text-gray-700 dark:text-gray-300 truncate">{role && <span className="text-[9px] px-1 rounded bg-gray-200 dark:bg-gray-600 mr-1">{role}</span>}{e.name}</span>
                                <span className="text-gray-400 shrink-0 tabular-nums">{line}{ct && ct.yearsRemaining > 0 && <span className="text-gray-500 dark:text-gray-500" title={contractByYearStr(ct)}> · {contractCompact(ct)}</span>}</span>
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
