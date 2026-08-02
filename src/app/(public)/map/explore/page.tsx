'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Building2, DoorOpen, Layers, Navigation, RotateCcw, Search, Share2, X } from 'lucide-react'
import { usePublicStore } from '@/store/public-store'
import type { Building, CampusBundle } from '@/types/nav-types'
import { buildingStats, resolveBuildingEntranceNode } from '@/lib/campus-geometry'
import { LocationShareSheet } from '@/components/map/LocationShareSheet'

const CampusMap = dynamic(() => import('@/components/public/CampusMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--navi-text-secondary)]">
      Loading map…
    </div>
  ),
})

export default function ExplorePage() {
  const router = useRouter()
  const campus = usePublicStore((s) => s.campus)
  const campusLoading = usePublicStore((s) => s.campusLoading)
  const campusError = usePublicStore((s) => s.campusError)
  const fetchCampusData = usePublicStore((s) => s.fetchCampusData)
  const selectedBuilding = usePublicStore((s) => s.selectedBuilding)

  useEffect(() => {
    if (!campus && !campusLoading && !campusError) void fetchCampusData('asu-ibajay')
  }, [campus, campusLoading, campusError, fetchCampusData])

  if (campusError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="text-sm text-[var(--navi-text-secondary)]">
          Couldn't load the campus map.
        </div>
        <div className="text-xs text-[var(--navi-error)]">{campusError}</div>
        <button
          onClick={() => void fetchCampusData('asu-ibajay')}
          className="flex items-center gap-2 rounded-lg bg-[var(--navi-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          <RotateCcw className="h-4 w-4" />
          Retry
        </button>
      </div>
    )
  }

  if (!campus || campusLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="h-12 w-full animate-pulse rounded-2xl bg-[var(--navi-border)]/60" />
        <div className="flex-1 animate-pulse rounded-2xl bg-[var(--navi-border)]/40" />
      </div>
    )
  }

  if (campus.buildings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <Building2 className="h-8 w-8 text-[var(--navi-text-secondary)]" />
        <div className="text-sm text-[var(--navi-text-secondary)]">
          No buildings available on this campus yet.
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1 w-full overflow-hidden">
      <CampusMap bundle={campus} />

      {/* Search entry */}
      <button
        onClick={() => router.push('/map/search')}
        className="absolute left-4 right-16 top-4 z-20 flex items-center gap-2 rounded-xl border border-[var(--navi-border)] bg-white px-3 py-2.5 text-left shadow-lg"
        aria-label="Search campus"
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--navi-text-secondary)]" />
        <span className="flex-1 truncate text-sm text-[var(--navi-text-secondary)]">
          Search rooms, buildings…
        </span>
      </button>

      <BuildingDetailSheet building={selectedBuilding ?? undefined} bundle={campus} />
    </div>
  )
}

interface SheetProps {
  building: Building | undefined
  bundle: CampusBundle
}

/** Bottom-sheet detail panel for the selected building (mobile & desktop). */
function BuildingDetailSheet({ building, bundle }: SheetProps) {
  const router = useRouter()
  const selectBuilding = usePublicStore((s) => s.selectBuilding)
  const setSheet = usePublicStore((s) => s.setSheet)
  const setTo = usePublicStore((s) => s.setTo)
  const addRecentDestination = usePublicStore((s) => s.addRecentDestination)
  const [shareOpen, setShareOpen] = useState(false)

  const stats = useMemo(
    () => (building ? buildingStats(bundle, building.id) : null),
    [bundle, building],
  )

  const rooms = useMemo(() => {
    if (!building) return []
    return bundle.searchEntries
      .filter((e) => e.type === 'room' && e.buildingId === building.id)
      .slice(0, 8)
  }, [bundle, building])

  const shareNode = useMemo(() => {
    if (!building) return null
    return (
      bundle.nodes.find((n) => n.buildingId === building.id && n.type === 'entrance') ??
      bundle.nodes.find((n) => n.buildingId === building.id) ??
      null
    )
  }, [bundle, building])

  const floorRange =
    building && building.floors.length > 1
      ? `Floors ${Math.min(...building.floors)}\u2013${Math.max(...building.floors)}`
      : `Floor ${building?.floors[0] ?? 0}`

  if (!building) return null

  const handleNavigate = () => {
    const nodeId = resolveBuildingEntranceNode(bundle, building.id)
    if (!nodeId) return
    setTo(nodeId)
    addRecentDestination(nodeId)
    router.push(`/map/navigate?to=${nodeId}`)
  }

  const handleClose = () => {
    selectBuilding(null)
    setSheet('hidden')
  }

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-[var(--navi-border)] bg-[var(--navi-card)] shadow-[0_-8px_24px_rgba(0,0,0,0.15)]"
      style={{ maxHeight: '45%', overflowY: 'auto' }}
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--navi-border)]" />
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-[var(--navi-text)]">
              {building.name}
            </h2>
            {building.code && (
              <span className="shrink-0 rounded-md bg-[var(--navi-primary-light)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--navi-primary)]">
                {building.code}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-[var(--navi-text-secondary)]">
            {[building.category, building.description].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button
          onClick={handleClose}
          className="ml-2 shrink-0 rounded-full p-1.5 text-[var(--navi-text-secondary)] hover:bg-[var(--navi-border)]/50"
          aria-label="Close building details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {stats && (
        <div className="mt-3 grid grid-cols-3 gap-2 px-4">
          <StatChip icon={<Layers className="h-3.5 w-3.5" />} label="Floors" value={stats.floors} />
          <StatChip icon={<DoorOpen className="h-3.5 w-3.5" />} label="Rooms" value={stats.rooms} />
          <StatChip icon={<Navigation className="h-3.5 w-3.5" />} label="Entrances" value={stats.entrances} />
        </div>
      )}

      {rooms.length > 0 && (
        <div className="px-4 pb-1 pt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--navi-text-secondary)]">
            Rooms
          </div>
          <div className="space-y-1">
            {rooms.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs text-[var(--navi-text)]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--navi-primary)]" />
                <span className="flex-1 truncate">{r.label}</span>
                {r.floor !== undefined && (
                  <span className="text-[10px] text-[var(--navi-text-secondary)]">F{r.floor}</span>
                )}
              </div>
            ))}
            {bundle.searchEntries.filter((e) => e.type === 'room' && e.buildingId === building.id)
              .length > 8 && (
              <div className="pt-0.5 text-center text-[10px] text-[var(--navi-text-secondary)]">
                + more rooms
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-[var(--navi-border)] p-3">
        <div className="flex gap-2">
          <button
            onClick={handleNavigate}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--navi-primary)] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Navigation className="h-4 w-4" />
            Navigate here
          </button>
          {shareNode && (
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--navi-border)] px-4 py-2.5 text-sm font-semibold text-[var(--navi-text)] transition-colors hover:bg-[var(--navi-content)]"
              aria-label={`Share ${building.name} as NAVI code`}
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          )}
        </div>
      </div>

      <LocationShareSheet
        open={shareOpen}
        campusId={building.campusId}
        nodeId={shareNode?.id ?? ''}
        label={building.name}
        sublabel={floorRange}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[var(--navi-content)] px-2.5 py-2">
      <span className="text-[var(--navi-primary)]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight text-[var(--navi-text)]">
          {value}
        </span>
        <span className="block truncate text-[10px] text-[var(--navi-text-secondary)]">{label}</span>
      </span>
    </div>
  )
}
