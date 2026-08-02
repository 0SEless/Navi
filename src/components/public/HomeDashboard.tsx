'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Compass, Camera, ShieldAlert, Clock, ChevronRight } from 'lucide-react'
import { usePublicStore } from '@/store/public-store'
import { useAuth } from '@/hooks/useAuth'
import { useHydrated } from '@/hooks/useHydrated'
import { EmergencyOverlay } from './EmergencyOverlay'

interface Announcement {
  id: string
  icon: string
  title: string
  description: string
  time: string
}

const mockAnnouncements: Announcement[] = [
  {
    id: 'a1',
    icon: '📢',
    title: 'Campus Tour Available',
    description: 'New self-guided tour route is now open at the main campus.',
    time: '2 hours ago',
  },
  {
    id: 'a2',
    icon: '🔧',
    title: 'Building 3 Renovation',
    description: 'Science wing construction may cause detours until August.',
    time: '1 day ago',
  },
  {
    id: 'a3',
    icon: '🎉',
    title: 'Freshman Orientation',
    description: 'Welcome event this Friday. Use NAVI to find your way around!',
    time: '3 days ago',
  },
]

interface QuickAction {
  id: string
  label: string
  icon: typeof MapPin
  color: string
  bgColor: string
  action: () => void
}

export function HomeDashboard() {
  const router = useRouter()
  const hydrated = useHydrated()
  const { user } = useAuth()
  const recentDestinations = usePublicStore((s) => s.recentDestinations)
  const setTab = usePublicStore((s) => s.setTab)
  const setTo = usePublicStore((s) => s.setTo)
  const addRecentDestination = usePublicStore((s) => s.addRecentDestination)

  const [emergencyOpen, setEmergencyOpen] = useState(false)

  const greeting = user?.name ?? 'Guest'

  const quickActions: QuickAction[] = [
    {
      id: 'navigate',
      label: 'Navigate',
      icon: MapPin,
      color: '#2563EB',
      bgColor: 'bg-blue-50',
      action: () => setTab('navigate'),
    },
    {
      id: 'explore',
      label: 'Explore Campus',
      icon: Compass,
      color: '#0EA5E9',
      bgColor: 'bg-sky-50',
      action: () => setTab('explore'),
    },
    {
      id: 'panorama',
      label: '360 Panorama',
      icon: Camera,
      color: '#D97706',
      bgColor: 'bg-amber-50',
      action: () => router.push('/map/panoramas'),
    },
    {
      id: 'emergency',
      label: 'Emergency',
      icon: ShieldAlert,
      color: '#DC2626',
      bgColor: 'bg-red-50',
      action: () => setEmergencyOpen(true),
    },
  ]

  const handleRecentTap = (nodeId: string) => {
    setTo(nodeId)
    addRecentDestination(nodeId)
    setTab('navigate')
  }

  return (
    <div className="flex flex-col min-h-full p-4 pb-8">
      {/* Greeting */}
      <h1 className="text-2xl font-bold text-[var(--navi-text)] mb-1">
        Hello, {greeting}!
      </h1>
      <p className="text-sm text-[var(--navi-text-secondary)] mb-4">
        Where would you like to go?
      </p>

      {/* Search bar */}
      <button
        onClick={() => router.push('/map/search')}
        className="flex items-center gap-3 w-full px-4 py-3 rounded-[var(--navi-radius-sm)] border border-[var(--navi-border)] bg-white shadow-sm hover:border-[var(--navi-primary)] transition-colors mb-6"
      >
        <Search className="h-4 w-4 text-[var(--navi-text-secondary)]" />
        <span className="text-sm text-[var(--navi-text-secondary)]">Search buildings, rooms, or places...</span>
      </button>

      {/* Quick action cards (2×2 grid) */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {quickActions.map((action) => (
          <button
            key={action.id}
            onClick={action.action}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-[var(--navi-radius-sm)] ${action.bgColor} border border-transparent hover:border-[var(--navi-border)] transition-all cursor-pointer`}
            aria-label={action.label}
          >
            <action.icon className="h-6 w-6" style={{ color: action.color }} />
            <span className="text-xs font-medium text-[var(--navi-text)] text-center leading-tight">
              {action.label}
            </span>
          </button>
        ))}
      </div>

      {/* Emergency overlay */}
      <EmergencyOverlay open={emergencyOpen} onOpenChange={setEmergencyOpen} />

      {/* Recent destinations */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--navi-text)]">Recent Destinations</h2>
          <Clock className="h-3.5 w-3.5 text-[var(--navi-text-secondary)]" />
        </div>
        {hydrated && recentDestinations.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
            {recentDestinations.map((nodeId) => (
              <button
                key={nodeId}
                onClick={() => handleRecentTap(nodeId)}
                className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-full border border-[var(--navi-border)] bg-white text-xs text-[var(--navi-text)] hover:border-[var(--navi-primary)] hover:text-[var(--navi-primary)] transition-colors whitespace-nowrap"
              >
                <MapPin className="h-3 w-3" />
                {nodeId}
                <ChevronRight className="h-3 w-3 text-[var(--navi-text-secondary)]" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--navi-text-secondary)] italic">
            No recent destinations yet. Search or tap on the map to get started.
          </p>
        )}
      </section>

      {/* Campus announcements */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--navi-text)] mb-3">
          Campus Announcements
        </h2>
        <div className="space-y-2">
          {mockAnnouncements.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 rounded-[var(--navi-radius-sm)] bg-white border border-[var(--navi-border)]"
            >
              <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">{item.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-[var(--navi-text)]">{item.title}</h3>
                  <span className="text-[10px] text-[var(--navi-text-secondary)] shrink-0">{item.time}</span>
                </div>
                <p className="text-xs text-[var(--navi-text-secondary)] mt-0.5 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
