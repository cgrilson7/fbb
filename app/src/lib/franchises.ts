// Canonical franchise identity table — single source of truth linking the
// three name vocabularies used across the data files:
//   code        → all.csv "Status" column (Fantrax roster short code)
//   salaryName  → salaries.csv / free_agency.csv "Franchise" column
//   fantraxName → standings.csv "Team" column (Fantrax team name)
//   displayName → what the app shows in UI (store FranchiseMapping fullName)
//
// Verified 2026-07-13 by roster-name overlap: for every code, the set of
// player names on its all.csv roster was intersected with every salaries.csv
// franchise's active contracts. Each code matched exactly one salary
// franchise (38-55 shared names) and had zero overlap with all others.
export interface Franchise {
  code: string
  displayName: string
  salaryName: string
  fantraxName: string
}

export const FRANCHISES: Franchise[] = [
  { code: 'B&A', displayName: 'Ben Brody & Aaron', salaryName: 'Ben Brody & Aaron', fantraxName: 'Bionic Big Boys' },
  { code: 'JD', displayName: 'JD Barnett', salaryName: 'JD Barnett', fantraxName: 'J.D. Barnett' },
  { code: 'ELLY', displayName: 'Dustin Hart & Max Wamp', salaryName: 'Dustin Hart & Max Wamp', fantraxName: 'Ellygal Immigrants' },
  { code: 'T', displayName: 'Tyler Hart', salaryName: 'Tyler Hart', fantraxName: 'Tyler' },
  { code: 'Zack', displayName: 'Zack Semler', salaryName: 'Zack Semler', fantraxName: 'Zack' },
  { code: 'Steve', displayName: 'Steve Cornish', salaryName: 'Steve Cornish', fantraxName: 'Steve Cornish' },
  { code: 'R&J', displayName: 'Ross & Jack Kantor', salaryName: 'Ross & Jack Kantor', fantraxName: 'Ross & Jack' },
  { code: 'C&G', displayName: 'Colin Wilson & Greg Holmes', salaryName: 'Colin Wilson & Greg Holmes', fantraxName: 'Colin & Greg' },
  { code: 'J&A', displayName: 'Jake Zuckman & Andrew Meyers', salaryName: 'Jake Zuckman & Andrew Meyers', fantraxName: 'E.T. Phone Holmes' },
  { code: 'Max', displayName: 'Max Mastbaum, Jake Mastbaum & Sam Elias', salaryName: 'Max, Jake & Sam', fantraxName: 'Max Mastbaum & co' },
  { code: 'Kai', displayName: 'Kai Nelson', salaryName: 'Kai Nelson', fantraxName: 'Kai Nelson' },
  { code: 'Brian', displayName: 'Brian Frederick', salaryName: 'Brian Frederick', fantraxName: 'Brian Frederick' },
  { code: 'Brenden', displayName: 'Brenden Freedman', salaryName: 'Brenden Freedman', fantraxName: 'Brenden' },
  { code: 'Ethan', displayName: 'Ethan Gobetz', salaryName: 'Ethan Gobetz', fantraxName: 'Ethan Gobetz' },
]

export const CODE_TO_FRANCHISE = new Map(FRANCHISES.map(f => [f.code, f]))
export const FANTRAX_NAME_TO_CODE = new Map(FRANCHISES.map(f => [f.fantraxName, f.code]))

// Owner-name strings drift across files ("Max, Jake & Sam" in salaries.csv,
// "Max, Jake, Sam" and "Ben Brody & Aaron:" in free_agency.csv), so lookups
// go through a loose key: lowercase alphanumerics only.
const looseKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const OWNER_NAME_TO_CODE = new Map<string, string>()
for (const f of FRANCHISES) {
  OWNER_NAME_TO_CODE.set(looseKey(f.salaryName), f.code)
  OWNER_NAME_TO_CODE.set(looseKey(f.displayName), f.code)
  OWNER_NAME_TO_CODE.set(looseKey(f.fantraxName), f.code)
}
OWNER_NAME_TO_CODE.set(looseKey('Max, Jake, Sam'), 'Max')

/** Resolve any owner/franchise name string (from salaries.csv,
 *  free_agency.csv, standings.csv, or app display) to its status code. */
export function ownerNameToCode(name: string): string | null {
  return OWNER_NAME_TO_CODE.get(looseKey(name)) ?? null
}
