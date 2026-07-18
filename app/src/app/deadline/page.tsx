'use client'

import { usePlayerStore } from '@/lib/store'
import { normalize } from '@/lib/normalize'
import { FRANCHISES, type Franchise } from '@/lib/franchises'
import { useMemo } from 'react'
import TargetsSection from './TargetsSection'
import { buildDealSheets, type DealSheet, type SendCandidate, type AskCandidate } from '@/lib/tradeEngine'
import { isExpiring, remainingContract, fmtM } from '@/lib/contracts'
import type { Player, SalaryEntry, LeagueStanding, ZipsBatter, ZipsPitcher } from '@/types'

// ============================================================
// League identity mapping — canonical table lives in lib/franchises.ts
// (Fantrax standings team names ↔ all.csv status codes ↔ salaries.csv
// owner names, verified by roster-name overlap).
// ============================================================

const OUR_CODE = 'C&G'
const OUR_SALARY_FRANCHISE = 'Colin Wilson & Greg Holmes'
const OUR_DISPLAY = 'Colin Wilson & Greg Holmes'
const SEASON_START = new Date(2026, 2, 20) // acquisitions after this = in-season pickups (Section 4.6: 1-year deals)

const TEAM_INFO: Record<string, Franchise> = Object.fromEntries(
  FRANCHISES.map(f => [f.fantraxName, f])
)

const SCORED_CATS = ['R', 'HR', 'RBI', 'SB', 'AVG', 'OBP', 'SLG', 'K', 'QS', 'SV', 'HLD', 'ERA', 'BB/9', 'H/IP']

// Buyer/seller tier from the real standings: above us by a clear margin =
// buyer, just above us = bubble, at or below us = seller.
const BUBBLE_MARGIN = 6
function computeTier(row: LeagueStanding, ourPoints: number): { label: string; cls: string } {
  if (TEAM_INFO[row.team]?.code === OUR_CODE)
    return { label: 'Seller (us)', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' }
  if (row.points <= ourPoints)
    return { label: 'Seller', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' }
  if (row.points - ourPoints <= BUBBLE_MARGIN)
    return { label: 'Bubble buyer', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' }
  return { label: 'Buyer', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
}

// ------------------------------------------------------------
// 3-year outlook: real FanGraphs ZiPS projections for 2026, 2027
// and 2028. Batters show wRC+ straight from ZiPS. Pitchers show
// ERA+ computed against that projection year's league-average
// ERA (IP-weighted across the file), since the export carries
// no xFIP/ERA+ column. Both: 100 = average, higher = better.
// ------------------------------------------------------------
interface ZipsYearMaps {
  bat: Map<string, ZipsBatter>
  pit: Map<string, ZipsPitcher>
  leagueEra: number
}

function leagueEraOf(pitchers: ZipsPitcher[]): number {
  let er = 0
  let ip = 0
  for (const p of pitchers) {
    if (p.ip > 0) {
      er += p.er
      ip += p.ip
    }
  }
  return ip > 0 ? (er / ip) * 9 : 4.2
}

function yearValue(maps: ZipsYearMaps, key: string): number | null {
  const bat = maps.bat.get(key)
  if (bat && bat.wrcPlus > 0 && bat.pa >= 50) return Math.round(bat.wrcPlus)
  const pit = maps.pit.get(key)
  if (pit && pit.era > 0 && pit.ip >= 20) return Math.round((maps.leagueEra / pit.era) * 100)
  return null
}

interface ThreeYear {
  metric: 'wRC+' | 'ERA+'
  y26: number | null
  y27: number | null
  y28: number | null
}

function threeYearOutlook(name: string, y26m: ZipsYearMaps, y27m: ZipsYearMaps, y28m: ZipsYearMaps): ThreeYear | null {
  const key = normalize(name)
  const y26 = yearValue(y26m, key)
  const y27 = yearValue(y27m, key)
  const y28 = yearValue(y28m, key)
  if (y26 === null && y27 === null && y28 === null) return null
  const isBat = y26m.bat.has(key) || y27m.bat.has(key) || y28m.bat.has(key)
  return { metric: isBat ? 'wRC+' : 'ERA+', y26, y27, y28 }
}

function OutlookCell({ o }: { o: ThreeYear | null }) {
  if (!o) return <span className="text-gray-400">—</span>
  const delta = o.y26 !== null && o.y28 !== null ? o.y28 - o.y26 : null
  const cls =
    delta !== null && delta <= -10
      ? 'text-red-600 dark:text-red-400'
      : delta !== null && delta >= 5
        ? 'text-green-600 dark:text-green-400'
        : 'text-gray-600 dark:text-gray-300'
  const f = (v: number | null) => (v === null ? '—' : v)
  return (
    <span className={`whitespace-nowrap ${cls}`}>
      {f(o.y26)} → {f(o.y27)} → {f(o.y28)}
      <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-500">{o.metric}</span>
    </span>
  )
}

function parseAcqDate(s: string): Date | null {
  if (!s || !s.trim()) return null
  const d = new Date(s.trim())
  return isNaN(d.getTime()) ? null : d
}

function fmtSalary(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n > 0 ? `$${Math.round(n / 1000)}k` : '—'
}

const BADGE_CLS: Record<'good' | 'ok' | 'dead' | 'unknown', string> = {
  good: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  ok: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  dead: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

// Contract badge for an ask, straight off the joined player record.
function askBadge(p: Player): { text: string; tone: keyof typeof BADGE_CLS } {
  const isFarm = p.hkbLevel !== null && p.hkbLevel !== 'MLB'
  if (/minors/i.test(p.contractType ?? '') || (p.contractEnds == null && isFarm)) return { text: 'Farm — free', tone: 'good' }
  if (/yp/i.test(p.contractType ?? '')) return { text: `YP thru ${p.contractEnds}`, tone: 'good' }
  if (p.contractEnds != null) {
    const c = remainingContract(p)
    return { text: `${fmtM(c.aav)}/yr thru ${p.contractEnds}`, tone: c.aav >= 15_000_000 ? 'ok' : 'good' }
  }
  return { text: 'No contract data', tone: 'unknown' }
}

function sendContract(p: Player): string {
  if (isExpiring(p)) return 'Expiring 2026'
  if (p.contractEnds == null) return '—'
  return `${fmtM(remainingContract(p).aav)}/yr thru ${p.contractEnds}`
}

function DeltaCell({ v }: { v: number }) {
  return (
    <span className={`font-bold tabular-nums ${v > 0 ? 'text-green-600 dark:text-green-400' : v < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
      {v > 0 ? `+${v}` : v}
    </span>
  )
}

function heatColor(points: number | null, teamCount: number): string {
  if (points === null) return 'transparent'
  const frac = (points - 1) / Math.max(1, teamCount - 1)
  return `hsla(${Math.round(frac * 120)}, 65%, 45%, 0.30)`
}

// ============================================================
// Page
// ============================================================

export default function DeadlinePage() {
  const { standings, players, salaries, zipsBatters, zipsPitchers, zips27Batters, zips27Pitchers, zips28Batters, zips28Pitchers } = usePlayerStore()

  const buildYearMaps = (bats: ZipsBatter[], pits: ZipsPitcher[]): ZipsYearMaps => {
    const bat = new Map<string, ZipsBatter>()
    bats.forEach(b => bat.set(b.normalizedName || normalize(b.name), b))
    const pit = new Map<string, ZipsPitcher>()
    pits.forEach(p => pit.set(p.normalizedName || normalize(p.name), p))
    return { bat, pit, leagueEra: leagueEraOf(pits) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zips26 = useMemo(() => buildYearMaps(zipsBatters, zipsPitchers), [zipsBatters, zipsPitchers])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zips27 = useMemo(() => buildYearMaps(zips27Batters, zips27Pitchers), [zips27Batters, zips27Pitchers])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zips28 = useMemo(() => buildYearMaps(zips28Batters, zips28Pitchers), [zips28Batters, zips28Pitchers])

  const playerByName = useMemo(() => {
    const m = new Map<string, Player>()
    players.forEach(p => {
      const k = normalize(p.name)
      if (!m.has(k) || p.status !== 'FA') m.set(k, p)
    })
    return m
  }, [players])

  const sorted = useMemo(
    () => [...standings].sort((a, b) => a.rank - b.rank),
    [standings]
  )
  const teamCount = sorted.length || 14
  const avgGP = sorted.length ? sorted.reduce((s, t) => s + t.gamesPlayed, 0) / sorted.length : 0
  const ourPoints = sorted.find(r => TEAM_INFO[r.team]?.code === OUR_CODE)?.points ?? 0

  // Trade engine: RoS roto states, sends, asks and a suggested package per franchise
  const engine = useMemo(() => buildDealSheets(players, OUR_DISPLAY), [players])

  // Our sell list: contracts ending 2026 (rentals — Section 4.6/4.8 mean no rights after this year),
  // excluding farm prospects (Minors deals stay controlled) and players no longer on our roster.
  const sellList = useMemo(() => {
    const seen = new Map<string, { entry: SalaryEntry; player: Player | null }>()
    for (const s of salaries) {
      if (s.franchise !== OUR_SALARY_FRANCHISE) continue
      if (s.contractEnds !== 2026) continue
      if (/minors/i.test(s.contractType)) continue
      const key = s.normalizedName || normalize(s.playerName)
      const player = playerByName.get(key) ?? null
      // salaries.csv keeps dropped contracts; a player we dropped shows as FA (or another code) in all.csv
      if (player && player.status !== OUR_CODE) continue
      const prev = seen.get(key)
      if (!prev || (parseAcqDate(s.acquisitionDate)?.getTime() ?? 0) > (parseAcqDate(prev.entry.acquisitionDate)?.getTime() ?? 0)) {
        seen.set(key, { entry: s, player })
      }
    }
    return [...seen.values()].sort((a, b) => (a.player?.rkOv ?? 99999) - (b.player?.rkOv ?? 99999))
  }, [salaries, playerByName])

  // Near-term deals (ending 2027–28): aging vets here are payroll-shedding
  // candidates. Trading avoids §4.8 dead cap entirely (dropping costs
  // 80% / 60% / 40% of AAV over three years).
  const shedList = useMemo(() => {
    const seen = new Map<string, { entry: SalaryEntry; player: Player | null }>()
    for (const s of salaries) {
      if (s.franchise !== OUR_SALARY_FRANCHISE) continue
      if (s.contractEnds !== 2027 && s.contractEnds !== 2028) continue
      if (/minors/i.test(s.contractType)) continue
      const key = s.normalizedName || normalize(s.playerName)
      const player = playerByName.get(key) ?? null
      if (player && player.status !== OUR_CODE) continue
      if (!seen.has(key)) seen.set(key, { entry: s, player })
    }
    // Oldest and most expensive first — that's the shed order
    return [...seen.values()].sort(
      (a, b) => (b.player?.age ?? 0) - (a.player?.age ?? 0) || b.entry.salary - a.entry.salary
    )
  }, [salaries, playerByName])

  // Long-deal targets: players on OTHER rosters controlled through 2029+.
  const longDealList = useMemo(() => {
    const franchiseInfo = new Map<string, { team: string; code: string }>()
    Object.entries(TEAM_INFO).forEach(([team, info]) => franchiseInfo.set(info.salaryName, { team, code: info.code }))
    const seen = new Map<string, { entry: SalaryEntry; player: Player | null; team: string }>()
    for (const s of salaries) {
      if (s.franchise === OUR_SALARY_FRANCHISE) continue
      if (s.contractEnds < 2029) continue
      if (/minors|yp/i.test(s.contractType)) continue
      const info = franchiseInfo.get(s.franchise)
      if (!info) continue
      const key = s.normalizedName || normalize(s.playerName)
      const player = playerByName.get(key) ?? null
      if (player && player.status !== info.code) continue // dropped or moved since
      if (!seen.has(key)) seen.set(key, { entry: s, player, team: info.team })
    }
    return [...seen.values()].sort((a, b) => (a.player?.rkOv ?? 99999) - (b.player?.rkOv ?? 99999))
  }, [salaries, playerByName])

  // Our committed payroll for 2027/2028 (cap = $150M in 2024, +$10M/yr),
  // to judge whether we can absorb a long deal. Excludes dead cap.
  const capRoom = useMemo(() => {
    const committed: Record<number, number> = { 2027: 0, 2028: 0 }
    for (const s of salaries) {
      if (s.franchise !== OUR_SALARY_FRANCHISE) continue
      if (/minors/i.test(s.contractType)) continue
      const key = s.normalizedName || normalize(s.playerName)
      const player = playerByName.get(key) ?? null
      if (player && player.status !== OUR_CODE) continue
      committed[2027] += s.salaryByYear[2027] ?? 0
      committed[2028] += s.salaryByYear[2028] ?? 0
    }
    return { 2027: { committed: committed[2027], cap: 180_000_000 }, 2028: { committed: committed[2028], cap: 190_000_000 } }
  }, [salaries, playerByName])

  if (!standings.length) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        No standings data loaded. Upload <code>standings.csv</code> (Fantrax “Standings — Point Totals”) on the Upload page.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">2026 Trade Deadline Plan</h1>
      </div>

      {/* Standings heatmap */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Standings &amp; category points</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Cells are roto points per category (green = near the top of the category, red = near the bottom). Tiers are
          computed from points vs ours (above by &gt;{BUBBLE_MARGIN} = buyer, within {BUBBLE_MARGIN} = bubble, at/below = seller).
          League-average games played: {Math.round(avgGP).toLocaleString()}.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Team</th>
                <th className="py-1 pr-2">Tier</th>
                <th className="py-1 pr-2 text-right">Pts</th>
                <th className="py-1 pr-2 text-right">+/-</th>
                <th className="py-1 pr-2 text-right">GP</th>
                {SCORED_CATS.map(c => (
                  <th key={c} className="py-1 px-1.5 text-center">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const tier = computeTier(row, ourPoints)
                const isUs = TEAM_INFO[row.team]?.code === OUR_CODE
                return (
                  <tr key={row.team} className={`border-t border-gray-100 dark:border-gray-700 ${isUs ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                    <td className="py-1 pr-2 font-medium text-gray-900 dark:text-white">{row.rank}</td>
                    <td className="py-1 pr-2 whitespace-nowrap font-medium text-gray-900 dark:text-white">{row.team}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tier.cls}`}>{tier.label}</span>
                    </td>
                    <td className="py-1 pr-2 text-right font-semibold text-gray-900 dark:text-white">{row.points}</td>
                    <td className={`py-1 pr-2 text-right ${row.recentDelta > 0 ? 'text-green-600 dark:text-green-400' : row.recentDelta < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                      {row.recentDelta > 0 ? `+${row.recentDelta}` : row.recentDelta}
                    </td>
                    <td className="py-1 pr-2 text-right text-gray-600 dark:text-gray-300">{row.gamesPlayed.toLocaleString()}</td>
                    {SCORED_CATS.map(c => (
                      <td key={c} className="py-1 px-1.5 text-center text-gray-800 dark:text-gray-100" style={{ backgroundColor: heatColor(row.categoryPoints[c] ?? null, teamCount) }}>
                        {row.categoryPoints[c] ?? '—'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sell list */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Our sell list — everyone with no rights after 2026</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Our salaries.csv contracts ending 2026 that are still on the roster per all.csv. In-season pickups
          (after {SEASON_START.toLocaleDateString()}) can never be kept (§4.6).
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 text-xs">
                <th className="py-1 pr-3">Player</th>
                <th className="py-1 pr-3">Pos</th>
                <th className="py-1 pr-3 text-right">Age</th>
                <th className="py-1 pr-3 text-right">Rank</th>
                <th className="py-1 pr-3 text-right">Salary</th>
                <th className="py-1 pr-3">Acquired</th>
                <th className="py-1 pr-3">3-yr wRC+ / ERA+ ’26→’28</th>
                <th className="py-1 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sellList.map(({ entry, player }) => {
                const acq = parseAcqDate(entry.acquisitionDate)
                const inSeason = acq !== null && acq.getTime() >= SEASON_START.getTime()
                const isYP = /yp/i.test(entry.contractType)
                return (
                  <tr key={entry.playerName} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{entry.playerName}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{player?.position ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{player?.age ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{player?.rkOv ? `#${player.rkOv}` : '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{fmtSalary(entry.salary)}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.acquisitionDate || '—'}</td>
                    <td className="py-1.5 pr-3 text-xs">
                      <OutlookCell o={threeYearOutlook(entry.playerName, zips26, zips27, zips28)} />
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${inSeason ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : isYP ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>
                        {inSeason ? 'In-season pickup' : isYP ? 'YP — final year' : 'Expiring FA deal'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payroll shed candidates */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Payroll shed candidates — deals ending 2027–28</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 max-w-4xl">
          Verdicts are mechanical age bands (YP = keep, 34+ = shop, 30–33 = listen, under 30 = keep). Trading avoids the
          §4.8 dead-cap hit (80% / 60% / 40% of AAV over three years). “Committed” = salary × seasons remaining including 2026.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 text-xs">
                <th className="py-1 pr-3">Player</th>
                <th className="py-1 pr-3">Pos</th>
                <th className="py-1 pr-3 text-right">Age</th>
                <th className="py-1 pr-3 text-right">Rank</th>
                <th className="py-1 pr-3 text-right">$/yr</th>
                <th className="py-1 pr-3">Thru</th>
                <th className="py-1 pr-3 text-right">Committed</th>
                <th className="py-1 pr-3">3-yr wRC+ / ERA+ ’26→’28</th>
                <th className="py-1 pr-3">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {shedList.map(({ entry, player }) => {
                const age = player?.age ?? null
                const yearsLeft = entry.contractEnds - 2026 + 1
                const committed = entry.salary * yearsLeft
                const isYP = /yp/i.test(entry.contractType)
                const verdict = isYP
                  ? { text: 'Cheap — keep', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
                  : age !== null && age >= 34
                    ? { text: 'Age cliff — shop now', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' }
                    : age !== null && age >= 30
                      ? { text: 'Listen on offers', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' }
                      : { text: 'Young core — keep', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
                return (
                  <tr key={entry.playerName} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{entry.playerName}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{player?.position ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{age ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{player?.rkOv ? `#${player.rkOv}` : '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{isYP ? 'YP' : fmtSalary(entry.salary)}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300">{entry.contractEnds}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{isYP ? '—' : fmtSalary(committed)}</td>
                    <td className="py-1.5 pr-3 text-xs">
                      <OutlookCell o={threeYearOutlook(entry.playerName, zips26, zips27, zips28)} />
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${verdict.cls}`}>{verdict.text}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Long-deal targets */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Long-deal targets — controlled through 2029+ on other rosters</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 max-w-4xl">
          Our committed payroll: {fmtSalary(capRoom[2027].committed)} of {fmtSalary(capRoom[2027].cap)} in 2027
          and {fmtSalary(capRoom[2028].committed)} of {fmtSalary(capRoom[2028].cap)} in 2028 (excl. dead cap).
          Verdicts are mechanical rank + age bands. “Committed” = sum of remaining salary hits from 2026 on.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 text-xs">
                <th className="py-1 pr-3">Player</th>
                <th className="py-1 pr-3">Team</th>
                <th className="py-1 pr-3">Tier</th>
                <th className="py-1 pr-3">Pos</th>
                <th className="py-1 pr-3 text-right">Age</th>
                <th className="py-1 pr-3 text-right">Rank</th>
                <th className="py-1 pr-3 text-right">$/yr</th>
                <th className="py-1 pr-3">Thru</th>
                <th className="py-1 pr-3 text-right">Committed</th>
                <th className="py-1 pr-3">3-yr wRC+ / ERA+ ’26→’28</th>
                <th className="py-1 pr-3">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {longDealList.map(({ entry, player, team }) => {
                const row = sorted.find(r => r.team === team)
                const tier = row ? computeTier(row, ourPoints) : null
                const age = player?.age ?? null
                const rk = player?.rkOv ?? null
                const committed = Object.entries(entry.salaryByYear).reduce(
                  (sum, [yr, amt]) => (Number(yr) >= 2026 ? sum + amt : sum),
                  0
                )
                const verdict =
                  rk === null
                    ? { text: 'No rank data', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
                    : rk <= 150 && age !== null && age <= 28
                      ? { text: 'Prime target — ask', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
                      : rk <= 150
                        ? { text: 'Good, but aging money', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' }
                        : rk <= 400
                          ? { text: 'Only at a discount', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' }
                          : { text: 'Bad money — avoid', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' }
                return (
                  <tr key={entry.playerName} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{entry.playerName}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{team}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {tier && <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tier.cls}`}>{tier.label}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{player?.position ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{age ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{rk ? `#${rk}` : '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{fmtSalary(entry.salary)}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300">{entry.contractEnds}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{fmtSalary(committed)}</td>
                    <td className="py-1.5 pr-3 text-xs">
                      <OutlookCell o={threeYearOutlook(entry.playerName, zips26, zips27, zips28)} />
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${verdict.cls}`}>{verdict.text}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Acquisition targets: young players, prospects, buy-low */}
      <TargetsSection players={players} />

      {/* Deal sheets */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Deal sheets — engine-suggested trades, every franchise</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-4xl">
          All computed, with positions fully factored in: every delta re-optimizes the whole 23-man lineup — displaced
          starters slide to other eligible slots (SS→MI, 1B→CI, LF→OF/UTIL) with bench fills behind them — and diffs
          roto points vs the team&#39;s baseline optimal lineup. Sends = our tradeable players (sell list + 30+ shed
          vets), ranked by what <em>their</em> re-optimized lineup gains, with the slot they&#39;d start at. Asks =
          their controlled dynasty assets by HKB value, with the roto points their re-optimized lineup loses without
          each. The suggested deal is the highest-HKB ask that a ≤3-player send package both covers win-now (joint roto
          gain beats their cost with margin) and affords in dynasty terms (ask HKB ≤ 250 × package roto gain); packages
          are verified with one joint re-optimization per side, so overlapping positions don&#39;t double-count.
        </p>
        {engine.sheets.size === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No RoS projection data loaded — upload <code>zips_dc_ros_advanced_*.csv</code> on the Upload page to power the trade engine.
          </div>
        ) : (
          <div className="space-y-4">
            {sorted
              .filter(row => TEAM_INFO[row.team] && TEAM_INFO[row.team].code !== OUR_CODE)
              .map(row => {
                const info = TEAM_INFO[row.team]
                const sheet = engine.sheets.get(info.displayName)
                const tier = computeTier(row, ourPoints)
                const weakest = SCORED_CATS
                  .map(c => ({ cat: c, pts: row.categoryPoints[c] }))
                  .filter((x): x is { cat: string; pts: number } => x.pts !== null && x.pts !== undefined)
                  .sort((a, b) => a.pts - b.pts)
                  .slice(0, 5)
                return (
                  <DealSheetCard
                    key={row.team}
                    row={row}
                    tier={tier}
                    weakest={weakest}
                    sheet={sheet ?? null}
                    zips26={zips26}
                    zips27={zips27}
                    zips28={zips28}
                  />
                )
              })}
          </div>
        )}
      </section>
    </div>
  )
}

// ============================================================
// Deal sheet card
// ============================================================

function DealSheetCard({
  row, tier, weakest, sheet, zips26, zips27, zips28,
}: {
  row: LeagueStanding
  tier: { label: string; cls: string }
  weakest: { cat: string; pts: number }[]
  sheet: DealSheet | null
  zips26: ZipsYearMaps
  zips27: ZipsYearMaps
  zips28: ZipsYearMaps
}) {
  const isSeller = tier.label === 'Seller'
  const sends = sheet?.sends.slice(0, 6) ?? []
  const asks = sheet?.asks ?? []
  // A seller has no use for win-now roto — the rental-package suggestion only
  // makes sense for teams still chasing points.
  const sug = isSeller ? null : sheet?.suggestion ?? null
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">{row.team}</h3>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tier.cls}`}>{tier.label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          #{row.rank} · {row.points} pts · {row.recentDelta > 0 ? `+${row.recentDelta}` : row.recentDelta} recent · {row.gamesPlayed.toLocaleString()} GP
        </span>
        {sheet && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            RoS roto: #{sheet.rosRotoRank} · {sheet.rosRotoTotal} pts
          </span>
        )}
      </div>

      {weakest.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Weakest cats:</span>
          {weakest.map(w => (
            <span key={w.cat} className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
              {w.cat} · {w.pts}
            </span>
          ))}
        </div>
      )}

      {sheet && sheet.holes.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Lineup holes:</span>
          {sheet.holes.map(h => (
            <span key={h.slot + h.detail} className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {h.slot} — {h.detail}
            </span>
          ))}
        </div>
      )}

      {/* Suggested deal */}
      {sug ? (
        <div className="mt-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-blue-600 dark:text-blue-400">Suggested deal</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {sug.sends.map(s => s.player.name).join(' + ')}
            </span>
            <span className="text-gray-400">⇄</span>
            <span className="font-medium text-gray-900 dark:text-white">{sug.ask.player.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600 dark:text-gray-300">
            <span>They: <DeltaCell v={sug.buyerNet} /> roto now</span>
            <span>We: <DeltaCell v={sug.ourRotoDelta} /> roto now</span>
            <span>
              HKB net{' '}
              <span className={`font-bold tabular-nums ${sug.hkbNet > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {sug.hkbNet > 0 ? `+${sug.hkbNet}` : sug.hkbNet}
              </span>
              {sug.ask.player.hkbRank && <span className="text-gray-400"> (they send HKB #{sug.ask.player.hkbRank})</span>}
            </span>
          </div>
        </div>
      ) : sheet && isSeller ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Seller — win-now sends have little value here; their asks are listed for reference (prospect-for-prospect only).
        </p>
      ) : sheet ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          No balanced package: no listed ask is both covered win-now and affordable in HKB terms by what our sends add.
        </p>
      ) : (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No RoS roster data for this franchise.</p>
      )}

      {/* We send */}
      {sends.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">We send — by roto gain to their lineup</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 text-xs">
                <th className="py-1 pr-3">Player</th>
                <th className="py-1 pr-3">Pos</th>
                <th className="py-1 pr-3 text-right">Age</th>
                <th className="py-1 pr-3">Contract</th>
                <th className="py-1 pr-3 text-right">RoS FPTS</th>
                <th className="py-1 pr-3 text-right">Their Δ</th>
                <th className="py-1 pr-3">Starts at</th>
                <th className="py-1 pr-3">Displaces</th>
                <th className="py-1 pr-3 text-right">Our cost</th>
              </tr>
            </thead>
            <tbody>
              {sends.map((s: SendCandidate) => (
                <tr key={s.player.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{s.player.name}</td>
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{s.player.position}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{s.player.age ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{sendContract(s.player)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{s.player.zipsRosProjection ? s.player.zipsRosProjection.fpts.toFixed(0) : '—'}</td>
                  <td className="py-1.5 pr-3 text-right"><DeltaCell v={s.deltaToThem} /></td>
                  <td className="py-1.5 pr-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {s.startsAt ? s.startsAt.replace(/^P\d+$/, 'P') : "doesn't start"}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {s.startsAt ? (s.replaces ?? '(fills empty slot)') : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-right"><DeltaCell v={-s.ourCost} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* We ask — HKB first, then RoS */}
      {asks.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">We ask — their controlled assets by HKB value</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 text-xs">
                <th className="py-1 pr-3">Player</th>
                <th className="py-1 pr-3">Pos</th>
                <th className="py-1 pr-3 text-right">Age</th>
                <th className="py-1 pr-3 text-right">HKB Rk</th>
                <th className="py-1 pr-3 text-right">HKB Val</th>
                <th className="py-1 pr-3">Prospect</th>
                <th className="py-1 pr-3 text-right">RoS FPTS</th>
                <th className="py-1 pr-3">3-yr ’26→’28</th>
                <th className="py-1 pr-3">Contract</th>
                <th className="py-1 pr-3 text-right">Cost to them</th>
              </tr>
            </thead>
            <tbody>
              {asks.map((a: AskCandidate) => {
                const badge = askBadge(a.player)
                return (
                  <tr key={a.player.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{a.player.name}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{a.player.position}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{a.player.age ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.player.hkbRank ? `#${a.player.hkbRank}` : '—'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-gray-900 dark:text-white">{a.player.hkbValue ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {a.player.fvGrade ? `FV ${a.player.fvGrade} · FG #${a.player.fvRank}${a.player.fvETA ? ` · ETA ${a.player.fvETA}` : ''}` : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {a.player.zipsRosProjection ? a.player.zipsRosProjection.fpts.toFixed(0) : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">
                      <OutlookCell o={threeYearOutlook(a.player.name, zips26, zips27, zips28)} />
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${BADGE_CLS[badge.tone]}`}>{badge.text}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {a.costToThem === 0
                        ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">free now</span>
                        : <DeltaCell v={-a.costToThem} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
