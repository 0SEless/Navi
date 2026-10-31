'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { findTerrainElevationConflicts, type TerrainArea, type TerrainVerticalDatum } from '@navi/core'
import { useEditor } from '@navi/editor'
import { terrainAreasToGeoJSON } from './terrain-area-geojson'

const SOURCE_ID = 'navi-authored-terrain-areas'
const FILL_ID = 'navi-authored-terrain-areas-fill'
const OUTLINE_ID = 'navi-authored-terrain-areas-outline'
const EMPTY_TERRAIN_AREAS: TerrainArea[] = []

const panelStyle: React.CSSProperties = {
  position: 'absolute', top: 52, left: 12, zIndex: 20, width: 292, maxHeight: 'calc(100% - 72px)',
  overflow: 'auto', background: 'var(--navi-card)', color: 'var(--navi-text)',
  border: '1px solid var(--navi-border)', borderRadius: 8, padding: 12,
  boxShadow: '0 4px 18px rgba(0,0,0,.18)', fontSize: 12,
}

export function TerrainAreaAuthoring({ map }: { map: maplibregl.Map }) {
  const { document, services } = useEditor()
  const dispatcher = services.get('dispatcher')
  const areas = document.terrainAreas ?? EMPTY_TERRAIN_AREAS
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawPoints, setDrawPoints] = useState<Array<{ lat: number; lng: number }>>([])
  const [editingBoundary, setEditingBoundary] = useState(false)
  const [name, setName] = useState('')
  const [elevation, setElevation] = useState('0')
  const [datumName, setDatumName] = useState(document.terrainVerticalDatum?.name ?? '')
  const [zeroReference, setZeroReference] = useState(document.terrainVerticalDatum?.zeroReference ?? '')
  const [gesturePointerEvents, setGesturePointerEvents] = useState(0)
  const [gestureCommands, setGestureCommands] = useState(0)
  const [gestureDocumentChanges, setGestureDocumentChanges] = useState(0)
  const [message, setMessage] = useState('')
  const areasRef = useRef(areas)
  const drawingRef = useRef(drawing)
  const pointsRef = useRef(drawPoints)
  const selectedIdRef = useRef(selectedId)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const gestureEventsRef = useRef(0)
  const gestureActiveRef = useRef(false)
  useEffect(() => {
    areasRef.current = areas
    drawingRef.current = drawing
    pointsRef.current = drawPoints
    selectedIdRef.current = selectedId
  }, [areas, drawing, drawPoints, selectedId])

  const conflicts = useMemo(() => findTerrainElevationConflicts(areas), [areas])
  const conflictIds = useMemo(() => new Set(conflicts.flatMap((conflict) => conflict.areaIds)), [conflicts])

  const updateSource = useCallback(() => {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    source?.setData(terrainAreasToGeoJSON(areasRef.current, selectedIdRef.current, conflictIds))
  }, [conflictIds, map])

  useEffect(() => {
    let clickHandler: ((event: maplibregl.MapLayerMouseEvent) => void) | undefined
    const installLayers = () => {
      if (!map.isStyleLoaded()) return
      if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: 'geojson', data: terrainAreasToGeoJSON(areasRef.current, selectedIdRef.current, conflictIds) })
      if (!map.getLayer(FILL_ID)) map.addLayer({
        id: FILL_ID, type: 'fill', source: SOURCE_ID,
        paint: {
          'fill-color': ['case', ['get', 'conflict'], '#dc2626', ['get', 'color']],
          'fill-opacity': ['case', ['get', 'selected'], 0.38, 0.2],
        },
      })
      if (!map.getLayer(OUTLINE_ID)) map.addLayer({
        id: OUTLINE_ID, type: 'line', source: SOURCE_ID,
        paint: {
          'line-color': ['case', ['get', 'conflict'], '#b91c1c', ['get', 'selected'], '#111827', '#1f2937'],
          'line-width': ['case', ['get', 'selected'], 3, 1.5],
        },
      })
      if (!clickHandler) {
        clickHandler = (event) => {
          const id = event.features?.[0]?.properties?.id
          if (typeof id !== 'string' || drawingRef.current) return
          const selected = areasRef.current.find((area) => area.id === id)
          if (!selected) return
          selectedIdRef.current = id
          setSelectedId(id)
          setName(selected.name)
          setElevation(String(selected.elevationMeters))
          setDatumName(document.terrainVerticalDatum?.name ?? '')
          setZeroReference(document.terrainVerticalDatum?.zeroReference ?? '')
        }
        map.on('click', FILL_ID, clickHandler)
      }
      updateSource()
    }
    installLayers()
    map.on('styledata', installLayers)
    return () => {
      map.off('styledata', installLayers)
      if (clickHandler) map.off('click', FILL_ID, clickHandler)
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
    }
  }, [document.terrainVerticalDatum, map, conflictIds, updateSource])

  useEffect(() => updateSource(), [areas, selectedId, updateSource])

  useEffect(() => {
    const documentStore = services.get('documentStore') as { subscribe?: (listener: () => void) => () => void } | undefined
    if (!documentStore?.subscribe) return
    return documentStore.subscribe(() => {
      setGestureDocumentChanges((count) => count + 1)
    })
  }, [services])

  useEffect(() => {
    const countPointerMove = () => {
      if (gestureActiveRef.current) gestureEventsRef.current += 1
    }
    window.addEventListener('pointermove', countPointerMove, true)
    return () => window.removeEventListener('pointermove', countPointerMove, true)
  }, [])

  useEffect(() => {
    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current) return
      const point = { lat: event.lngLat.lat, lng: event.lngLat.lng }
      pointsRef.current = [...pointsRef.current, point]
      setDrawPoints(pointsRef.current)
    }
    if (drawing) {
      map.doubleClickZoom.disable()
      map.on('click', onMapClick)
    } else {
      map.doubleClickZoom.enable()
    }
    return () => {
      map.off('click', onMapClick)
      if (drawing) map.doubleClickZoom.enable()
    }
  }, [drawing, map])

  const selectedArea = areas.find((area) => area.id === selectedId) ?? null
  useEffect(() => {
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
    if (!editingBoundary || !selectedArea) return
    const draftPoints = selectedArea.points.map((point) => ({ ...point }))
    const markers = selectedArea.points.map((point, index) => {
      const marker = new maplibregl.Marker({ draggable: true, color: '#111827' })
        .setLngLat([point.lng, point.lat])
        .addTo(map)
      marker.getElement().dataset.testid = 'terrain-vertex-handle'
      marker.getElement().setAttribute('aria-label', `Terrain boundary vertex ${index + 1}`)
      marker.on('dragstart', () => {
        gestureEventsRef.current = 0
        gestureActiveRef.current = true
        setGestureCommands(0)
        setGestureDocumentChanges(0)
      })
      marker.on('drag', () => { gestureEventsRef.current += 1 })
      marker.on('dragend', () => {
        gestureActiveRef.current = false
        const next = marker.getLngLat()
        draftPoints[index] = { lat: next.lat, lng: next.lng }
        const result = dispatcher?.execute({
          id: 'terrain-area.update', label: 'Adjust Terrain Boundary',
          payload: { areaId: selectedArea.id, changes: { points: draftPoints } },
        })
        if (!result || result.success === false) {
          setMessage(result?.error ?? 'Boundary update failed')
          return
        }
        setGesturePointerEvents(gestureEventsRef.current)
        setGestureCommands((count) => count + 1)
        setMessage('Boundary updated. Save to commit this campus terrain scope.')
      })
      return marker
    })
    markersRef.current = markers
    return () => {
      markers.forEach((marker) => marker.remove())
      markersRef.current = []
    }
  }, [dispatcher, editingBoundary, map, selectedArea])

  const beginDrawing = () => {
    setSelectedId(null)
    selectedIdRef.current = null
    setName('')
    setElevation('0')
    setMessage('Click the campus map to add polygon vertices, then finish the boundary.')
    pointsRef.current = []
    setDrawPoints([])
    setDrawing(true)
  }

  const finishDrawing = () => {
    const parsedElevation = Number(elevation)
    const datum: TerrainVerticalDatum = {
      kind: 'campus-local', name: datumName.trim(), zeroReference: zeroReference.trim(), elevationStatus: 'authored-not-surveyed',
    }
    const result = dispatcher?.execute({
      id: 'terrain-area.create', label: 'Create Terrain Area',
      payload: { id: `terrain-${crypto.randomUUID()}`, name: name.trim(), points: pointsRef.current, color: '#22aa66', elevationMeters: parsedElevation, datum },
    })
    if (!result || result.success === false) {
      setMessage(result?.error ?? 'Terrain area creation failed')
      return
    }
    setSelectedId(result.entityId ?? null)
    selectedIdRef.current = result.entityId ?? null
    setDrawing(false)
    setDrawPoints([])
    pointsRef.current = []
    setMessage('Terrain area authored. Save to commit the campus terrain scope.')
  }

  const updateArea = (changes: Partial<TerrainArea> & { datum?: TerrainVerticalDatum }) => {
    if (!selectedArea) return
    const result = dispatcher?.execute({ id: 'terrain-area.update', label: 'Edit Terrain Area', payload: { areaId: selectedArea.id, changes } })
    if (!result || result.success === false) setMessage(result?.error ?? 'Terrain edit failed')
    else setMessage('Terrain area authored. Save to commit the campus terrain scope.')
  }

  const saveMetadata = () => {
    if (!selectedArea) return
    const numericElevation = Number(elevation)
    if (!Number.isFinite(numericElevation)) {
      setMessage('Elevation must be a finite number of meters.')
      return
    }
    const datum: TerrainVerticalDatum = { kind: 'campus-local', name: datumName.trim(), zeroReference: zeroReference.trim(), elevationStatus: 'authored-not-surveyed' }
    updateArea({ name: name.trim(), elevationMeters: numericElevation, datum })
  }

  const deleteArea = () => {
    if (!selectedArea) return
    const result = dispatcher?.execute({ id: 'terrain-area.delete', label: 'Delete Terrain Area', payload: { areaId: selectedArea.id } })
    if (result?.success) {
      setSelectedId(null)
      selectedIdRef.current = null
      setEditingBoundary(false)
      setMessage('Terrain area deleted. Save to commit the campus terrain scope.')
    } else setMessage(result?.error ?? 'Terrain delete failed')
  }

  return (
    <section style={panelStyle} aria-label="Terrain authoring" data-testid="terrain-authoring-panel">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Terrain areas</strong>
        <span>{areas.length} authored</span>
      </header>
      {areas.length > 0 && <div data-testid="terrain-area-list" style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
        {areas.map((area) => <button key={area.id} type="button" data-testid={`terrain-select-${area.id}`} onClick={() => {
          selectedIdRef.current = area.id
          setSelectedId(area.id)
          setName(area.name)
          setElevation(String(area.elevationMeters))
          setDatumName(document.terrainVerticalDatum?.name ?? '')
          setZeroReference(document.terrainVerticalDatum?.zeroReference ?? '')
        }}>{area.name} · {area.elevationMeters} m</button>)}
      </div>}
      <output data-testid="terrain-render-state" data-area-count={areas.length} data-conflict-count={conflicts.length}>
        {areas.length} authored terrain polygon{areas.length === 1 ? '' : 's'} rendered in the campus map
      </output>
      {conflicts.length > 0 && <div role="alert" data-testid="terrain-elevation-conflict" style={{ marginBottom: 8, color: '#b91c1c', fontWeight: 700 }}>
        {conflicts.length} overlapping area pair{conflicts.length === 1 ? '' : 's'} have conflicting elevations. Areas remain separate.
      </div>}
      {!drawing && <button type="button" data-testid="terrain-draw-start" onClick={beginDrawing}>Draw terrain area</button>}
      {drawing && <>
        <label style={{ display: 'block', marginTop: 6 }}>Name<input data-testid="terrain-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label style={{ display: 'block', marginTop: 6 }}>Elevation (m, authored)<input data-testid="terrain-elevation" type="number" step="any" value={elevation} onChange={(event) => setElevation(event.target.value)} /></label>
        <label style={{ display: 'block', marginTop: 6 }}>Campus datum name<input data-testid="terrain-datum-name" value={datumName} onChange={(event) => setDatumName(event.target.value)} placeholder="e.g. Campus survey benchmark" /></label>
        <label style={{ display: 'block', marginTop: 6 }}>Zero reference<input data-testid="terrain-datum-zero" value={zeroReference} onChange={(event) => setZeroReference(event.target.value)} placeholder="What 0.000 m means" /></label>
        <div>{drawPoints.length} vertices</div>
        <button type="button" data-testid="terrain-draw-finish" disabled={drawPoints.length < 3} onClick={finishDrawing}>Finish polygon</button>
        <button type="button" onClick={() => { setDrawing(false); setDrawPoints([]); pointsRef.current = [] }}>Cancel</button>
      </>}
      {!drawing && selectedArea && <>
        <div style={{ marginTop: 8, fontWeight: 600 }}>{selectedArea.name}</div>
        {conflictIds.has(selectedArea.id) && <div role="alert" style={{ color: '#b91c1c' }}>Conflicting elevation overlap</div>}
        <label style={{ display: 'block', marginTop: 6 }}>Name<input data-testid="terrain-edit-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label style={{ display: 'block', marginTop: 6 }}>Elevation (m, authored)<input data-testid="terrain-edit-elevation" type="number" step="any" value={elevation} onChange={(event) => setElevation(event.target.value)} /></label>
        <label style={{ display: 'block', marginTop: 6 }}>Campus datum name<input data-testid="terrain-edit-datum-name" value={datumName} onChange={(event) => setDatumName(event.target.value)} /></label>
        <label style={{ display: 'block', marginTop: 6 }}>Zero reference<input data-testid="terrain-edit-datum-zero" value={zeroReference} onChange={(event) => setZeroReference(event.target.value)} /></label>
        <div>Relative to campus-local datum · Authored, not surveyed · {selectedArea.points.length} vertices</div>
        <button type="button" data-testid="terrain-edit-apply" onClick={saveMetadata}>Apply properties</button>
        <button type="button" data-testid="terrain-boundary-edit" onClick={() => setEditingBoundary((value) => !value)}>{editingBoundary ? 'Finish boundary edit' : 'Edit boundary'}</button>
        {editingBoundary && <div>Drag a vertex handle; each completed drag adds one geometry command.</div>}
        <button type="button" data-testid="terrain-delete" onClick={deleteArea}>Delete area</button>
      </>}
      {message && <div role="status" style={{ marginTop: 8 }}>{message}</div>}
      <output data-testid="terrain-gesture-metrics" data-pointer-events={gesturePointerEvents} data-document-commands={gestureCommands} data-document-changes={gestureDocumentChanges}>
        Last completed boundary gestures: {gesturePointerEvents} pointer events / {gestureCommands} geometry commands / {gestureDocumentChanges} document changes
      </output>
    </section>
  )
}
