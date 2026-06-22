'use client'

import { useMemo } from 'react'
import type { Player } from '@/types'
import { computeStandings, type FranchiseStanding } from '@/lib/rotoStandings'
import { LEAGUE_CATEGORIES } from '@/lib/categories'
import { remainingContract, contractByYearStr, contractCompact } from '@/lib/contracts'

function fmtCat(v: number, decimals: number): string {
  if (decimals === 0) return Math.round(v).toString()
  const s = v.toFixed(decimals)
  return decimals === 3 ? s.replace(/^0/, '') : s
}

function TeamImpact({ label, base, post, accent }: { label: string; base: FranchiseStanding; post: FranchiseStanding; accent: string }) {
  const dPts = post.rotoTotal - base.rotoTotal
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className={`text-sm font-semibold ${accent} truncate`}>{label}</h4>
        <div className="text-sm">
          <span className="text-gray-500 dark:text-gray-400">Roto </span>
          <span className="font-bold text-gray-900 dark:text-gray-100">{base.rotoTotal}→{post.rotoTotal}</span>
          <span className={`ml-1 font-bold ${dPts > 0 ? 'text-green-600 dark:text-green-400' : dPts < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
            ({dPts > 0 ? '+' : ''}{dPts})
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-x-1 gap-y-1.5">
        {LEAGUE_CATEGORIES.map(cat => {
          const bV = base.totals[cat.key], pV = post.totals[cat.key]
          const bR = base.ranks[cat.key], pR = post.ranks[cat.key]
          const changed = Math.abs(bV - pV) > (cat.decimals ? 0.0005 : 0.5)
          const rankUp = pR < bR
          return (
            <div key={cat.key} className={`text-center rounded px-0.5 py-0.5 ${changed ? 'bg-gray-50 dark:bg-gray-700/40' : ''}`}>
              <div className="text-[9px] uppercase text-gray-400">{cat.label}</div>
              <div className={`text-[11px] tabular-nums ${changed ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>{fmtCat(pV, cat.decimals)}</div>
              <div className={`text-[9px] tabular-nums ${bR !== pR ? (rankUp ? 'text-green-600 dark:text-green-400 font-bold' : 'text-red-500 dark:text-red-400 font-bold') : 'text-gray-400'}`}>
                {bR !== pR ? `#${bR}→${pR}` : `#${pR}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MovingList({ title, players, accent }: { title: string; players: Player[]; accent: string }) {
  if (players.length === 0) return null
  return (
    <div>
      <div className={`text-xs font-medium mb-1 ${accent}`}>{title}</div>
      <div className="space-y-0.5">
        {players.map(p => {
          const c = remainingContract(p)
          return (
            <div key={p.id} className="flex items-center justify-between text-xs gap-2">
              <span className="text-gray-700 dark:text-gray-300 truncate">{p.name} <span className="text-gray-400">{p.position}</span></span>
              <span className="text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">{contractCompact(c)} <span className="text-gray-400">({contractByYearStr(c)})</span></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function TradeRotoImpact({
  rostersByFr, baseStandings, myFranchise, theirFranchise, myRoster, theirRoster, give, get,
}: {
  rostersByFr: Map<string, Player[]>
  baseStandings: Map<string, FranchiseStanding>
  myFranchise: string
  theirFranchise: string
  myRoster: Player[]
  theirRoster: Player[]
  give: Player[]   // players you send
  get: Player[]    // players you receive
}) {
  const postStandings = useMemo(() => {
    if (!theirFranchise || (give.length === 0 && get.length === 0)) return null
    const giveIds = new Set(give.map(p => p.id))
    const getIds = new Set(get.map(p => p.id))
    const myAfter = myRoster.filter(p => !giveIds.has(p.id)).concat(get)
    const theirAfter = theirRoster.filter(p => !getIds.has(p.id)).concat(give)
    const next = new Map(rostersByFr)
    next.set(myFranchise, myAfter)
    next.set(theirFranchise, theirAfter)
    return computeStandings(next)
  }, [rostersByFr, myFranchise, theirFranchise, myRoster, theirRoster, give, get])

  if (!theirFranchise) {
    return <div className="text-center py-6 text-sm text-gray-400">Select a trade partner to see ROS rotisserie standings impact.</div>
  }
  if (!postStandings) {
    return <div className="text-center py-6 text-sm text-gray-400">Add players to both sides to see the projected standings impact.</div>
  }

  const myBase = baseStandings.get(myFranchise)
  const myPost = postStandings.get(myFranchise)
  const theirBase = baseStandings.get(theirFranchise)
  const theirPost = postStandings.get(theirFranchise)
  if (!myBase || !myPost || !theirBase || !theirPost) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Projected ROS rotisserie impact</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-2">
          <TeamImpact label={`${myFranchise} (you)`} base={myBase} post={myPost} accent="text-blue-600 dark:text-blue-400" />
          <MovingList title="You receive" players={get} accent="text-green-600 dark:text-green-400" />
          <MovingList title="You send" players={give} accent="text-red-500 dark:text-red-400" />
        </div>
        <div className="space-y-2">
          <TeamImpact label={theirFranchise} base={theirBase} post={theirPost} accent="text-gray-700 dark:text-gray-300" />
          <MovingList title="They receive" players={give} accent="text-green-600 dark:text-green-400" />
          <MovingList title="They send" players={get} accent="text-red-500 dark:text-red-400" />
        </div>
      </div>
      <p className="text-[11px] text-gray-400">Green rank = category your lineup climbs; standings recomputed with every team at its roto-optimal lineup.</p>
    </div>
  )
}
