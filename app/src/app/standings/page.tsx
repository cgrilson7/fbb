'use client'

import { usePlayerStore } from '@/lib/store'
import { useMemo, useState } from 'react'
import type { ZipsBatter, ZipsPitcher } from '@/types'

type ProjSource = 'zips' | 'zipsDc'

interface FranchiseStats {
  franchise: string
  shortCode: string
  // Batting counting
  hr: number
  rbi: number
  r: number
  sb: number
  // Batting components for rate calc
  ab: number
  h: number
  bb: number
  hbp: number
  sf: number
  singles: number
  doubles: number
  triples: number
  // Pitching counting
  k: number
  qs: number
  sv: number
  hld: number
  // Pitching components for rate calc
  ip: number
  er: number
  hAllowed: number
  bbPitching: number
  // Computed rates
  avg: number
  obp: number
  slg: number
  era: number
  bb9: number
  hip: number
}

interface FranchiseRow extends FranchiseStats {
  points: Record<string, number>
  totalPoints: number
}

const BATTING_CATS = ['hr', 'rbi', 'r', 'sb', 'avg', 'obp', 'slg'] as const
const PITCHING_CATS = ['k', 'qs', 'sv', 'hld', 'era', 'bb9', 'hip'] as const
const ALL_CATS = [...BATTING_CATS, ...PITCHING_CATS] as const
const LOWER_IS_BETTER = new Set(['era', 'bb9', 'hip'])

const CAT_LABELS: Record<string, string> = {
  hr: 'HR', rbi: 'RBI', r: 'R', sb: 'SB', avg: 'AVG', obp: 'OBP', slg: 'SLG',
  k: 'K', qs: 'QS', sv: 'SV', hld: 'HLD', era: 'ERA', bb9: 'BB/9', hip: 'H/IP',
}

function formatStat(cat: string, value: number): string {
  if (['avg', 'obp', 'slg'].includes(cat)) return value.toFixed(3)
  if (['era', 'bb9', 'hip'].includes(cat)) return value.toFixed(2)
  return Math.round(value).toLocaleString()
}

export default function StandingsPage() {
  const [projSource, setProjSource] = useState<ProjSource>('zipsDc')
  const {
    players, franchiseMappings,
    zipsBatters, zipsPitchers, zipsDcBatters, zipsDcPitchers,
  } = usePlayerStore()

  const rows = useMemo(() => {
    const batters: ZipsBatter[] = projSource === 'zipsDc' ? zipsDcBatters : zipsBatters
    const pitchers: ZipsPitcher[] = projSource === 'zipsDc' ? zipsDcPitchers : zipsPitchers

    const batterMap = new Map<string, ZipsBatter>()
    batters.forEach(b => batterMap.set(b.normalizedName, b))
    const pitcherMap = new Map<string, ZipsPitcher>()
    pitchers.forEach(p => pitcherMap.set(p.normalizedName, p))

    // Group rostered players by franchise
    const franchisePlayers = new Map<string, string[]>() // shortCode -> normalizedNames
    const franchiseNameMap = new Map<string, string>()
    franchiseMappings.forEach(m => franchiseNameMap.set(m.shortCode, m.fullName))

    for (const p of players) {
      if (p.status === 'FA' || p.isWaiver || p.status === '') continue
      const code = p.status
      if (code === 'FA') continue
      if (!franchisePlayers.has(code)) franchisePlayers.set(code, [])
      franchisePlayers.get(code)!.push(p.normalizedName)
    }

    // Aggregate per franchise
    const stats: FranchiseStats[] = []
    for (const [shortCode, names] of franchisePlayers) {
      const fullName = franchiseNameMap.get(shortCode) || shortCode
      if (fullName === 'Free Agent') continue

      const s: FranchiseStats = {
        franchise: fullName, shortCode,
        hr: 0, rbi: 0, r: 0, sb: 0,
        ab: 0, h: 0, bb: 0, hbp: 0, sf: 0, singles: 0, doubles: 0, triples: 0,
        k: 0, qs: 0, sv: 0, hld: 0,
        ip: 0, er: 0, hAllowed: 0, bbPitching: 0,
        avg: 0, obp: 0, slg: 0, era: 0, bb9: 0, hip: 0,
      }

      const seen = new Set<string>()
      for (const nn of names) {
        if (seen.has(nn)) continue
        seen.add(nn)

        // Check BOTH batter and pitcher for each player (handles Ohtani)
        const bat = batterMap.get(nn)
        if (bat) {
          s.hr += bat.hr; s.rbi += bat.rbi; s.r += bat.r; s.sb += bat.sb
          s.ab += bat.ab; s.h += bat.h; s.bb += bat.bb
          s.hbp += bat.hbp; s.sf += bat.sf
          s.singles += bat.singles; s.doubles += bat.doubles; s.triples += bat.triples
        }

        const pit = pitcherMap.get(nn)
        if (pit) {
          s.k += pit.k; s.qs += pit.qs; s.sv += pit.sv; s.hld += pit.hld
          s.ip += pit.ip; s.er += pit.er; s.hAllowed += pit.h; s.bbPitching += pit.bb
        }
      }

      // Compute rate stats
      s.avg = s.ab > 0 ? s.h / s.ab : 0
      s.obp = (s.ab + s.bb + s.hbp + s.sf) > 0
        ? (s.h + s.bb + s.hbp) / (s.ab + s.bb + s.hbp + s.sf)
        : 0
      const tb = s.singles + 2 * s.doubles + 3 * s.triples + 4 * s.hr
      s.slg = s.ab > 0 ? tb / s.ab : 0
      s.era = s.ip > 0 ? 9 * s.er / s.ip : 0
      s.bb9 = s.ip > 0 ? 9 * s.bbPitching / s.ip : 0
      s.hip = s.ip > 0 ? s.hAllowed / s.ip : 0

      stats.push(s)
    }

    // Rank and assign points
    const numTeams = stats.length
    const result: FranchiseRow[] = stats.map(s => ({
      ...s,
      points: {} as Record<string, number>,
      totalPoints: 0,
    }))

    for (const cat of ALL_CATS) {
      // Sort franchises by this category
      const sorted = [...result].sort((a, b) => {
        const aVal = a[cat as keyof FranchiseStats] as number
        const bVal = b[cat as keyof FranchiseStats] as number
        return LOWER_IS_BETTER.has(cat) ? aVal - bVal : bVal - aVal
      })

      // Assign points with tie-splitting
      let rank = 0
      let i = 0
      while (i < sorted.length) {
        let j = i
        while (j < sorted.length && (sorted[j][cat as keyof FranchiseStats] as number) === (sorted[i][cat as keyof FranchiseStats] as number)) {
          j++
        }
        // Positions i..j-1 are tied; points for these positions are numTeams-i, numTeams-i-1, ..., numTeams-j+1
        let totalPts = 0
        for (let k = i; k < j; k++) {
          totalPts += numTeams - k
        }
        const avgPts = totalPts / (j - i)
        for (let k = i; k < j; k++) {
          const row = result.find(r => r.shortCode === sorted[k].shortCode)!
          row.points[cat] = avgPts
        }
        i = j
      }
    }

    // Sum total points
    for (const row of result) {
      row.totalPoints = Object.values(row.points).reduce((sum, p) => sum + p, 0)
    }

    // Sort by total points descending
    result.sort((a, b) => b.totalPoints - a.totalPoints)
    return result
  }, [players, franchiseMappings, zipsBatters, zipsPitchers, zipsDcBatters, zipsDcPitchers, projSource])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Projected Standings
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Projection:</span>
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => setProjSource('zips')}
              className={`px-3 py-1.5 text-sm font-medium rounded-l-md border ${
                projSource === 'zips'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              ZiPS
            </button>
            <button
              onClick={() => setProjSource('zipsDc')}
              className={`px-3 py-1.5 text-sm font-medium rounded-r-md border-t border-b border-r ${
                projSource === 'zipsDc'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              ZiPS DC
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="sticky left-0 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Rank
              </th>
              <th className="sticky left-10 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Franchise
              </th>
              {ALL_CATS.map(cat => (
                <th key={cat} className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">
                  {CAT_LABELS[cat]}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isCG = row.shortCode === 'C&G'
              return (
                <tr
                  key={row.shortCode}
                  className={`border-b border-gray-100 dark:border-gray-800 ${
                    isCG
                      ? 'bg-blue-50 dark:bg-blue-900/30 font-medium'
                      : idx % 2 === 0
                        ? 'bg-white dark:bg-gray-900'
                        : 'bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  <td className="sticky left-0 px-3 py-2 text-gray-600 dark:text-gray-400 bg-inherit">
                    {idx + 1}
                  </td>
                  <td className={`sticky left-10 px-3 py-2 bg-inherit whitespace-nowrap ${
                    isCG ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {row.franchise}
                  </td>
                  {ALL_CATS.map(cat => {
                    const val = row[cat as keyof FranchiseStats] as number
                    const pts = row.points[cat] || 0
                    return (
                      <td key={cat} className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        <div>{formatStat(cat, val)}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{pts % 1 === 0 ? pts : pts.toFixed(1)} pts</div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100">
                    {row.totalPoints % 1 === 0 ? row.totalPoints : row.totalPoints.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No roster data available. Upload player and projection files first.
        </div>
      )}
    </div>
  )
}
