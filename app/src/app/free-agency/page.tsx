'use client'

import { useState, useMemo } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react'

type ViewMode = 'upcoming' | 'completed' | 'all'
type SortField = 'auctionDate' | 'playerName' | 'position' | 'team' | 'age' | 'hkbRank' | 'hkbValue' | 'zipsFpts' | 'zipsWar' | 'fwar2024' | 'projectedStat' | 'estimatedAAV' | 'actualAAV' | 'aavDiff'
type SortOrder = 'asc' | 'desc'

interface EnrichedFreeAgent {
  playerName: string
  auctionDate: string
  previousFranchise: string
  acquisitionDate: string
  fwar2024: number | null
  projectedStat: number | null
  isRFA: boolean
  hometownEligible: boolean
  winningFranchise: string
  winningContract: string
  otherBids: string
  // Joined from players
  position: string
  team: string
  age: number | null
  hkbRank: number | null
  hkbValue: number | null
  zipsFpts: number | null
  zipsWar: number | null
  actualAAV: number | null
  contractYears: number | null
  estimatedAAV: number | null
  aavDiff: number | null
}

function parseContractAAV(contract: string): number | null {
  // "4 Years, $20,600,000 AAV" or "4 Years, $20,600,000 AAV (RFA)"
  const match = contract.match(/\$([0-9,]+)\s*AAV/)
  if (!match) return null
  return parseFloat(match[1].replace(/,/g, ''))
}

function parseContractYears(contract: string): number | null {
  const match = contract.match(/(\d+)\s*Years?/i)
  if (!match) return null
  return parseInt(match[1], 10)
}

interface FeatureDef {
  name: string
  extract: (e: EnrichedFreeAgent) => number | null
  log: boolean  // whether to log-transform the value
}

const ALL_FEATURES: FeatureDef[] = [
  { name: 'hkbValue', extract: e => e.hkbValue, log: true },
  { name: 'zipsWar', extract: e => e.zipsWar, log: false },
  { name: 'age', extract: e => e.age, log: false },
  { name: 'fwar2024', extract: e => e.fwar2024, log: false },
  { name: 'projectedStat', extract: e => e.projectedStat, log: false },
]

interface MultivarModel {
  coefficients: number[]  // [intercept, ...feature coefficients]
  features: FeatureDef[]
  r2: number
  n: number
}

function extractFeatureValues(entry: EnrichedFreeAgent, features: FeatureDef[]): number[] | null {
  const vals: number[] = []
  for (const f of features) {
    const raw = f.extract(entry)
    if (raw === null || raw === undefined || (f.log && raw <= 0)) return null
    vals.push(f.log ? Math.log(raw) : raw)
  }
  return vals
}

// Matrix helpers for OLS (small matrices only)
function matTranspose(m: number[][]): number[][] {
  const rows = m.length, cols = m[0].length
  const t: number[][] = Array.from({ length: cols }, () => new Array(rows))
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      t[j][i] = m[i][j]
  return t
}

function matMul(a: number[][], b: number[][]): number[][] {
  const rows = a.length, cols = b[0].length, inner = b.length
  const r: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      for (let k = 0; k < inner; k++)
        r[i][j] += a[i][k] * b[k][j]
  return r
}

function matInvert(matrix: number[][]): number[][] | null {
  const n = matrix.length
  // Augment with identity
  const aug: number[][] = matrix.map((row, i) => {
    const r = [...row]
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0)
    return r
  })
  // Gauss-Jordan elimination
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col
    for (let row = col + 1; row < n; row++)
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row
    if (Math.abs(aug[maxRow][col]) < 1e-12) return null
    ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
    const pivot = aug[col][col]
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = aug[row][col]
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j]
    }
  }
  return aug.map(row => row.slice(n))
}

function fitMultivarModel(entries: EnrichedFreeAgent[], featureSet?: FeatureDef[]): MultivarModel | null {
  const features = featureSet ? [...featureSet] : [...ALL_FEATURES]

  // Try with all features, drop last feature if too few complete cases
  while (features.length > 0) {
    const minSamples = Math.max(8, features.length + 2)
    const rows: { x: number[]; y: number }[] = []

    for (const e of entries) {
      if (!e.winningFranchise || !e.actualAAV || e.actualAAV <= 0) continue
      const vals = extractFeatureValues(e, features)
      if (!vals) continue
      rows.push({ x: vals, y: Math.log(e.actualAAV) })
    }

    if (rows.length >= minSamples) {
      // Build X matrix with intercept column
      const X = rows.map(r => [1, ...r.x])
      const y = rows.map(r => [r.y])
      const Xt = matTranspose(X)
      const XtX = matMul(Xt, X)
      const XtXinv = matInvert(XtX)
      if (!XtXinv) { features.pop(); continue }
      const Xty = matMul(Xt, y)
      const beta = matMul(XtXinv, Xty).map(r => r[0])

      // Compute R²
      const meanY = rows.reduce((s, r) => s + r.y, 0) / rows.length
      let ssTot = 0, ssRes = 0
      for (let i = 0; i < rows.length; i++) {
        const predicted = X[i].reduce((s, v, j) => s + v * beta[j], 0)
        ssRes += (rows[i].y - predicted) ** 2
        ssTot += (rows[i].y - meanY) ** 2
      }
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

      return { coefficients: beta, features: [...features], r2, n: rows.length }
    }

    features.pop()
  }

  return null
}

function predictWithModel(model: MultivarModel, entry: EnrichedFreeAgent): number | null {
  const vals = extractFeatureValues(entry, model.features)
  if (!vals) return null
  const x = [1, ...vals]
  const logAAV = x.reduce((s, v, i) => s + v * model.coefficients[i], 0)
  return Math.exp(logAAV)
}

function formatAAV(aav: number): string {
  if (aav >= 1_000_000) return `$${(aav / 1_000_000).toFixed(1)}M`
  if (aav >= 1_000) return `$${(aav / 1_000).toFixed(0)}K`
  return `$${aav.toFixed(0)}`
}

function parseAuctionDate(dateStr: string): Date {
  // Parse "M/D" format, assuming current year
  const parts = dateStr.split('/')
  if (parts.length === 2) {
    return new Date(2025, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10))
  }
  return new Date(dateStr)
}

const OUR_FRANCHISE = 'C&G'

export default function FreeAgencyPage() {
  const { freeAgentEntries, players } = usePlayerStore()
  const hasHydrated = useHydration()
  const [viewMode, setViewMode] = useState<ViewMode>('upcoming')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('auctionDate')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // Join free agent entries with player data, fit model, predict
  const { enrichedEntries, model, fallbackModel } = useMemo(() => {
    const playerMap = new Map(players.map(p => [p.normalizedName, p]))

    // First pass: enrich with player data + parse actual AAV
    const entries = freeAgentEntries.map(entry => {
      const player = playerMap.get(entry.normalizedName)
      return {
        playerName: entry.playerName,
        auctionDate: entry.auctionDate,
        previousFranchise: entry.previousFranchise,
        acquisitionDate: entry.acquisitionDate,
        fwar2024: entry.fwar2024,
        projectedStat: entry.projectedStat,
        isRFA: entry.isRFA,
        hometownEligible: entry.hometownEligible,
        winningFranchise: entry.winningFranchise,
        winningContract: entry.winningContract,
        otherBids: entry.otherBids,
        position: player?.position || '',
        team: player?.team || '',
        age: player?.age ?? null,
        hkbRank: player?.hkbRank ?? null,
        hkbValue: player?.hkbValue ?? null,
        zipsFpts: player?.zipsProjection?.fpts ?? null,
        zipsWar: player?.zipsProjection?.war ?? null,
        actualAAV: parseContractAAV(entry.winningContract),
        contractYears: parseContractYears(entry.winningContract),
        estimatedAAV: null as number | null,
      } as EnrichedFreeAgent
    })

    // Fit multivariate model and HKB-value-only fallback
    const model = fitMultivarModel(entries)
    const fallbackModel = fitMultivarModel(entries, [ALL_FEATURES[0]])

    // Apply predictions: try main model first, fall back to simple model
    for (const entry of entries) {
      const pred = model ? predictWithModel(model, entry) : null
      entry.estimatedAAV = pred ?? (fallbackModel ? predictWithModel(fallbackModel, entry) : null)
      entry.aavDiff = (entry.actualAAV && entry.estimatedAAV)
        ? entry.actualAAV - entry.estimatedAAV
        : null
    }

    return { enrichedEntries: entries, model, fallbackModel }
  }, [freeAgentEntries, players])

  // Split into upcoming vs completed
  const upcomingCount = enrichedEntries.filter(e => !e.winningFranchise).length
  const completedCount = enrichedEntries.filter(e => !!e.winningFranchise).length

  // Filter and sort
  const filteredEntries = useMemo(() => {
    let result = [...enrichedEntries]

    // View mode filter
    if (viewMode === 'upcoming') {
      result = result.filter(e => !e.winningFranchise)
    } else if (viewMode === 'completed') {
      result = result.filter(e => !!e.winningFranchise)
    }

    // Search filter
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(e =>
        e.playerName.toLowerCase().includes(lower) ||
        e.team.toLowerCase().includes(lower) ||
        e.position.toLowerCase().includes(lower)
      )
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number | null
      let bVal: string | number | null

      if (sortField === 'auctionDate') {
        aVal = parseAuctionDate(a.auctionDate).getTime()
        bVal = parseAuctionDate(b.auctionDate).getTime()
      } else {
        aVal = a[sortField] as string | number | null
        bVal = b[sortField] as string | number | null
      }

      if (aVal === null || aVal === undefined) aVal = sortOrder === 'asc' ? Infinity : -Infinity
      if (bVal === null || bVal === undefined) bVal = sortOrder === 'asc' ? Infinity : -Infinity

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      return sortOrder === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })

    return result
  }, [enrichedEntries, viewMode, search, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder(field === 'hkbRank' || field === 'auctionDate' ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc'
      ? <ChevronUp className="w-4 h-4 inline ml-1" />
      : <ChevronDown className="w-4 h-4 inline ml-1" />
  }

  const getRowColor = (entry: EnrichedFreeAgent) => {
    const isOurs = entry.winningFranchise === OUR_FRANCHISE ||
      entry.otherBids.includes(OUR_FRANCHISE) ||
      entry.previousFranchise === OUR_FRANCHISE
    if (isOurs) return 'bg-blue-50 dark:bg-blue-900/20'
    if (!entry.winningFranchise) return 'bg-amber-50 dark:bg-amber-900/10'
    return ''
  }

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  if (freeAgentEntries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No free agency data loaded. Go to Upload page to load free_agency.csv.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Free Agency Auctions
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filteredEntries.length} players
        </span>
      </div>

      {/* View toggle + search */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* View mode buttons */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {([
              { mode: 'upcoming' as ViewMode, label: 'Upcoming', count: upcomingCount },
              { mode: 'completed' as ViewMode, label: 'Completed', count: completedCount },
              { mode: 'all' as ViewMode, label: 'All', count: enrichedEntries.length },
            ]).map(({ mode, label, count }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, team, position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {search && (
            <button
              onClick={() => setSearch('')}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Model summary */}
      {model && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-sm space-y-1">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="font-medium text-indigo-800 dark:text-indigo-300">
              AAV Model ({model.features.length} features)
            </span>
            <span className="text-indigo-600 dark:text-indigo-400">
              R² = {model.r2.toFixed(3)}
            </span>
            <span className="text-indigo-600 dark:text-indigo-400">
              n = {model.n} completed auctions
            </span>
          </div>
          <div className="text-indigo-600 dark:text-indigo-400 text-xs">
            log(AAV) = {model.coefficients[0] >= 0 ? '' : '−'}{Math.abs(model.coefficients[0]).toFixed(2)}
            {model.features.map((f, i) => {
              const coef = model.coefficients[i + 1]
              const sign = coef >= 0 ? ' + ' : ' − '
              const label = f.log ? `log(${f.name})` : f.name
              return <span key={f.name}>{sign}{Math.abs(coef).toFixed(3)}*{label}</span>
            })}
          </div>
          <div className="text-indigo-500 dark:text-indigo-500 text-xs">
            Est. AAV color: <span className="text-blue-600 font-medium">prediction</span> |
            <span className="text-green-600"> within 25%</span> |
            <span className="text-amber-600"> under</span> |
            <span className="text-red-600"> over</span> actual
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {([
                  { field: 'auctionDate' as SortField, label: 'Date' },
                  { field: 'playerName' as SortField, label: 'Player' },
                  { field: 'position' as SortField, label: 'Pos' },
                  { field: 'team' as SortField, label: 'Team' },
                  { field: 'age' as SortField, label: 'Age' },
                  { field: 'hkbRank' as SortField, label: 'HKB Rk' },
                  { field: 'hkbValue' as SortField, label: 'HKB Val' },
                  { field: 'zipsFpts' as SortField, label: 'ZiPS FPTS' },
                  { field: 'zipsWar' as SortField, label: 'ZiPS WAR' },
                  { field: 'fwar2024' as SortField, label: '\'24 fWAR' },
                  { field: 'projectedStat' as SortField, label: 'wRC+/FIP-' },
                  { field: 'actualAAV' as SortField, label: 'AAV' },
                  { field: 'estimatedAAV' as SortField, label: 'Est. AAV' },
                  { field: 'aavDiff' as SortField, label: 'Diff' },
                ]).map(({ field, label }) => (
                  <th
                    key={field}
                    className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                    onClick={() => handleSort(field)}
                  >
                    {label} <SortIcon field={field} />
                  </th>
                ))}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Info
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Previous
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Winner
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contract
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredEntries.map((entry, idx) => (
                <tr
                  key={`${entry.playerName}-${idx}`}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${getRowColor(entry)}`}
                >
                  <td className="px-3 py-2 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                    {entry.auctionDate}
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {entry.playerName}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.position || '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.team || '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.age ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.hkbRank ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.hkbValue?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.zipsFpts?.toFixed(0) ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.zipsWar?.toFixed(1) ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.fwar2024?.toFixed(1) ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {entry.projectedStat ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {entry.actualAAV ? formatAAV(entry.actualAAV) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-sm whitespace-nowrap ${
                    entry.estimatedAAV && entry.actualAAV
                      ? Math.abs(entry.estimatedAAV - entry.actualAAV) / entry.actualAAV < 0.25
                        ? 'text-green-600 dark:text-green-400'
                        : entry.estimatedAAV > entry.actualAAV
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                      : !entry.winningFranchise && entry.estimatedAAV
                      ? 'text-blue-600 dark:text-blue-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {entry.estimatedAAV ? formatAAV(entry.estimatedAAV) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-sm whitespace-nowrap font-medium ${
                    entry.aavDiff !== null
                      ? entry.aavDiff < 0
                        ? 'text-green-600 dark:text-green-400'
                        : entry.aavDiff > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-600 dark:text-gray-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {entry.aavDiff !== null
                      ? `${entry.aavDiff > 0 ? '+' : entry.aavDiff < 0 ? '-' : ''}${formatAAV(Math.abs(entry.aavDiff))}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <div className="flex gap-1">
                      {entry.isRFA && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100">
                          RFA
                        </span>
                      )}
                      {entry.hometownEligible && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-800 dark:text-teal-100">
                          HTD
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {entry.previousFranchise || '—'}
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    {entry.winningFranchise ? (
                      <span className={`font-medium ${
                        entry.winningFranchise === OUR_FRANCHISE
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {entry.winningFranchise}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 italic">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {entry.winningContract || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
