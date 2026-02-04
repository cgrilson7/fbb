export interface Player {
  id: string
  name: string
  team: string
  position: string
  status: string // Owner or "FA"
  age: number | null
  salary: string | null
  contract: string | null
  score: number | null
  adp: number | null
  rkOv: number | null
  // Joined from HKB
  hkbRank: number | null
  hkbValue: number | null
  hkbLevel: string | null
  // Joined from salaries
  franchise: string | null
  contractType: string | null
  contractLength: number | null
  salaryByYear: Record<number, number>
  // Joined from prospects
  prospectRank: number | null
  prospectLevel: string | null
  prospectStats: ProspectStats | null
  // Derived
  isAvailable: boolean
  matchConfidence: number
  normalizedName: string
}

export interface HKBPlayer {
  rank: number
  name: string
  value: number
  age: number | null
  positions: string
  team: string
  level: string
  normalizedName: string
}

export interface SalaryEntry {
  playerName: string
  franchise: string
  contractType: string
  salary: number
  contractLength: number
  contractStarts: number
  contractEnds: number
  salaryByYear: Record<number, number>
  normalizedName: string
}

export interface ProspectStats {
  rank: number
  team: string
  age: number
  playerId: number
  level: string
  // Batting stats
  atBats?: number
  runs?: number
  hits?: number
  doubles?: number
  triples?: number
  homeRuns?: number
  rbi?: number
  stolenBases?: number
  avg?: number
  obp?: number
  slg?: number
  ops?: number
  // Pitching stats
  era?: number
  whip?: number
  wins?: number
  losses?: number
  saves?: number
  inningsPitched?: number
  strikeOuts?: number
  walks?: number
}

export interface BattingProspect {
  rank: number
  team: string
  age: number
  fullName: string
  playerId: number
  level: string
  atBats: number
  runs: number
  hits: number
  doubles: number
  triples: number
  homeRuns: number
  rbi: number
  stolenBases: number
  avg: number
  obp: number
  slg: number
  ops: number
  normalizedName: string
}

export interface PitchingProspect {
  rank: number
  team: string
  age: number
  fullName: string
  playerId: number
  level: string
  era: number
  whip: number
  wins: number
  losses: number
  saves: number
  inningsPitched: number
  strikeOuts: number
  walks: number
  normalizedName: string
}

export interface FranchiseMapping {
  shortCode: string
  fullName: string
  confirmed: boolean
}

export interface UnmatchedPlayer {
  source: 'players' | 'hkb' | 'salaries' | 'prospects'
  name: string
  normalizedName: string
  candidates: { name: string; normalizedName: string; score: number }[]
}

export interface NameMapping {
  source: string
  target: string
  confirmedBy: 'auto' | 'user'
}
