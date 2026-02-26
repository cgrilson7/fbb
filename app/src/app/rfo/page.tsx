'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { Search, ChevronUp, ChevronDown, X, Loader2, Check, ChevronRight, Trash2, SkipForward, FastForward } from 'lucide-react'
import { FixedSizeList as List } from 'react-window'
import type { Player, RfoDraftPick } from '@/types'

type PlayerType = 'all' | 'batter' | 'pitcher'
type SortField = 'hkbRank' | 'hkbValue' | 'name' | 'team' | 'position' | 'age' | 'warZ' | 'fptsZ' | 'hkbZ' | 'composite'
type SortOrder = 'asc' | 'desc'
type StatusFilter = 'all' | 'available' | 'drafted' | 'unavailable'
type ActiveTab = 'draft' | 'rfa' | 'results'

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 44

const ASC_NATURAL: Record<string, boolean> = {
  hkbRank: true, name: true, team: true, position: true, age: true,
}

// RFO Draft Level Structure (from 2026 RFO Draft sheet)
const RFO_LEVELS = [
  { level: 1, salary: 5_000_000, years: 2, order: 'A' as const, pickLimit: 3 },
  { level: 2, salary: 5_000_000, years: 1, order: 'B' as const, pickLimit: 3 },
  { level: 3, salary: 4_000_000, years: 2, order: 'A' as const, pickLimit: 3 },
  { level: 4, salary: 4_000_000, years: 1, order: 'B' as const, pickLimit: 3 },
  { level: 5, salary: 3_000_000, years: 2, order: 'A' as const, pickLimit: 3 },
  { level: 6, salary: 3_000_000, years: 1, order: 'B' as const, pickLimit: 3 },
  { level: 7, salary: 2_500_000, years: 1, order: 'A' as const, pickLimit: 3 },
  { level: 8, salary: 2_000_000, years: 1, order: 'B' as const, pickLimit: 3 },
  { level: 9, salary: 1_500_000, years: 1, order: 'A' as const, pickLimit: 3 },
  { level: 10, salary: 1_000_000, years: 1, order: 'B' as const, pickLimit: 3 },
  { level: 11, salary: 500_000, years: 1, order: 'A' as const, pickLimit: 5 },
]

// Order A: from 2026 RFO Draft sheet (with slot trades applied)
const ORDER_A = [
  'Max Mastbaum, Jake Mastbaum & Sam Elias',
  'Kai Nelson',
  'Dustin Hart & Max Wamp',
  'Colin Wilson & Greg Holmes',
  'Brenden Freedman',
  'Brian Frederick',
  'Zack Semler',
  'Steve Cornish',
  'Ethan Gobetz',
  'Ben Brody & Aaron',
  'JD Barnett',
  'Jake Zuckman & Andrew Meyers',
  'Ross & Jack Kantor',
  'Tyler Hart',
]

// Order B: from 2026 RFO Draft sheet
const ORDER_B = [
  'Colin Wilson & Greg Holmes',
  'Dustin Hart & Max Wamp',
  'Kai Nelson',
  'Max Mastbaum, Jake Mastbaum & Sam Elias',
  'Tyler Hart',
  'Ross & Jack Kantor',
  'Jake Zuckman & Andrew Meyers',
  'JD Barnett',
  'Ben Brody & Aaron',
  'Ethan Gobetz',
  'Steve Cornish',
  'Zack Semler',
  'Brian Frederick',
  'Brenden Freedman',
]

// RFA picks already declared (from 2026 RFO Draft sheet)
const RFA_DECLARATIONS: { playerName: string, franchise: string, rfaFrom: string, level: number }[] = [
  { playerName: 'Ezequiel Tovar', franchise: 'Brenden Freedman', rfaFrom: 'Brenden Freedman', level: 1 },
  { playerName: 'Ozzie Albies', franchise: 'Brian Frederick', rfaFrom: 'Ben Brody & Aaron', level: 1 },
  { playerName: 'Josh Jung', franchise: 'Zack Semler', rfaFrom: 'Zack Semler', level: 1 },
  { playerName: 'Trevor Megill', franchise: 'Steve Cornish', rfaFrom: 'Steve Cornish', level: 1 },
  { playerName: 'Kyle Finnegan', franchise: 'Steve Cornish', rfaFrom: 'Steve Cornish', level: 1 },
  { playerName: 'Andrew Abbott', franchise: 'Jake Zuckman & Andrew Meyers', rfaFrom: 'Jake Zuckman & Andrew Meyers', level: 1 },
  { playerName: 'Pete Fairbanks', franchise: 'Ross & Jack Kantor', rfaFrom: 'Ross & Jack Kantor', level: 1 },
  { playerName: 'Brandon Woodruff', franchise: 'Ross & Jack Kantor', rfaFrom: 'Ross & Jack Kantor', level: 1 },
  { playerName: 'Joe Musgrove', franchise: 'Ethan Gobetz', rfaFrom: 'Ethan Gobetz', level: 1 },
  { playerName: 'Yainer Diaz', franchise: 'JD Barnett', rfaFrom: 'JD Barnett', level: 1 },
  { playerName: 'Alec Bohm', franchise: 'Jake Zuckman & Andrew Meyers', rfaFrom: 'Jake Zuckman & Andrew Meyers', level: 1 },
]

// RFA declaration window is closed — no more RFA picks can be added
const RFA_WINDOW_CLOSED = true

// RFA capacity: 5 max per franchise per offseason (from 2026 RFO Draft sheet)
// Tracks how many RFA spots each franchise used in the blind auction (pre-RFO)
const RFA_USED: Record<string, number> = {
  'Max Mastbaum, Jake Mastbaum & Sam Elias': 0,
  'Kai Nelson': 0,
  'Dustin Hart & Max Wamp': 0,
  'Colin Wilson & Greg Holmes': 0,
  'Brenden Freedman': 1,
  'Brian Frederick': 2,
  'Zack Semler': 0,
  'Steve Cornish': 3,
  'Ethan Gobetz': 4,
  'Ben Brody & Aaron': 3,
  'JD Barnett': 3,
  'Jake Zuckman & Andrew Meyers': 0,
  'Ross & Jack Kantor': 3,
  'Tyler Hart': 3,
}
const RFA_MAX = 5

const CG_NAME = 'Colin Wilson & Greg Holmes'
const CURRENT_YEAR = 2026
const getSalaryCap = (year: number): number => 150_000_000 + (year - 2024) * 10_000_000

function formatSalary(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  return `$${(amount / 1_000).toFixed(0)}k`
}

interface ZScoreEntry {
  warZ: number | null
  fptsZ: number | null
  hkbZ: number | null
  composite: number | null
}

export default function RfoPage() {
  const {
    players, freeAgentEntries, salaries, franchiseMappings,
    rfoDraftPicks, rfoUnavailable, rfoDraftCursor,
    addRfoDraftPick, removeRfoDraftPick, toggleRfoUnavailable,
    setRfoDraftPicks, setRfoUnavailable, setRfoDraftCursor,
  } = usePlayerStore()
  const hasHydrated = useHydration()
  const [activeTab, setActiveTab] = useState<ActiveTab>('draft')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('composite')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [playerType, setPlayerType] = useState<PlayerType>('all')
  const [positionFilter, setPositionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('available')
  const [showDraftLog, setShowDraftLog] = useState(true)
  const [listHeight, setListHeight] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const available = window.innerHeight - rect.top - 24
        setListHeight(Math.max(300, available - HEADER_HEIGHT))
      }
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  const draftedSet = useMemo(() => new Set(rfoDraftPicks.map(p => p.normalizedName)), [rfoDraftPicks])
  const unavailableSet = useMemo(() => new Set(rfoUnavailable), [rfoUnavailable])

  const franchiseShortCodes = useMemo(() => {
    const map = new Map<string, string>()
    franchiseMappings.forEach(m => map.set(m.fullName, m.shortCode))
    return map
  }, [franchiseMappings])

  // For the RFO pool: only exclude players who were SIGNED in free agency (have a winning franchise)
  const signedInFA = useMemo(() => {
    return new Set(
      freeAgentEntries
        .filter(e => e.winningFranchise && e.winningFranchise.trim() !== '')
        .map(e => e.normalizedName)
    )
  }, [freeAgentEntries])

  const hasFreeAgencyData = freeAgentEntries.length > 0

  // RFA rights map for the draft board (unsigned players only)
  const rfaRightsMap = useMemo(() => {
    const map = new Map<string, { franchise: string, shortCode: string }>()
    freeAgentEntries.forEach(e => {
      if (!e.isRFA || !e.previousFranchise) return
      if (e.winningFranchise && e.winningFranchise.trim() !== '') return
      map.set(e.normalizedName, {
        franchise: e.previousFranchise,
        shortCode: franchiseShortCodes.get(e.previousFranchise) || e.previousFranchise,
      })
    })
    salaries.forEach(s => {
      if (map.has(s.normalizedName)) return
      if (signedInFA.has(s.normalizedName)) return
      if (s.contractEnds !== 2025 || s.contractStarts > 2025) return
      map.set(s.normalizedName, {
        franchise: s.franchise,
        shortCode: franchiseShortCodes.get(s.franchise) || s.franchise,
      })
    })
    return map
  }, [freeAgentEntries, salaries, franchiseShortCodes, signedInFA])

  // RFO Pool: available free agents minus those signed in free agency
  const poolPlayers = useMemo(() => {
    return players.filter(p => {
      if (!p.isAvailable) return false
      if (hasFreeAgencyData && signedInFA.has(p.normalizedName)) return false
      return true
    })
  }, [players, signedInFA, hasFreeAgencyData])

  // RFA trade targets
  interface RfaTarget {
    playerName: string
    normalizedName: string
    previousFranchise: string
    previousShortCode: string
    rfaRemaining: number
    player: Player
  }

  const underContract = useMemo(() => {
    const set = new Set<string>()
    salaries.forEach(s => {
      if (s.franchise && s.franchise.trim()) set.add(s.normalizedName)
    })
    return set
  }, [salaries])

  const shortCodeToFull = useMemo(() => {
    const map = new Map<string, string>()
    franchiseMappings.forEach(m => map.set(m.shortCode, m.fullName))
    return map
  }, [franchiseMappings])

  const rfaTargets = useMemo(() => {
    const targets: RfaTarget[] = []
    players.forEach(p => {
      if (p.isAvailable) return
      if (p.status === 'FA' || !p.status) return
      if (underContract.has(p.normalizedName)) return
      if (RFA_DECLARATIONS.some(d => d.playerName === p.name)) return

      const fullName = shortCodeToFull.get(p.status) || p.status
      if (fullName === CG_NAME) return

      const used = RFA_USED[fullName] ?? 0
      const remaining = RFA_MAX - used

      targets.push({
        playerName: p.name,
        normalizedName: p.normalizedName,
        previousFranchise: fullName,
        previousShortCode: p.status,
        rfaRemaining: remaining,
        player: p,
      })
    })
    targets.sort((a, b) => (a.player.hkbRank ?? 9999) - (b.player.hkbRank ?? 9999))
    return targets
  }, [players, underContract, shortCodeToFull])

  // RFA targets filtered
  const [rfaSearch, setRfaSearch] = useState('')
  const [rfaFranchiseFilter, setRfaFranchiseFilter] = useState('')
  const [rfaHasCapacity, setRfaHasCapacity] = useState(false)

  const filteredRfaTargets = useMemo(() => {
    let result = rfaTargets
    if (rfaSearch) {
      const lower = rfaSearch.toLowerCase()
      result = result.filter(t => t.playerName.toLowerCase().includes(lower) || t.player.team.toLowerCase().includes(lower))
    }
    if (rfaFranchiseFilter) {
      result = result.filter(t => t.previousFranchise === rfaFranchiseFilter)
    }
    if (rfaHasCapacity) {
      result = result.filter(t => t.rfaRemaining > 0)
    }
    return result
  }, [rfaTargets, rfaSearch, rfaFranchiseFilter, rfaHasCapacity])

  const rfaFranchises = useMemo(() => {
    const set = new Set<string>()
    rfaTargets.forEach(t => set.add(t.previousFranchise))
    return Array.from(set).sort()
  }, [rfaTargets])

  // --- Draft cursor logic ---
  const currentLevelConfig = useMemo(() =>
    RFO_LEVELS.find(l => l.level === rfoDraftCursor.level) || RFO_LEVELS[0],
    [rfoDraftCursor.level]
  )
  const currentOrder = currentLevelConfig.order === 'A' ? ORDER_A : ORDER_B
  const currentFranchise = currentOrder[rfoDraftCursor.pickIndex] || currentOrder[0]
  const isCGTurn = currentFranchise === CG_NAME

  const advanceCursor = useCallback(() => {
    const cursor = { ...rfoDraftCursor }
    cursor.pickIndex++
    if (cursor.pickIndex >= 14) {
      cursor.pickIndex = 0
      cursor.round++
      const levelConfig = RFO_LEVELS.find(l => l.level === cursor.level) || RFO_LEVELS[0]
      if (cursor.round > levelConfig.pickLimit) {
        // Move to next level
        const nextLevelIdx = RFO_LEVELS.findIndex(l => l.level === cursor.level) + 1
        if (nextLevelIdx < RFO_LEVELS.length) {
          cursor.level = RFO_LEVELS[nextLevelIdx].level
          cursor.round = 1
          cursor.pickIndex = 0
        }
      }
    }
    setRfoDraftCursor(cursor)
  }, [rfoDraftCursor, setRfoDraftCursor])

  const skipToNextRound = useCallback(() => {
    const cursor = { ...rfoDraftCursor }
    const levelConfig = RFO_LEVELS.find(l => l.level === cursor.level) || RFO_LEVELS[0]
    if (cursor.round >= levelConfig.pickLimit) {
      // Move to next level
      const nextLevelIdx = RFO_LEVELS.findIndex(l => l.level === cursor.level) + 1
      if (nextLevelIdx < RFO_LEVELS.length) {
        cursor.level = RFO_LEVELS[nextLevelIdx].level
        cursor.round = 1
        cursor.pickIndex = 0
      }
    } else {
      cursor.round++
      cursor.pickIndex = 0
    }
    setRfoDraftCursor(cursor)
  }, [rfoDraftCursor, setRfoDraftCursor])

  const skipPick = useCallback(() => {
    advanceCursor()
  }, [advanceCursor])

  const handleDraftPlayer = useCallback((player: Player) => {
    addRfoDraftPick({
      normalizedName: player.normalizedName,
      playerName: player.name,
      franchise: currentFranchise,
      level: rfoDraftCursor.level,
      round: rfoDraftCursor.round,
    })
    advanceCursor()
  }, [addRfoDraftPick, currentFranchise, rfoDraftCursor.level, rfoDraftCursor.round, advanceCursor])

  // --- Z-score computation ---
  const zScoreStats = useMemo(() => {
    const available = poolPlayers.filter(p => !draftedSet.has(p.normalizedName) && !unavailableSet.has(p.normalizedName))

    const warVals: number[] = []
    const fptsVals: number[] = []
    const hkbVals: number[] = []

    available.forEach(p => {
      if (p.zipsProjection?.war != null) warVals.push(p.zipsProjection.war)
      if (p.zipsProjection?.fpts != null) fptsVals.push(p.zipsProjection.fpts)
      if (p.hkbValue != null) hkbVals.push(p.hkbValue)
    })

    const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const stddev = (arr: number[], m: number) => {
      if (arr.length < 2) return 1
      return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length)
    }

    const warMean = mean(warVals)
    const fptsMean = mean(fptsVals)
    const hkbMean = mean(hkbVals)

    return {
      warMean, warStd: stddev(warVals, warMean),
      fptsMean, fptsStd: stddev(fptsVals, fptsMean),
      hkbMean, hkbStd: stddev(hkbVals, hkbMean),
    }
  }, [poolPlayers, draftedSet, unavailableSet])

  const zScoreMap = useMemo(() => {
    const map = new Map<string, ZScoreEntry>()
    const { warMean, warStd, fptsMean, fptsStd, hkbMean, hkbStd } = zScoreStats

    poolPlayers.forEach(p => {
      const warZ = p.zipsProjection?.war != null ? (p.zipsProjection.war - warMean) / warStd : null
      const fptsZ = p.zipsProjection?.fpts != null ? (p.zipsProjection.fpts - fptsMean) / fptsStd : null
      const hkbZ = p.hkbValue != null ? (p.hkbValue - hkbMean) / hkbStd : null

      const scores = [warZ, fptsZ, hkbZ].filter((v): v is number => v !== null)
      const composite = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

      map.set(p.normalizedName, { warZ, fptsZ, hkbZ, composite })
    })
    return map
  }, [poolPlayers, zScoreStats])

  const positions = useMemo(() => {
    const allPos = new Set<string>()
    poolPlayers.forEach(p => {
      p.position.split(',').forEach(pos => allPos.add(pos.trim()))
    })
    return Array.from(allPos).filter(Boolean).sort()
  }, [poolPlayers])

  const filteredPlayers = useMemo(() => {
    let result = [...poolPlayers]

    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.team.toLowerCase().includes(lower)
      )
    }

    if (playerType === 'batter') {
      result = result.filter(p => !p.zipsProjection || p.zipsProjection.type === 'batter')
    } else if (playerType === 'pitcher') {
      result = result.filter(p => !p.zipsProjection || p.zipsProjection.type === 'pitcher')
    }

    if (positionFilter) {
      result = result.filter(p =>
        p.position.split(',').some(pos => pos.trim() === positionFilter)
      )
    }

    if (statusFilter === 'available') {
      result = result.filter(p => !draftedSet.has(p.normalizedName) && !unavailableSet.has(p.normalizedName))
    } else if (statusFilter === 'drafted') {
      result = result.filter(p => draftedSet.has(p.normalizedName))
    } else if (statusFilter === 'unavailable') {
      result = result.filter(p => unavailableSet.has(p.normalizedName))
    }

    result.sort((a, b) => {
      // Z-score sort fields
      if (['warZ', 'fptsZ', 'hkbZ', 'composite'].includes(sortField)) {
        const aZ = zScoreMap.get(a.normalizedName)
        const bZ = zScoreMap.get(b.normalizedName)
        const aVal = aZ?.[sortField as keyof ZScoreEntry] ?? (sortOrder === 'asc' ? Infinity : -Infinity)
        const bVal = bZ?.[sortField as keyof ZScoreEntry] ?? (sortOrder === 'asc' ? Infinity : -Infinity)
        return sortOrder === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number)
      }

      let aVal: string | number | null = a[sortField as keyof Player] as string | number | null
      let bVal: string | number | null = b[sortField as keyof Player] as string | number | null

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
  }, [poolPlayers, search, sortField, sortOrder, playerType, positionFilter, statusFilter, draftedSet, unavailableSet, zScoreMap])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder(ASC_NATURAL[field] ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortOrder === 'asc'
      ? <ChevronUp className="w-4 h-4 inline ml-1" />
      : <ChevronDown className="w-4 h-4 inline ml-1" />
  }

  const clearFilters = () => {
    setSearch('')
    setPlayerType('all')
    setPositionFilter('')
    setStatusFilter('available')
  }

  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const clearAllStatuses = () => {
    setRfoDraftPicks([])
    setRfoUnavailable([])
    setRfoDraftCursor({ level: 1, round: 1, pickIndex: 0 })
    setShowResetConfirm(false)
  }

  // Draft log grouped by level + round
  const draftLogByLevelRound = useMemo(() => {
    const map = new Map<string, RfoDraftPick[]>()
    rfoDraftPicks.forEach(pick => {
      const key = `${pick.level}-${pick.round ?? 1}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(pick)
    })
    return map
  }, [rfoDraftPicks])

  // C&G picks summary
  const cgPicks = useMemo(() =>
    rfoDraftPicks.filter(p => p.franchise === CG_NAME),
    [rfoDraftPicks]
  )

  // Budget tracker: existing C&G salaries + RFO draft pick salaries
  const budgetByYear = useMemo(() => {
    const years = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2]
    return years.map(year => {
      // Existing salary obligations
      const existing = salaries
        .filter(s => s.franchise === CG_NAME)
        .reduce((sum, s) => sum + (s.salaryByYear[year] || 0), 0)

      // RFO draft pick salaries (C&G only)
      const rfoDraftSalary = cgPicks.reduce((sum, pick) => {
        const levelConfig = RFO_LEVELS.find(l => l.level === pick.level)
        if (!levelConfig) return sum
        const contractEnd = CURRENT_YEAR + levelConfig.years - 1
        if (year <= contractEnd) return sum + levelConfig.salary
        return sum
      }, 0)

      const total = existing + rfoDraftSalary
      const cap = getSalaryCap(year)
      return { year, existing, rfoDraftSalary, total, cap, pct: (total / cap) * 100 }
    })
  }, [salaries, cgPicks])

  // RFO Draft Results: players acquired on 2/25 or 2/26 of 2026 from salaries.csv
  const rfoResults = useMemo(() => {
    const isRfoDate = (dateStr: string): boolean => {
      if (!dateStr) return false
      const d = dateStr.trim()
      // Match: 2/25, 2/25/26, 2/25/2026, 2/26, 2/26/26, 2/26/2026
      return /^2\/2[56]$/.test(d) || /^2\/2[56]\/26$/.test(d) || /^2\/2[56]\/2026$/.test(d)
    }
    const rfoEntries = salaries.filter(s =>
      isRfoDate(s.acquisitionDate) && s.franchise
    )

    // Build a player lookup for HKB value and FPTS
    const playerMap = new Map(players.map(p => [p.normalizedName, p]))

    // Group by franchise
    const byFranchise = new Map<string, {
      playerName: string
      normalizedName: string
      salary: number
      contractLength: number
      hkbValue: number | null
      fpts: number | null
      position: string
      team: string
      age: number | null
    }[]>()

    rfoEntries.forEach(s => {
      if (!byFranchise.has(s.franchise)) byFranchise.set(s.franchise, [])
      const player = playerMap.get(s.normalizedName)
      byFranchise.get(s.franchise)!.push({
        playerName: s.playerName,
        normalizedName: s.normalizedName,
        salary: s.salary,
        contractLength: s.contractLength,
        hkbValue: player?.hkbValue ?? null,
        fpts: player?.zipsProjection?.fpts ?? null,
        position: player?.position ?? '—',
        team: player?.team ?? '—',
        age: player?.age ?? null,
      })
    })

    // Sort players within each franchise by salary descending
    byFranchise.forEach(picks => {
      picks.sort((a, b) => b.salary - a.salary)
    })

    // Sort franchises by total salary spent descending
    const sorted = Array.from(byFranchise.entries()).sort((a, b) => {
      const totalA = a[1].reduce((sum, p) => sum + p.salary, 0)
      const totalB = b[1].reduce((sum, p) => sum + p.salary, 0)
      return totalB - totalA
    })

    return sorted
  }, [salaries, players])

  const hasFilters = search || playerType !== 'all' || positionFilter || statusFilter !== 'available'

  const thClass = 'px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap'

  const zColor = (val: number | null) => {
    if (val === null) return 'text-gray-400 dark:text-gray-500'
    if (val >= 1.5) return 'text-green-700 dark:text-green-300 font-semibold'
    if (val >= 0.5) return 'text-green-600 dark:text-green-400'
    if (val > -0.5) return 'text-gray-600 dark:text-gray-400'
    if (val > -1.5) return 'text-red-500 dark:text-red-400'
    return 'text-red-700 dark:text-red-300 font-semibold'
  }

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const p = filteredPlayers[index]
    if (!p) return null
    const isDrafted = draftedSet.has(p.normalizedName)
    const isUnavailable = unavailableSet.has(p.normalizedName)
    const draftPick = rfoDraftPicks.find(pk => pk.normalizedName === p.normalizedName)
    const rfaRights = rfaRightsMap.get(p.normalizedName)
    const zScores = zScoreMap.get(p.normalizedName)

    const rowBg = isDrafted
      ? 'bg-green-50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-800'
      : isUnavailable
      ? 'bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800'
      : 'border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'

    const textClass = isUnavailable
      ? 'line-through text-red-400 dark:text-red-500'
      : isDrafted
      ? 'text-green-700 dark:text-green-300'
      : 'text-gray-600 dark:text-gray-400'

    const nameClass = isUnavailable
      ? 'line-through text-red-500 dark:text-red-400'
      : isDrafted
      ? 'text-green-800 dark:text-green-200 font-medium'
      : 'text-gray-900 dark:text-white font-medium'

    const isCGPick = draftPick?.franchise === CG_NAME

    return (
      <div style={style} className={`flex items-center ${rowBg}`}>
        {/* Action button - Check only */}
        <div className="w-[44px] min-w-[44px] px-1 flex items-center justify-center">
          <button
            onClick={() => isDrafted ? removeRfoDraftPick(p.normalizedName) : handleDraftPlayer(p)}
            className={`p-1 rounded transition-colors ${
              isDrafted
                ? 'bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-100'
                : isCGTurn
                ? 'bg-yellow-100 dark:bg-yellow-800 hover:bg-yellow-200 dark:hover:bg-yellow-700 text-yellow-700 dark:text-yellow-200 ring-2 ring-yellow-400'
                : 'hover:bg-green-100 dark:hover:bg-green-800 text-gray-400 hover:text-green-600'
            }`}
            title={isDrafted ? 'Undo draft' : `Draft for ${franchiseShortCodes.get(currentFranchise) || currentFranchise}`}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* HKB Rank */}
        <div className={`w-[55px] min-w-[55px] px-3 text-sm ${textClass}`}>
          {p.hkbRank ?? '—'}
        </div>
        {/* Name */}
        <div className={`flex-1 min-w-[150px] px-3 text-sm ${nameClass} truncate`}>
          {p.name}
          {draftPick && (
            <span className={`ml-2 text-[10px] ${isCGPick ? 'text-yellow-600 dark:text-yellow-400 font-bold' : 'text-green-600 dark:text-green-400'}`}>
              L{draftPick.level}R{draftPick.round ?? 1} → {franchiseShortCodes.get(draftPick.franchise) || draftPick.franchise}
            </span>
          )}
        </div>
        {/* RFA */}
        <div className="w-[70px] min-w-[70px] px-2">
          {rfaRights && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100">
              RFA {rfaRights.shortCode}
            </span>
          )}
        </div>
        {/* Position */}
        <div className={`w-[80px] min-w-[80px] px-3 text-sm ${textClass} truncate`}>{p.position}</div>
        {/* Team */}
        <div className={`w-[50px] min-w-[50px] px-3 text-sm ${textClass}`}>{p.team}</div>
        {/* Age */}
        <div className={`w-[45px] min-w-[45px] px-3 text-sm ${textClass}`}>{p.age ?? '—'}</div>
        {/* HKB Value */}
        <div className={`w-[60px] min-w-[60px] px-3 text-sm ${textClass}`}>{p.hkbValue?.toLocaleString() ?? '—'}</div>
        {/* ZiPS WAR */}
        <div className={`w-[55px] min-w-[55px] px-3 text-sm ${textClass}`}>
          {p.zipsProjection?.war?.toFixed(1) ?? '—'}
        </div>
        {/* ZiPS FPTS */}
        <div className={`w-[60px] min-w-[60px] px-3 text-sm ${textClass}`}>
          {p.zipsProjection?.fpts?.toFixed(0) ?? '—'}
        </div>
        {/* WAR-z */}
        <div className={`w-[55px] min-w-[55px] px-3 text-sm ${zColor(zScores?.warZ ?? null)}`}>
          {zScores?.warZ != null ? zScores.warZ.toFixed(2) : '—'}
        </div>
        {/* FPTS-z */}
        <div className={`w-[55px] min-w-[55px] px-3 text-sm ${zColor(zScores?.fptsZ ?? null)}`}>
          {zScores?.fptsZ != null ? zScores.fptsZ.toFixed(2) : '—'}
        </div>
        {/* HKB-z */}
        <div className={`w-[55px] min-w-[55px] px-3 text-sm ${zColor(zScores?.hkbZ ?? null)}`}>
          {zScores?.hkbZ != null ? zScores.hkbZ.toFixed(2) : '—'}
        </div>
        {/* Composite */}
        <div className={`w-[65px] min-w-[65px] px-3 text-sm font-medium ${zColor(zScores?.composite ?? null)}`}>
          {zScores?.composite != null ? zScores.composite.toFixed(2) : '—'}
        </div>
      </div>
    )
  }, [filteredPlayers, draftedSet, unavailableSet, rfoDraftPicks, rfaRightsMap, franchiseShortCodes, removeRfoDraftPick, handleDraftPlayer, isCGTurn, currentFranchise, zScoreMap])

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <p className="text-gray-500 dark:text-gray-400">Loading data...</p>
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No players loaded. Go to Upload page to load CSV files.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          RFO Draft
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {([
              { value: 'draft' as const, label: 'Live Draft Board' },
              { value: 'results' as const, label: 'Draft Results' },
              { value: 'rfa' as const, label: 'RFA Trade Targets' },
            ]).map(tab => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'rfa' && (
        <div className="space-y-4">
          {/* RFA Declarations from spreadsheet */}
          {RFA_DECLARATIONS.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                RFA Picks Already Declared for RFO
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {RFA_DECLARATIONS.map(d => (
                  <div key={d.playerName} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{d.playerName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        L{d.level} {formatSalary(RFO_LEVELS[d.level - 1]?.salary ?? 0)}/{RFO_LEVELS[d.level - 1]?.years ?? 1}yr
                        {' '}— {franchiseShortCodes.get(d.franchise) || d.franchise}
                        {d.rfaFrom !== d.franchise && <span className="text-purple-600 dark:text-purple-400"> (RFA from {franchiseShortCodes.get(d.rfaFrom) || d.rfaFrom})</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RFA Window Closed Banner */}
          {RFA_WINDOW_CLOSED && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-300 font-medium">
                RFA declaration window is closed. {RFA_DECLARATIONS.length} RFA picks have been locked in.
              </p>
            </div>
          )}

          {/* RFA Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search players..."
                  value={rfaSearch}
                  onChange={e => setRfaSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={rfaFranchiseFilter}
                onChange={e => setRfaFranchiseFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">All RFA franchises</option>
                {rfaFranchises.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rfaHasCapacity}
                  onChange={e => setRfaHasCapacity(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                Has RFA capacity
              </label>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {filteredRfaTargets.length} players
              </span>
            </div>
          </div>

          {/* RFA Capacity Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">RFA Capacity by Franchise</h3>
            <div className="flex flex-wrap gap-2">
              {ORDER_A.filter(f => f !== CG_NAME).map(f => {
                const used = RFA_USED[f] ?? 0
                const remaining = RFA_MAX - used
                return (
                  <div key={f} className={`px-2 py-1 rounded text-xs border ${
                    remaining > 0
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-800 dark:text-red-300'
                  }`}>
                    <span className="font-medium">{franchiseShortCodes.get(f) || f}</span>
                    <span className="ml-1">{remaining}/{RFA_MAX}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* RFA Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3">HKB Rk</th>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Previous Franchise</th>
                  <th className="px-4 py-3">RFA Capacity</th>
                  <th className="px-4 py-3">Pos</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">HKB Val</th>
                  <th className="px-4 py-3">ZiPS WAR</th>
                  <th className="px-4 py-3">ZiPS FPTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredRfaTargets.map(t => (
                  <tr key={t.normalizedName} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${t.rfaRemaining <= 0 ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.player.hkbRank ?? '—'}</td>
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{t.playerName}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-100">
                        {t.previousShortCode}
                      </span>
                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{t.previousFranchise}</span>
                    </td>
                    <td className="px-4 py-2">
                      {t.rfaRemaining > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                          {t.rfaRemaining} left
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100">
                          Full
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.player.position ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.player.team ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.player.age ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.player.hkbValue?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.player.zipsProjection?.war?.toFixed(1) ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{t.player.zipsProjection?.fpts?.toFixed(0) ?? '—'}</td>
                  </tr>
                ))}
                {filteredRfaTargets.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      {players.length === 0
                        ? 'No player data loaded. Upload all.csv and salaries.csv to see RFA targets.'
                        : 'No unsigned players found matching filters. These are players on a franchise roster but without an active contract.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'draft' && (
        <>
          {/* Current Pick Banner */}
          <div className={`rounded-lg shadow p-4 ${
            isCGTurn
              ? 'bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-400 dark:border-yellow-600'
              : 'bg-white dark:bg-gray-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    Level {rfoDraftCursor.level}, Round {rfoDraftCursor.round} — Pick {rfoDraftCursor.pickIndex + 1}/14
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {formatSalary(currentLevelConfig.salary)} / {currentLevelConfig.years}yr contract — Order {currentLevelConfig.order}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-semibold ${isCGTurn ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-800 dark:text-gray-200'}`}>
                    {franchiseShortCodes.get(currentFranchise) || currentFranchise}
                  </span>
                  {isCGTurn && (
                    <span className="px-2 py-1 rounded-md text-xs font-bold bg-yellow-400 dark:bg-yellow-600 text-yellow-900 dark:text-yellow-100 animate-pulse">
                      OUR PICK
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={skipPick}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Pass / skip this pick"
                >
                  <SkipForward className="w-4 h-4" />
                  Pass
                </button>
                <button
                  onClick={skipToNextRound}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Skip to next round or level"
                >
                  <FastForward className="w-4 h-4" />
                  Next Round
                </button>
              </div>
            </div>
            {/* Level progress bar */}
            <div className="mt-3 flex gap-1">
              {RFO_LEVELS.map(l => {
                const picksAtLevel = rfoDraftPicks.filter(p => p.level === l.level).length
                const isCurrentLevel = rfoDraftCursor.level === l.level
                return (
                  <button
                    key={l.level}
                    onClick={() => setRfoDraftCursor({ level: l.level, round: 1, pickIndex: 0 })}
                    className={`flex-1 py-1 rounded text-[10px] font-medium transition-colors ${
                      isCurrentLevel
                        ? 'bg-blue-600 text-white'
                        : picksAtLevel > 0
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    L{l.level}{picksAtLevel > 0 && ` (${picksAtLevel})`}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Budget Tracker */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">C&G Budget</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {cgPicks.length} RFO pick{cgPicks.length !== 1 ? 's' : ''} adding {formatSalary(budgetByYear[0]?.rfoDraftSalary || 0)}/yr
              </span>
            </div>
            <div className="space-y-2">
              {budgetByYear.map(item => {
                const capPct = item.pct
                const barColor = capPct >= 200
                  ? 'bg-red-600'
                  : capPct >= 120
                  ? 'bg-red-500'
                  : capPct >= 100
                  ? 'bg-orange-500'
                  : capPct >= 80
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
                // Scale: bar goes to 200% of cap (hard cap)
                const maxPct = 200
                const existingWidth = Math.min((item.existing / item.cap * 100) / maxPct * 100, 100)
                const rfoWidth = Math.min((item.rfoDraftSalary / item.cap * 100) / maxPct * 100, 100 - existingWidth)
                const threshold100 = (100 / maxPct) * 100 // 50%
                const threshold120 = (120 / maxPct) * 100

                return (
                  <div key={item.year} className="flex items-center gap-3">
                    <div className="w-10 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                      {item.year}
                    </div>
                    <div className="flex-1 relative h-6 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                      {/* Existing salary bar */}
                      <div
                        className="absolute inset-y-0 left-0 bg-blue-500/70 dark:bg-blue-600/70"
                        style={{ width: `${existingWidth}%` }}
                      />
                      {/* RFO draft salary bar (stacked on top) */}
                      {item.rfoDraftSalary > 0 && (
                        <div
                          className="absolute inset-y-0 bg-yellow-400/80 dark:bg-yellow-500/80"
                          style={{ left: `${existingWidth}%`, width: `${rfoWidth}%` }}
                        />
                      )}
                      {/* 100% cap marker */}
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-green-600 dark:border-green-400 z-10"
                        style={{ left: `${threshold100}%` }}
                      />
                      {/* 120% marker */}
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-red-400 dark:border-red-500 z-10 border-dashed"
                        style={{ left: `${threshold120}%` }}
                      />
                    </div>
                    <div className="w-[140px] text-right">
                      <span className={`text-xs font-bold ${
                        capPct >= 120 ? 'text-red-600 dark:text-red-400'
                        : capPct >= 100 ? 'text-orange-600 dark:text-orange-400'
                        : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {formatSalary(item.total)} / {formatSalary(item.cap)}
                      </span>
                      <span className={`ml-1 text-[10px] font-semibold ${
                        capPct >= 120 ? 'text-red-500' : capPct >= 100 ? 'text-orange-500' : 'text-green-600 dark:text-green-400'
                      }`}>
                        {capPct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500/70 inline-block rounded-sm" /> Existing</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 bg-yellow-400/80 inline-block rounded-sm" /> RFO Picks</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-600 inline-block" /> 100% cap</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block border-dashed border-t" /> 120% cap</span>
            </div>
          </div>

          <div className="flex gap-4">
            {/* Main draft board */}
            <div className="flex-1 space-y-4 min-w-0">
              {/* Filters */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                    {(['all', 'batter', 'pitcher'] as PlayerType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => setPlayerType(type)}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                          playerType === type
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {type === 'all' ? 'All' : type === 'batter' ? 'Batters' : 'Pitchers'}
                      </button>
                    ))}
                  </div>

                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search players..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <select
                    value={positionFilter}
                    onChange={e => setPositionFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">All positions</option>
                    {positions.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>

                  <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                    {([
                      { value: 'all' as const, label: 'All' },
                      { value: 'available' as const, label: 'Open' },
                      { value: 'drafted' as const, label: 'Drafted' },
                      { value: 'unavailable' as const, label: 'N/A' },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setStatusFilter(opt.value)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          statusFilter === opt.value
                            ? opt.value === 'drafted' ? 'bg-green-600 text-white'
                              : opt.value === 'unavailable' ? 'bg-red-600 text-white'
                              : opt.value === 'available' ? 'bg-blue-600 text-white'
                              : 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                      Clear
                    </button>
                  )}

                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 ml-auto">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-green-200 dark:bg-green-700 inline-block" /> {rfoDraftPicks.length} drafted
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-red-200 dark:bg-red-700 inline-block" /> {rfoUnavailable.length} N/A
                    </span>
                    {(rfoDraftPicks.length > 0 || rfoUnavailable.length > 0) && (
                      <button onClick={() => setShowResetConfirm(true)} className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 underline ml-1">
                        Reset All
                      </button>
                    )}
                    <span className="ml-2">{filteredPlayers.length.toLocaleString()} players</span>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div ref={containerRef} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="flex items-center bg-gray-50 dark:bg-gray-700" style={{ height: HEADER_HEIGHT }}>
                  <div className="w-[44px] min-w-[44px] px-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
                    &nbsp;
                  </div>
                  <div className={`w-[55px] min-w-[55px] ${thClass}`} onClick={() => handleSort('hkbRank')}>
                    HKB <SortIcon field="hkbRank" />
                  </div>
                  <div className={`flex-1 min-w-[150px] ${thClass}`} onClick={() => handleSort('name')}>
                    Name <SortIcon field="name" />
                  </div>
                  <div className="w-[70px] min-w-[70px] px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    RFA
                  </div>
                  <div className={`w-[80px] min-w-[80px] ${thClass}`} onClick={() => handleSort('position')}>
                    Pos <SortIcon field="position" />
                  </div>
                  <div className={`w-[50px] min-w-[50px] ${thClass}`} onClick={() => handleSort('team')}>
                    Team <SortIcon field="team" />
                  </div>
                  <div className={`w-[45px] min-w-[45px] ${thClass}`} onClick={() => handleSort('age')}>
                    Age <SortIcon field="age" />
                  </div>
                  <div className={`w-[60px] min-w-[60px] ${thClass}`} onClick={() => handleSort('hkbValue')}>
                    Val <SortIcon field="hkbValue" />
                  </div>
                  <div className="w-[55px] min-w-[55px] px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    WAR
                  </div>
                  <div className="w-[60px] min-w-[60px] px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    FPTS
                  </div>
                  <div className={`w-[55px] min-w-[55px] ${thClass}`} onClick={() => handleSort('warZ')}>
                    W-z <SortIcon field="warZ" />
                  </div>
                  <div className={`w-[55px] min-w-[55px] ${thClass}`} onClick={() => handleSort('fptsZ')}>
                    F-z <SortIcon field="fptsZ" />
                  </div>
                  <div className={`w-[55px] min-w-[55px] ${thClass}`} onClick={() => handleSort('hkbZ')}>
                    H-z <SortIcon field="hkbZ" />
                  </div>
                  <div className={`w-[65px] min-w-[65px] ${thClass}`} onClick={() => handleSort('composite')}>
                    Comp <SortIcon field="composite" />
                  </div>
                </div>

                <List
                  height={listHeight}
                  itemCount={filteredPlayers.length}
                  itemSize={ROW_HEIGHT}
                  width="100%"
                  overscanCount={20}
                >
                  {Row}
                </List>
              </div>
            </div>

            {/* Draft Log Sidebar */}
            <div className={`${showDraftLog ? 'w-80' : 'w-8'} flex-shrink-0 transition-all`}>
              <button
                onClick={() => setShowDraftLog(!showDraftLog)}
                className="mb-2 p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                title={showDraftLog ? 'Hide draft log' : 'Show draft log'}
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${showDraftLog ? 'rotate-180' : ''}`} />
              </button>
              {showDraftLog && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {/* C&G Picks Summary */}
                  {cgPicks.length > 0 && (
                    <div className="mb-3 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700">
                      <h4 className="text-xs font-bold text-yellow-800 dark:text-yellow-300 mb-1">
                        Our Picks ({cgPicks.length})
                      </h4>
                      {cgPicks.map(pick => (
                        <div key={pick.normalizedName} className="text-xs text-yellow-700 dark:text-yellow-400">
                          L{pick.level}R{pick.round ?? 1}: {pick.playerName}
                        </div>
                      ))}
                    </div>
                  )}

                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Draft Log ({rfoDraftPicks.length})
                  </h3>
                  {rfoDraftPicks.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">No picks yet</p>
                  ) : (
                    <div className="space-y-3">
                      {Array.from(draftLogByLevelRound.entries())
                        .sort(([a], [b]) => {
                          const [aL, aR] = a.split('-').map(Number)
                          const [bL, bR] = b.split('-').map(Number)
                          return aL !== bL ? aL - bL : aR - bR
                        })
                        .map(([key, picks]) => {
                          const [level, round] = key.split('-').map(Number)
                          return (
                            <div key={key}>
                              <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                                Level {level} Round {round} — {formatSalary(RFO_LEVELS[level - 1]?.salary ?? 0)}/{RFO_LEVELS[level - 1]?.years ?? 1}yr
                              </div>
                              {picks.map(pick => {
                                const isCG = pick.franchise === CG_NAME
                                return (
                                  <div key={pick.normalizedName} className={`flex items-center justify-between gap-1 py-1 text-xs rounded px-1 ${
                                    isCG ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                                  }`}>
                                    <div className="min-w-0">
                                      <span className={`font-medium truncate block ${isCG ? 'text-yellow-800 dark:text-yellow-200' : 'text-gray-900 dark:text-white'}`}>
                                        {pick.playerName}
                                      </span>
                                      <span className={`${isCG ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                                        {franchiseShortCodes.get(pick.franchise) || pick.franchise}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => removeRfoDraftPick(pick.normalizedName)}
                                      className="p-0.5 rounded text-gray-400 hover:text-red-500 flex-shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {activeTab === 'results' && (
        <div className="space-y-6">
          {rfoResults.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                No RFO draft results found. Make sure salaries.csv includes players acquired on 2/25/26 or 2/26/26.
              </p>
            </div>
          ) : (
            <>
              {/* League-wide summary */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Total Players Drafted</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {rfoResults.reduce((sum, [, picks]) => sum + picks.length, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Total Salary Committed</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatSalary(rfoResults.reduce((sum, [, picks]) => sum + picks.reduce((s, p) => s + p.salary, 0), 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Franchises</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {rfoResults.length}
                    </div>
                  </div>
                </div>
              </div>

              {rfoResults.map(([franchise, picks]) => {
                const shortCode = franchiseShortCodes.get(franchise) || franchise
                const totalSalary = picks.reduce((sum, p) => sum + p.salary, 0)
                const totalHkb = picks.reduce((sum, p) => sum + (p.hkbValue ?? 0), 0)
                const totalFpts = picks.reduce((sum, p) => sum + (p.fpts ?? 0), 0)
                const isCG = franchise === CG_NAME

                return (
                  <div key={franchise} className={`bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden ${
                    isCG ? 'ring-2 ring-yellow-400 dark:ring-yellow-600' : ''
                  }`}>
                    <div className={`px-4 py-3 flex items-center justify-between ${
                      isCG ? 'bg-yellow-50 dark:bg-yellow-900/30' : 'bg-gray-50 dark:bg-gray-700'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{shortCode}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{franchise}</span>
                        {isCG && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-400 dark:bg-yellow-600 text-yellow-900 dark:text-yellow-100">
                            US
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-gray-600 dark:text-gray-400">
                          {picks.length} pick{picks.length !== 1 ? 's' : ''}
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatSalary(totalSalary)} committed
                        </span>
                        <span className="text-blue-600 dark:text-blue-400">
                          {totalHkb.toLocaleString()} HKB
                        </span>
                        <span className="text-green-600 dark:text-green-400">
                          {totalFpts.toFixed(0)} FPTS
                        </span>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                          <th className="px-4 py-2">Player</th>
                          <th className="px-4 py-2">Pos</th>
                          <th className="px-4 py-2">Team</th>
                          <th className="px-4 py-2">Age</th>
                          <th className="px-4 py-2 text-right">Salary</th>
                          <th className="px-4 py-2 text-right">Yrs</th>
                          <th className="px-4 py-2 text-right">HKB Val</th>
                          <th className="px-4 py-2 text-right">FPTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {picks.map(p => (
                          <tr key={p.normalizedName} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{p.playerName}</td>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{p.position}</td>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{p.team}</td>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{p.age ?? '—'}</td>
                            <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">{formatSalary(p.salary)}</td>
                            <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{p.contractLength}</td>
                            <td className="px-4 py-2 text-right text-blue-600 dark:text-blue-400">{p.hkbValue?.toLocaleString() ?? '—'}</td>
                            <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">{p.fpts?.toFixed(0) ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Reset Draft?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This will clear all {rfoDraftPicks.length} draft pick{rfoDraftPicks.length !== 1 ? 's' : ''} and {rfoUnavailable.length} unavailable marking{rfoUnavailable.length !== 1 ? 's' : ''}, and reset the cursor to Level 1 Round 1. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={clearAllStatuses}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
