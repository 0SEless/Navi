'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeftRight, Crosshair, Locate, MapPin, Navigation, QrCode, X } from 'lucide-react'
import { usePublicStore } from '@/store/public-store'
import { searchCampus, type SearchResult } from '@/lib/campus-search'
import { aStar } from '@/engine/a-star'
import { resolveNearestNode } from '@/lib/location-resolver'
import { QRScanSheet } from '@/components/map/QRScanSheet'
import type { PathResult } from '@/types/nav-types'

const CampusMap = dynamic(() => import('@/components/map/CampusMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--navi-text-secondary)]">
      Loading map…
    </div>
  ),
})

type PickerRole = 'from' | 'to'

export default function NavigatePage() {
  const campus = usePublicStore((s) => s.campus)
  const campusLoading = usePublicStore((s) => s.campusLoading)
  const campusError = usePublicStore((s) => s.campusError)
  const fetchCampusData = usePublicStore((s) => s.fetchCampusData)
  const fromNode = usePublicStore((s) => s.fromNode)
  const toNode = usePublicStore((s) => s.toNode)
  const setFrom = usePublicStore((s) => s.setFrom)
  const setTo = usePublicStore((s) => s.setTo)
  const setActiveFloor = usePublicStore((s) => s.setActiveFloor)
  const addRecentDestination = usePublicStore((s) => s.addRecentDestination)

  const [picker, setPicker] = useState<PickerRole | null>(null)
  const [query, setQuery] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [activeStepIdx, setActiveStepIdx] = useState(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    if (!campus && !campusLoading && !campusError) void fetchCampusData('asu-ibajay')
  }, [campus, campusLoading, campusError, fetchCampusData])

  // Deep links & refreshes: `?to=` / `?from=` prefill the route (the
  // search/explore pages and NAVI codes link here as /map/navigate?to=<id>).
  // We read window.location.search once on mount instead of using
  // useSearchParams — in Next 16 that hook forces a Suspense boundary during
  // static rendering, which this page doesn't otherwise need.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const to = params.get('to')
    const from = params.get('from')
    if (to) {
      setTo(to)
      addRecentDestination(to)
    }
    if (from) setFrom(from)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nodes = campus?.nodes ?? []
  const buildings = campus?.buildings ?? []

  const nodeById = useMemo(() => {
    const m = new Map<string, (typeof nodes)[number]>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  const buildingName = (id?: string) => buildings.find((b) => b.id === id)?.name ?? id

  const route = useMemo<PathResult | null>(() => {
    if (!fromNode || !toNode || nodes.length === 0) return null
    return aStar(nodes, campus?.edges ?? [], fromNode, toNode, {
      buildings,
    })
  }, [fromNode, toNode, nodes, buildings, campus])

  // Floor auto-switch: follow the active step (start by default)
  const activeStepNode = route?.steps[Math.min(activeStepIdx, route.steps.length - 1)]?.nodeId
  useEffect(() => {
    if (!activeStepNode) return
    const floor = nodeById.get(activeStepNode)?.floor
    if (floor !== undefined) setActiveFloor(floor)
  }, [activeStepNode, nodeById, setActiveFloor])

  // Reset step highlight when a new route is computed
  useEffect(() => {
    setActiveStepIdx(0)
  }, [fromNode, toNode])

  const searchResults = useMemo(() => {
    if (!picker || !campus) return []
    return searchCampus(campus, query)
  }, [picker, query, campus])

  const pick = (r: SearchResult) => {
    const nodeId = r.nodeId ?? r.id
    if (picker === 'from') setFrom(nodeId)
    else setTo(nodeId)
    setPicker(null)
    setQuery('')
  }

  const handleScanResolved = useCallback(
    (node: { id: string; label?: string }, mode: 'start' | 'destination') => {
      const label = node.label ?? node.id
      if (mode === 'start') {
        setFrom(node.id)
        showToast(`Current location set: ${label}`)
      } else {
        setTo(node.id)
        showToast(`Destination set: ${label}`)
      }
    },
    [setFrom, setTo, showToast],
  )

  const handleLocate = () => {
    if (locating) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showToast('Geolocation is not supported by this browser')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const resolved = resolveNearestNode(nodes, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        if (!resolved) {
          showToast('You are far from the campus — try scanning a NAVI code instead')
          return
        }
        setFrom(resolved.node.id)
        showToast(`Located at ${resolved.node.label ?? resolved.node.id} (${Math.round(resolved.distanceMeters)} m)`)
      },
      (err) => {
        setLocating(false)
        showToast(`Location unavailable — ${err.message}${err.code === 1 ? '. Try scanning a NAVI code.' : ''}`)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
  }

  const fromLabel = fromNode ? nodeById.get(fromNode)?.label ?? fromNode : null
  const toLabel = toNode ? nodeById.get(toNode)?.label ?? toNode : null

  return (
    <div className="relative flex-1 w-full overflow-hidden">
      {/* Top panel: from/to */}
      <div className="absolute left-4 right-4 top-4 z-20 rounded-2xl border border-[var(--navi-border)] bg-white p-3 shadow-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setPicker('from'); setQuery('') }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-[var(--navi-content)] px-3 py-2 text-left"
            aria-label="Choose start point"
          >
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            <span className={`truncate text-sm ${fromLabel ? 'text-[var(--navi-text)]' : 'text-[var(--navi-text-secondary)]'}`}>
              {fromLabel ?? 'Choose start…'}
            </span>
          </button>
          <button
            onClick={() => setPicker('to')}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-[var(--navi-content)] px-3 py-2 text-left"
            aria-label="Choose destination"
          >
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--navi-primary)]" />
            <span className={`truncate text-sm ${toLabel ? 'text-[var(--navi-text)]' : 'text-[var(--navi-text-secondary)]'}`}>
              {toLabel ?? 'Choose destination…'}
            </span>
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => { const f = fromNode; setFrom(toNode); setTo(f) }}
            className="flex items-center gap-1 rounded-lg border border-[var(--navi-border)] px-2.5 py-1.5 text-xs text-[var(--navi-text-secondary)] hover:text-[var(--navi-text)]"
            aria-label="Swap start and destination"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Swap
          </button>
          <button
            onClick={() => { setFrom(null); setTo(null) }}
            className="flex items-center gap-1 rounded-lg border border-[var(--navi-border)] px-2.5 py-1.5 text-xs text-[var(--navi-text-secondary)] hover:text-[var(--navi-text)]"
            aria-label="Clear route"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
          <button
            onClick={handleLocate}
            disabled={locating}
            className="flex items-center gap-1 rounded-lg border border-[var(--navi-border)] px-2.5 py-1.5 text-xs text-[var(--navi-text-secondary)] hover:text-[var(--navi-text)] disabled:opacity-50"
            aria-label="Use my current location"
            title="Use my current location"
          >
            <Crosshair className={`h-3.5 w-3.5 ${locating ? 'animate-spin' : ''}`} />
            {locating ? 'Locating…' : 'Locate me'}
          </button>
          <button
            onClick={() => setScanOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-[var(--navi-border)] px-2.5 py-1.5 text-xs text-[var(--navi-text-secondary)] hover:text-[var(--navi-text)]"
            aria-label="Scan a NAVI code"
            title="Scan a NAVI code"
          >
            <QrCode className="h-3.5 w-3.5" />
            Scan
          </button>
          <div className="ml-auto text-xs font-semibold text-[var(--navi-primary)]">
            {route ? `${Math.round(route.cost)} m` : ''}
          </div>
        </div>
      </div>

      <CampusMap route={route ? { path: route.path, cost: route.cost } : null} />

      {/* Toast */}
      {toast && (
        <div
          className="absolute inset-x-4 top-20 z-30 mx-auto max-w-md rounded-xl bg-[var(--navi-text)] px-4 py-2.5 text-center text-xs font-medium text-[var(--navi-card)] shadow-lg"
          role="status"
        >
          {toast}
        </div>
      )}

      {/* Campus load error — matches the search/explore pages' retry pattern */}
      {campusError && !campus && (
        <div className="absolute inset-x-4 top-20 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-[var(--navi-error)]/40 bg-[var(--navi-error)]/10 px-4 py-2.5 text-xs font-medium text-[var(--navi-error)] shadow-lg">
          <span className="min-w-0 flex-1 truncate">Couldn't load campus data — {campusError}</span>
          <button
            onClick={() => void fetchCampusData('asu-ibajay')}
            className="shrink-0 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      <QRScanSheet open={scanOpen} onClose={() => setScanOpen(false)} onResolved={handleScanResolved} />

      {/* Picker overlay */}
      {picker && (
        <div className="absolute inset-x-0 top-0 z-30 border-b border-[var(--navi-border)] bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${picker === 'from' ? 'bg-emerald-500' : 'bg-[var(--navi-primary)]'}`} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={picker === 'from' ? 'Search start point…' : 'Search destination…'}
              className="min-w-0 flex-1 rounded-lg bg-[var(--navi-content)] px-3 py-2 text-sm outline-none"
              aria-label="Search locations"
            />
            <button onClick={() => setPicker(null)} className="rounded-full p-1 text-[var(--navi-text-secondary)]" aria-label="Close search">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={`${r.kind}:${r.id}`}
                onClick={() => pick(r)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--navi-content)]"
              >
                {r.kind === 'building' ? <MapPin className="h-4 w-4 shrink-0 text-[var(--navi-text-secondary)]" /> : <Locate className="h-4 w-4 shrink-0 text-[var(--navi-text-secondary)]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--navi-text)]">{r.label}</span>
                  <span className="block truncate text-xs text-[var(--navi-text-secondary)]">
                    {[r.sublabel, r.floor !== undefined ? `Floor ${r.floor}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}
            {searchResults.length === 0 && query && (
              <div className="px-2 py-3 text-center text-sm text-[var(--navi-text-secondary)]">No matches</div>
            )}
          </div>
        </div>
      )}

      {/* Route steps — tap a step to follow it (switches the map floor) */}
      {route && route.steps.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[45%] overflow-y-auto rounded-t-2xl border-t border-[var(--navi-border)] bg-white p-3 pb-4 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--navi-text-secondary)]">
            <Navigation className="h-3.5 w-3.5" />
            Route steps
          </div>
          {route.steps.map((step, i) => {
            const inBuilding = nodeById.get(step.nodeId)
            const active = i === Math.min(activeStepIdx, route.steps.length - 1)
            return (
              <button
                key={i}
                onClick={() => setActiveStepIdx(i)}
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-2.5 text-left text-sm text-[var(--navi-text)] transition-colors ${
                  active ? 'bg-[var(--navi-primary)]/10' : 'hover:bg-[var(--navi-content)]'
                }`}
                aria-label={`Step ${i + 1}: ${step.instruction}`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    active
                      ? 'bg-[var(--navi-primary)] text-white'
                      : 'bg-[var(--navi-primary)]/10 text-[var(--navi-primary)]'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{step.instruction}</span>
                <span className="shrink-0 text-xs text-[var(--navi-text-secondary)]">
                  {step.distance > 0 ? `${Math.round(step.distance)} m` : ''}
                  {inBuilding?.floor !== undefined ? ` · F${inBuilding.floor}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
