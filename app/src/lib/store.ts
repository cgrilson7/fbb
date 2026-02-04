import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Player,
  HKBPlayer,
  SalaryEntry,
  BattingProspect,
  PitchingProspect,
  FranchiseMapping,
  NameMapping,
  UnmatchedPlayer
} from '@/types'
import { normalize, findBestMatches } from './normalize'

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
  { shortCode: 'FA', fullName: 'Free Agent', confirmed: true },
]

interface PlayerStore {
  // Raw data from CSVs
  rawPlayers: Player[]
  hkbPlayers: HKBPlayer[]
  salaries: SalaryEntry[]
  battingProspects: BattingProspect[]
  pitchingProspects: PitchingProspect[]

  // Joined data
  players: Player[]

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

  // Join data from all sources
  joinData: () => void

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
      rawPlayers: [],
      hkbPlayers: [],
      salaries: [],
      battingProspects: [],
      pitchingProspects: [],
      players: [],
      franchiseMappings: DEFAULT_FRANCHISE_MAPPINGS,
      nameMappings: [],
      unmatchedPlayers: [],

      // Setters
      setPlayers: (players) => set({ rawPlayers: players }),
      setHKB: (players) => set({ hkbPlayers: players }),
      setSalaries: (salaries) => set({ salaries }),
      setBattingProspects: (prospects) => set({ battingProspects: prospects }),
      setPitchingProspects: (prospects) => set({ pitchingProspects: prospects }),

      // Join data from all sources
      joinData: () => {
        const state = get()
        const { rawPlayers, hkbPlayers, salaries, battingProspects, pitchingProspects, nameMappings, franchiseMappings } = state

        // Create lookup maps
        const hkbMap = new Map<string, HKBPlayer>()
        hkbPlayers.forEach(p => hkbMap.set(p.normalizedName, p))

        const salaryMap = new Map<string, SalaryEntry>()
        salaries.forEach(s => salaryMap.set(s.normalizedName, s))

        const battingMap = new Map<string, BattingProspect>()
        battingProspects.forEach(p => battingMap.set(p.normalizedName, p))

        const pitchingMap = new Map<string, PitchingProspect>()
        pitchingProspects.forEach(p => pitchingMap.set(p.normalizedName, p))

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

          // Track unmatched HKB
          if (!hkb && hkbPlayers.length > 0) {
            const candidates = findBestMatches(
              player.name,
              hkbPlayers.map(h => ({ name: h.name, normalizedName: h.normalizedName }))
            )
            if (candidates.length > 0 && candidates[0].score < 1) {
              unmatched.push({
                source: 'players',
                name: player.name,
                normalizedName: player.normalizedName,
                candidates
              })
            }
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
            matchConfidence: hkb ? 1 : 0.5,
          }
        })

        set({
          players: joinedPlayers,
          unmatchedPlayers: unmatched.slice(0, 100) // Limit to top 100
        })
      },

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
      partialize: (state) => ({
        rawPlayers: state.rawPlayers,
        hkbPlayers: state.hkbPlayers,
        salaries: state.salaries,
        battingProspects: state.battingProspects,
        pitchingProspects: state.pitchingProspects,
        franchiseMappings: state.franchiseMappings,
        nameMappings: state.nameMappings,
      }),
    }
  )
)
