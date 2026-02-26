'use client'

import { useEffect, useRef } from 'react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { fetchAndLoadDefaults } from '@/lib/csvParser'

export default function AutoLoadProvider({ children }: { children: React.ReactNode }) {
  const hasHydrated = useHydration()
  const started = useRef(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (started.current) return
    started.current = true
    fetchAndLoadDefaults(usePlayerStore, () => {})
  }, [hasHydrated])

  return <>{children}</>
}
