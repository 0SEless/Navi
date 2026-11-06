'use client'

import { useEffect, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { toLocal, type BrushSettings, type CampusDocument, type TerrainSampler } from '@navi/core'
import type { Command, MutationResult } from '@navi/editor'
import { contoursSetupPayload, lassoCommand, resetCommand, slopeCommand } from '@/lib/terrain/area-commands'
import { tracingKey, tracingStore, type TracingImage } from '@/lib/terrain/tracing-store'
import { TerrainToolRail, type TerrainTool } from './TerrainToolRail'
import { TerrainToolPanel } from './TerrainToolPanel'
import { TerrainAreaPanel, type TracedLine } from './TerrainAreaPanel'
import { TerrainLayersPanel, type TerrainLayers } from './TerrainLayersPanel'
import { TracingImageLayer } from './TracingImageLayer'
import { useMapDraft } from './useMapDraft'
import { useBoundaryEditor } from './useBoundaryEditor'
import { BuildingGroundPanel, type GroundChange } from './BuildingGroundPanel'
import { TerrainImportPanel } from './TerrainImportPanel'
import { useEnsureZone } from '@/components/studio/v2/ZoneProvider'
import { StructureTool } from './tools/StructureTool'
import { CursorHeight } from './CursorHeight'

type LatLng = { lat: number; lng: number }
const AREA_TOOLS: ReadonlySet<TerrainTool> = new Set(['lasso', 'slope', 'reset', 'contour-pen'])

/** Tool rail, brush and area panels, Edit boundary, layers and the local tracing image. */
export function TerrainTools(props: {
  document: CampusDocument
  sampler: TerrainSampler | null
  map: maplibregl.Map | null
  editing: boolean
  dispatch: (command: Command) => MutationResult | undefined
  tool: TerrainTool
  onTool: (tool: TerrainTool) => void
  settings: BrushSettings
  onSettings: (next: BrushSettings) => void
  layers: TerrainLayers
  onLayers: (next: TerrainLayers) => void
  cutAboveFloorId: string | null
  onCutAbove: (floorId: string | null) => void
}) {
  const { document, sampler, map: mainMap, editing, dispatch, tool } = props
  const campusId = document.metadata.campusId
  const [points, setPoints] = useState<LatLng[]>([])
  const [traced, setTraced] = useState<TracedLine[]>([])
  const [tracing, setTracing] = useState<TracingImage | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const ensureZone = useEnsureZone()
  const toolRef = useRef(tool)
  toolRef.current = tool

  useEffect(() => setPoints([]), [tool])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPoints([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    let cancelled = false
    void tracingStore().get(tracingKey(campusId)).then((stored) => {
      if (!cancelled && stored) setTracing(stored)
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [campusId])

  const areaActive = editing && AREA_TOOLS.has(tool)
  const draft = {
    active: areaActive,
    points,
    closed: tool === 'lasso' || tool === 'reset',
    onPoint: (p: LatLng) => setPoints((current) => (tool === 'slope' && current.length >= 2 ? [p] : [...current, p])),
  }
  // Buildings tool: click inside a building outline to select it.
  useEffect(() => {
    const map = mainMap
    if (!map) return
    const onClick = (event: maplibregl.MapMouseEvent) => {
      if (toolRef.current !== 'pad') return
      const { lat, lng } = event.lngLat
      const hit = document.buildings.find((b) => {
        const ring = b.footprint?.points ?? []
        let inside = false
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i]
          const c = ring[j]
          if (a.lat > lat !== c.lat > lat && lng < ((c.lng - a.lng) * (lat - a.lat)) / (c.lat - a.lat) + a.lng) inside = !inside
        }
        return inside
      })
      setSelectedBuildingId(hit?.id ?? null)
    }
    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [mainMap, document])

  useMapDraft(mainMap, draft)
  const boundary = { active: editing && tool === 'boundary', document, dispatch }
  useBoundaryEditor(mainMap, boundary)

  const run = (command: Command | null) => {
    if (!command) {
      setMessage('Nothing changed.')
      return
    }
    const result = dispatch(command)
    setMessage(result && result.success === false ? result.error ?? 'That did not work.' : null)
    setPoints([])
  }
  const groundAt = (p: LatLng) => {
    if (!sampler || !document.terrain) return null
    const q = toLocal(document.terrain.grid, p)
    return Math.round(sampler.heightAt(q.x, q.y) * 100) / 100
  }
  const saveTracing = (next: TracingImage | null) => {
    setTracing(next)
    const key = tracingKey(campusId)
    void (next ? tracingStore().put(key, next) : tracingStore().delete(key)).catch(() => undefined)
  }
  const ring = document.boundary?.points ?? []
  const selectedBuilding = document.buildings.find((b) => b.id === selectedBuildingId) ?? null
  const changeGround = async (change: GroundChange) => {
    if (!selectedBuilding) return
    // Ground settings belong to the building: they need its lock, never the terrain lock.
    if (!(await ensureZone([`building:${encodeURIComponent(selectedBuilding.id)}`]))) {
      setMessage('Another admin is editing this building.')
      return
    }
    run({ id: 'building.set-ground', label: 'Building ground', payload: { buildingId: selectedBuilding.id, ...change } })
  }

  return (
    <>
      <TerrainToolRail tool={tool} disabled={!editing} alwaysOn={sampler ? ['pan', 'stairs'] : ['pan']} onTool={props.onTool} />
      <CursorHeight map={mainMap} sampler={sampler} />
      <StructureTool document={document} sampler={sampler} map={mainMap} active={tool === 'stairs' && Boolean(sampler)} dispatch={dispatch} />
      {editing && (
        <button type="button" onClick={() => setImporting(true)} style={{ position: 'absolute', left: 140, top: 12, zIndex: 2, padding: '4px 10px', fontSize: 12, borderRadius: 4, border: '1px solid var(--navi-border, #e5e7eb)', background: 'var(--navi-card, #fff)' }}>
          Import ground…
        </button>
      )}
      {importing && (
        <div style={{ position: 'absolute', left: 140, top: 48, zIndex: 3, padding: 14, background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
          <TerrainImportPanel
            hasChanges={Object.keys(document.terrainTiles ?? {}).length > 0}
            onImport={(payload) => { setImporting(false); run({ id: 'terrain.setup', label: 'Import ground', payload }) }}
            onCancel={() => setImporting(false)}
          />
        </div>
      )}
      {editing && tool === 'pad' && (
        <BuildingGroundPanel building={selectedBuilding} sampler={sampler} cutAboveFloorId={props.cutAboveFloorId} onChange={(change) => void changeGround(change)} onCutAbove={props.onCutAbove} />
      )}
      {editing && (tool === 'raise-lower' || tool === 'smooth' || tool === 'flatten' || tool === 'picker') && (
        <TerrainToolPanel settings={props.settings} onChange={props.onSettings} showMode={tool === 'raise-lower' || tool === 'picker'} />
      )}
      {areaActive && (
        <TerrainAreaPanel
          tool={tool as 'lasso' | 'slope' | 'reset' | 'contour-pen'}
          points={points}
          groundAt={groundAt}
          traced={traced}
          onClear={() => setPoints([])}
          onLasso={(op) => run(lassoCommand(document, points, op))}
          onSlope={(fromH, toH, width) => run(slopeCommand(document, { ...points[0], h: fromH }, { ...points[1], h: toH }, width))}
          onReset={() => run(resetCommand(document, points))}
          onAddLine={(elevationM) => {
            setTraced((current) => [...current, { elevationM, points }])
            setPoints([])
          }}
          onGenerate={() => {
            run({ id: 'terrain.setup', label: 'Generate surface from contours', payload: contoursSetupPayload(document, traced) })
            setTraced([])
          }}
        />
      )}
      {message && (
        <div role="alert" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3, padding: '4px 10px', fontSize: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 4 }}>
          {message}
        </div>
      )}
      <TerrainLayersPanel
        layers={props.layers}
        onLayers={props.onLayers}
        hasTracing={Boolean(tracing)}
        tracingOpacity={tracing?.opacity ?? 0.6}
        onTracingFile={(file) => {
          const lats = ring.map((p) => p.lat)
          const lngs = ring.map((p) => p.lng)
          const place = tracing ?? (ring.length >= 3
            ? { west: Math.min(...lngs), east: Math.max(...lngs), south: Math.min(...lats), north: Math.max(...lats), opacity: 0.6 }
            : null)
          if (place) saveTracing({ ...place, blob: file })
        }}
        onTracingOpacity={(opacity) => tracing && saveTracing({ ...tracing, opacity })}
        onRemoveTracing={() => saveTracing(null)}
      />
      <TracingImageLayer map={mainMap} image={tracing} visible={props.layers.tracing} onPlace={(bounds) => tracing && saveTracing({ ...tracing, ...bounds })} />
    </>
  )
}
