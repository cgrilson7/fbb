import type { StateStorage } from 'zustand/middleware'

const IDB_KEY_PREFIX = 'fbb-dynasty'

const isServer = typeof window === 'undefined'

// Lazy-load idb-keyval to avoid SSR issues (it accesses indexedDB at import time)
async function getIdb() {
  const { get, set, del } = await import('idb-keyval')
  return { get, set, del }
}

export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (isServer) return null

    const { get } = await getIdb()
    const value = await get(`${IDB_KEY_PREFIX}:${name}`)
    if (value !== undefined) return value as string

    // One-time migration from localStorage
    const lsValue = localStorage.getItem(name)
    if (lsValue) {
      const { set } = await getIdb()
      await set(`${IDB_KEY_PREFIX}:${name}`, lsValue)
      localStorage.removeItem(name)
      return lsValue
    }

    return null
  },

  setItem: async (name: string, value: string): Promise<void> => {
    if (isServer) return
    const { set } = await getIdb()
    await set(`${IDB_KEY_PREFIX}:${name}`, value)
  },

  removeItem: async (name: string): Promise<void> => {
    if (isServer) return
    const { del } = await getIdb()
    await del(`${IDB_KEY_PREFIX}:${name}`)
  },
}
