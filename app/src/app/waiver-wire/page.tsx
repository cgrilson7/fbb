'use client'

import { useState, useMemo, useCallback, Fragment } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Loader2, ChevronDown, ChevronRight, Lock, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { Player } from '@/types'
import {
  POS_SLOTS,
  PITCHER_SLOTS,
  ALL_START_SLOTS,
  isEligibleForSlot,
  getBasePositions,
  findOptimalLineup,
  type LineupPlayer,
} from '@/lib/lineup'
import {
  buildRosterEntries,
  optimizeRotoLineup,
  assignmentRaw,
  type RosterEntry,
  type SlotAssignment,
} from '@/lib/rotoLineup'
import {
  LEAGUE_CATEGORIES,
  type CatKey,
  type CatTotals,
  emptyRaw,
  addRaw,
  subRaw,
  rawOf,
  finalize,
  buildField,
  type CatRaw,
  rotoPointsVsField,
  rankInField,
  classifyPitcherRole,
} from '@/lib/categories'

const MY_FRANCHISE = 'Colin Wilson & Greg Holmes'

type AvailFilter = 'all' | 'fa' | 'waivers'
type TypeFilter = 'batters' | 'pitchers'

const BAT_CATS = LEAGUE_CATEGORIES.filter(c => c.group === 'bat')
const PIT_CATS = LEAGUE_CATEGORIES.filter(c => c.group === 'pit')

function fmt(v: number, decimals: number): string {
  if (decimals === 0) return Math.round(v).toString()
  const s = v.toFixed(decimals)
  return decimals === 3 ? s.replace(/^0/, '') : s
}

function rankClass(rank: number, n: number): string {
  const pct = (rank - 1) / Math.max(1, n - 1)
  if (pct <= 0.2) return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
  if (pct <= 0.45) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  if (pct <= 0.7) return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
}

export default function WaiverWirePage() {
  const { players, franchiseMappings, lockedSlots, lockedSlotsFranchise, setLockedSlots, setLockedSlotsMeta } = usePlayerStore()
  const hasHydrated = useHydration()

  const franchises = useMemo(() => {
    const set = new Set<string>()
    for (const p of players) {
      if (p.franchise && p.franchise !== 'Free Agent' && p.status !== 'FA' && !p.isAvailable) set.add(p.franchise)
    }
    return [...set].sort()
  }, [players])

  const [selectedFranchise, setSelectedFranchise] = useState(MY_FRANCHISE)
  const [search, setSearch] = useState('')
  const [availFilter, setAvailFilter] = useState<AvailFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('pitchers')
  const [sortKey, setSortKey] = useState<'impact' | 'fpts' | CatKey>('impact')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const activeFranchise = franchises.includes(selectedFranchise) ? selectedFranchise : (franchises[0] ?? MY_FRANCHISE)
  const isLineupSet = lockedSlotsFranchise === activeFranchise && Object.keys(lockedSlots).length > 0

  // Roster entries per franchise (ROS projections). Memoized on players only.
  const entriesByFr = useMemo(() => {
    const byFr = new Map<string, Player[]>()
    for (const p of players) {
      if (!p.franchise || p.franchise === 'Free Agent' || p.status === 'FA' || p.isAvailable) continue
      if (!byFr.has(p.franchise)) byFr.set(p.franchise, [])
      byFr.get(p.franchise)!.push(p)
    }
    const out = new Map<string, RosterEntry[]>()
    for (const [fr, ps] of byFr) out.set(fr, buildRosterEntries(ps))
    return out
  }, [players])

  // FPTS-best totals (the fixed field everyone is optimized against). [players]
  const t0Field = useMemo(() => {
    const totals = new Map<string, CatTotals>()
    for (const [fr, entries] of entriesByFr) {
      totals.set(fr, finalize(fptsBestRaw(entries)))
    }
    return totals
  }, [entriesByFr])

  // Opponents' roto-optimal lineups (no locks). Memoized on [players].
  const optimizedByFr = useMemo(() => {
    const out = new Map<string, SlotAssignment>()
    const allFr = [...entriesByFr.keys()]
    for (const fr of allFr) {
      const others = allFr.filter(f => f !== fr).map(f => t0Field.get(f)!).filter(Boolean)
      const field = buildField(others)
      out.set(fr, optimizeRotoLineup(entriesByFr.get(fr)!, {}, field))
    }
    return out
  }, [entriesByFr, t0Field])

  // Selected franchise lineup honors locks if set
  const selectedLineup = useMemo(() => {
    const entries = entriesByFr.get(activeFranchise)
    if (!entries) return null
    if (!isLineupSet) return optimizedByFr.get(activeFranchise) ?? null
    const allFr = [...entriesByFr.keys()]
    const others = allFr.filter(f => f !== activeFranchise).map(f => t0Field.get(f)!).filter(Boolean)
    return optimizeRotoLineup(entries, lockedSlots, buildField(others))
  }, [entriesByFr, optimizedByFr, t0Field, activeFranchise, isLineupSet, lockedSlots])

  // Final standings field + totals (everyone roto-optimal; selected may have locks)
  const { byFranchiseTotals, finalField, baseTotals, baseRaw, basePoints } = useMemo(() => {
    const totals = new Map<string, CatTotals>()
    for (const fr of entriesByFr.keys()) {
      const assign = fr === activeFranchise ? selectedLineup : optimizedByFr.get(fr)
      totals.set(fr, assign ? finalize(assignmentRaw(assign)) : finalize(emptyRaw()))
    }
    const others = [...totals.keys()].filter(f => f !== activeFranchise).map(f => totals.get(f)!)
    const field = buildField(others)
    const bRaw = selectedLineup ? assignmentRaw(selectedLineup) : emptyRaw()
    const bTotals = finalize(bRaw)
    return {
      byFranchiseTotals: totals,
      finalField: field,
      baseTotals: bTotals,
      baseRaw: bRaw,
      basePoints: rotoPointsVsField(bTotals, field),
    }
  }, [entriesByFr, optimizedByFr, selectedLineup, activeFranchise])

  const nTeams = franchises.length

  // Pitching breakdown for the selected lineup
  const pitchingBreakdown = useMemo(() => {
    if (!selectedLineup) return { sp: [], rp: [] as RosterEntry[] }
    const pitchers = PITCHER_SLOTS.map(s => selectedLineup[s]).filter((e): e is RosterEntry => !!e)
    return {
      sp: pitchers.filter(e => classifyPitcherRole(e.proj) === 'SP'),
      rp: pitchers.filter(e => classifyPitcherRole(e.proj) === 'RP'),
    }
  }, [selectedLineup])

  // Slot occupants of selected lineup (for swap targeting)
  const selectedBySlot = selectedLineup ?? {}

  const confirmAutoLineup = useCallback(() => {
    const assign = optimizedByFr.get(activeFranchise)
    if (!assign) return
    const locks: Record<string, string> = {}
    for (const slot of ALL_START_SLOTS) {
      const occ = assign[slot]
      if (occ) locks[slot] = occ.name
    }
    setLockedSlots(locks)
    setLockedSlotsMeta(activeFranchise, 'roto:ros')
  }, [optimizedByFr, activeFranchise, setLockedSlots, setLockedSlotsMeta])

  // Candidate available players with roto impact
  const candidates = useMemo(() => {
    if (!selectedLineup) return []
    const avail = players.filter(p => {
      if (!p.isAvailable || !p.zipsRosProjection) return false
      if (availFilter === 'fa' && p.isWaiver) return false
      if (availFilter === 'waivers' && !p.isWaiver) return false
      return true
    })

    return avail.map(p => {
      const proj = p.zipsRosProjection!
      const positions = p.position.split(',').map(s => s.trim())
      const isPitcher = positions.includes('SP') || positions.includes('RP')
      const candLP: LineupPlayer = { name: p.name, value: proj.fpts, isFarm: false, basePositions: getBasePositions(p.position), isPitcher, pitcherType: null }

      const eligibleSlots = (isPitcher ? PITCHER_SLOTS : POS_SLOTS).filter(slot => isPitcher || isEligibleForSlot(candLP, slot))
      // Prefer filling an empty eligible slot (pure add); else replace weakest occupant
      let replaced: RosterEntry | null = null
      let replacedSlot: string | null = null
      const emptyEligible = eligibleSlots.find(slot => !selectedBySlot[slot])
      if (emptyEligible) {
        replacedSlot = emptyEligible
      } else {
        for (const slot of eligibleSlots) {
          const occ = selectedBySlot[slot]
          if (occ && (replaced === null || occ.fpts < replaced.fpts)) { replaced = occ; replacedSlot = slot }
        }
      }

      const candRaw = rawOf(proj)
      const newRaw = addRaw(subRaw(baseRaw, replaced ? replaced.raw : emptyRaw()), candRaw)
      const newTotals = finalize(newRaw)
      const deltaPts = rotoPointsVsField(newTotals, finalField) - basePoints

      return {
        player: p,
        proj,
        isPitcher,
        line: finalize(rawOf(proj)) as CatTotals, // player's own rate stats
        replaced,
        replacedSlot,
        deltaPts,
        newTotals,
      }
    })
  }, [players, selectedLineup, selectedBySlot, baseRaw, finalField, basePoints, availFilter])

  const visible = useMemo(() => {
    let r = candidates.filter(c => c.isPitcher === (typeFilter === 'pitchers'))
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(c => c.player.name.toLowerCase().includes(q) || c.player.team.toLowerCase().includes(q))
    }
    r = [...r].sort((a, b) => {
      if (sortKey === 'impact') return b.deltaPts - a.deltaPts
      if (sortKey === 'fpts') return b.proj.fpts - a.proj.fpts
      return (b.line[sortKey] - a.line[sortKey])
    })
    return r.slice(0, 150)
  }, [candidates, typeFilter, search, sortKey])

  const toggle = (name: string) => setExpanded(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  if (!hasHydrated) {
    return <div className="flex items-center justify-center py-12 gap-3"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /><p className="text-gray-500">Loading data...</p></div>
  }
  if (players.length === 0) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">No player data loaded. Go to Upload to load CSV files.</div>
  }

  const maxRotoPoints = nTeams * LEAGUE_CATEGORIES.length

  return (
    <div className="space-y-4">
      {/* Header + franchise selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Waiver Wire — ROS Categories</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">Team</label>
          <select
            value={activeFranchise}
            onChange={e => setSelectedFranchise(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white max-w-[220px]"
          >
            {franchises.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {/* Lineup gate */}
      {!isLineupSet ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 text-center space-y-3">
          <p className="text-amber-800 dark:text-amber-200 font-medium">Set {activeFranchise}&apos;s lineup to evaluate waiver adds.</p>
          <p className="text-sm text-amber-700 dark:text-amber-300">Category totals and swap impact are measured against your 23-man starting lineup (13 hitters + 10 pitchers).</p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button onClick={confirmAutoLineup} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
              Use roto-optimal auto lineup
            </button>
            <Link href="/franchise-value" className="inline-flex items-center gap-1 px-4 py-2 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-sm font-medium rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40">
              Set on Value page <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Team category panel */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Your ROS category standing</h2>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Roto points</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{basePoints} <span className="text-gray-400 font-normal">/ {maxRotoPoints}</span></span>
                <button onClick={confirmAutoLineup} className="text-xs text-gray-400 hover:text-blue-500" title="Reset to roto-optimal auto lineup">reset</button>
                <Link href="/franchise-value" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500"><Lock className="w-3 h-3" /> edit lineup</Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {[BAT_CATS, PIT_CATS].map((group, gi) => (
                    <tr key={gi} className="align-top">
                      {group.map(cat => {
                        const v = baseTotals[cat.key]
                        const { rank } = rankInField(cat.key, v, finalField)
                        return (
                          <td key={cat.key} className="px-2 py-1.5 text-center border-r border-gray-100 dark:border-gray-700/50 last:border-0">
                            <div className="text-[10px] uppercase tracking-wide text-gray-400">{cat.label}</div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{fmt(v, cat.decimals)}</div>
                            <div className={`mt-0.5 inline-flex items-center justify-center px-1.5 rounded text-[10px] font-bold ${rankClass(rank, nTeams)}`}>#{rank}</div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pitching breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Your 10 pitchers — {pitchingBreakdown.sp.length} SP / {pitchingBreakdown.rp.length} RP <span className="text-xs font-normal text-gray-400">(role from ROS projection)</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([['Starters', pitchingBreakdown.sp], ['Relievers', pitchingBreakdown.rp]] as [string, RosterEntry[]][]).map(([label, list]) => (
                <div key={label}>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label} ({list.length})</div>
                  <div className="space-y-0.5">
                    {list.length === 0 && <div className="text-xs text-gray-400">none</div>}
                    {list.map(e => (
                      <div key={e.name} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 dark:text-gray-300 truncate mr-2">{e.name}</span>
                        <span className="text-gray-400 tabular-nums flex gap-2 shrink-0">
                          <span className="w-12 text-right">{(e.proj.ip ?? 0).toFixed(0)} IP</span>
                          {(e.proj.qs ?? 0) > 0 && <span>{e.proj.qs} QS</span>}
                          {(e.proj.sv ?? 0) > 0 && <span className="text-green-600 dark:text-green-400">{e.proj.sv} SV</span>}
                          {(e.proj.hld ?? 0) > 0 && <span className="text-purple-600 dark:text-purple-400">{e.proj.hld} HLD</span>}
                          <span>{(e.proj.era ?? 0).toFixed(2)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available players */}
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-40" />
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['pitchers', 'batters'] as const).map(t => (
                <button key={t} onClick={() => { setTypeFilter(t); if (sortKey !== 'impact' && sortKey !== 'fpts') setSortKey('impact') }} className={`px-3 py-1.5 text-sm font-medium ${typeFilter === t ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{t === 'pitchers' ? 'Pitchers' : 'Batters'}</button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['all', 'fa', 'waivers'] as const).map(f => (
                <button key={f} onClick={() => setAvailFilter(f)} className={`px-3 py-1.5 text-sm font-medium ${availFilter === f ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{f === 'all' ? 'All' : f === 'fa' ? 'FA' : 'Waivers'}</button>
              ))}
            </div>
            <span className="text-sm text-gray-400 ml-auto">{visible.length} shown</span>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="w-6"></th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Player</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Pos</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer" onClick={() => setSortKey('impact')}>
                      Roto Δ{sortKey === 'impact' && ' ▼'}
                    </th>
                    {(typeFilter === 'pitchers' ? PIT_CATS : BAT_CATS).map(cat => (
                      <th key={cat.key} onClick={() => setSortKey(cat.key)} className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                        {cat.label}{sortKey === cat.key && ' ▼'}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Replaces</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {visible.map(c => {
                    const cats = typeFilter === 'pitchers' ? PIT_CATS : BAT_CATS
                    const isOpen = expanded.has(c.player.name)
                    return (
                      <Fragment key={c.player.id}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="pl-2"><button onClick={() => toggle(c.player.name)} className="text-gray-400 hover:text-gray-600">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button></td>
                          <td className="px-2 py-1.5">
                            <span className="font-medium text-gray-900 dark:text-gray-100">{c.player.name}</span>
                            <span className="text-gray-400 ml-1.5 text-xs">{c.player.team}</span>
                            {c.player.isWaiver && <span className="ml-1.5 text-[10px] px-1 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">W{c.player.waiverDay ? ` ${c.player.waiverDay}` : ''}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center text-xs text-gray-500">{c.player.position}</td>
                          <td className={`px-2 py-1.5 text-center font-bold tabular-nums ${c.deltaPts > 0 ? 'text-green-600 dark:text-green-400' : c.deltaPts < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                            {c.deltaPts > 0 ? '+' : ''}{c.deltaPts}
                          </td>
                          {cats.map(cat => (
                            <td key={cat.key} className="px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmt(c.line[cat.key], cat.decimals)}</td>
                          ))}
                          <td className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">{c.replaced ? c.replaced.name : c.replacedSlot ? `(empty ${c.replacedSlot})` : '—'}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-gray-50 dark:bg-gray-700/30">
                            <td></td>
                            <td colSpan={cats.length + 4} className="px-3 py-2">
                              <div className="text-xs text-gray-600 dark:text-gray-300">
                                <span className="font-medium">If added{c.replaced ? ` for ${c.replaced.name}` : ''}:</span> your category ranks change as —
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                  {LEAGUE_CATEGORIES.map(cat => {
                                    const before = rankInField(cat.key, baseTotals[cat.key], finalField).rank
                                    const after = rankInField(cat.key, c.newTotals[cat.key], finalField).rank
                                    if (before === after) return null
                                    const better = after < before
                                    return (
                                      <span key={cat.key} className={better ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                                        {cat.label}: #{before}→#{after}
                                      </span>
                                    )
                                  })}
                                  {LEAGUE_CATEGORIES.every(cat => rankInField(cat.key, baseTotals[cat.key], finalField).rank === rankInField(cat.key, c.newTotals[cat.key], finalField).rank) && <span className="text-gray-400">no rank changes (counting-stat gains only)</span>}
                                </div>
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
        </>
      )}
    </div>
  )
}

// Category contribution of a roster's FPTS-best starting lineup.
function fptsBestRaw(entries: RosterEntry[]): CatRaw {
  const lp: LineupPlayer[] = entries.map(r => ({ name: r.name, value: r.fpts, isFarm: r.isFarm, basePositions: r.basePositions, isPitcher: r.isPitcher, pitcherType: null }))
  const seed = findOptimalLineup(lp, {})
  const byName = new Map(entries.map(r => [r.name, r]))
  let raw = emptyRaw()
  for (const slot of ALL_START_SLOTS) {
    const occ = seed[slot]
    if (occ) { const e = byName.get(occ.name); if (e) raw = addRaw(raw, e.raw) }
  }
  return raw
}
