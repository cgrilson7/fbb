import Papa from 'papaparse'
import { normalize } from './normalize'
import type {
  Player,
  HKBPlayer,
  SalaryEntry,
  BattingProspect,
  PitchingProspect
} from '@/types'

export type FileType = 'players' | 'hkb' | 'salaries' | 'battingProspects' | 'pitchingProspects'

export function detectFileType(filename: string): FileType | null {
  const lower = filename.toLowerCase()
  // Check harryknowsball FIRST (contains "all" which would match players)
  if (lower.includes('harryknowsball') || lower.includes('hkb')) return 'hkb'
  if (lower.includes('salaries') || lower.includes('salary')) return 'salaries'
  if (lower.includes('batting') && lower.includes('prospect')) return 'battingProspects'
  if (lower.includes('pitching') && lower.includes('prospect')) return 'pitchingProspects'
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

function transformData(rows: Record<string, string>[], type: FileType): unknown[] {
  switch (type) {
    case 'players':
      return rows.map(transformPlayer)
    case 'hkb':
      return rows.map(transformHKB)
    case 'salaries':
      return rows.map(transformSalary)
    case 'battingProspects':
      return rows.map(transformBattingProspect)
    case 'pitchingProspects':
      return rows.map(transformPitchingProspect)
    default:
      return rows
  }
}

function transformPlayer(row: Record<string, string>): Player {
  const name = row['Player'] || row['Name'] || ''
  const status = row['Status'] || 'FA'
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
    // Derived
    isAvailable: status === 'FA',
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

  // Parse yearly salary columns (2025, 2026, ... 2031)
  // Format: "2026 Salary Hit" or similar
  for (let year = 2025; year <= 2031; year++) {
    const key = Object.keys(row).find(k =>
      k.includes(year.toString()) && k.toLowerCase().includes('salary')
    )
    if (key && row[key]) {
      salaryByYear[year] = parseCurrency(row[key])
    }
  }

  return {
    playerName,
    franchise: getValue(['Franchise', 'Owner']).trim(),
    contractType: getValue(['Contract Type']).trim(),
    salary: parseCurrency(getValue(['Salary']) || '0'),
    contractLength: parseInt(getValue(['Contract Length']) || '1', 10),
    contractStarts: parseInt(getValue(['Contract Starts']) || '2026', 10),
    contractEnds: parseInt(getValue(['Contract Ends']) || '2026', 10),
    salaryByYear,
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
