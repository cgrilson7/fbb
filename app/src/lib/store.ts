import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  Player,
  HKBPlayer,
  SalaryEntry,
  BattingProspect,
  PitchingProspect,
  ZipsBatter,
  ZipsPitcher,
  ZipsProjection,
  FranchiseMapping,
  NameMapping,
  UnmatchedPlayer,
  FreeAgentEntry,
  SalaryReliefDesignation,
  FVRanking,
  RfoDraftPick
} from '@/types'
import { normalize } from './normalize'
import { idbStorage } from './idb-storage'

// Default franchise mappings
const DEFAULT_FRANCHISE_MAPPINGS: FranchiseMapping[] = [
  { shortCode: 'C&G', fullName: 'Colin Wilson & Greg Holmes', confirmed: true },
  { shortCode: 'B&A', fullName: 'Ben Brody & Aaron', confirmed: true },
  { shortCode: 'R&J', fullName: 'Ross & Jack Kantor', confirmed: true },
  { shortCode: 'J&A', fullName: 'Jake Zuckman & Andrew Meyers', confirmed: true },
  { shortCode: 'T', fullName: 'Tyler Hart', confirmed: true },
  { shortCode: 'Max', fullName: 'Dustin Hart & Max Wamp', confirmed: true },
  { shortCode: 'Kai', fullName: 'Kai Nelson', confirmed: true },
  { shortCode: 'Ethan', fullName: 'Ethan Gobetz', confirmed: true },
  { shortCode: 'Steve', fullName: 'Steve Cornish', confirmed: true },
  { shortCode: 'Zack', fullName: 'Zack Semler', confirmed: true },
  { shortCode: 'JD', fullName: 'JD Barnett', confirmed: true },
  { shortCode: 'Brian', fullName: 'Brian Frederick', confirmed: true },
  { shortCode: 'Brenden', fullName: 'Brenden Freedman', confirmed: true },
  { shortCode: 'ELLY', fullName: 'Max Mastbaum, Jake Mastbaum & Sam Elias', confirmed: true },
  { shortCode: 'FA', fullName: 'Free Agent', confirmed: true },
]

interface PlayerStore {
  // Hydration state
  _hasHydrated: boolean

  // Raw data from CSVs
  rawPlayers: Player[]
  hkbPlayers: HKBPlayer[]
  salaries: SalaryEntry[]
  battingProspects: BattingProspect[]
  pitchingProspects: PitchingProspect[]
  zipsBatters: ZipsBatter[]
  zipsPitchers: ZipsPitcher[]
  freeAgentEntries: FreeAgentEntry[]
  fvRankings: FVRanking[]

  // Joined data
  players: Player[]

  // Salary relief
  salaryReliefDesignations: SalaryReliefDesignation[]

  // Pool draft status tracking
  poolDrafted: string[]    // normalizedNames of drafted players
  poolUnavailable: string[] // normalizedNames of unavailable players
  setPoolDrafted: (names: string[]) => void
  setPoolUnavailable: (names: string[]) => void
  togglePoolDrafted: (normalizedName: string) => void
  togglePoolUnavailable: (normalizedName: string) => void

  // RFO draft tracking
  rfoDraftPicks: RfoDraftPick[]
  rfoUnavailable: string[]
  rfoDraftCursor: { level: number; round: number; pickIndex: number }
  addRfoDraftPick: (pick: RfoDraftPick) => void
  removeRfoDraftPick: (normalizedName: string) => void
  toggleRfoUnavailable: (normalizedName: string) => void
  setRfoDraftPicks: (picks: RfoDraftPick[]) => void
  setRfoUnavailable: (names: string[]) => void
  setRfoDraftCursor: (cursor: { level: number; round: number; pickIndex: number }) => void

  // Mappings
  franchiseMappings: FranchiseMapping[]
  nameMappings: NameMapping[]
  unmatchedPlayers: UnmatchedPlayer[]

  // Setters
  setPlayers: (players: Player[]) => void
  setHKB: (players: HKBPlayer[]) => void
  setSalaries: (salaries: SalaryEntry[]) => void
  setBattingProspects: (prospects: BattingProspect[]) => void
  setPitchingProspects: (prospects: PitchingProspect[]) => void
  setZipsBatters: (batters: ZipsBatter[]) => void
  setZipsPitchers: (pitchers: ZipsPitcher[]) => void
  setFreeAgentEntries: (entries: FreeAgentEntry[]) => void
  setFVRankings: (rankings: FVRanking[]) => void

  // Join data from all sources
  joinData: () => void

  // Salary relief management
  addSalaryRelief: (designation: SalaryReliefDesignation) => void
  removeSalaryRelief: (normalizedName: string, year: number) => void

  // Mapping management
  setFranchiseMapping: (mapping: FranchiseMapping) => void
  addNameMapping: (mapping: NameMapping) => void
  clearUnmatched: (name: string) => void

  // Filters
  getPlayersByFranchise: (franchise: string) => Player[]
  getAvailablePlayers: () => Player[]
  getProspects: (type: 'batting' | 'pitching' | 'all') => Player[]
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      // Initial state
      _hasHydrated: false,
      rawPlayers: [],
      hkbPlayers: [],
      salaries: [],
      battingProspects: [],
      pitchingProspects: [],
      zipsBatters: [],
      zipsPitchers: [],
      freeAgentEntries: [],
      fvRankings: [],
      players: [],
      salaryReliefDesignations: [],
      poolDrafted: [],
      poolUnavailable: [],
      rfoDraftPicks: [],
      rfoUnavailable: [],
      rfoDraftCursor: { level: 1, round: 1, pickIndex: 0 },
      franchiseMappings: DEFAULT_FRANCHISE_MAPPINGS,
      nameMappings: [],
      unmatchedPlayers: [],

      // Setters
      setPlayers: (players) => set({ rawPlayers: players }),
      setHKB: (players) => set({ hkbPlayers: players }),
      setSalaries: (salaries) => set({ salaries }),
      setBattingProspects: (prospects) => set({ battingProspects: prospects }),
      setPitchingProspects: (prospects) => set({ pitchingProspects: prospects }),
      setZipsBatters: (batters) => set({ zipsBatters: batters }),
      setZipsPitchers: (pitchers) => set({ zipsPitchers: pitchers }),
      setFreeAgentEntries: (entries) => set({ freeAgentEntries: entries }),
      setFVRankings: (rankings) => set({ fvRankings: rankings }),

      // Join data from all sources
      joinData: () => {
        const state = get()
        const { rawPlayers, hkbPlayers, salaries, battingProspects, pitchingProspects, zipsBatters, zipsPitchers, fvRankings, nameMappings, franchiseMappings } = state

        // Create lookup maps
        const hkbMap = new Map<string, HKBPlayer>()
        hkbPlayers.forEach(p => hkbMap.set(p.normalizedName, p))

        const salaryMap = new Map<string, SalaryEntry>()
        salaries.forEach(s => salaryMap.set(s.normalizedName, s))

        const battingMap = new Map<string, BattingProspect>()
        battingProspects.forEach(p => battingMap.set(p.normalizedName, p))

        const pitchingMap = new Map<string, PitchingProspect>()
        pitchingProspects.forEach(p => pitchingMap.set(p.normalizedName, p))

        const zipsBatterMap = new Map<string, ZipsBatter>()
        zipsBatters.forEach(p => zipsBatterMap.set(p.normalizedName, p))

        const zipsPitcherMap = new Map<string, ZipsPitcher>()
        zipsPitchers.forEach(p => zipsPitcherMap.set(p.normalizedName, p))

        const fvRankingMap = new Map<string, FVRanking>()
        fvRankings.forEach(p => fvRankingMap.set(p.normalizedName, p))

        // Apply user name mappings
        const nameMap = new Map<string, string>()
        nameMappings.forEach(m => nameMap.set(normalize(m.source), normalize(m.target)))

        // Franchise lookup
        const franchiseMap = new Map<string, string>()
        franchiseMappings.forEach(m => franchiseMap.set(m.shortCode, m.fullName))

        const unmatched: UnmatchedPlayer[] = []

        // Join all data
        const joinedPlayers = rawPlayers.map(player => {
          let normalizedName = player.normalizedName
          // Check if we have a user mapping
          if (nameMap.has(normalizedName)) {
            normalizedName = nameMap.get(normalizedName)!
          }

          // HKB data
          const hkb = hkbMap.get(normalizedName)
          const hkbRank = hkb?.rank ?? null
          const hkbValue = hkb?.value ?? null
          const hkbLevel = hkb?.level ?? null

          // Salary data
          const salary = salaryMap.get(normalizedName)
          const franchise = franchiseMap.get(player.status) || player.status
          const contractType = salary?.contractType ?? null
          const contractLength = salary?.contractLength ?? null
          const salaryByYear = salary?.salaryByYear ?? {}

          // Prospect data
          const batting = battingMap.get(normalizedName)
          const pitching = pitchingMap.get(normalizedName)
          const prospect = batting || pitching
          const prospectRank = prospect?.rank ?? null
          const prospectLevel = prospect?.level ?? null
          const prospectStats = prospect ? {
            rank: prospect.rank,
            team: prospect.team,
            age: prospect.age,
            playerId: prospect.playerId,
            level: prospect.level,
            ...(batting && {
              atBats: batting.atBats,
              runs: batting.runs,
              hits: batting.hits,
              doubles: batting.doubles,
              triples: batting.triples,
              homeRuns: batting.homeRuns,
              rbi: batting.rbi,
              stolenBases: batting.stolenBases,
              avg: batting.avg,
              obp: batting.obp,
              slg: batting.slg,
              ops: batting.ops,
            }),
            ...(pitching && {
              era: pitching.era,
              whip: pitching.whip,
              wins: pitching.wins,
              losses: pitching.losses,
              saves: pitching.saves,
              inningsPitched: pitching.inningsPitched,
              strikeOuts: pitching.strikeOuts,
              walks: pitching.walks,
            }),
          } : null

          // ZiPS projection data
          const zipsBatter = zipsBatterMap.get(normalizedName)
          const zipsPitcher = zipsPitcherMap.get(normalizedName)
          let zipsProjection: ZipsProjection | null = null
          if (zipsBatter) {
            zipsProjection = {
              type: 'batter',
              war: zipsBatter.war,
              fpts: zipsBatter.fpts,
              fptsRate: zipsBatter.fptsPerG,
              pa: zipsBatter.pa,
              hr: zipsBatter.hr,
              r: zipsBatter.r,
              rbi: zipsBatter.rbi,
              sb: zipsBatter.sb,
              avg: zipsBatter.avg,
              obp: zipsBatter.obp,
              slg: zipsBatter.slg,
              ops: zipsBatter.ops,
              wrcPlus: zipsBatter.wrcPlus,
            }
          } else if (zipsPitcher) {
            zipsProjection = {
              type: 'pitcher',
              war: zipsPitcher.war,
              fpts: zipsPitcher.fpts,
              fptsRate: zipsPitcher.fptsPerIP,
              w: zipsPitcher.w,
              qs: zipsPitcher.qs,
              era: zipsPitcher.era,
              sv: zipsPitcher.sv,
              hld: zipsPitcher.hld,
              k: zipsPitcher.k,
              ip: zipsPitcher.ip,
              bb9: zipsPitcher.bb9,
              whip: zipsPitcher.whip,
            }
          }

          // FV ranking data
          const fvRanking = fvRankingMap.get(normalizedName)
          const fvRank = fvRanking?.rank ?? null
          const fvGrade = fvRanking?.fv ?? null
          const fvETA = fvRanking?.eta ?? null
          const fvHighestLevel = fvRanking?.highestLevel ?? null
          const fvPosition = fvRanking?.position ?? null

          // Track unmatched HKB (fuzzy matching done lazily on Match page)
          if (!hkb && hkbPlayers.length > 0) {
            unmatched.push({
              source: 'players',
              name: player.name,
              normalizedName: player.normalizedName,
              candidates: []
            })
          }

          return {
            ...player,
            hkbRank,
            hkbValue,
            hkbLevel,
            franchise,
            contractType,
            contractLength,
            salaryByYear,
            prospectRank,
            prospectLevel,
            prospectStats,
            fvRank,
            fvGrade,
            fvETA,
            fvHighestLevel,
            fvPosition,
            zipsProjection,
            matchConfidence: hkb ? 1 : 0.5,
          }
        })

        set({
          players: joinedPlayers,
          unmatchedPlayers: unmatched.slice(0, 100) // Limit to top 100
        })
      },

      // Pool draft status
      setPoolDrafted: (names) => set({ poolDrafted: names }),
      setPoolUnavailable: (names) => set({ poolUnavailable: names }),
      togglePoolDrafted: (normalizedName) =>
        set(state => {
          const set_ = new Set(state.poolDrafted)
          if (set_.has(normalizedName)) set_.delete(normalizedName)
          else set_.add(normalizedName)
          // Remove from unavailable if drafting
          const unavail = new Set(state.poolUnavailable)
          unavail.delete(normalizedName)
          return { poolDrafted: Array.from(set_), poolUnavailable: Array.from(unavail) }
        }),
      togglePoolUnavailable: (normalizedName) =>
        set(state => {
          const unavail = new Set(state.poolUnavailable)
          if (unavail.has(normalizedName)) unavail.delete(normalizedName)
          else unavail.add(normalizedName)
          // Remove from drafted if marking unavailable
          const drafted = new Set(state.poolDrafted)
          drafted.delete(normalizedName)
          return { poolUnavailable: Array.from(unavail), poolDrafted: Array.from(drafted) }
        }),

      // RFO draft tracking
      addRfoDraftPick: (pick) =>
        set(state => ({
          rfoDraftPicks: [...state.rfoDraftPicks, pick],
          rfoUnavailable: state.rfoUnavailable.filter(n => n !== pick.normalizedName),
        })),
      removeRfoDraftPick: (normalizedName) =>
        set(state => ({
          rfoDraftPicks: state.rfoDraftPicks.filter(p => p.normalizedName !== normalizedName),
        })),
      toggleRfoUnavailable: (normalizedName) =>
        set(state => {
          const unavail = new Set(state.rfoUnavailable)
          if (unavail.has(normalizedName)) unavail.delete(normalizedName)
          else unavail.add(normalizedName)
          // Remove from drafted if marking unavailable
          const picks = state.rfoDraftPicks.filter(p => p.normalizedName !== normalizedName)
          return { rfoUnavailable: Array.from(unavail), rfoDraftPicks: picks }
        }),
      setRfoDraftPicks: (picks) => set({ rfoDraftPicks: picks }),
      setRfoUnavailable: (names) => set({ rfoUnavailable: names }),
      setRfoDraftCursor: (cursor) => set({ rfoDraftCursor: cursor }),

      // Salary relief management
      addSalaryRelief: (designation) =>
        set(state => ({
          salaryReliefDesignations: [...state.salaryReliefDesignations, designation]
        })),

      removeSalaryRelief: (normalizedName, year) =>
        set(state => ({
          salaryReliefDesignations: state.salaryReliefDesignations.filter(
            d => !(d.normalizedName === normalizedName && d.year === year)
          )
        })),

      // Mapping management
      setFranchiseMapping: (mapping) =>
        set(state => ({
          franchiseMappings: state.franchiseMappings.map(m =>
            m.shortCode === mapping.shortCode ? mapping : m
          )
        })),

      addNameMapping: (mapping) =>
        set(state => ({
          nameMappings: [...state.nameMappings, mapping]
        })),

      clearUnmatched: (name) =>
        set(state => ({
          unmatchedPlayers: state.unmatchedPlayers.filter(u => u.name !== name)
        })),

      // Filters
      getPlayersByFranchise: (franchise) => {
        const state = get()
        return state.players.filter(p => p.franchise === franchise || p.status === franchise)
      },

      getAvailablePlayers: () => {
        const state = get()
        return state.players.filter(p => p.isAvailable)
      },

      getProspects: (type) => {
        const state = get()
        return state.players.filter(p => {
          if (!p.prospectStats) return false
          if (type === 'all') return true
          if (type === 'batting') return p.prospectStats.atBats !== undefined
          if (type === 'pitching') return p.prospectStats.era !== undefined
          return false
        })
      },
    }),
    {
      name: 'fbb-player-store',
      storage: createJSONStorage(() => idbStorage),
      version: 1,
      partialize: (state) => ({
        rawPlayers: state.rawPlayers,
        hkbPlayers: state.hkbPlayers,
        salaries: state.salaries,
        battingProspects: state.battingProspects,
        pitchingProspects: state.pitchingProspects,
        zipsBatters: state.zipsBatters,
        zipsPitchers: state.zipsPitchers,
        freeAgentEntries: state.freeAgentEntries,
        fvRankings: state.fvRankings,
        salaryReliefDesignations: state.salaryReliefDesignations,
        poolDrafted: state.poolDrafted,
        poolUnavailable: state.poolUnavailable,
        rfoDraftPicks: state.rfoDraftPicks,
        rfoUnavailable: state.rfoUnavailable,
        rfoDraftCursor: state.rfoDraftCursor,
        franchiseMappings: state.franchiseMappings,
        nameMappings: state.nameMappings,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Re-join data after rehydration if we have raw data
          if (state.rawPlayers.length > 0) {
            state.joinData()
          }
          usePlayerStore.setState({ _hasHydrated: true })
        } else {
          usePlayerStore.setState({ _hasHydrated: true })
        }
      },
    }
  )
)
