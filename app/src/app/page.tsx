'use client'

import { useState, useEffect } from 'react'
import { Upload, Check, AlertCircle, FileText, Loader2 } from 'lucide-react'
import { usePlayerStore } from '@/lib/store'
import { useHydration } from '@/lib/useHydration'
import { parseCSV, detectFileType, fetchAndLoadDefaults, FileType } from '@/lib/csvParser'

interface UploadStatus {
  type: FileType
  status: 'pending' | 'uploading' | 'uploaded' | 'error'
  count?: number
  error?: string
}

const fileTypes: { type: FileType; label: string; description: string }[] = [
  { type: 'players', label: 'all.csv', description: 'Base player universe from Fantrax' },
  { type: 'hkb', label: 'harryknowsball_players.csv', description: 'Dynasty rankings' },
  { type: 'salaries', label: 'salaries.csv', description: 'League contracts' },
  { type: 'battingProspects', label: 'batting_prospects.csv', description: 'MiLB batting stats' },
  { type: 'pitchingProspects', label: 'pitching_prospects.csv', description: 'MiLB pitching stats' },
  { type: 'zipsBatters', label: 'zips_batters.csv', description: 'ZiPS batter projections' },
  { type: 'zipsPitchers', label: 'zips_pitchers.csv', description: 'ZiPS pitcher projections' },
  { type: 'freeAgency', label: 'free_agency.csv', description: 'Free agent auction tracker' },
  { type: 'fvRankings', label: 'fv_rankings.csv', description: 'FanGraphs Future Value rankings' },
]

// Map file types to store state keys
const storeKeyMap: Record<FileType, string> = {
  players: 'rawPlayers',
  hkb: 'hkbPlayers',
  salaries: 'salaries',
  battingProspects: 'battingProspects',
  pitchingProspects: 'pitchingProspects',
  zipsBatters: 'zipsBatters',
  zipsPitchers: 'zipsPitchers',
  freeAgency: 'freeAgentEntries',
  fvRankings: 'fvRankings',
}

export default function UploadPage() {
  const [uploads, setUploads] = useState<Record<FileType, UploadStatus>>({
    players: { type: 'players', status: 'pending' },
    hkb: { type: 'hkb', status: 'pending' },
    salaries: { type: 'salaries', status: 'pending' },
    battingProspects: { type: 'battingProspects', status: 'pending' },
    pitchingProspects: { type: 'pitchingProspects', status: 'pending' },
    zipsBatters: { type: 'zipsBatters', status: 'pending' },
    zipsPitchers: { type: 'zipsPitchers', status: 'pending' },
    freeAgency: { type: 'freeAgency', status: 'pending' },
    fvRankings: { type: 'fvRankings', status: 'pending' },
  })

  const store = usePlayerStore()
  const { setPlayers, setHKB, setSalaries, setBattingProspects, setPitchingProspects, setZipsBatters, setZipsPitchers, setFreeAgentEntries, setFVRankings, joinData } = store
  const hasHydrated = useHydration()

  const [isJoining, setIsJoining] = useState(false)

  const [autoFetching, setAutoFetching] = useState(false)

  // After hydration, show green checkmarks for already-persisted data
  useEffect(() => {
    if (!hasHydrated) return
    setUploads(prev => {
      const next = { ...prev }
      for (const ft of fileTypes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const arr = (store as any)[storeKeyMap[ft.type]] as unknown[]
        if (arr && arr.length > 0 && next[ft.type].status === 'pending') {
          next[ft.type] = { type: ft.type, status: 'uploaded', count: arr.length }
        }
      }
      return next
    })
  }, [hasHydrated, store])

  // Auto-fetch bundled CSV data if store is empty after hydration
  useEffect(() => {
    if (!hasHydrated) return
    if (store.rawPlayers.length > 0) return
    setAutoFetching(true)
    fetchAndLoadDefaults(usePlayerStore, (type, count) => {
      setUploads(prev => ({
        ...prev,
        [type]: { type, status: 'uploaded', count }
      }))
    }).finally(() => setAutoFetching(false))
  }, [hasHydrated, store.rawPlayers.length])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      console.log(`Processing file: ${file.name}`)
      const detectedType = detectFileType(file.name)
      console.log(`Detected type: ${detectedType}`)
      if (!detectedType) {
        console.warn(`Unknown file type: ${file.name}`)
        continue
      }

      // Set uploading state
      setUploads(prev => ({
        ...prev,
        [detectedType]: { type: detectedType, status: 'uploading' }
      }))

      try {
        console.log(`Parsing ${file.name} as ${detectedType}...`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any[] = await parseCSV(file, detectedType)
        console.log(`Parsed ${data.length} records from ${file.name}`, data.slice(0, 2))

        switch (detectedType) {
          case 'players':
            setPlayers(data)
            break
          case 'hkb':
            setHKB(data)
            break
          case 'salaries':
            setSalaries(data)
            break
          case 'battingProspects':
            setBattingProspects(data)
            break
          case 'pitchingProspects':
            setPitchingProspects(data)
            break
          case 'zipsBatters':
            setZipsBatters(data)
            break
          case 'zipsPitchers':
            setZipsPitchers(data)
            break
          case 'freeAgency':
            setFreeAgentEntries(data)
            break
          case 'fvRankings':
            setFVRankings(data)
            break
        }

        console.log(`Setting upload status for ${detectedType} to uploaded with ${data.length} records`)
        setUploads(prev => {
          const newState = {
            ...prev,
            [detectedType]: { type: detectedType, status: 'uploaded', count: data.length }
          }
          console.log('New uploads state:', newState)
          return newState
        })
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error)
        setUploads(prev => ({
          ...prev,
          [detectedType]: {
            type: detectedType,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }))
      }
    }

    // After all uploads, join the data
    setIsJoining(true)
    joinData()
    setIsJoining(false)
  }

  const uploadedCount = Object.values(uploads).filter(u => u.status === 'uploaded').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Fantasy Baseball Analysis Suite
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Upload your CSV files to get started. Colin Wilson & Greg Holmes franchise.
        </p>
      </div>

      {/* Upload Zone */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
          <div className="flex flex-col items-center">
            <Upload className="w-12 h-12 text-gray-400 mb-3" />
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
              Drop CSV files here or click to upload
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Upload multiple files at once
            </p>
          </div>
          <input
            type="file"
            className="hidden"
            accept=".csv"
            multiple
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* File Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fileTypes.map(({ type, label, description }) => {
          const upload = uploads[type]
          return (
            <div
              key={type}
              className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 ${
                upload.status === 'uploaded'
                  ? 'border-green-500'
                  : upload.status === 'uploading'
                  ? 'border-blue-500'
                  : upload.status === 'error'
                  ? 'border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-gray-400 mr-2" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{label}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                  </div>
                </div>
                {upload.status === 'uploading' && (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                )}
                {upload.status === 'uploaded' && (
                  <div className="flex items-center text-green-600 dark:text-green-400">
                    <Check className="w-5 h-5" />
                    <span className="ml-1 text-sm">{upload.count?.toLocaleString()}</span>
                  </div>
                )}
                {upload.status === 'error' && (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
              {upload.status === 'error' && upload.error && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{upload.error}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Progress Summary */}
      {autoFetching && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
          <p className="text-blue-800 dark:text-blue-300">
            Loading bundled data files...
          </p>
        </div>
      )}
      {isJoining && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-yellow-600 dark:text-yellow-400 animate-spin" />
          <p className="text-yellow-800 dark:text-yellow-300">
            Joining data sources...
          </p>
        </div>
      )}
      {!isJoining && uploadedCount > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-blue-800 dark:text-blue-300">
            <span className="font-medium">{uploadedCount} of {fileTypes.length}</span> files uploaded.
            {uploadedCount === fileTypes.length && ' All data loaded! Navigate to other pages to explore.'}
          </p>
        </div>
      )}
    </div>
  )
}
