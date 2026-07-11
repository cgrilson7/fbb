import Papa from 'papaparse'
import { normalize } from './normalize'
import type {
  Player,
  HKBPlayer,
  SalaryEntry,
  BattingProspect,
  PitchingProspect,
  ZipsBatter,
  ZipsPitcher,
  FreeAgentEntry,
  FVRanking,
  FantasyProsRanking,
  CloserEntry,
  CloserMonkeyEntry,
  FGMinorsBatter,
  FGMinorsPitcher,
  ProspectRanking,
  LeagueStanding
} from '@/types'

export type FileType = 'players' | 'hkb' | 'salaries' | 'battingProspects' | 'pitchingProspects' | 'zipsBatters' | 'zipsPitchers' | 'zipsDcBatters' | 'zipsDcPitchers' | 'zipsRosBatters' | 'zipsRosPitchers' | 'freeAgency' | 'fvRankings' | 'fpRankings' | 'closers' | 'closermonkey' | 'fgMinorsBatters' | 'fgMinorsPitchers' | 'prospectRankings' | 'standings'

export function detectFileType(filename: string): FileType | null {
  const lower = filename.toLowerCase()
  // Check harryknowsball FIRST (contains "all" which would match players)
  if (lower.includes('harryknowsball') || lower.includes('hkb')) return 'hkb'
  if (lower.includes('salaries') || lower.includes('salary')) return 'salaries'
  if (lower.includes('closermonkey')) return 'closermonkey'
  if (lower.includes('closer')) return 'closers'
  if (lower.includes('fantasypros')) return 'fpRankings'
  if (lower.includes('fv') && lower.includes('rank')) return 'fvRankings'
  // Check before batting/pitching prospects — "prospect_rankings" contains "prospect"
  if (lower.includes('prospect') && lower.includes('rank')) return 'prospectRankings'
  if (lower.includes('standing')) return 'standings'
  if (lower.includes('free') && lower.includes('agen')) return 'freeAgency'
  if (lower.includes('fangraphs') && lower.includes('minors') && lower.includes('batter')) return 'fgMinorsBatters'
  if (lower.includes('fangraphs') && lower.includes('minors') && lower.includes('pitcher')) return 'fgMinorsPitchers'
  if (lower.includes('batting') && lower.includes('prospect')) return 'battingProspects'
  if (lower.includes('pitching') && lower.includes('prospect')) return 'pitchingProspects'
  // ZiPS projections — check ROS (rest-of-season) before DC/regular, since ROS
  // filenames also contain "dc"/"batter" (e.g. zips_dc_ros_advanced_batters.csv)
  if (lower.includes('zips') && lower.includes('ros') && lower.includes('batter')) return 'zipsRosBatters'
  if (lower.includes('zips') && lower.includes('ros') && lower.includes('pitcher')) return 'zipsRosPitchers'
  // ZiPS projections (check DC before regular)
  if (lower.includes('zips') && lower.includes('dc') && lower.includes('batter')) return 'zipsDcBatters'
  if (lower.includes('zips') && lower.includes('dc') && lower.includes('pitcher')) return 'zipsDcPitchers'
  if (lower.includes('zips') && lower.includes('batter')) return 'zipsBatters'
  if (lower.includes('zips') && lower.includes('pitcher')) return 'zipsPitchers'
  // Check "all" last since it's a common substring
  if (lower.includes('all') && lower.endsWith('.csv')) return 'players'
  return null
}

export function parseCSV<T>(file: File, type: FileType): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = transformData(results.data as Record<string, string>[], type)
          resolve(data as T[])
        } catch (error) {
          reject(error)
        }
      },
      error: (error) => reject(error)
    })
  })
}

// Fantrax IDs of duplicate/lesser players who share names with stars
const EXCLUDED_PLAYER_IDS = new Set([
  '*06lfx*', // Julio Rodriguez (HOU, RP) — not the SEA OF
  '*04awg*', // Julio Rodriguez (KC, C) — not the SEA OF
  '*06qx9*', // Jose Ramirez (DET, RP) — not the CLE 3B
  '*06rse*', // Jose Ramirez (DET, RF/OF) — not the CLE 3B
  '*0375c*', // Edwin Diaz (HOU, 3B/SS) — not the LAD RP
])

function transformData(rows: Record<string, string>[], type: FileType): unknown[] {
  switch (type) {
    case 'players':
      return rows
        .filter(row => !EXCLUDED_PLAYER_IDS.has(row['ID'] || ''))
        .map(transformPlayer)
    case 'hkb':
      return rows.map(transformHKB)
    case 'salaries':
      return rows.map(transformSalary)
    case 'battingProspects':
      return rows.map(transformBattingProspect)
    case 'pitchingProspects':
      return rows.map(transformPitchingProspect)
    case 'zipsBatters':
    case 'zipsDcBatters':
    case 'zipsRosBatters':
      return rows.map(transformZipsBatter)
    case 'zipsPitchers':
    case 'zipsDcPitchers':
    case 'zipsRosPitchers':
      return rows.map(transformZipsPitcher)
    case 'freeAgency':
      return rows.map(transformFreeAgency)
    case 'fvRankings':
      return rows.map(transformFVRanking)
    case 'prospectRankings':
      return rows.filter(row => (row['Name'] || '').trim() !== '').map(transformProspectRanking)
    case 'standings':
      return rows.filter(row => (row['Team'] || '').trim() !== '').map(transformStanding)
    case 'fpRankings':
      return rows.filter(row => (row['PLAYER NAME'] || row['Player Name'] || '').trim() !== '').map(transformFPRanking)
    case 'closers':
      return rows.map(transformCloser)
    case 'closermonkey':
      return rows.filter(row => (row['Team'] || '').trim() !== '').map(transformCloserMonkey)
    case 'fgMinorsBatters':
      return rows.filter(row => (row['Name'] || '').trim() !== '').map(transformFGMinorsBatter)
    case 'fgMinorsPitchers':
      return rows.filter(row => (row['Name'] || '').trim() !== '').map(transformFGMinorsPitcher)
    default:
      return rows
  }
}

function transformPlayer(row: Record<string, string>): Player {
  const name = row['Player'] || row['Name'] || ''
  const status = row['Status'] || 'FA'
  const isWaiver = status.startsWith('W')
  const waiverDayMatch = isWaiver ? status.match(/\((\w+)\)/) : null
  return {
    id: row['ID'] || crypto.randomUUID(),
    name,
    team: row['Team'] || '',
    position: row['Position'] || row['Pos'] || '',
    status,
    age: parseNumber(row['Age']),
    salary: row['Salary'] || null,
    contract: row['Contract'] || null,
    score: parseNumber(row['Score']),
    adp: parseNumber(row['ADP']),
    rkOv: parseNumber(row['RkOv']),
    // Will be populated during join
    hkbRank: null,
    hkbValue: null,
    hkbLevel: null,
    franchise: null,
    contractType: null,
    contractLength: null,
    salaryByYear: {},
    prospectRank: null,
    prospectLevel: null,
    prospectStats: null,
    fpRank: null,
    fpPos: null,
    fvRank: null,
    fvGrade: null,
    fvETA: null,
    fvHighestLevel: null,
    fvPosition: null,
    zipsProjection: null,
    zipsDcProjection: null,
    zipsRosProjection: null,
    // Derived
    isAvailable: status === 'FA' || isWaiver,
    isWaiver,
    waiverDay: waiverDayMatch?.[1] ?? null,
    matchConfidence: 1,
    normalizedName: normalize(name)
  }
}

function transformHKB(row: Record<string, string>): HKBPlayer {
  const name = row['Name'] || ''
  return {
    rank: parseInt(row['Rank'] || '0', 10),
    name,
    value: parseInt(row['Value'] || '0', 10),
    age: parseNumber(row['Age']),
    positions: row['Positions'] || row['Position'] || '',
    team: row['Team'] || '',
    level: row['Level'] || 'MLB',
    normalizedName: normalize(name)
  }
}

function transformSalary(row: Record<string, string>): SalaryEntry {
  // Handle columns with extra spaces by checking trimmed keys
  const getValue = (keys: string[]): string => {
    for (const key of keys) {
      // Check exact match first
      if (row[key]) return row[key]
      // Check trimmed keys
      const found = Object.keys(row).find(k => k.trim() === key || k.trim().toLowerCase() === key.toLowerCase())
      if (found && row[found]) return row[found]
    }
    return ''
  }

  const playerName = getValue(['Player Name', 'Player'])
  const salaryByYear: Record<number, number> = {}

  // Parse yearly salary columns (2025, 2026, ... 2040)
  // Format: "2026 Salary Hit" or similar
  for (let year = 2025; year <= 2040; year++) {
    const key = Object.keys(row).find(k =>
      k.includes(year.toString()) && k.toLowerCase().includes('salary')
    )
    if (key && row[key]) {
      salaryByYear[year] = parseCurrency(row[key])
    }
  }

  // For YP/Minors contracts, the "Salary" column may be non-numeric (e.g. "YP")
  // Fall back to the current year's salary hit
  const rawSalary = getValue(['Salary'])
  let salary = parseCurrency(rawSalary)
  if (salary === 0 && rawSalary && !/\d/.test(rawSalary.replace(/[$,.\s-]/g, ''))) {
    // Non-numeric salary field - use 2026 salary hit as fallback
    salary = salaryByYear[2026] || Object.values(salaryByYear).find(v => v > 0) || 0
  }

  const contractStartsRaw = getValue(['Contract Starts'])
  const contractEndsRaw = getValue(['Contract Ends'])

  return {
    playerName,
    franchise: getValue(['Franchise', 'Owner']).trim(),
    contractType: getValue(['Contract Type']).trim(),
    salary,
    contractLength: parseInt((getValue(['Contract Length']) || '0').replace(/[$\s]/g, ''), 10) || 0,
    contractStarts: contractStartsRaw ? parseInt(contractStartsRaw, 10) : 0,
    contractEnds: contractEndsRaw ? parseInt(contractEndsRaw, 10) : 0,
    salaryByYear,
    acquisitionDate: getValue(['Acq. Date', 'Acquisition Date']).trim(),
    normalizedName: normalize(playerName)
  }
}

function transformBattingProspect(row: Record<string, string>): BattingProspect {
  const fullName = row['full_name'] || row['Name'] || ''
  return {
    rank: parseInt(row['rank'] || '0', 10),
    team: row['team'] || '',
    age: parseInt(row['age'] || '0', 10),
    fullName,
    playerId: parseInt(row['playerId'] || '0', 10),
    level: row['sportAbbrev'] || row['level'] || '',
    atBats: parseInt(row['atBats'] || '0', 10),
    runs: parseInt(row['runs'] || '0', 10),
    hits: parseInt(row['hits'] || '0', 10),
    doubles: parseInt(row['doubles'] || '0', 10),
    triples: parseInt(row['triples'] || '0', 10),
    homeRuns: parseInt(row['homeRuns'] || '0', 10),
    rbi: parseInt(row['rbi'] || '0', 10),
    stolenBases: parseInt(row['stolenBases'] || row['sb'] || '0', 10),
    avg: parseFloat(row['avg'] || '0'),
    obp: parseFloat(row['obp'] || '0'),
    slg: parseFloat(row['slg'] || '0'),
    ops: parseFloat(row['ops'] || '0'),
    normalizedName: normalize(fullName)
  }
}

function transformPitchingProspect(row: Record<string, string>): PitchingProspect {
  const fullName = row['full_name'] || row['Name'] || ''
  return {
    rank: parseInt(row['rank'] || '0', 10),
    team: row['team'] || '',
    age: parseInt(row['age'] || '0', 10),
    fullName,
    playerId: parseInt(row['playerId'] || '0', 10),
    level: row['sportAbbrev'] || row['level'] || '',
    era: parseFloat(row['era'] || '0'),
    whip: parseFloat(row['whip'] || '0'),
    wins: parseInt(row['wins'] || '0', 10),
    losses: parseInt(row['losses'] || '0', 10),
    saves: parseInt(row['saves'] || '0', 10),
    inningsPitched: parseFloat(row['inningsPitched'] || '0'),
    strikeOuts: parseInt(row['strikeOuts'] || '0', 10),
    walks: parseInt(row['walks'] || '0', 10),
    normalizedName: normalize(fullName)
  }
}

function transformZipsBatter(row: Record<string, string>): ZipsBatter {
  const name = row['Name'] || ''
  return {
    name,
    team: row['Team'] || '',
    pa: parseInt(row['PA'] || '0', 10),
    ab: parseInt(row['AB'] || '0', 10),
    h: parseInt(row['H'] || '0', 10),
    singles: parseInt(row['1B'] || '0', 10),
    doubles: parseInt(row['2B'] || '0', 10),
    triples: parseInt(row['3B'] || '0', 10),
    hr: parseInt(row['HR'] || '0', 10),
    r: parseInt(row['R'] || '0', 10),
    rbi: parseInt(row['RBI'] || '0', 10),
    bb: parseInt(row['BB'] || '0', 10),
    hbp: parseInt(row['HBP'] || '0', 10),
    sf: parseInt(row['SF'] || '0', 10),
    sb: parseInt(row['SB'] || '0', 10),
    avg: parseFloat(row['AVG'] || '0'),
    obp: parseFloat(row['OBP'] || '0'),
    slg: parseFloat(row['SLG'] || '0'),
    ops: parseFloat(row['OPS'] || '0'),
    wrcPlus: parseFloat(row['wRC+'] || '0'),
    war: parseFloat(row['WAR'] || '0'),
    fpts: parseFloat(row['FPTS'] || '0'),
    fptsPerG: parseFloat(row['FPTS/G'] || '0'),
    normalizedName: normalize(name)
  }
}

function transformZipsPitcher(row: Record<string, string>): ZipsPitcher {
  const name = row['Name'] || ''
  return {
    name,
    team: row['Team'] || '',
    w: parseInt(row['W'] || '0', 10),
    qs: parseInt(row['QS'] || '0', 10),
    era: parseFloat(row['ERA'] || '0'),
    sv: parseInt(row['SV'] || '0', 10),
    hld: parseInt(row['HLD'] || '0', 10),
    g: parseInt(row['G'] || '0', 10),
    gs: parseInt(row['GS'] || '0', 10),
    ip: parseFloat(row['IP'] || '0'),
    h: parseInt(row['H'] || '0', 10),
    bb: parseInt(row['BB'] || '0', 10),
    er: parseInt(row['ER'] || '0', 10),
    k: parseInt(row['SO'] || '0', 10),
    bb9: parseFloat(row['BB/9'] || '0'),
    whip: parseFloat(row['WHIP'] || '0'),
    war: parseFloat(row['WAR'] || '0'),
    fpts: parseFloat(row['FPTS'] || '0'),
    fptsPerIP: parseFloat(row['FPTS/IP'] || '0'),
    normalizedName: normalize(name)
  }
}

function transformFreeAgency(row: Record<string, string>): FreeAgentEntry {
  // Fuzzy column lookup — handles extra spaces and ? in headers
  const getCol = (keys: string[]): string => {
    for (const key of keys) {
      if (row[key] !== undefined) return row[key]
    }
    // Try trimmed match
    const found = Object.keys(row).find(k =>
      keys.some(key => k.trim().toLowerCase() === key.toLowerCase())
    )
    return found ? row[found] : ''
  }
  const playerName = getCol(['Player Name'])
  const rfa = getCol(['RFA?', 'RFA']).trim().toUpperCase()
  const hometown = getCol(['Hometown Discount Eligible']).trim().toUpperCase()
  // Handle "2025 wRC+/ FIP-" with possible spaces
  const projKey = Object.keys(row).find(k => k.includes('wRC+') || k.includes('FIP'))
  return {
    playerName,
    auctionDate: getCol(['Auction Date']),
    previousFranchise: getCol(['2025 Franchise']),
    acquisitionDate: getCol(['Acquisition Date']),
    fwar2024: parseNumber(getCol(['2024 fWAR'])),
    projectedStat: projKey ? parseNumber(row[projKey]) : null,
    isRFA: rfa === 'YES' || rfa === 'Y' || rfa === 'TRUE',
    hometownEligible: hometown === 'YES' || hometown === 'Y' || hometown === 'TRUE',
    winningFranchise: getCol(['Winning Franchise']),
    winningContract: getCol(['Winning Contract']),
    otherBids: getCol(['Other Bids']),
    normalizedName: normalize(playerName)
  }
}

function transformFVRanking(row: Record<string, string>): FVRanking {
  const name = row['Name'] || ''
  return {
    rank: parseInt(row['Rk'] || '0', 10),
    name,
    team: row['Team'] || '',
    age: parseNumber(row['Age']),
    highestLevel: row['Highest Level'] || '',
    position: row['Position'] || '',
    eta: parseNumber(row['ETA']),
    fv: parseInt(row['FV'] || '0', 10),
    normalizedName: normalize(name)
  }
}

function transformProspectRanking(row: Record<string, string>): ProspectRanking {
  const name = row['Name'] || ''
  return {
    name,
    team: row['Team'] || '',
    position: row['Position'] || row['Pos'] || '',
    mlbRank: parseNumber(row['MLB Rank']),
    mlbPreseasonRank: parseNumber(row['MLB Preseason Rank']),
    klawRank: parseNumber(row['KLaw Rank']),
    eta: parseNumber(row['ETA']),
    normalizedName: normalize(name)
  }
}

// Fantrax "Standings - Point Totals" export. Category columns hold roto points
// (1..N teams), not raw stat values. AB/H/IP are unscored and left blank.
const STANDINGS_CAT_COLUMNS = ['PA', 'R', 'HR', 'RBI', 'SB', 'AVG', 'OBP', 'SLG', 'ERA', 'K', 'SV', 'HLD', 'QS', 'BB/9', 'H/IP']

function transformStanding(row: Record<string, string>): LeagueStanding {
  const num = (v: string | undefined): number | null => {
    const n = parseFloat((v || '').replace(/,/g, '').trim())
    return isNaN(n) ? null : n
  }
  const categoryPoints: Record<string, number | null> = {}
  for (const cat of STANDINGS_CAT_COLUMNS) {
    categoryPoints[cat] = num(row[cat])
  }
  return {
    rank: num(row['Rank']) ?? 0,
    team: (row['Team'] || '').trim(),
    points: num(row['Pts']) ?? 0,
    recentDelta: num(row['+/-']) ?? 0,
    gamesPlayed: num(row['GP']) ?? 0,
    categoryPoints
  }
}

function transformFPRanking(row: Record<string, string>): FantasyProsRanking {
  const name = row['PLAYER NAME'] || row['Player Name'] || ''
  const rawPos = row['POS'] || row['Pos'] || ''
  // Strip trailing digits from position (e.g. "SS1" -> "SS", "OF3" -> "OF")
  const pos = rawPos.replace(/\d+$/, '')
  const ecrRaw = row['ECR VS. ADP'] || row['ECR VS ADP'] || ''
  let ecrVsAdp: number | null = null
  if (ecrRaw && ecrRaw !== '-') {
    const parsed = parseInt(ecrRaw.replace('+', ''), 10)
    if (!isNaN(parsed)) ecrVsAdp = parsed
  }
  return {
    rank: parseInt(row['RK'] || row['Rank'] || '0', 10),
    name,
    team: row['TEAM'] || row['Team'] || '',
    pos,
    age: parseNumber(row['AGE'] || row['Age']),
    best: parseNumber(row['BEST'] || row['Best']),
    worst: parseNumber(row['WORST'] || row['Worst']),
    avg: parseNumber(row['AVG.'] || row['Avg']),
    stdDev: parseNumber(row['STD.DEV'] || row['Std Dev']),
    ecrVsAdp,
    normalizedName: normalize(name),
  }
}

function transformCloser(row: Record<string, string>): CloserEntry {
  const name = row['Player'] || ''
  return {
    team: row['Team'] || '',
    player: name,
    throws: row['Throws'] || '',
    role: row['Role'] || '',
    vfa: parseNumber(row['vFA']),
    vsi: parseNumber(row['vSI']),
    g: parseNumber(row['G']),
    ip: parseNumber(row['IP']),
    era: parseNumber(row['ERA']),
    sv: parseNumber(row['SV']),
    hld: parseNumber(row['HLD']),
    k9: parseNumber(row['K9']),
    kpct: parseNumber(row['KPct']),
    nameAscii: row['NameASCII'] || name,
    normalizedName: normalize(row['NameASCII'] || name),
  }
}

function transformCloserMonkey(row: Record<string, string>): CloserMonkeyEntry {
  const isCommittee = (row['Committee'] || '').trim() === '*'
  return {
    team: (row['Team'] || '').trim(),
    closer: (row['Closer'] || '').trim(),
    firstInLine: (row['1st in Line'] || '').trim(),
    secondInLine: (row['2nd in Line'] || '').trim(),
    updated: (row['Updated'] || '').trim(),
    isCommittee,
    closerNormalized: normalize(row['Closer'] || ''),
    firstNormalized: normalize(row['1st in Line'] || ''),
    secondNormalized: normalize(row['2nd in Line'] || ''),
  }
}

function transformFGMinorsBatter(row: Record<string, string>): FGMinorsBatter {
  const name = row['Name'] || ''
  return {
    name,
    team: row['Team'] || '',
    level: row['Level'] || '',
    age: parseInt(row['Age'] || '0', 10),
    pa: parseInt(row['PA'] || '0', 10),
    bbPct: parseFloat(row['BB%']?.replace('%', '') || '0'),
    kPct: parseFloat(row['K%']?.replace('%', '') || '0'),
    avg: parseFloat(row['AVG'] || '0'),
    obp: parseFloat(row['OBP'] || '0'),
    slg: parseFloat(row['SLG'] || '0'),
    ops: parseFloat(row['OPS'] || '0'),
    iso: parseFloat(row['ISO'] || '0'),
    babip: parseFloat(row['BABIP'] || '0'),
    woba: parseFloat(row['wOBA'] || '0'),
    wrcPlus: parseFloat(row['wRC+'] || '0'),
    playerId: row['PlayerId'] || '',
    normalizedName: normalize(name),
  }
}

function transformFGMinorsPitcher(row: Record<string, string>): FGMinorsPitcher {
  const name = row['Name'] || ''
  return {
    name,
    team: row['Team'] || '',
    level: row['Level'] || '',
    age: parseInt(row['Age'] || '0', 10),
    ip: parseFloat(row['IP'] || '0'),
    k9: parseFloat(row['K/9'] || '0'),
    bb9: parseFloat(row['BB/9'] || '0'),
    kPct: parseFloat(row['K%']?.replace('%', '') || '0'),
    bbPct: parseFloat(row['BB%']?.replace('%', '') || '0'),
    kMinusBbPct: parseFloat(row['K-BB%']?.replace('%', '') || '0'),
    whip: parseFloat(row['WHIP'] || '0'),
    babip: parseFloat(row['BABIP'] || '0'),
    lobPct: parseFloat(row['LOB%']?.replace('%', '') || '0'),
    era: parseFloat(row['ERA'] || '0'),
    fip: parseFloat(row['FIP'] || '0'),
    xfip: parseFloat(row['xFIP'] || '0'),
    playerId: row['PlayerId'] || '',
    normalizedName: normalize(name),
  }
}

export function parseCSVText<T>(text: string, type: FileType): T[] {
  const results = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  })
  return transformData(results.data as Record<string, string>[], type) as T[]
}

const DEFAULT_DATA_MANIFEST: { url: string; type: FileType }[] = [
  { url: '/data/all.csv', type: 'players' },
  { url: '/data/harryknowsball_players.csv', type: 'hkb' },
  { url: '/data/salaries.csv', type: 'salaries' },
  { url: '/data/batting_prospects.csv', type: 'battingProspects' },
  { url: '/data/pitching_prospects.csv', type: 'pitchingProspects' },
  { url: '/data/zips_batters.csv', type: 'zipsBatters' },
  { url: '/data/zips_pitchers.csv', type: 'zipsPitchers' },
  { url: '/data/zips_dc_batters.csv', type: 'zipsDcBatters' },
  { url: '/data/zips_dc_pitchers.csv', type: 'zipsDcPitchers' },
  { url: '/data/zips_dc_ros_advanced_batters.csv', type: 'zipsRosBatters' },
  { url: '/data/zips_dc_ros_advanced_pitchers.csv', type: 'zipsRosPitchers' },
  { url: '/data/free_agency.csv', type: 'freeAgency' },
  { url: '/data/fv_rankings.csv', type: 'fvRankings' },
  { url: '/data/prospect_rankings.csv', type: 'prospectRankings' },
  { url: '/data/standings.csv', type: 'standings' },
  { url: '/data/fantasypros_dynasty_rankings.csv', type: 'fpRankings' },
  { url: '/data/closers.csv', type: 'closers' },
  { url: '/data/closermonkey.csv', type: 'closermonkey' },
  { url: '/data/fangraphs_minors_batters.csv', type: 'fgMinorsBatters' },
  { url: '/data/fangraphs_minors_pitchers.csv', type: 'fgMinorsPitchers' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Store = any

export async function fetchAndLoadDefaults(
  store: Store,
  onFileLoaded?: (type: FileType, count: number) => void
): Promise<void> {
  // Map file types to store state keys for checking existing data
  const storeKeyMap: Record<FileType, string> = {
    players: 'rawPlayers',
    hkb: 'hkbPlayers',
    salaries: 'salaries',
    battingProspects: 'battingProspects',
    pitchingProspects: 'pitchingProspects',
    zipsBatters: 'zipsBatters',
    zipsPitchers: 'zipsPitchers',
    zipsDcBatters: 'zipsDcBatters',
    zipsDcPitchers: 'zipsDcPitchers',
    zipsRosBatters: 'zipsRosBatters',
    zipsRosPitchers: 'zipsRosPitchers',
    freeAgency: 'freeAgentEntries',
    fvRankings: 'fvRankings',
    prospectRankings: 'prospectRankings',
    standings: 'standings',
    fpRankings: 'fpRankings',
    closers: 'closers',
    closermonkey: 'closerMonkey',
    fgMinorsBatters: 'fgMinorsBatters',
    fgMinorsPitchers: 'fgMinorsPitchers',
  }

  const setterMap: Record<FileType, string> = {
    players: 'setPlayers',
    hkb: 'setHKB',
    salaries: 'setSalaries',
    battingProspects: 'setBattingProspects',
    pitchingProspects: 'setPitchingProspects',
    zipsBatters: 'setZipsBatters',
    zipsPitchers: 'setZipsPitchers',
    zipsDcBatters: 'setZipsDcBatters',
    zipsDcPitchers: 'setZipsDcPitchers',
    zipsRosBatters: 'setZipsRosBatters',
    zipsRosPitchers: 'setZipsRosPitchers',
    freeAgency: 'setFreeAgentEntries',
    fvRankings: 'setFVRankings',
    prospectRankings: 'setProspectRankings',
    standings: 'setStandings',
    fpRankings: 'setFPRankings',
    closers: 'setClosers',
    closermonkey: 'setCloserMonkey',
    fgMinorsBatters: 'setFGMinorsBatters',
    fgMinorsPitchers: 'setFGMinorsPitchers',
  }

  // Always fetch all bundled files so deploys with updated CSVs take effect
  const toFetch = DEFAULT_DATA_MANIFEST

  const results = await Promise.all(
    toFetch.map(async ({ url, type }) => {
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        const text = await res.text()
        const data = parseCSVText(text, type)
        return { type, data }
      } catch {
        return null
      }
    })
  )

  for (const result of results) {
    if (!result) continue
    const setter = store.getState()[setterMap[result.type]]
    if (typeof setter === 'function') {
      setter(result.data)
      onFileLoaded?.(result.type, result.data.length)
    }
  }

  store.getState().joinData()
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const num = parseFloat(value.replace(/,/g, ''))
  return isNaN(num) ? null : num
}

function parseCurrency(value: string): number {
  // Handle formats like "$ 35,700,000" or "$35,700,000" or just "35700000"
  const cleaned = value.replace(/[$,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}
