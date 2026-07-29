'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useEditor, useSelection, Viewport, CurrentToolStore, ContextHeader, ToolDock, INTERIOR_TOOL_GROUPS, useToolDockShortcuts } from '@navi/editor'
import { useLegacyBuilding, useFloorSyncStatus, useFloorSyncError, useFloorComponents } from '@/hooks/floor-graph-selectors'
import { DiagnosticsPanel } from '@/components/diagnostics/DiagnosticsPanel'
import { runValidationChecks } from './validation-checks'
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
  navigate: 'select',
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

  const [editorMode, setEditorMode] = useState<'architecture' | 'navigation-preview'>('architecture')
  // Floor plan opacity (separate from alignment to allow preview without persistence)
  const [alignOpacity, setAlignOpacity] = useState(0.7)

  const hasPlan = !!building?.floorPlanUrls?.[floor]
  const [mode, setMode] = useState<'setup' | 'mapping'>(hasPlan ? 'mapping' : 'mapping')
  const [locked, setLocked] = useState(false)
  const [showGotIt, setShowGotIt] = useState(false)
  const [setupCardHidden, setSetupCardHidden] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [uploadCardDismissed, setUploadCardDismissed] = useState(false)
  const [showUnlockWarning, setShowUnlockWarning] = useState(false)

  const [navPreviewOpen, setNavPreviewOpen] = useState(false)
  const [validationVisible, setValidationVisible] = useState(false)
  const floorComponents = useFloorComponents(buildingId, floorAdapter.activeFloorIndex)
  const validationChecks = useMemo(
    () => validationVisible ? runValidationChecks(building, floorAdapter.activeFloorIndex, floorComponents) : [],
    [validationVisible, building, floorAdapter.activeFloorIndex, floorComponents],
  )

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
    if (editorMode === 'navigation-preview' && toolId !== 'select') return
    if (toolId === 'align') return // alignment handled by workflow state
    const mappedId = TOOL_ID_MAP[toolId] || toolId
    activateTool(mappedId)
    clear()
  }, [activateTool, clear, editorMode])

  // Find the active tool ID in the groups (reverse mapping)
  const dockActiveTool = editorMode === 'navigation-preview' ? 'select' : mode === 'setup' ? 'select' : Object.entries(TOOL_ID_MAP).find(([, v]) => v === activeTool)?.[0] || activeTool

  useToolDockShortcuts(INTERIOR_TOOL_GROUPS, dockActiveTool, handleToolActivate)

  const historyRef = useRef(services.get('history'))
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.repeat) {
        e.preventDefault()
        if (e.shiftKey) {
          historyRef.current.redo()
        } else {
          historyRef.current.undo()
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y') && !e.repeat) {
        e.preventDefault()
        historyRef.current.redo()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editorMode])

  const floorCount = building?.floors?.length ?? 0
  const floorLabel = floor === 0 ? 'GF' : floor > 0 ? `${floor}F` : `${floor}F`
  const canvasTool = mode === 'setup' ? 'select' : editorMode === 'navigation-preview' ? 'select' : activeTool

  // Find planAlignment for current floor from floorData
  const currentLevel = building?.floors?.[floorAdapter.activeFloorIndex] ?? floor
  const currentFloorData = building?.floorData?.find((fd: any) => fd.level === currentLevel)
  const planAlignment = (currentFloorData as any)?.planAlignment as { offset?: { x: number; y: number }; scale?: number; rotation?: number; opacity?: number } | undefined

  const [editorAlignment, setEditorAlignment] = useState(planAlignment)
  useEffect(() => setEditorAlignment(planAlignment), [planAlignment])

  const currentFloorId = (currentFloorData as any)?.id as string | undefined
  // Persist alignment when mode transitions from setup → mapping (lock)
  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (prevModeRef.current === 'setup' && mode === 'mapping' && currentFloorId && editorAlignment) {
      const dispatcher = services.get('dispatcher') as any
      dispatcher?.execute({ id: 'entity.update', payload: { entityId: currentFloorId, changes: { planAlignment: editorAlignment } } })
    }
    prevModeRef.current = mode
  }, [mode, currentFloorId, editorAlignment, services])

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const dispatcher = services.get('dispatcher') as any
      dispatcher?.execute({ id: 'entity.update', payload: { entityId: currentFloorId, changes: { planImageId: dataUrl } } })
      setShowGotIt(true)
      setMode('setup')
    }
    reader.readAsDataURL(file)
  }, [services, currentFloorId])

  const handleLock = useCallback(() => {
    setLocked(true)
    setMode('mapping')
    setShowGotIt(false)
  }, [])

  const handleUnlock = useCallback(() => {
    const roomCount = floorComponents.filter((c) => c.type === 'room').length
    const hallwayCount = floorComponents.filter((c) => c.type === 'hallway').length
    if (roomCount > 0 || hallwayCount > 0) {
      setShowUnlockWarning(true)
    } else {
      setMode('setup')
      setLocked(false)
      setSetupCardHidden(false)
    }
  }, [floorComponents])

  const confirmUnlock = useCallback(() => {
    setShowUnlockWarning(false)
    setMode('setup')
    setLocked(false)
    setSetupCardHidden(false)
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!building ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
          Building not found
        </div>
      ) : floor < 0 || floor >= floorCount ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
          Floor not found
        </div>
      ) : (
        <>
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
          <FloorEditorCanvas building={building} floor={floorAdapter.activeFloorIndex} tool={canvasTool} layers={layers} selectedId={selectedId} onSelect={(id) => id ? select(id) : clear()} planAlignment={editorAlignment} alignMode={mode === 'setup'} readOnly={editorMode === 'navigation-preview'} locked={locked} onAlignmentChange={(a) => setEditorAlignment(a)} />
          {!hasPlan && !uploadCardDismissed && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', zIndex: 20 }}>
              <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 12, padding: '28px 32px', maxWidth: 360, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#F1F5F9', marginBottom: 6 }}>{floorLabel}</div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>This floor has no floor plan.</div>
                <label style={{ display: 'inline-block', padding: '8px 20px', borderRadius: 6, background: '#3B82F6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
                  Upload Floor Plan
                  <input type="file" accept="image/png,image/jpeg" onChange={handleUpload} style={{ display: 'none' }} />
                </label>
                <div>
                  <button onClick={() => { setUploadCardDismissed(true); setMode('mapping') }} style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
                    Continue without floor plan
                  </button>
                </div>
              </div>
            </div>
          )}
          {showGotIt && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
              <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#E2E8F0' }}>Floor uploaded. Drag it until the walls match the map.</span>
                <button onClick={() => setShowGotIt(false)} style={{ padding: '4px 10px', borderRadius: 4, background: '#3B82F6', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer' }}>Got it</button>
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            {mode === 'setup' ? (
              <div style={{ display: 'flex', background: 'var(--navi-card)', borderRadius: 6, border: '1px solid var(--navi-border)', padding: '3px 6px', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, marginRight: 4 }}>Setup</span>
                <button onClick={() => setEditorMode('architecture')} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: '#E2E8F0', fontSize: 11, cursor: 'pointer' }}>Move</button>
                <label style={{ fontSize: 10, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Opacity
                  <input type="range" min="0" max="1" step="0.05" value={editorAlignment?.opacity ?? alignOpacity}
                    onChange={(e) => { const v = parseFloat(e.target.value); setAlignOpacity(v); setEditorAlignment((prev) => ({ ...prev, opacity: v })) }}
                    style={{ width: 60 }} />
                </label>
                <button onClick={() => setShowAdvanced((a) => !a)} style={{ padding: '4px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: '#94A3B8', fontSize: 10, cursor: 'pointer' }}>{showAdvanced ? 'Hide' : 'Advanced'}</button>
                <button onClick={() => setEditorAlignment({})} style={{ padding: '4px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: '#EF4444', fontSize: 10, cursor: 'pointer' }}>Reset</button>
                <button onClick={handleLock} style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: '#10B981', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Lock Alignment</button>
              </div>
            ) : (
              <ToolDock groups={INTERIOR_TOOL_GROUPS} activeTool={dockActiveTool} onActivateTool={handleToolActivate} />
            )}
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
              Floor Setup
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: hasPlan ? '#10B981' : '#64748B' }}>
                <span>{hasPlan ? '\u2713' : '\u25CB'}</span> Upload
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: mode === 'mapping' && locked ? '#10B981' : mode === 'setup' ? '#E2E8F0' : '#64748B' }}>
                <span>{mode === 'mapping' && locked ? '\u2713' : '\u25CB'}</span> Align
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: mode === 'mapping' && locked ? '#10B981' : '#64748B' }}>
                <span>{mode === 'mapping' && locked ? '\u2713' : '\u25CB'}</span> Lock
              </div>
            </div>
            {mode === 'mapping' && (
              <>
                <div style={{ borderTop: '1px solid #334155', margin: '8px 0' }} />
                <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Tracing</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#64748B' }}>
                  <div>Rooms</div>
                  <div>Hallways</div>
                  <div>Connections</div>
                </div>
              </>
            )}
            {mode === 'setup' && hasPlan && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#94A3B8', lineHeight: 1.4 }}>
                Drag the floor plan until walls match the map, then lock.
              </div>
            )}
            {!setupCardHidden && mode === 'mapping' && (
              <button onClick={() => setSetupCardHidden(true)} style={{ marginTop: 6, background: 'none', border: 'none', color: '#64748B', fontSize: 10, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Hide
              </button>
            )}
            {setupCardHidden && mode === 'mapping' && (
              <button onClick={handleUnlock} style={{ marginTop: 6, background: 'none', border: 'none', color: '#94A3B8', fontSize: 10, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                Floor Plan Setup
              </button>
            )}
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

          {mode === 'setup' && showAdvanced && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--navi-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Advanced Alignment
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              </div>
            </div>
          )}
          {validationVisible && validationChecks.length > 0 && (
            <div style={{ borderTop: '1px solid var(--navi-border)', maxHeight: 240, overflowY: 'auto' }}>
              <DiagnosticsPanel
                diagnostics={validationChecks.map((c, i) => ({
                  id: c.id,
                  code: c.code as any,
                  category: 'document' as any,
                  severity: c.severity,
                  title: c.title,
                  message: c.message,
                  provider: 'validation',
                  target: c.entityId ? { entityType: 'component', entityId: c.entityId } : undefined,
                }))}
              />
            </div>
          )}
          {selectedId && (
            <ComponentProperties key={selectedId} componentId={selectedId} onClose={() => clear()} />
          )}
        </div>
      </div>
      {showUnlockWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 10, padding: '24px 28px', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 8 }}>Unlock floor plan?</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 16 }}>Unlocking may misalign traced geometry.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setShowUnlockWarning(false)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#E2E8F0', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmUnlock} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, cursor: 'pointer' }}>Unlock</button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
