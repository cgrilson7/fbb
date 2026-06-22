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
  // Joined from FV Rankings
  fvRank: number | null
  fvGrade: number | null
  fvETA: number | null
  fvHighestLevel: string | null
  fvPosition: string | null
  // Joined from FantasyPros
  fpRank: number | null
  fpPos: string | null
  // Joined from ZiPS
  zipsProjection: ZipsProjection | null
  zipsDcProjection: ZipsProjection | null
  // ZiPS DC rest-of-season (advanced) — powers waiver-wire FPTS
  zipsRosProjection: ZipsProjection | null
  // Derived
  isAvailable: boolean
  isWaiver: boolean
  waiverDay: string | null
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
  acquisitionDate: string
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

export interface FGMinorsBatter {
  name: string
  team: string
  level: string
  age: number
  pa: number
  bbPct: number
  kPct: number
  avg: number
  obp: number
  slg: number
  ops: number
  iso: number
  babip: number
  woba: number
  wrcPlus: number
  playerId: string
  normalizedName: string
}

export interface FGMinorsPitcher {
  name: string
  team: string
  level: string
  age: number
  ip: number
  k9: number
  bb9: number
  kPct: number
  bbPct: number
  kMinusBbPct: number
  whip: number
  babip: number
  lobPct: number
  era: number
  fip: number
  xfip: number
  playerId: string
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

export interface ZipsBatter {
  name: string
  team: string
  pa: number
  ab: number
  h: number
  singles: number
  doubles: number
  triples: number
  hr: number
  r: number
  rbi: number
  bb: number
  hbp: number
  sf: number
  sb: number
  avg: number
  obp: number
  slg: number
  ops: number
  wrcPlus: number
  war: number
  fpts: number
  fptsPerG: number
  normalizedName: string
}

export interface ZipsPitcher {
  name: string
  team: string
  w: number
  qs: number
  era: number
  sv: number
  hld: number
  g: number
  gs: number
  ip: number
  h: number
  bb: number
  er: number
  k: number
  bb9: number
  whip: number
  war: number
  fpts: number
  fptsPerIP: number
  normalizedName: string
}

export interface FVRanking {
  rank: number
  name: string
  team: string
  age: number | null
  highestLevel: string
  position: string
  eta: number | null
  fv: number
  normalizedName: string
}

export interface FreeAgentEntry {
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
  normalizedName: string
}

export interface SalaryReliefDesignation {
  playerName: string
  normalizedName: string
  year: number
}

export interface RfoDraftPick {
  normalizedName: string
  playerName: string
  franchise: string
  level: number
  round?: number
}

export interface FantasyProsRanking {
  rank: number
  name: string
  team: string
  pos: string
  age: number | null
  best: number | null
  worst: number | null
  avg: number | null
  stdDev: number | null
  ecrVsAdp: number | null
  normalizedName: string
}

export interface CloserEntry {
  team: string
  player: string
  throws: string
  role: string
  vfa: number | null
  vsi: number | null
  g: number | null
  ip: number | null
  era: number | null
  sv: number | null
  hld: number | null
  k9: number | null
  kpct: number | null
  nameAscii: string
  normalizedName: string
}

export interface CloserMonkeyEntry {
  team: string
  closer: string
  firstInLine: string
  secondInLine: string
  updated: string
  isCommittee: boolean
  // Normalized names for matching against player database
  closerNormalized: string
  firstNormalized: string
  secondNormalized: string
}

export interface ZipsProjection {
  type: 'batter' | 'pitcher'
  war: number
  fpts: number
  fptsRate: number // FPTS/G for batters, FPTS/IP for pitchers
  // Batter stats
  pa?: number
  ab?: number
  h?: number
  singles?: number
  doubles?: number
  triples?: number
  hr?: number
  r?: number
  rbi?: number
  bb?: number
  hbp?: number
  sf?: number
  sb?: number
  avg?: number
  obp?: number
  slg?: number
  ops?: number
  wrcPlus?: number
  // Pitcher stats
  w?: number
  qs?: number
  era?: number
  sv?: number
  hld?: number
  g?: number
  gs?: number
  k?: number
  ip?: number
  hAllowed?: number
  bbPitching?: number
  er?: number
  bb9?: number
  whip?: number
}
