'use client'

import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Upload,
  Users,
  ArrowLeftRight,
  Star,
  DollarSign,
  Gavel,
  Layers,
  Link2,
  Building2,
  Diamond,
  Sprout,
  ClipboardList,
  Moon,
  Sun
} from 'lucide-react'
import { useState, useEffect } from 'react'
import AutoLoadProvider from '@/lib/AutoLoadProvider'

const navItems = [
  { href: '/', label: 'Upload', icon: Upload },
  { href: '/players', label: 'Players', icon: Users },
  { href: '/trade', label: 'Trade', icon: ArrowLeftRight },
  { href: '/prospects', label: 'Prospects', icon: Star },
  { href: '/farm-system', label: 'Farms', icon: Sprout },
  { href: '/salaries', label: 'Salaries', icon: DollarSign },
  { href: '/free-agency', label: 'Free Agency', icon: Gavel },
  { href: '/pool', label: 'Pool', icon: Layers },
  { href: '/rfo', label: 'RFO', icon: ClipboardList },
  { href: '/match', label: 'Match', icon: Link2 },
  { href: '/franchise-value', label: 'Value', icon: Diamond },
  { href: '/franchises', label: 'Franchises', icon: Building2 },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('darkMode')
    if (stored) setDarkMode(JSON.parse(stored))
  }, [])

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  return (
    <html lang="en" className={darkMode ? 'dark' : ''}>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-8">
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  FBB Dynasty
                </span>
                <div className="flex space-x-1">
                  {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-1.5" />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </nav>
        <AutoLoadProvider>
          <main className="max-w-7xl mx-auto px-4 py-6">
            {children}
          </main>
        </AutoLoadProvider>
      </body>
    </html>
  )
}
