'use client'

import { useEffect, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { DEFAULT_ROAD_STYLE, DEFAULT_TERRAIN_LOOK, toLocal, type BrushSettings, type CampusDocument, type TerrainMesh, type TerrainSampler } from '@navi/core'
import { MeshTool } from './tools/MeshTool'
import { GradeTool } from './tools/GradeTool'
import { TerrainListPanel } from './TerrainListPanel'
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
import type { OpenFloors } from '@/lib/terrain/terrain-floors'
import { HeightEditMode } from './HeightEditMode'
import type { TerrainMapProps } from './TerrainMap'
import { MAP_CENTRE_X } from './form-styles'

type LatLng = { lat: number; lng: number }
const noop = () => {}
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
  /** Shift+Z height mode: the live draft for the map, and whether the mode is on (brushes off). */
  onDraft?: (draft: TerrainMapProps['draft']) => void
  onHeightActive?: (active: boolean) => void
  /** Opened from the map editor on one stair (?stair=<id>). */
  requestedStairId?: string | null
  /** Mesh tool: the mesh being edited (the ground follows it live). */
  onMeshDraft?: (mesh: TerrainMesh | null) => void
  /** The building whose floors the 3D view shows (one view with NAVI Web), and its floor on top. */
  onOpenFloors?: (open: OpenFloors | null) => void
}) {
  const { document, sampler, map: mainMap, editing, dispatch, tool } = props
  const campusId = document.metadata.campusId
  const [points, setPoints] = useState<LatLng[]>([])
  const [traced, setTraced] = useState<TracedLine[]>([])
  const [tracing, setTracing] = useState<TracingImage | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
  const [selectedStairId, setSelectedStairId] = useState<string | null>(null)
  const [heightMode, setHeightMode] = useState(false)
  const [importing, setImporting] = useState(false)
  const [meshOpen, setMeshOpen] = useState(false)
  const [requestedMeshId, setRequestedMeshId] = useState<string | null>(null)
  const [requestedRoadId, setRequestedRoadId] = useState<string | null>(null)
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
  // The Mesh tool draws its lasso the same way while no mesh is open.
  const meshLasso = editing && tool === 'mesh' && !meshOpen
  const draft = {
    active: areaActive || meshLasso,
    points,
    closed: tool === 'lasso' || tool === 'reset' || tool === 'mesh',
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
  const boundary = { active: editing && tool === 'boundary', document, dispatch, onMessage: setMessage }
  useBoundaryEditor(mainMap, boundary)

  const run = (command: Command | null): MutationResult | undefined => {
    if (!command) {
      setMessage('Nothing changed.')
      return undefined
    }
    const result = dispatch(command)
    setMessage(result && result.success === false ? result.error ?? 'That did not work.' : null)
    setPoints([])
    return result
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
  // The campus box plus ~20 m (the terrain grid's margin): where the cursor height label has ground.
  const campusBounds: [[number, number], [number, number]] | null = ring.length >= 3
    ? [[Math.min(...ring.map((p) => p.lng)) - 0.0002, Math.min(...ring.map((p) => p.lat)) - 0.0002], [Math.max(...ring.map((p) => p.lng)) + 0.0002, Math.max(...ring.map((p) => p.lat)) + 0.0002]]
    : null
  const selectedBuilding = document.buildings.find((b) => b.id === selectedBuildingId) ?? null
  // One view (owner 2026-11-15): the Buildings tool's building (up to Cut away above, else its top floor), or the
  // building a selected stair/ramp attaches to (its floor), shows its floors like NAVI Web.
  const selectedStair = tool === 'stairs' && selectedStairId ? (document.structures ?? []).find((s) => s.id === selectedStairId) ?? null : null
  const stairSlab = selectedStair ? [selectedStair.start, selectedStair.end].find((e) => e.kind === 'slab') ?? null : null
  const topFloorId = selectedBuilding ? [...selectedBuilding.floors].sort((a, b) => b.elevation - a.elevation)[0]?.id ?? null : null
  const openKey = tool === 'pad' && selectedBuilding && topFloorId
    ? `${selectedBuilding.id}|${props.cutAboveFloorId ?? topFloorId}`
    : stairSlab && stairSlab.kind === 'slab' ? `${stairSlab.buildingId}|${stairSlab.floorId}` : ''
  const onOpenFloors = props.onOpenFloors
  useEffect(() => {
    if (!onOpenFloors) return
    if (!openKey) { onOpenFloors(null); return }
    const [buildingId, floorId] = openKey.split('|')
    onOpenFloors({ buildingId, floorId })
  }, [openKey, onOpenFloors])
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
      <TerrainToolRail tool={tool} disabled={!editing} alwaysOn={sampler ? ['pan', 'stairs'] : ['pan']} onTool={props.onTool} onImport={() => setImporting(true)} importDisabled={!editing} />
      <CursorHeight map={mainMap} sampler={sampler} bounds={campusBounds} />
      <HeightEditMode
        map={mainMap} document={document} sampler={sampler} dispatch={dispatch}
        target={tool === 'pad' && selectedBuildingId
          ? { kind: 'building', buildingId: selectedBuildingId }
          : tool === 'stairs' && selectedStairId ? { kind: 'stair', structureId: selectedStairId } : null}
        onDraft={(next) => props.onDraft?.(next)} onActive={(on) => { setHeightMode(on); props.onHeightActive?.(on) }}
        ensureBuildingLock={(buildingId) => ensureZone([`building:${encodeURIComponent(buildingId)}`])}
      />
      <StructureTool document={document} sampler={sampler} map={mainMap} active={tool === 'stairs' && Boolean(sampler)} dispatch={dispatch} onSelect={setSelectedStairId} showHandles={!heightMode} requestedId={props.requestedStairId ?? null} />
      {importing && (
        <div style={{ position: 'absolute', left: MAP_CENTRE_X, bottom: 64, transform: 'translateX(-50%)', zIndex: 3, padding: 14, background: 'var(--navi-card, #fff)', border: '1px solid var(--navi-border, #e5e7eb)', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
          <TerrainImportPanel
            hasChanges={Object.keys(document.terrainTiles ?? {}).length > 0}
            onImport={(payload) => {
              // Section 5: the panel stays open and shows the reason when the import is refused.
              const result = dispatch({ id: 'terrain.setup', label: 'Import terrain', payload })
              if (!result || result.success !== false) setImporting(false)
              return result
            }}
            onCancel={() => setImporting(false)}
          />
        </div>
      )}
      <MeshTool
        map={mainMap} document={document} sampler={sampler} active={editing && tool === 'mesh'}
        lassoPoints={points} onLassoReset={() => setPoints([])} dispatch={dispatch}
        onDraft={props.onMeshDraft ?? noop} requestedMeshId={requestedMeshId} onSessionChange={setMeshOpen}
      />
      <GradeTool map={mainMap} document={document} sampler={sampler} active={editing && tool === 'grade'} dispatch={dispatch} requestedRoadId={requestedRoadId} />
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
        list={document.terrain ? (
          <TerrainListPanel
            document={document} editing={editing} dispatch={(command) => run(command)}
            onOpenMesh={(id) => { props.onTool('mesh'); setRequestedMeshId(`${id}#${Date.now()}`) }}
            onOpenRoad={(id) => { props.onTool('grade'); setRequestedRoadId(`${id}#${Date.now()}`) }}
          />
        ) : undefined}
        layers={props.layers}
        onLayers={props.onLayers}
        mapLook={document.terrain?.mapLook ?? DEFAULT_TERRAIN_LOOK}
        mapLookDisabled={!editing || !document.terrain}
        onMapLook={(look) => {
          const result = dispatch({ id: 'terrain.set-look', label: 'Map look', payload: { look } })
          if (result && !result.success) setMessage(result.error ?? 'The map look could not be changed.')
        }}
        roadStyle={document.terrain?.roadStyle ?? DEFAULT_ROAD_STYLE}
        onRoadStyle={(style) => {
          const result = dispatch({ id: 'terrain.set-road-style', label: 'Road style', payload: { style } })
          if (result && !result.success) setMessage(result.error ?? 'The road style could not be changed.')
        }}
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
