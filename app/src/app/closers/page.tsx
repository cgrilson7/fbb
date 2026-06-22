'use client'

import { useMemo, useState, useCallback } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { normalize } from '@/lib/normalize'
import { Loader2, Plus, X } from 'lucide-react'
import type { Player, CloserEntry, CloserMonkeyEntry, ZipsPitcher } from '@/types'

const DIVISIONS: { label: string; teams: string[] }[] = [
  { label: 'AL East', teams: ['BAL', 'BOS', 'NYY', 'TB', 'TOR'] },
  { label: 'AL Central', teams: ['CHW', 'CLE', 'DET', 'KC', 'MIN'] },
  { label: 'AL West', teams: ['ATH', 'HOU', 'LAA', 'SEA', 'TEX'] },
  { label: 'NL East', teams: ['ATL', 'MIA', 'NYM', 'PHI', 'WAS'] },
  { label: 'NL Central', teams: ['CHC', 'CIN', 'MIL', 'PIT', 'STL'] },
  { label: 'NL West', teams: ['ARI', 'COL', 'LAD', 'SD', 'SF'] },
]

const CLOSER_ROLES = new Set(['Closer', 'Co-Closer', 'Closer Committee'])
const SETUP_ROLES = new Set(['Setup Man'])
const IL_ROLES = new Set(['60-Day IL', 'Projected Injured List'])

function roleSortKey(role: string): number {
  if (CLOSER_ROLES.has(role)) return 0
  if (SETUP_ROLES.has(role)) return 1
  if (role === 'Middle Reliever') return 2
  if (role === 'Long Reliever') return 3
  if (role === 'Projected Injured List') return 4
  if (role === '60-Day IL') return 5
  if (role === 'Restricted List') return 6
  return 3
}

type ProjSource = 'zips' | 'zipsDc'
type ViewMode = 'depthCharts' | 'closerMonkey' | 'franchiseRP'
type FilterMode = 'all' | 'closers' | 'available'

// --- Shared badge components ---

function StatusBadge({ player }: { player: Player | null }) {
  if (!player) return <span className="text-xs text-gray-500">?</span>
  if (player.isAvailable) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">FA</span>
  }
  if (player.isWaiver) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400">W{player.waiverDay ? ` (${player.waiverDay})` : ''}</span>
  }
  const isMine = player.status === 'C&G'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
      isMine ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    }`}>{player.status}</span>
  )
}

function RoleBadge({ role }: { role: string }) {
  if (CLOSER_ROLES.has(role)) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">CL</span>
  if (SETUP_ROLES.has(role)) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">SU</span>
  if (role === 'Middle Reliever') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">MR</span>
  if (role === 'Long Reliever') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500">LR</span>
  if (IL_ROLES.has(role)) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">IL</span>
  if (role === 'Restricted List') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">RL</span>
  return null
}

function CmRoleBadge({ role }: { role: 'CL' | '1st' | '2nd' }) {
  if (role === 'CL') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 min-w-[28px] justify-center">CL</span>
  if (role === '1st') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 min-w-[28px] justify-center">1st</span>
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 min-w-[28px] justify-center">2nd</span>
}

// --- Projection source toggle ---

function ProjToggle({ projSource, setProjSource }: { projSource: ProjSource; setProjSource: (s: ProjSource) => void }) {
  return (
    <div className="inline-flex rounded-md shadow-sm">
      <button onClick={() => setProjSource('zips')} className={`px-3 py-1.5 text-sm font-medium rounded-l-md border ${projSource === 'zips' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>ZiPS</button>
      <button onClick={() => setProjSource('zipsDc')} className={`px-3 py-1.5 text-sm font-medium rounded-r-md border-t border-b border-r ${projSource === 'zipsDc' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>ZiPS DC</button>
    </div>
  )
}

// --- CloserMonkey player matching ---

// Match a short CloserMonkey name (e.g. "Helsley", "B King", "R Suárez") to a player
// by searching players on the same MLB team
function matchCmPlayer(
  shortName: string,
  mlbTeam: string,
  players: Player[],
  pitcherMap: Map<string, ZipsPitcher>
): Player | null {
  if (!shortName) return null

  const normalizedShort = normalize(shortName)
  const parts = normalizedShort.split(' ')

  // Get all players on this MLB team (by their Fantrax team field)
  const teamPlayers = players.filter(p => p.team === mlbTeam)

  // 1. Try exact normalized match against all players first
  for (const p of players) {
    if (p.normalizedName === normalizedShort) return p
  }

  // 2. Try matching by last name within team, optionally checking first initial
  const isInitialPattern = parts.length >= 2 && parts[0].length <= 2
  const lastName = parts[parts.length - 1]
  const initial = isInitialPattern ? parts[0][0] : null

  const candidates = teamPlayers.filter(p => {
    const playerParts = p.normalizedName.split(' ')
    const playerLast = playerParts[playerParts.length - 1]
    if (playerLast !== lastName) return false
    if (initial && playerParts[0][0] !== initial) return false
    return true
  })

  if (candidates.length === 1) return candidates[0]

  // 3. If multiple candidates, prefer pitchers (check ZiPS map)
  if (candidates.length > 1) {
    const pitchers = candidates.filter(p => pitcherMap.has(p.normalizedName))
    if (pitchers.length === 1) return pitchers[0]
    if (pitchers.length > 0) return pitchers[0]
    return candidates[0]
  }

  // 4. Try matching just last name across all players, prefer pitcher on right team
  const allByLast = players.filter(p => {
    const playerParts = p.normalizedName.split(' ')
    const playerLast = playerParts[playerParts.length - 1]
    if (playerLast !== lastName) return false
    if (initial && playerParts[0][0] !== initial) return false
    return true
  })

  if (allByLast.length === 1) return allByLast[0]
  if (allByLast.length > 1) {
    const pitchers = allByLast.filter(p => pitcherMap.has(p.normalizedName))
    if (pitchers.length === 1) return pitchers[0]
    if (pitchers.length > 0) return pitchers[0]
    return allByLast[0]
  }

  return null
}

// --- Franchise RP aggregation ---

interface FranchiseRP {
  franchise: string
  shortCode: string
  sv: number
  hld: number
  k: number
  ip: number
  er: number
  hAllowed: number
  bb: number
  era: number
  whip: number
  bb9: number
  playerCount: number
}

function aggregateRP(
  players: Player[],
  pitcherMap: Map<string, ZipsPitcher>,
  franchiseMappings: { shortCode: string; fullName: string }[]
): FranchiseRP[] {
  const franchiseNameMap = new Map<string, string>()
  franchiseMappings.forEach(m => franchiseNameMap.set(m.shortCode, m.fullName))

  const byFranchise = new Map<string, FranchiseRP>()

  for (const p of players) {
    if (p.status === 'FA' || p.status === '' || p.isWaiver) continue
    const pit = pitcherMap.get(p.normalizedName)
    if (!pit) continue
    // Only relievers: IP < 100 or has SV/HLD
    if (pit.ip >= 100 && pit.sv === 0 && pit.hld === 0) continue

    const code = p.status
    if (!byFranchise.has(code)) {
      const fullName = franchiseNameMap.get(code) || code
      if (fullName === 'Free Agent') continue
      byFranchise.set(code, { franchise: fullName, shortCode: code, sv: 0, hld: 0, k: 0, ip: 0, er: 0, hAllowed: 0, bb: 0, era: 0, whip: 0, bb9: 0, playerCount: 0 })
    }
    const f = byFranchise.get(code)!
    f.sv += pit.sv
    f.hld += pit.hld
    f.k += pit.k
    f.ip += pit.ip
    f.er += pit.er
    f.hAllowed += pit.h
    f.bb += pit.bb
    f.playerCount++
  }

  const result: FranchiseRP[] = []
  for (const f of byFranchise.values()) {
    f.era = f.ip > 0 ? 9 * f.er / f.ip : 0
    f.whip = f.ip > 0 ? (f.hAllowed + f.bb) / f.ip : 0
    f.bb9 = f.ip > 0 ? 9 * f.bb / f.ip : 0
    result.push(f)
  }
  result.sort((a, b) => (b.sv + b.hld) - (a.sv + a.hld))
  return result
}

function getRank(franchises: FranchiseRP[], code: string, stat: keyof FranchiseRP, lowerBetter = false): number {
  const sorted = [...franchises].sort((a, b) => {
    const av = a[stat] as number
    const bv = b[stat] as number
    return lowerBetter ? av - bv : bv - av
  })
  return sorted.findIndex(f => f.shortCode === code) + 1
}

// --- Main page ---

export default function ClosersPage() {
  const { closers, closerMonkey, players, zipsPitchers, zipsDcPitchers, franchiseMappings } = usePlayerStore()
  const hasHydrated = useHydration()

  const [view, setView] = useState<ViewMode>('closerMonkey')
  const [filter, setFilter] = useState<FilterMode>('closers')
  const [projSource, setProjSource] = useState<ProjSource>('zipsDc')
  const [simAdds, setSimAdds] = useState<Set<string>>(new Set())

  const toggleSim = useCallback((normalizedName: string) => {
    setSimAdds(prev => {
      const next = new Set(prev)
      if (next.has(normalizedName)) next.delete(normalizedName)
      else next.add(normalizedName)
      return next
    })
  }, [])

  // Pitcher projection maps
  const pitcherMap = useMemo(() => {
    const pitchers = projSource === 'zipsDc' ? zipsDcPitchers : zipsPitchers
    const map = new Map<string, ZipsPitcher>()
    pitchers.forEach(p => map.set(p.normalizedName, p))
    return map
  }, [projSource, zipsPitchers, zipsDcPitchers])

  // Player lookup
  const playerMap = useMemo(() => {
    const map = new Map<string, Player>()
    for (const p of players) {
      if (!map.has(p.normalizedName)) map.set(p.normalizedName, p)
    }
    return map
  }, [players])

  // --- Depth Charts (FanGraphs) data ---
  type EnrichedCloser = CloserEntry & { matchedPlayer: Player | null; zipsProj: ZipsPitcher | null }

  const teamClosers = useMemo(() => {
    const map = new Map<string, EnrichedCloser[]>()
    for (const c of closers) {
      if (!map.has(c.team)) map.set(c.team, [])
      map.get(c.team)!.push({
        ...c,
        matchedPlayer: playerMap.get(c.normalizedName) ?? null,
        zipsProj: pitcherMap.get(c.normalizedName) ?? null,
      })
    }
    for (const [, list] of map) {
      list.sort((a, b) => roleSortKey(a.role) - roleSortKey(b.role))
    }
    return map
  }, [closers, playerMap, pitcherMap])

  const filteredTeamClosers = useMemo(() => {
    if (filter === 'all') return teamClosers
    const result = new Map<string, EnrichedCloser[]>()
    for (const [team, list] of teamClosers) {
      let filtered = list
      if (filter === 'closers') {
        filtered = list.filter(c => CLOSER_ROLES.has(c.role) || SETUP_ROLES.has(c.role))
      } else if (filter === 'available') {
        filtered = list.filter(c => c.matchedPlayer && (c.matchedPlayer.isAvailable || c.matchedPlayer.isWaiver))
      }
      if (filtered.length > 0) result.set(team, filtered)
    }
    return result
  }, [teamClosers, filter])

  // --- CloserMonkey data ---
  interface CmMatchedPlayer {
    name: string
    role: 'CL' | '1st' | '2nd'
    player: Player | null
    zips: ZipsPitcher | null
    normalizedName: string
  }

  const cmTeamData = useMemo(() => {
    const map = new Map<string, { entry: CloserMonkeyEntry; matched: CmMatchedPlayer[] }>()
    for (const cm of closerMonkey) {
      const entries: { name: string; role: 'CL' | '1st' | '2nd'; normalized: string }[] = [
        { name: cm.closer, role: 'CL', normalized: cm.closerNormalized },
        { name: cm.firstInLine, role: '1st', normalized: cm.firstNormalized },
        { name: cm.secondInLine, role: '2nd', normalized: cm.secondNormalized },
      ]
      const matched: CmMatchedPlayer[] = entries
        .filter(e => e.name.trim() !== '')
        .map(e => {
          const p = matchCmPlayer(e.name, cm.team, players, pitcherMap)
          const nn = p?.normalizedName || e.normalized
          return {
            name: e.name,
            role: e.role,
            player: p,
            zips: pitcherMap.get(nn) ?? null,
            normalizedName: nn,
          }
        })
      map.set(cm.team, { entry: cm, matched })
    }
    return map
  }, [closerMonkey, players, pitcherMap])

  // Franchise RP aggregation
  const franchiseRPs = useMemo(() =>
    aggregateRP(players, pitcherMap, franchiseMappings),
    [players, pitcherMap, franchiseMappings]
  )

  // C&G current totals
  const cgCurrent = useMemo(() =>
    franchiseRPs.find(f => f.shortCode === 'C&G') ?? null,
    [franchiseRPs]
  )

  // Simulated adds totals
  const simTotals = useMemo(() => {
    let sv = 0, hld = 0, k = 0, ip = 0, er = 0, hAllowed = 0, bb = 0
    for (const nn of simAdds) {
      const pit = pitcherMap.get(nn)
      if (!pit) continue
      sv += pit.sv; hld += pit.hld; k += pit.k; ip += pit.ip
      er += pit.er; hAllowed += pit.h; bb += pit.bb
    }
    return { sv, hld, k, ip, er, hAllowed, bb }
  }, [simAdds, pitcherMap])

  // Combined C&G + sim
  const cgWithSim = useMemo(() => {
    if (!cgCurrent) return null
    const ip = cgCurrent.ip + simTotals.ip
    const er = cgCurrent.er + simTotals.er
    const hA = cgCurrent.hAllowed + simTotals.hAllowed
    const bb = cgCurrent.bb + simTotals.bb
    return {
      sv: cgCurrent.sv + simTotals.sv,
      hld: cgCurrent.hld + simTotals.hld,
      k: cgCurrent.k + simTotals.k,
      ip,
      era: ip > 0 ? 9 * er / ip : 0,
      whip: ip > 0 ? (hA + bb) / ip : 0,
    }
  }, [cgCurrent, simTotals])

  // Ranks
  const cgSvRank = useMemo(() => cgCurrent ? getRank(franchiseRPs, 'C&G', 'sv') : 0, [franchiseRPs, cgCurrent])
  const cgHldRank = useMemo(() => cgCurrent ? getRank(franchiseRPs, 'C&G', 'hld') : 0, [franchiseRPs, cgCurrent])

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500">Loading data...</p>
      </div>
    )
  }

  if (closers.length === 0 && closerMonkey.length === 0) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">No closer data available. Upload closers.csv or closermonkey.csv.</div>
  }

  const viewButtons: { key: ViewMode; label: string }[] = [
    { key: 'closerMonkey', label: 'CloserMonkey' },
    { key: 'depthCharts', label: 'Depth Charts' },
    { key: 'franchiseRP', label: 'Franchise RP' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Closer Depth Charts</h1>
        <div className="flex items-center gap-3">
          <ProjToggle projSource={projSource} setProjSource={setProjSource} />
          <div className="inline-flex rounded-md shadow-sm">
            {viewButtons.map((btn, i) => (
              <button
                key={btn.key}
                onClick={() => setView(btn.key)}
                className={`px-3 py-1.5 text-sm font-medium border ${
                  i === 0 ? 'rounded-l-md' : i === viewButtons.length - 1 ? 'rounded-r-md border-l-0' : 'border-l-0'
                } ${view === btn.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
              >{btn.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* CloserMonkey View */}
      {view === 'closerMonkey' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
              <span><CmRoleBadge role="CL" /> Closer</span>
              <span><CmRoleBadge role="1st" /> 1st in line</span>
              <span><CmRoleBadge role="2nd" /> 2nd in line</span>
              <span><span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">FA</span> Available</span>
              <span><span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">C&G</span> Yours</span>
              <span className="text-amber-600 dark:text-amber-400">* = committee</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {DIVISIONS.map(div => (
              <div key={div.label} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{div.label}</h2>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {div.teams.map(team => {
                    const data = cmTeamData.get(team)
                    if (!data) {
                      return (
                        <div key={team} className="px-4 py-2">
                          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{team}</span>
                          <span className="text-xs text-gray-400 ml-2">No data</span>
                        </div>
                      )
                    }
                    return (
                      <div key={team} className="px-4 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{team}</span>
                          {data.entry.isCommittee && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">* committee</span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">{data.entry.updated}</span>
                        </div>
                        <div className="space-y-1">
                          {data.matched.map(m => {
                            const isAvailable = m.player?.isAvailable || m.player?.isWaiver
                            const inSim = simAdds.has(m.normalizedName)
                            return (
                              <div key={`${team}-${m.role}`} className="flex items-center gap-2 text-sm">
                                <CmRoleBadge role={m.role} />
                                <span className={isAvailable ? 'font-semibold text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}>
                                  {m.player?.name || m.name}
                                </span>
                                <StatusBadge player={m.player} />
                                {!m.player && (
                                  <span className="text-xs text-amber-500" title="Could not match to roster">unmatched</span>
                                )}
                                {m.zips && (
                                  <span className="text-xs text-gray-400 ml-auto flex gap-2 tabular-nums">
                                    {m.zips.sv > 0 && <span>{m.zips.sv} SV</span>}
                                    {m.zips.hld > 0 && <span>{m.zips.hld} HLD</span>}
                                    <span>{m.zips.era.toFixed(2)} ERA</span>
                                    <span>{m.zips.k} K</span>
                                  </span>
                                )}
                                {isAvailable && (
                                  <button
                                    onClick={() => toggleSim(m.normalizedName)}
                                    className={`ml-1 p-0.5 rounded ${inSim ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/40'}`}
                                    title={inSim ? 'Remove from simulation' : 'Add to simulation'}
                                  >
                                    {inSim ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Depth Charts View */}
      {view === 'depthCharts' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
              <span><span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">CL</span> Closer</span>
              <span><span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">SU</span> Setup</span>
              <span><span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">FA</span> Available</span>
              <span><span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">C&G</span> Yours</span>
            </div>
            <div className="inline-flex rounded-md shadow-sm">
              {([['closers', 'CL/SU'], ['available', 'Available'], ['all', 'All']] as [FilterMode, string][]).map(([key, label], i) => (
                <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 text-sm font-medium border ${i === 0 ? 'rounded-l-md' : i === 2 ? 'rounded-r-md border-l-0' : 'border-l-0'} ${filter === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {DIVISIONS.map(div => (
              <div key={div.label} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{div.label}</h2>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {div.teams.map(team => {
                    const entries = filteredTeamClosers.get(team)
                    if (!entries || entries.length === 0) {
                      return (
                        <div key={team} className="px-4 py-2">
                          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{team}</span>
                          <span className="text-xs text-gray-400 ml-2">No matches</span>
                        </div>
                      )
                    }
                    return (
                      <div key={team} className="px-4 py-2">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">{team}</div>
                        <div className="space-y-1">
                          {entries.map(entry => {
                            const p = entry.matchedPlayer
                            const isAvailable = p?.isAvailable || p?.isWaiver
                            const z = entry.zipsProj
                            const inSim = simAdds.has(entry.normalizedName)
                            return (
                              <div key={entry.normalizedName} className="flex items-center gap-2 text-sm">
                                <RoleBadge role={entry.role} />
                                <span className={isAvailable ? 'font-semibold text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}>
                                  {entry.player}
                                </span>
                                <StatusBadge player={p} />
                                {z && (
                                  <span className="text-xs text-gray-400 ml-auto flex gap-2 tabular-nums">
                                    {z.sv > 0 && <span>{z.sv} SV</span>}
                                    {z.hld > 0 && <span>{z.hld} HLD</span>}
                                    <span>{z.era.toFixed(2)} ERA</span>
                                    <span>{z.k} K</span>
                                  </span>
                                )}
                                {isAvailable && (
                                  <button
                                    onClick={() => toggleSim(entry.normalizedName)}
                                    className={`ml-1 p-0.5 rounded ${inSim ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/40'}`}
                                    title={inSim ? 'Remove from simulation' : 'Add to simulation'}
                                  >
                                    {inSim ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Franchise RP View */}
      {view === 'franchiseRP' && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Franchise</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">SV</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">HLD</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">K</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">IP</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">ERA</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">WHIP</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">BB/9</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">RPs</th>
              </tr>
            </thead>
            <tbody>
              {franchiseRPs.map(f => {
                const isCG = f.shortCode === 'C&G'
                return (
                  <tr key={f.shortCode} className={`border-b border-gray-100 dark:border-gray-800 ${isCG ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''}`}>
                    <td className={`px-3 py-2 whitespace-nowrap ${isCG ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>{f.franchise}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.sv}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.hld}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.k}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.ip.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.era.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.whip.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.bb9.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">{f.playerCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Simulation Panel */}
      {simAdds.size > 0 && (
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t-2 border-blue-500 rounded-t-lg shadow-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Simulation: C&G RP Impact</h3>
            <button onClick={() => setSimAdds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
          </div>

          {/* Sim players list */}
          <div className="flex flex-wrap gap-2">
            {Array.from(simAdds).map(nn => {
              const pit = pitcherMap.get(nn)
              const p = playerMap.get(nn)
              return (
                <span key={nn} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-xs font-medium">
                  {p?.name || nn}
                  {pit && <span className="text-green-600 dark:text-green-400">({pit.sv > 0 ? `${pit.sv} SV` : ''}{pit.sv > 0 && pit.hld > 0 ? ', ' : ''}{pit.hld > 0 ? `${pit.hld} HLD` : ''})</span>}
                  <button onClick={() => toggleSim(nn)} className="ml-0.5 hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              )
            })}
          </div>

          {/* Before / After table */}
          {cgCurrent && cgWithSim && (
            <div className="overflow-x-auto">
              <table className="text-sm w-full">
                <thead>
                  <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <th className="px-2 py-1 text-left"></th>
                    <th className="px-2 py-1 text-right">SV</th>
                    <th className="px-2 py-1 text-right">HLD</th>
                    <th className="px-2 py-1 text-right">K</th>
                    <th className="px-2 py-1 text-right">ERA</th>
                    <th className="px-2 py-1 text-right">WHIP</th>
                    <th className="px-2 py-1 text-right">SV Rank</th>
                    <th className="px-2 py-1 text-right">HLD Rank</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-gray-500 dark:text-gray-400">
                    <td className="px-2 py-1 font-medium">Current</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgCurrent.sv}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgCurrent.hld}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgCurrent.k}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgCurrent.era.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgCurrent.whip.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgSvRank} of {franchiseRPs.length}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgHldRank} of {franchiseRPs.length}</td>
                  </tr>
                  <tr className="text-green-700 dark:text-green-400 font-medium">
                    <td className="px-2 py-1">With adds</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgWithSim.sv}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgWithSim.hld}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgWithSim.k}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgWithSim.era.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{cgWithSim.whip.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {(() => {
                        const simmed = franchiseRPs.map(f => f.shortCode === 'C&G' ? { ...f, sv: cgWithSim.sv } : f)
                        const sorted = [...simmed].sort((a, b) => b.sv - a.sv)
                        return `${sorted.findIndex(f => f.shortCode === 'C&G') + 1} of ${franchiseRPs.length}`
                      })()}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {(() => {
                        const simmed = franchiseRPs.map(f => f.shortCode === 'C&G' ? { ...f, hld: cgWithSim.hld } : f)
                        const sorted = [...simmed].sort((a, b) => b.hld - a.hld)
                        return `${sorted.findIndex(f => f.shortCode === 'C&G') + 1} of ${franchiseRPs.length}`
                      })()}
                    </td>
                  </tr>
                  <tr className="text-xs text-gray-400">
                    <td className="px-2 py-1">Delta</td>
                    <td className="px-2 py-1 text-right tabular-nums text-green-600">+{simTotals.sv}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-green-600">+{simTotals.hld}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-green-600">+{simTotals.k}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{(cgWithSim.era - cgCurrent.era) >= 0 ? '+' : ''}{(cgWithSim.era - cgCurrent.era).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{(cgWithSim.whip - cgCurrent.whip) >= 0 ? '+' : ''}{(cgWithSim.whip - cgCurrent.whip).toFixed(2)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
