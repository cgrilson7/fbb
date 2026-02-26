import { usePlayerStore } from './store'

export function useHydration() {
  return usePlayerStore((s) => s._hasHydrated)
}
