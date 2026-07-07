'use client'

import { Search } from 'lucide-react'

export default function SearchPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center">
      <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <Search className="h-6 w-6 text-[var(--navi-primary)]" />
      </div>
      <h1 className="text-xl font-semibold text-[var(--navi-text)]">Search</h1>
      <p className="text-sm text-[var(--navi-text-secondary)] mt-1">Search coming in Phase 4</p>
    </div>
  )
}
