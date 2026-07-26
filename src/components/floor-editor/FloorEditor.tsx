'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useEditor, useSelection, Viewport, CurrentToolStore, ContextHeader, ToolDock, INTERIOR_TOOL_GROUPS, useToolDockShortcuts } from '@navi/editor'
import { useLegacyBuilding, useFloorSyncStatus, useFloorSyncError } from '@/hooks/floor-graph-selectors'
import { FloorOutliner } from './FloorOutliner'
import { ComponentProperties } from './ComponentProperties'
import { useFloorAdapter } from './adapters/floor-adapter'
import { useToolAdapter } from './adapters/tool-adapter'
import type { LayerVisibility } from '@/types/studio-types'

const FloorEditorCanvas = dynamic(
  () => import('./FloorEditorCanvas').then((m) => m.FloorEditorCanvas),
  { ssr: false, loading: () => <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 12 }}>Loading map…</div> }
)
import { Eye, EyeOff } from 'lucide-react'

interface FloorEditorProps {
  mapId: string
  buildingId: string
  floor: number
}

// Map spec tool IDs to current StudioTool IDs (until Phase 6 renames them)
const TOOL_ID_MAP: Record<string, string> = {
  select: 'select',
  space: 'room',
  hallway: 'hallway',
  entrance: 'entrance',
  stair: 'stairs',
  elevator: 'elevator',
}

const ARCHITECTURE_LAYERS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'floor_plan', label: 'Floor Plan' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'hallways', label: 'Hallways' },
  { key: 'assets', label: 'Assets' },
  { key: 'labels', label: 'Labels' },
]

export function FloorEditor({ mapId, buildingId, floor }: FloorEditorProps) {
  const { services } = useEditor()
  const viewport = services.get('viewport')

  const building = useLegacyBuilding(buildingId)
  const syncStatus = useFloorSyncStatus()
  const syncError = useFloorSyncError()

  const { activeTool, activateTool } = useToolAdapter(services.get('toolRegistry') as CurrentToolStore)
  const floorAdapter = useFloorAdapter(viewport as Viewport, building ?? null, floor)
  const { lastSelected, select, clear } = useSelection()
  const selectedId = lastSelected?.id ?? null
  const selectedCount = lastSelected ? 1 : 0

  const headerStatus = syncStatus === 'synced' ? 'saved' : syncStatus === 'syncing' ? 'saving' : syncStatus === 'error' ? 'error' : 'unsaved'

  const [layers, setLayers] = useState<LayerVisibility>({
    osm: false, satellite: false, floor_plan: true, buildings: false,
    rooms: true, hallways: true, assets: true, nodes: false, edges: false, labels: true,
  })

  const [panMode, setPanMode] = useState(false)
  const [alignMode, setAlignMode] = useState(false)
  const [editorMode, setEditorMode] = useState<'architecture' | 'navigation-preview'>('architecture')
  // Floor plan opacity (separate from alignment to allow preview without persistence)
  const [alignOpacity, setAlignOpacity] = useState(0.7)

  const [navPreviewOpen, setNavPreviewOpen] = useState(false)
  const [validationVisible, setValidationVisible] = useState(false)

  // Sync nav preview state when editor mode changes
  useEffect(() => {
    if (editorMode === 'navigation-preview') {
      setNavPreviewOpen(true)
      if (!(layers.nodes && layers.edges)) {
        setLayers((prev) => ({ ...prev, nodes: true, edges: true }))
      }
    }
  }, [editorMode])

  const graphVisible = layers.nodes && layers.edges
  const toggleGraph = useCallback(() => {
    const newVal = !(layers.nodes && layers.edges)
    setLayers((prev) => ({ ...prev, nodes: newVal, edges: newVal }))
  }, [layers.nodes, layers.edges])

  const toggleLayer = useCallback((key: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleToolActivate = useCallback((toolId: string) => {
    // Navigation Preview mode: only pan allowed
    if (editorMode === 'navigation-preview' && toolId !== 'pan') return
    if (toolId === 'pan') {
      setPanMode((p) => !p)
      setAlignMode(false)
      return
    }
    if (toolId === 'align') {
      if (!building.floorPlanUrls?.[floor]) return
      setAlignMode((a) => !a)
      setPanMode(false)
      clear()
      return
    }
    setPanMode(false)
    setAlignMode(false)
    const mappedId = TOOL_ID_MAP[toolId] || toolId
    activateTool(mappedId)
    clear()
  }, [activateTool, clear, editorMode])

  // Find the active tool ID in the groups (reverse mapping)
  const dockActiveTool = editorMode === 'navigation-preview' ? 'select' : panMode ? 'pan' : alignMode ? 'align' : Object.entries(TOOL_ID_MAP).find(([, v]) => v === activeTool)?.[0] || activeTool

  useToolDockShortcuts(INTERIOR_TOOL_GROUPS, dockActiveTool, handleToolActivate)

  // Spacebar for temporary pan, A toggles align mode
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setPanMode(true)
      }
      if (e.key === 'a' && editorMode === 'architecture' && !e.repeat && !e.ctrlKey && !e.metaKey && building.floorPlanUrls?.[floor]) {
        e.preventDefault()
        setPanMode(false)
        setAlignMode((a) => !a)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setPanMode(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [editorMode])

  if (!building) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
        Building not found
      </div>
    )
  }

  const floorCount = building.floors?.length ?? 0
  if (floor === undefined || floor < 0 || floor >= floorCount) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
        Floor not found
      </div>
    )
  }

  const floorLabel = floor === 0 ? 'GF' : floor > 0 ? `${floor}F` : `${floor}F`
  const canvasTool = alignMode ? 'align' : panMode ? 'select' : editorMode === 'navigation-preview' ? 'select' : activeTool

  // Find planAlignment for current floor from floorData
  const currentLevel = building.floors?.[floorAdapter.activeFloorIndex] ?? floor
  const currentFloorData = building.floorData?.find((fd: any) => fd.level === currentLevel)
  const planAlignment = (currentFloorData as any)?.planAlignment as { offset?: { x: number; y: number }; scale?: number; rotation?: number; opacity?: number } | undefined

  const [editorAlignment, setEditorAlignment] = useState(planAlignment)
  useEffect(() => setEditorAlignment(planAlignment), [planAlignment])

  // Persist alignment when align mode toggles off (or floor changes)
  const prevAlignRef = useRef(alignMode)
  const currentFloorId = (currentFloorData as any)?.id as string | undefined
  useEffect(() => {
    if (prevAlignRef.current && !alignMode && currentFloorId && editorAlignment) {
      // Exiting align mode — save alignment to document
      const dispatcher = services.get('dispatcher') as any
      dispatcher?.execute({ id: 'entity.update', payload: { entityId: currentFloorId, changes: { planAlignment: editorAlignment } } })
    }
    prevAlignRef.current = alignMode
  }, [alignMode, currentFloorId, editorAlignment, services])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ContextHeader
        mapId={mapId}
        buildingName={building?.name ?? ''}
        floorLabel={floorLabel}
        status={headerStatus}
        statusMessage={syncError ?? undefined}
        selectedCount={selectedCount}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <FloorOutliner building={building} activeFloor={floor} mapId={mapId} selectedId={selectedId} onSelect={(id) => id ? select(id) : clear()} />

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <FloorEditorCanvas building={building} floor={floorAdapter.activeFloorIndex} tool={canvasTool} layers={layers} selectedId={selectedId} onSelect={(id) => id ? select(id) : clear()} planAlignment={editorAlignment} alignMode={alignMode} readOnly={editorMode === 'navigation-preview'} onAlignmentChange={(a) => setEditorAlignment(a)} />
          {!building.floorPlanUrls?.[floor] && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              padding: '6px 12px', background: 'rgba(30, 41, 59, 0.9)',
              color: '#94A3B8', fontSize: 11, zIndex: 10,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              No floor plan &mdash; components shown on dark background. Upload one in the Building panel.
            </div>
          )}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ToolDock groups={INTERIOR_TOOL_GROUPS} activeTool={dockActiveTool} onActivateTool={handleToolActivate} />
            <div style={{
              display: 'flex', background: 'var(--navi-card)', borderRadius: 6, overflow: 'hidden',
              border: '1px solid var(--navi-border)',
            }}>
              <button onClick={() => setEditorMode('architecture')}
                style={{
                  padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 10,
                  background: editorMode === 'architecture' ? 'var(--navi-text)' : 'transparent',
                  color: editorMode === 'architecture' ? 'var(--navi-card)' : 'var(--navi-text-secondary)',
                  fontWeight: editorMode === 'architecture' ? 600 : 400,
                }}>
                Architecture
              </button>
              <button onClick={() => setEditorMode('navigation-preview')}
                style={{
                  padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 10,
                  background: editorMode === 'navigation-preview' ? '#8B5CF6' : 'transparent',
                  color: editorMode === 'navigation-preview' ? '#fff' : 'var(--navi-text-secondary)',
                  fontWeight: editorMode === 'navigation-preview' ? 600 : 400,
                }}>
                Navigation
              </button>
            </div>
          </div>
        </div>

        <div style={{
          width: 220, background: 'var(--navi-card)', borderLeft: '1px solid var(--navi-border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--navi-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Pipeline
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
              {[
                { id: 'align', label: 'Align' },
                { id: 'architecture', label: 'Architecture' },
                { id: 'validate', label: 'Validate' },
                { id: 'preview', label: 'Preview' },
                { id: 'publish', label: 'Publish' },
              ].map((step) => {
                const completed = step.id === 'align' && !!building.floorPlanUrls?.[floor]
                const isCurrent = alignMode ? step.id === 'align' : editorMode === 'navigation-preview' ? step.id === 'preview' : step.id === 'architecture'
                const state = completed ? 'done' : isCurrent ? 'current' : 'upcoming'
                const icon = state === 'done' ? '\u2713' : state === 'current' ? '\u25CF' : '\u25CB'
                const isClickable = step.id === 'align' || step.id === 'architecture' || step.id === 'preview'
                return (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {step.id !== 'align' && (
                      <span style={{ color: '#475569', fontSize: 8 }}>→</span>
                    )}
                    <button onClick={() => {
                      if (!isClickable) return
                      if (step.id === 'align' && building.floorPlanUrls?.[floor]) {
                        handleToolActivate('align')
                      } else if (step.id === 'architecture') {
                        setEditorMode('architecture')
                        setAlignMode(false)
                      } else if (step.id === 'preview') {
                        setEditorMode('navigation-preview')
                        setAlignMode(false)
                      }
                    }}
                      style={{
                        padding: '3px 5px', borderRadius: 3, border: 'none', cursor: isClickable ? 'pointer' : 'default',
                        fontSize: 9, fontWeight: isCurrent ? 600 : 400,
                        background: isCurrent ? 'var(--navi-text)' : 'transparent',
                        color: state === 'done' ? '#10B981' : isCurrent ? 'var(--navi-card)' : isClickable ? 'var(--navi-text)' : 'var(--navi-text-secondary)',
                        opacity: state === 'upcoming' && !isClickable ? 0.35 : 1,
                        transition: 'all 0.1s',
                      }}>
                      <span style={{ fontSize: 10, marginRight: 2 }}>{icon}</span>
                      {step.label}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Layers
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {ARCHITECTURE_LAYERS.map(({ key, label }) => {
                const active = layers[key]
                return (
                  <button key={key} onClick={() => toggleLayer(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4,
                      border: 'none', cursor: 'pointer', background: 'transparent',
                      color: active ? 'var(--navi-text)' : 'var(--navi-text-secondary)',
                      fontSize: 10, textAlign: 'left', opacity: active ? 1 : 0.5,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--navi-content)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {active ? <Eye size={11} /> : <EyeOff size={11} />}
                    {label}
                  </button>
                )
              })}
            </div>

            <div style={{ borderTop: '1px solid var(--navi-border)', margin: '8px 0' }} />
            <button onClick={() => setNavPreviewOpen((p) => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4,
                border: 'none', cursor: 'pointer', background: 'transparent', width: '100%',
                color: 'var(--navi-text-secondary)', fontSize: 10, textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--navi-content)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform: navPreviewOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Navigation Preview
            </button>
            {navPreviewOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
                <button onClick={toggleGraph}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4,
                    border: 'none', cursor: 'pointer', background: 'transparent',
                    color: graphVisible ? 'var(--navi-text)' : 'var(--navi-text-secondary)',
                    fontSize: 10, textAlign: 'left', opacity: graphVisible ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--navi-content)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {graphVisible ? <Eye size={11} /> : <EyeOff size={11} />}
                  Graph
                </button>
                <button onClick={() => setValidationVisible((v) => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4,
                    border: 'none', cursor: 'pointer', background: 'transparent',
                    color: validationVisible ? 'var(--navi-text)' : 'var(--navi-text-secondary)',
                    fontSize: 10, textAlign: 'left', opacity: validationVisible ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--navi-content)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {validationVisible ? <Eye size={11} /> : <EyeOff size={11} />}
                  Validation
                </button>
              </div>
            )}
          </div>

          {alignMode && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--navi-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Floor Plan Alignment
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                  Opacity
                  <input type="range" min="0" max="1" step="0.05"
                    value={editorAlignment?.opacity ?? alignOpacity}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setAlignOpacity(v)
                      setEditorAlignment((prev) => ({ ...prev, opacity: v }))
                    }}
                    style={{ width: '100%', marginTop: 4 }} />
                </label>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                  Rotation (°)
                  <input type="number" min="-180" max="180" step="0.5"
                    value={editorAlignment?.rotation ?? 0}
                    onChange={(e) => setEditorAlignment((prev) => ({ ...prev, rotation: parseFloat(e.target.value) || 0 }))}
                    style={{ width: '100%', marginTop: 4, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)', background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11 }} />
                </label>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                  Scale
                  <input type="number" min="0.1" max="5" step="0.05"
                    value={editorAlignment?.scale ?? 1}
                    onChange={(e) => setEditorAlignment((prev) => ({ ...prev, scale: parseFloat(e.target.value) || 1 }))}
                    style={{ width: '100%', marginTop: 4, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)', background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11 }} />
                </label>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                  Offset X (m)
                  <input type="number" step="0.5"
                    value={editorAlignment?.offset?.x ?? 0}
                    onChange={(e) => setEditorAlignment((prev) => ({ ...prev, offset: { ...prev.offset, x: parseFloat(e.target.value) || 0 } }))}
                    style={{ width: '100%', marginTop: 4, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)', background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11 }} />
                </label>
                <label style={{ fontSize: 10, color: 'var(--navi-text-secondary)' }}>
                  Offset Y (m)
                  <input type="number" step="0.5"
                    value={editorAlignment?.offset?.y ?? 0}
                    onChange={(e) => setEditorAlignment((prev) => ({ ...prev, offset: { ...prev.offset, y: parseFloat(e.target.value) || 0 } }))}
                    style={{ width: '100%', marginTop: 4, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--navi-border)', background: 'var(--navi-content)', color: 'var(--navi-text)', fontSize: 11 }} />
                </label>
                <button onClick={() => setEditorAlignment({})}
                  style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--navi-border)', background: 'var(--navi-content)', color: '#EF4444', fontSize: 10, cursor: 'pointer' }}>
                  Reset
                </button>
              </div>
            </div>
          )}
          {selectedId && (
            <ComponentProperties key={selectedId} componentId={selectedId} onClose={() => clear()} />
          )}
        </div>
      </div>
    </div>
  )
}
