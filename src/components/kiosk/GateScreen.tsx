'use client'

import dynamic from 'next/dynamic'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import type { CampusBundle, SearchEntry } from '@/types/nav-types'
import type { NavRoute } from '@/types/route-types'
import { findNavRoute } from '@/lib/findRoute'
import { estimatePresentationEtaMinutes, formatNavigationDistance, getNavigationRouteComposition } from '@/lib/navigation-experience'
import { GATE_IDLE_MS, useIdleReset } from '@/hooks/useIdleReset'

const ExploreMap = dynamic(() => import('@/components/public/ExploreMap'), { ssr: false })

export function gateHandoffUrl(origin: string, checkpointId: string, toNodeId: string): string {
  return `${origin}/map/navigate?qr=${encodeURIComponent(checkpointId)}&to=${encodeURIComponent(toNodeId)}`
}

export interface GateScreenProps {
  campus: CampusBundle
  checkpointId: string
  startNodeId: string | null
}

export function GateScreen({ campus, checkpointId, startNodeId }: GateScreenProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SearchEntry | null>(null)
  const [qrData, setQrData] = useState('')
  const route = useMemo<NavRoute | null>(() => selected?.nodeId && startNodeId
    ? findNavRoute(campus.nodes, campus.edges, startNodeId, selected.nodeId)
    : null, [campus, selected, startNodeId])
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return []
    return campus.searchEntries
      .filter((entry) => entry.nodeId && entry.label.toLocaleLowerCase().includes(term))
      .slice(0, 8)
  }, [campus.searchEntries, query])
  const composition = useMemo(() => getNavigationRouteComposition(route), [route])

  const reset = () => { setQuery(''); setSelected(null); setQrData('') }
  useIdleReset(GATE_IDLE_MS, reset)

  useEffect(() => {
    if (!selected?.nodeId || !route || typeof window === 'undefined') { setQrData(''); return }
    let cancelled = false
    void QRCode.toDataURL(gateHandoffUrl(window.location.origin, checkpointId, selected.nodeId))
      .then((value: string) => { if (!cancelled) setQrData(value) })
      .catch(() => { if (!cancelled) setQrData('') })
    return () => { cancelled = true }
  }, [checkpointId, route, selected])

  if (!startNodeId) return <main className="flex min-h-screen items-center justify-center p-8 text-center text-lg" role="alert">This gate screen&apos;s checkpoint has no routing anchor. Ask staff to set it up.</main>

  const etaMinutes = route ? estimatePresentationEtaMinutes(route.totalDistance) : null
  return <main className="min-h-screen bg-[var(--navi-bg)] p-5 text-[var(--navi-text)] sm:p-8">
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold">Where do you want to go?</h1>
      <label className="mt-5 block text-lg font-medium" htmlFor="gate-destination">Search destinations</label>
      <input id="gate-destination" className="mt-2 min-h-14 w-full rounded-xl border border-[var(--navi-border)] bg-[var(--navi-card)] px-4 text-lg" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null) }} placeholder="Search a room or place" />
      {results.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2" role="listbox" aria-label="Destinations">{results.map((entry) => <button key={entry.id} type="button" role="option" aria-selected={selected?.id === entry.id} onClick={() => setSelected(entry)} className="min-h-14 rounded-xl border border-[var(--navi-border)] bg-[var(--navi-card)] px-4 text-left text-lg">{entry.label}</button>)}</div> : null}
      {selected ? route ? <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]" aria-label="Route preview">
        <div className="min-h-72 overflow-hidden rounded-2xl border border-[var(--navi-border)]"><ExploreMap bundle={campus} route={{ path: route.path, cost: route.totalDistance }} /></div>
        <div className="rounded-2xl border border-[var(--navi-border)] bg-[var(--navi-card)] p-5">
          <h2 className="text-xl font-semibold">{selected.label}</h2>
          <p className="mt-3">{formatNavigationDistance(route.totalDistance)} · {etaMinutes === null ? '—' : `${etaMinutes} min`}</p>
          {composition.floorTransitions.length ? <ul className="mt-4 space-y-2 text-sm">{composition.floorTransitions.map((step) => <li key={step.stepIndex}>{step.connector === 'stairs' ? 'Stairs' : 'Elevator'} {step.toFloor > step.fromFloor ? 'up' : 'down'} to {step.label}</li>)}</ul> : null}
          <div className="mt-5 border-t border-[var(--navi-border)] pt-4 text-center">
            <p className="font-semibold">Continue on your phone</p>
            {qrData ? <img className="mx-auto mt-3 h-44 w-44" src={qrData} alt="Continue on your phone" /> : <p className="mt-3 text-sm">Preparing QR code…</p>}
          </div>
        </div>
      </section> : <p className="mt-5 rounded-xl border border-amber-500/40 p-4 text-lg" role="status">No route to this place from here.</p> : null}
    </div>
  </main>
}
