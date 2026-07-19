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
  Repeat,
  Trophy,
  Shield,
  Handshake,
  Moon,
  Sun,
  Menu,
  X
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
  { href: '/standings', label: 'Standings', icon: Trophy },
  { href: '/deadline', label: 'Deadline', icon: Handshake },
  { href: '/closers', label: 'Closers', icon: Shield },
  { href: '/waiver-wire', label: 'Waivers', icon: Repeat },
  { href: '/franchises', label: 'Franchises', icon: Building2 },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [darkMode, setDarkMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close the mobile menu on navigation
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

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
        {/* Mobile top bar */}
        <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center gap-3 px-4 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            className="p-1.5 -ml-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
            FBB Dynasty
          </span>
        </header>
        {/* Backdrop when mobile menu is open */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-x-0 top-14 bottom-0 z-30 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`fixed top-14 bottom-0 md:inset-y-0 left-0 z-30 w-52 flex flex-col bg-white dark:bg-gray-800 shadow-sm border-r border-gray-200 dark:border-gray-700 transition-transform duration-200 md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="hidden md:flex h-16 items-center px-4 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
              FBB Dynasty
            </span>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
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
                  <Icon className="w-4 h-4 mr-2" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="px-2 py-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="flex items-center w-full px-3 py-2 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {darkMode ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
              {darkMode ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </aside>
        <AutoLoadProvider>
          <main className="md:ml-52 px-4 md:px-6 pt-[4.5rem] md:pt-6 pb-6">
            {children}
          </main>
        </AutoLoadProvider>
      </body>
    </html>
  )
}
