'use client'

import { useEffect, useMemo, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { usePublicStore } from '@/store/public-store'
import type { CampusBundle } from '@/types/nav-types'
import { tracesToGeoJSON } from '@/components/map/authoredTraceGeoJSON'
import { buildPoiGeoJSON, isOutdoorCampusPOI } from '@/components/map/layers/POILayer'
import { useNavigationMap } from './NavigationMap'
import { getCachedNavigationRenderModel } from './NavigationRenderModel'

type Phase = 'loading' | 'interactive' | 'error'

export function PublicCampusRuntimeStatus() {
  const { map, isReady, isActive, hostRequested } = useNavigationMap()
  const campus = usePublicStore((store) => store.campus)
  const campusStatus = usePublicStore((store) => store.campusStatus)
  const campusLoading = usePublicStore((store) => store.campusLoading)
  const revealedPoiIds = usePublicStore((store) => store.revealedPoiIds)
  const requirements = useMemo(() => {
    if (!campus) return []
    const model = getCachedNavigationRenderModel(campus)
    const required: Array<{ source: string; ids: string[]; layers: string[] }> = []
    const buildingIds = model.buildings.map((building) => building.id)
    if (buildingIds.length > 0) {
      required.push({
        source: 'buildings',
        ids: buildingIds,
        layers: ['buildings-fill', 'buildings-outline', 'buildings-extrusion', 'buildings-labels'],
      })
    }

    const outdoorPois = campus.poi.filter(isOutdoorCampusPOI)
    const poiIds = buildPoiGeoJSON(model.indoor.pois, revealedPoiIds, outdoorPois).features
      .map((feature) => feature.properties?.id ?? feature.id)
      .filter((id): id is string => typeof id === 'string')
    if (poiIds.length > 0) {
      required.push({
        source: 'pois',
        ids: poiIds,
        layers: ['pois-layer', 'pois-outdoor-fill', 'pois-outdoor-outline', 'pois-outdoor-extrusion'],
      })
    }

    const roadIds = tracesToGeoJSON(campus.traces ?? []).features
      .map((feature) => feature.properties?.id ?? feature.id)
      .filter((id): id is string => typeof id === 'string')
    if (roadIds.length > 0) {
      required.push({
        source: 'authored-roads',
        ids: roadIds,
        layers: ['authored-roads-outline', 'authored-roads-fill', 'authored-roads-path'],
      })
    }
    return required
  }, [campus, revealedPoiIds])
  const [result, setResult] = useState<{ map: maplibregl.Map | null; campus: CampusBundle | null; phase: Phase }>({ map: null, campus: null, phase: 'loading' })
  const phase = result.map === map && result.campus === campus ? result.phase : 'loading'

  useEffect(() => {
    if (!isActive) return
    let active = true
    let settled = false
    let generation = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const publish = (next: Phase) => {
      if (active) setResult((previous) => previous.map === map && previous.campus === campus && previous.phase === next
        ? previous : { map, campus, phase: next })
    }
    const startWatchdog = () => {
      if (timer !== undefined) return
      // Recovery only: source/layer events, not this deadline, establish readiness.
      timer = setTimeout(() => { if (active && !settled) publish('error') }, 20_000)
    }
    const attached = () => map && requirements.every((required) => map.getSource(required.source)
      && required.layers.every((layer) => map.getLayer(layer)))
    const check = async () => {
      const current = ++generation
      if (settled && attached()) return
      if (settled) publish('loading')
      settled = false
      startWatchdog()
      await Promise.resolve()
      if (!active || current !== generation) return
      if (!map || !isReady || !campus || !map.isStyleLoaded() || !attached()) return
      for (const required of requirements) {
        if (!map.isSourceLoaded(required.source)) return
        const data = await (map.getSource(required.source) as maplibregl.GeoJSONSource).getData()
        if (!active || current !== generation) return
        const ids = new Set(data.type === 'FeatureCollection' ? data.features.map((feature) => feature.properties?.id ?? feature.id) : [])
        if (!required.ids.every((id) => ids.has(id))) return
      }
      settled = true
      clearTimeout(timer)
      timer = undefined
      publish('interactive')
    }
    const schedule = () => { void check().catch(() => { if (active) publish('error') }) }
    const invalidate = () => {
      settled = false
      publish('loading')
      schedule()
    }
    const events = ['load', 'idle', 'sourcedata', 'styledata'] as const
    for (const event of events) map?.on(event, schedule)
    map?.on('style.load', invalidate)
    startWatchdog()
    schedule()
    return () => {
      active = false
      generation++
      clearTimeout(timer)
      for (const event of events) map?.off(event, schedule)
      map?.off('style.load', invalidate)
    }
  }, [campus, hostRequested, isActive, isReady, map, requirements])

  if (!isActive) return null
  return <>
    <output hidden data-testid="public-campus-runtime-state" data-state={phase} data-campus-status={campusStatus} data-campus-loading={String(campusLoading)} data-map-requested={String(hostRequested)} />
    {(hostRequested || phase === 'error') && phase !== 'interactive' && <div data-testid="public-campus-runtime-backdrop" className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-[var(--navi-content)]/30">
      <div className="mx-4 flex items-center gap-3 rounded-2xl border border-[var(--navi-border)] bg-[var(--navi-card)] px-4 py-3 text-sm text-[var(--navi-text)] shadow-lg" role={phase === 'error' ? 'alert' : 'status'} aria-live="polite">
        {phase === 'error' ? <div>
          <p>Campus map could not finish loading.</p>
          <button type="button" className="pointer-events-auto mt-2 font-semibold text-[var(--navi-accent)]" onClick={() => window.location.reload()}>Reload campus map</button>
        </div> : <>
          <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--navi-border)] border-t-[var(--navi-accent)]" />
          <span>Loading campus map…</span>
        </>}
      </div>
    </div>}
  </>
}
