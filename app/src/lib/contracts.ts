// Contract / salary helpers for dynasty trade evaluation.
import type { Player } from '@/types'

export interface ContractInfo {
  yearsRemaining: number
  total: number
  aav: number
  byYear: { year: number; salary: number }[]
  type: string
}

// Remaining contract from `fromYear` onward (years with a positive salary hit).
export function remainingContract(p: Player, fromYear = 2026): ContractInfo {
  const byYear = Object.entries(p.salaryByYear || {})
    .map(([y, s]) => ({ year: Number(y), salary: s }))
    .filter(x => x.year >= fromYear && x.salary > 0)
    .sort((a, b) => a.year - b.year)
  const total = byYear.reduce((s, x) => s + x.salary, 0)
  return {
    yearsRemaining: byYear.length,
    total,
    aav: byYear.length > 0 ? total / byYear.length : 0,
    byYear,
    type: p.contractType || '',
  }
}

export function fmtM(v: number): string {
  if (v === 0) return '$0'
  const m = v / 1_000_000
  if (Math.abs(m) >= 1) return `$${m.toFixed(1)}M`
  return `$${Math.round(v / 1000)}K`
}

// "3yr · $39.7M/yr"  (years remaining + AAV)
export function contractCompact(c: ContractInfo): string {
  if (c.yearsRemaining === 0) return 'expiring'
  return `${c.yearsRemaining}yr · ${fmtM(c.aav)}/yr`
}

// "'26 18.5 · '27 18.5 · '28 18.5"
export function contractByYearStr(c: ContractInfo): string {
  if (c.byYear.length === 0) return 'no future salary'
  return c.byYear.map(x => `'${String(x.year).slice(2)} ${(x.salary / 1_000_000).toFixed(1)}`).join(' · ')
}
