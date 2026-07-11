'use client'

import { usePlayerStore } from '@/lib/store'
import { normalize } from '@/lib/normalize'
import { useMemo } from 'react'
import type { Player, SalaryEntry, FVRanking, LeagueStanding, ZipsBatter, ZipsPitcher } from '@/types'

// ============================================================
// League identity mapping
// Fantrax standings use team names; all.csv uses status codes;
// salaries.csv uses owner names. Verified via roster evidence
// (e.g. Elly De La Cruz: status ELLY, salaries "Dustin Hart & Max Wamp").
// ============================================================

const OUR_CODE = 'C&G'
const OUR_SALARY_FRANCHISE = 'Colin Wilson & Greg Holmes'
const SEASON_START = new Date(2026, 2, 20) // acquisitions after this = in-season pickups (Section 4.6: 1-year deals)

const TEAM_INFO: Record<string, { code: string; salaryFranchise: string }> = {
  'Bionic Big Boys': { code: 'B&A', salaryFranchise: 'Ben Brody & Aaron' },
  'J.D. Barnett': { code: 'JD', salaryFranchise: 'JD Barnett' },
  'Ellygal Immigrants': { code: 'ELLY', salaryFranchise: 'Dustin Hart & Max Wamp' },
  'Tyler': { code: 'T', salaryFranchise: 'Tyler Hart' },
  'Zack': { code: 'Zack', salaryFranchise: 'Zack Semler' },
  'Steve Cornish': { code: 'Steve', salaryFranchise: 'Steve Cornish' },
  'Ross & Jack': { code: 'R&J', salaryFranchise: 'Ross & Jack Kantor' },
  'Colin & Greg': { code: 'C&G', salaryFranchise: OUR_SALARY_FRANCHISE },
  'E.T. Phone Holmes': { code: 'J&A', salaryFranchise: 'Jake Zuckman & Andrew Meyers' },
  'Max Mastbaum & co': { code: 'Max', salaryFranchise: 'Max, Jake & Sam' },
  'Kai Nelson': { code: 'Kai', salaryFranchise: 'Kai Nelson' },
  'Brian Frederick': { code: 'Brian', salaryFranchise: 'Brian Frederick' },
  'Brenden': { code: 'Brenden', salaryFranchise: 'Brenden Freedman' },
  'Ethan Gobetz': { code: 'Ethan', salaryFranchise: 'Ethan Gobetz' },
}

const TIERS: Record<string, { label: string; cls: string }> = {
  'Bionic Big Boys': { label: 'Buyer', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  'J.D. Barnett': { label: 'Buyer', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  'Ellygal Immigrants': { label: 'Buyer', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  'Tyler': { label: 'Buyer', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  'Zack': { label: 'Aggressive buyer', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  'Steve Cornish': { label: 'Aggressive buyer', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  'Ross & Jack': { label: 'Bubble buyer', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  'Colin & Greg': { label: 'Seller (us)', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  'E.T. Phone Holmes': { label: 'Seller (rival)', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  'Max Mastbaum & co': { label: 'Seller (rival)', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  'Kai Nelson': { label: 'Seller', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  'Brian Frederick': { label: 'Seller', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  'Brenden': { label: 'Seller', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  'Ethan Gobetz': { label: 'Seller', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
}

const SCORED_CATS = ['R', 'HR', 'RBI', 'SB', 'AVG', 'OBP', 'SLG', 'K', 'QS', 'SV', 'HLD', 'ERA', 'BB/9', 'H/IP']

// ============================================================
// Deal sheets — narrative from the July '26 seller analysis.
// Target contract status is resolved LIVE from salaries.csv /
// all.csv / fv_rankings.csv, so a stale target auto-flags red.
// ============================================================

interface BuyerPlan {
  team: string
  headline: string
  rationale: string
  positionNeeds: string
  send: string
  targets: { name: string; note: string }[]
}

const BUYER_PLANS: BuyerPlan[] = [
  {
    team: 'Steve Cornish',
    headline: 'Our best trade partner',
    rationale:
      'Elite rates on both sides (ERA / BB9 / H-IP, AVG / OBP) but last-tier volume — bottom three in HR, R, RBI and K with ~170 games in hand vs the league average. Every counting-stat bat or innings arm we send gets amplified by the games he has left to play.',
    positionNeeds: '2B is literally empty; OF production (Happ & Teoscar in down years, Acuña ranked #250); strikeout innings behind Wheeler.',
    send: 'Semien + Pasquantino, sweetened with Raley or Merrill Kelly',
    targets: [
      { name: 'Walker Jenkins', note: 'The prize — AAA CF, ETA 2026' },
      { name: 'Cade Horton', note: 'Young MLB arm, strong alternate' },
      { name: 'Colson Montgomery', note: 'Controlled long-term but $23M/yr — only if we want the bat that badly' },
      { name: 'Hagen Smith', note: 'Farm fallback' },
      { name: 'Charlie Condon', note: 'Farm fallback' },
      { name: 'Aiva Arquette', note: 'Farm fallback' },
    ],
  },
  {
    team: 'Ellygal Immigrants',
    headline: 'Biggest single hole on any contender',
    rationale:
      'The bullpen carries their ratios (HLD 14, H/IP 14, SV 13) but the rotation is Foster Griffin and prospects — QS 4 and K 5. Every real starter added swings two categories at once, so they should pay full freight for arms.',
    positionNeeds: 'Starting pitching above all; 3B (Durbin/Baty); corner-OF power (Stanton ranked #364).',
    send: 'Bregman + Will Warren (or Merrill Kelly)',
    targets: [
      { name: 'Carter Jensen', note: 'Buried in a 3-catcher glut behind Herrera & Hicks — catcher is our thinnest long-term spot' },
      { name: 'Brooks Lee', note: 'Cheapest controlled MLB bat on any buyer' },
      { name: 'Luke Keaschall', note: 'Young MLB 2B' },
      { name: 'Jakob Marsee', note: 'Young MLB CF' },
      { name: 'Kade Anderson', note: 'Farm arm' },
    ],
  },
  {
    team: 'Ross & Jack',
    headline: 'Motivated bubble team',
    rationale:
      'QS volume (12.5) but the innings are bad ones (ERA 3, H/IP 3), and the offense slugs nothing (SLG 4, HR 7) behind Soto and Tucker. Only 2.5 points ahead of us — the buyer most likely to overpay to stay alive.',
    positionNeeds: '3B (Andújar ranked #584); corner power; a ratio-safe reliever.',
    send: 'Bregman + Sheets (or Sewald)',
    targets: [
      { name: 'Harry Ford', note: 'MLB-ready C blocked behind Hunter Goodman — fills our catcher need' },
      { name: 'Justin Crawford', note: 'Young OF' },
      { name: 'Chandler Simpson', note: 'Young OF, elite speed' },
      { name: 'Angel Genao', note: 'Farm SS' },
      { name: 'JR Ritchie', note: 'Farm arm' },
      { name: 'Jaxon Wiggins', note: 'Farm arm' },
    ],
  },
  {
    team: 'Bionic Big Boys',
    headline: 'Leader buying insurance',
    rationale:
      'Offense is nearly maxed out (12s and 13s across the board), so all their upside is pitching: HLD 6.5, SV 8, K 8. They want ratio-safe relief that will not dent an ERA of 13 — exactly what our expiring arms are.',
    positionNeeds: 'Setup corps behind Hader/Weaver; catcher (only an aging Salvador Pérez); CF depth.',
    send: 'Sewald + Kerkering',
    targets: [
      { name: 'Cam Smith', note: 'The ask — their other young MLB bats (Carter, Winn) proved to be expiring' },
      { name: 'Jonah Tong', note: 'Farm arm, ETA now' },
      { name: 'Joe Mack', note: 'Farm C' },
      { name: 'Ryan Waldschmidt', note: 'Farm OF' },
      { name: 'Connelly Early', note: 'Young MLB arm on a cheap deal' },
    ],
  },
  {
    team: 'Tyler',
    headline: 'Most desperate, farm-only return',
    rationale:
      'Batting is literally capped (14s everywhere, SV 14 too) — 100% of his upside is starting pitching: ERA 2, BB/9 1, QS 5. Desperation is leverage for us, but his young MLB bats are expiring or expensive, so the return must come off the farm.',
    positionNeeds: 'Two starting pitchers; setup relief (HLD 5). No batting needs whatsoever.',
    send: 'Merrill Kelly + Will Warren + Kerkering',
    targets: [
      { name: 'Jett Williams', note: 'Farm MI/OF' },
      { name: 'Lazaro Montes', note: 'Farm power bat' },
      { name: 'Franklin Arias', note: 'Farm SS' },
      { name: 'Moises Ballesteros', note: 'Controlled but $16.1M/yr — only at a discount' },
    ],
  },
  {
    team: 'J.D. Barnett',
    headline: 'Clear buyer, weak return fit',
    rationale:
      'Elite offense plus K/SV, but every ratio category sits at 5 (ERA, BB/9, H/IP) — needs quality innings, not volume. Thin farm, and his one blocked young bat (Soderstrom) costs $20M/yr through 2032, so the realistic return is limited.',
    positionNeeds: 'Ratio-friendly SP/RP; SS (Tovar and Seager both cratering); AVG help.',
    send: 'Sewald (or Bregman)',
    targets: [
      { name: 'Jarlin Susana', note: 'Farm arm' },
      { name: 'Seth Hernandez', note: 'Farm arm, long ETA' },
      { name: 'Ezequiel Tovar', note: 'Cheap SS flier' },
    ],
  },
  {
    team: 'Zack',
    headline: 'Needs power and outfielders',
    rationale:
      'Young rotation front (Schlittler, Woo) with nothing behind it (ERA 4, QS 6.5), and the offense lacks pop: HR 8, RBI 9, SLG 9. His best outfielder is Jung Hoo Lee at #192 — the worst contender outfield in the league.',
    positionNeeds: 'Power OF; a veteran QS/ERA starter. SB 4 looks like a punt — no speed needed.',
    send: 'Raley + Sheets',
    targets: [
      { name: 'Kyson Witherspoon', note: 'Farm arm' },
      { name: 'Jurrangelo Cijntje', note: 'Farm arm' },
      { name: 'Alfredo Duno', note: 'Farm C, if he bites hard' },
    ],
  },
]

// Targets vetted and ruled out: their contracts also end in 2026 (or the price is a salary dump)
const RULED_OUT = [
  'Jackson Chourio (FA deal ends 2026)',
  'Evan Carter & Masyn Winn (YP deals expire 2026)',
  'Kyle Harrison, Angel Martínez, Daylen Lile (all end 2026)',
  'Tyler Soderstrom ($20M/yr through 2032 — a salary dump, not a prospect return)',
]

// ============================================================
// Live data resolution
// ============================================================

interface ResolvedTarget {
  name: string
  note: string
  position: string
  age: number | null
  rkOv: number | null
  fv: FVRanking | null
  badge: { text: string; tone: 'good' | 'ok' | 'dead' | 'unknown' }
}

// ------------------------------------------------------------
// 3-year outlook: real FanGraphs ZiPS projections for 2026, 2027
// and 2028, each normalized to a full season of playing time
// (FPTS/G × 150 for hitters; FPTS/IP × 175 for SP, × 65 for RP)
// so the trend reflects projected skill, not playing-time noise.
// ------------------------------------------------------------
interface ZipsYearMaps {
  bat: Map<string, ZipsBatter>
  pit: Map<string, ZipsPitcher>
}

function seasonRate(maps: ZipsYearMaps, key: string): number | null {
  const bat = maps.bat.get(key)
  if (bat && bat.fptsPerG > 0) return bat.fptsPerG * 150
  const pit = maps.pit.get(key)
  if (pit && pit.fptsPerIP > 0) return pit.fptsPerIP * (pit.gs > 5 ? 175 : 65)
  return null
}

interface ThreeYear {
  y26: number | null
  y27: number | null
  y28: number | null
}

function threeYearOutlook(name: string, y26m: ZipsYearMaps, y27m: ZipsYearMaps, y28m: ZipsYearMaps): ThreeYear | null {
  const key = normalize(name)
  const y26 = seasonRate(y26m, key)
  const y27 = seasonRate(y27m, key)
  const y28 = seasonRate(y28m, key)
  if (y26 === null && y27 === null && y28 === null) return null
  const r = (v: number | null) => (v === null ? null : Math.round(v))
  return { y26: r(y26), y27: r(y27), y28: r(y28) }
}

function OutlookCell({ o }: { o: ThreeYear | null }) {
  if (!o) return <span className="text-gray-400">—</span>
  const pct28 = o.y26 && o.y28 ? o.y28 / o.y26 : null
  const cls =
    pct28 !== null && pct28 < 0.8
      ? 'text-red-600 dark:text-red-400'
      : pct28 !== null && pct28 > 1.05
        ? 'text-green-600 dark:text-green-400'
        : 'text-gray-600 dark:text-gray-300'
  const f = (v: number | null) => (v === null ? '—' : v)
  return (
    <span className={`whitespace-nowrap ${cls}`}>
      {f(o.y26)} → {f(o.y27)} → {f(o.y28)}
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

function resolveTarget(
  spec: { name: string; note: string },
  buyerFranchise: string,
  buyerCode: string,
  salaryByName: Map<string, SalaryEntry[]>,
  playerByName: Map<string, Player>,
  fvByName: Map<string, FVRanking>
): ResolvedTarget {
  const key = normalize(spec.name)
  const player = playerByName.get(key) ?? null
  const fv = fvByName.get(key) ?? null
  const entries = salaryByName.get(key) ?? []
  const entry = entries.find(e => e.franchise === buyerFranchise) ?? entries[0] ?? null

  let badge: ResolvedTarget['badge']
  if (entry && /minors/i.test(entry.contractType)) {
    badge = { text: 'Farm — free', tone: 'good' }
  } else if (entry && /yp/i.test(entry.contractType)) {
    badge =
      entry.contractEnds >= 2027
        ? { text: `YP thru ${entry.contractEnds}`, tone: 'good' }
        : { text: 'YP expires 2026 — dead', tone: 'dead' }
  } else if (entry) {
    badge =
      entry.contractEnds >= 2027
        ? { text: `${fmtSalary(entry.salary)}/yr thru ${entry.contractEnds}`, tone: entry.salary >= 15_000_000 ? 'ok' : 'good' }
        : { text: 'Expiring 2026 — dead', tone: 'dead' }
  } else if (player && player.status === buyerCode) {
    badge = { text: 'Farm — free', tone: 'good' }
  } else {
    badge = { text: 'No contract data', tone: 'unknown' }
  }

  return {
    name: spec.name,
    note: spec.note,
    position: player?.position ?? fv?.position ?? '',
    age: player?.age ?? null,
    rkOv: player?.rkOv ?? null,
    fv,
    badge,
  }
}

const BADGE_CLS: Record<ResolvedTarget['badge']['tone'], string> = {
  good: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  ok: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  dead: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
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
  const { standings, players, salaries, fvRankings, zipsBatters, zipsPitchers, zips27Batters, zips27Pitchers, zips28Batters, zips28Pitchers } = usePlayerStore()

  const buildYearMaps = (bats: ZipsBatter[], pits: ZipsPitcher[]): ZipsYearMaps => {
    const bat = new Map<string, ZipsBatter>()
    bats.forEach(b => bat.set(b.normalizedName || normalize(b.name), b))
    const pit = new Map<string, ZipsPitcher>()
    pits.forEach(p => pit.set(p.normalizedName || normalize(p.name), p))
    return { bat, pit }
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

  const salaryByName = useMemo(() => {
    const m = new Map<string, SalaryEntry[]>()
    salaries.forEach(s => {
      const k = s.normalizedName || normalize(s.playerName)
      const arr = m.get(k) ?? []
      arr.push(s)
      m.set(k, arr)
    })
    return m
  }, [salaries])

  const fvByName = useMemo(() => {
    const m = new Map<string, FVRanking>()
    fvRankings.forEach(f => m.set(f.normalizedName || normalize(f.name), f))
    return m
  }, [fvRankings])

  const sorted = useMemo(
    () => [...standings].sort((a, b) => a.rank - b.rank),
    [standings]
  )
  const teamCount = sorted.length || 14
  const avgGP = sorted.length ? sorted.reduce((s, t) => s + t.gamesPlayed, 0) / sorted.length : 0
  const standingsByTeam = useMemo(() => {
    const m = new Map<string, LeagueStanding>()
    sorted.forEach(s => m.set(s.team, s))
    return m
  }, [sorted])

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

  // Near-term deals (ending 2027–28): not forced sales, but aging vets here are
  // payroll-shedding candidates. Trading avoids §4.8 dead cap entirely (dropping
  // costs 80% / 60% / 40% of AAV over three years).
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
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-4xl">
          We are <span className="font-semibold">sellers</span>. The plan: move players with <span className="font-semibold">no
          control after 2026</span> — expiring FA deals, final-year YP contracts, and every in-season pickup (all in-season
          contracts are 1-year, Constitution §4.6) — for <span className="font-semibold">young controlled MLB players or top
          prospects</span>. Beyond the rentals, aging vets on near-term deals (through 2027–28, e.g. Freeman) are
          payroll-shedding candidates. Contract badges below are resolved live from salaries.csv, all.csv and
          fv_rankings.csv: a red badge means the target’s contract also expires in 2026 and is worthless to acquire.
          3-yr outlook columns are real FanGraphs ZiPS 2026 / 2027 / 2028 projections, normalized to full-season playing time.
        </p>
      </div>

      {/* Standings heatmap */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Standings &amp; category points</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Cells are roto points per category (green = near the top of the category, red = near the bottom).
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
                const tier = TIERS[row.team]
                const isUs = TEAM_INFO[row.team]?.code === OUR_CODE
                return (
                  <tr key={row.team} className={`border-t border-gray-100 dark:border-gray-700 ${isUs ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                    <td className="py-1 pr-2 font-medium text-gray-900 dark:text-white">{row.rank}</td>
                    <td className="py-1 pr-2 whitespace-nowrap font-medium text-gray-900 dark:text-white">{row.team}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {tier && <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tier.cls}`}>{tier.label}</span>}
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
          Computed from salaries.csv: our contracts ending 2026 that are still on the roster per all.csv. In-season pickups
          (after {SEASON_START.toLocaleDateString()}) can never be kept regardless. There is zero reason to hold any of these
          past the deadline — even a marginal farm prospect back beats letting them walk in October.
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
                <th className="py-1 pr-3">3-yr outlook ’26→’28</th>
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
          Not forced sales, but every dollar and roster spot here has an opportunity cost. Aging vets (Freeman is the
          headline: elite AVG/OBP right now, but 36 with {fmtSalary(29_520_000)}/yr through 2028) are worth more to a
          contender today than they will ever be to us — and trading avoids the §4.8 dead-cap hit entirely (dropping costs
          80% / 60% / 40% of AAV over three years). Young core on this list is shown for completeness; keep unless blown away.
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
                <th className="py-1 pr-3">3-yr outlook ’26→’28</th>
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
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Freeman fits the buyers who need batting rates: J.D. Barnett (AVG 8) and Ross &amp; Jack (AVG 7, OBP 5) — both
          also need his cap-friendly production more than prospects they’d otherwise hoard. Injured arms (Burnes, Steele)
          can’t be moved at value — hold and revisit in the offseason. “Committed” = salary × seasons remaining including 2026.
        </p>
      </section>

      {/* Deal sheets */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Deal sheets — buyers in priority order</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-4xl">
          Weakest categories are computed from the standings; position needs and asks come from roster analysis (July 2026).
          Rival sellers to beat to market: E.T. Phone Holmes and Max Mastbaum &amp; co — Mastbaum’s Sale/Sánchez/Gilbert
          surplus competes directly with our pitching rentals.
        </p>
        <div className="space-y-4">
          {BUYER_PLANS.map(plan => {
            const info = TEAM_INFO[plan.team]
            const st = standingsByTeam.get(plan.team)
            const weakest = st
              ? SCORED_CATS
                  .map(c => ({ cat: c, pts: st.categoryPoints[c] }))
                  .filter((x): x is { cat: string; pts: number } => x.pts !== null && x.pts !== undefined)
                  .sort((a, b) => a.pts - b.pts)
                  .slice(0, 5)
              : []
            const targets = plan.targets.map(t =>
              resolveTarget(t, info.salaryFranchise, info.code, salaryByName, playerByName, fvByName)
            )
            return (
              <div key={plan.team} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{plan.team}</h3>
                  {st && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      #{st.rank} · {st.points} pts · {st.recentDelta > 0 ? `+${st.recentDelta}` : st.recentDelta} recent · {st.gamesPlayed.toLocaleString()} GP
                    </span>
                  )}
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{plan.headline}</span>
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

                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{plan.rationale}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">Position needs:</span> {plan.positionNeeds}
                </p>
                <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">
                  <span className="font-semibold">We send:</span> {plan.send}
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 text-xs">
                        <th className="py-1 pr-3">Ask</th>
                        <th className="py-1 pr-3">Pos</th>
                        <th className="py-1 pr-3 text-right">Age</th>
                        <th className="py-1 pr-3 text-right">Rank</th>
                        <th className="py-1 pr-3">Prospect</th>
                        <th className="py-1 pr-3">3-yr outlook ’26→’28</th>
                        <th className="py-1 pr-3">Contract</th>
                        <th className="py-1 pr-3">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map(t => (
                        <tr key={t.name} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{t.name}</td>
                          <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{t.position || '—'}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{t.age ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-600 dark:text-gray-300">{t.rkOv ? `#${t.rkOv}` : '—'}</td>
                          <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {t.fv ? `FV ${t.fv.fv} · FG #${t.fv.rank}${t.fv.eta ? ` · ETA ${t.fv.eta}` : ''}` : '—'}
                          </td>
                          <td className="py-1.5 pr-3 text-xs">
                            <OutlookCell o={threeYearOutlook(t.name, zips26, zips27, zips28)} />
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${BADGE_CLS[t.badge.tone]}`}>{t.badge.text}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300">{t.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Footnotes */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Vetted and ruled out</h2>
        <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
          {RULED_OUT.map(r => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Method: standings cells are Fantrax roto category points (rank-based), so margins within a category are not
          visible here — treat “gettable” categories as directional. Buyer/seller tiers, position needs and asks reflect
          the July 10, 2026 snapshot; contract badges re-resolve automatically whenever salaries.csv or all.csv are
          refreshed on the Upload page. 3-yr outlook = real FanGraphs ZiPS projections for 2026, 2027 and 2028 (zips_2027_*.csv /
          zips_2028_*.csv), each normalized to full-season playing time (FPTS/G × 150 for hitters, FPTS/IP × 175 for SP
          or × 65 for RP) so the trend reflects projected skill rather than playing-time assumptions. “—” = not projected
          that year.
        </p>
      </section>
    </div>
  )
}
