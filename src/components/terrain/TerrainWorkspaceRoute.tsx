'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type maplibregl from 'maplibre-gl'
import type { BrushSettings, Rect, TileId } from '@navi/core'
import { useRouter } from 'next/navigation'
import { useDocumentVersion, useEditor, type Command, type MutationResult } from '@navi/editor'
import { isSaveV2Enabled } from '@/studio-v2/client/flag'
import { exposeTerrainEditingForProbe } from '@/studio-v2/client/test-hooks'
import { useEnsureZone, ZoneProvider } from '@/components/studio/v2/ZoneProvider'
import { useExplicitSave, useSaveShortcut, useStudioSession } from '@/components/studio/v2/useStudioSession'
import { TerrainWorkspace, type SaveResult } from './TerrainWorkspace'
import { useTerrainLock } from './useTerrainLock'
import { TerrainStage } from './TerrainStage'
import type { TerrainMapProps } from './TerrainMap'
import { TerrainViewControls } from './TerrainViewControls'
import { markTerrainDirty, NO_AREA, tilesBounds, useTerrainSampler } from '@/lib/terrain/use-terrain-sampler'
import type { TerrainView } from '@/lib/terrain/terrain-view'
import type { TerrainTool } from './TerrainToolRail'
import { DEFAULT_BRUSH } from './TerrainToolPanel'
import { TerrainTools } from './TerrainTools'
import { loadLayers, saveLayers, type TerrainLayers } from '@/lib/terrain/terrain-layers'
import { useTerrainStroke } from './useTerrainStroke'
import { useTerrainShortcuts } from './useTerrainShortcuts'
import { createTerrainPaintPreview, type TerrainPaintPreview } from '@/lib/three-d/terrain-preview'
import { executeWithStart, viewDocument } from '@/lib/terrain/terrain-start'
import { useSettingsBoundary } from './useSettingsBoundary'
import { guideSeen, markGuideSeen, TerrainGuide } from './TerrainGuide'

interface Dispatcher {
  execute(command: Command): MutationResult
}

/** Wires the terrain workspace to the editor, the Save v2 session, the terrain lock and navigation. */
export function TerrainWorkspaceRoute({ mapId, children }: { mapId: string; children?: ReactNode }) {
  const { document } = useEditor()
  if (!isSaveV2Enabled()) {
    return <div style={{ padding: 32, fontSize: 13 }}>The terrain workspace needs the new saving (Save v2) turned on.</div>
  }
  return (
    <ZoneProvider campusId={document.metadata.campusId} showDenials={false}>
      <TerrainWorkspaceConnected mapId={mapId}>{children}</TerrainWorkspaceConnected>
    </ZoneProvider>
  )
}

function TerrainWorkspaceConnected({ mapId, children }: { mapId: string; children?: ReactNode }) {
  const { document: stored, services } = useEditor()
  const documentVersion = useDocumentVersion() // re-render on every document change
  // Section 5: Terrain opens on the campus. Missing boundary -> the one drawn at map creation;
  // missing terrain -> flat "Campus ground". Both reach the real document only at the first edit.
  const settingsBoundary = useSettingsBoundary(stored.metadata.campusId)
  const document = useMemo(
    () => viewDocument(stored, settingsBoundary.points),
    // documentVersion stands for in-place changes of the stored document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored, documentVersion, settingsBoundary.points],
  )
  const router = useRouter()
  const [view, setView] = useState<TerrainView>('neutral')
  const [exaggeration, setExaggeration] = useState(1)
  // "Edit in terrain editor" from the map editor opens on one stair: /edit/terrain?stair=<id>.
  const [requestedStairId] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('stair')))
  const [tool, setTool] = useState<TerrainTool>(() => (requestedStairId ? 'stairs' : 'raise-lower'))
  const [settings, setSettings] = useState<BrushSettings>(DEFAULT_BRUSH)
  const [mainMap, setMainMap] = useState<maplibregl.Map | null>(null)
  // Tilted = shown in 3D; follows the map's live pitch (hand tilt or the 3D button).
  const [tilted, setTilted] = useState(false)
  // Section 5: the guide shows once per browser (after mount: storage is browser-only).
  const [guideOpen, setGuideOpen] = useState(false)
  useEffect(() => { if (!guideSeen()) setGuideOpen(true) }, [])
  const closeGuide = useCallback(() => { markGuideSeen(); setGuideOpen(false) }, [])
  // Section 5: layer choices are remembered in this browser.
  const [layers, setLayersState] = useState<TerrainLayers>(() => loadLayers())
  const setLayers = useCallback((next: TerrainLayers) => {
    setLayersState(next)
    saveLayers(next)
  }, [])
  const [cutAboveFloorId, setCutAboveFloorId] = useState<string | null>(null)
  // Shift+Z height mode: brushes are off while it is on; the drag's draft is drawn on the map, not saved.
  const [heightActive, setHeightActive] = useState(false)
  const [draft, setDraft] = useState<TerrainMapProps['draft']>(null)
  const ensureZone = useEnsureZone()
  const { sampler, version } = useTerrainSampler(document, documentVersion)
  // The clay preview while painting: built once per route, never touches sampler/version state.
  const previewRef = useRef<TerrainPaintPreview | null>(null)
  if (previewRef.current == null) {
    previewRef.current = createTerrainPaintPreview()
  }
  useEffect(() => () => previewRef.current?.dispose(), [])
  useEffect(() => {
    previewRef.current?.setMaps(mainMap ? [mainMap] : [], exaggeration)
  }, [mainMap, exaggeration])
  useEffect(() => {
    if (!mainMap) return
    const onPitch = () => setTilted(mainMap.getPitch() > 2)
    onPitch()
    mainMap.on('pitch', onPitch)
    return () => { mainMap.off('pitch', onPitch) }
  }, [mainMap])
  const toggleThreeD = useCallback(() => {
    mainMap?.easeTo({ pitch: tilted ? 0 : 60, duration: 600 })
  }, [mainMap, tilted])
  const session = useStudioSession()
  const save = useExplicitSave(session)
  useSaveShortcut(save)
  const lock = useTerrainLock()

  const dispatch = useCallback((command: Command): MutationResult | undefined => {
    const dispatcher = services.get('dispatcher') as Dispatcher | undefined
    // Stairs and presets are free parts (no lock) and do not change the ground: no tile reload.
    if (command.id.startsWith('structure.') || command.id.startsWith('structure-preset.')) {
      markTerrainDirty(NO_AREA)
      return dispatcher?.execute(command)
    }
    if (lock.status !== 'held') return { success: false, error: 'The terrain is locked by another admin.' }
    // A tile edit only redraws its own area; other commands redraw everything.
    const grid = document.terrain?.grid
    const tiles = command.id === 'terrain.apply-tiles' ? command.payload.tiles as Record<string, unknown> | undefined : undefined
    markTerrainDirty(grid && tiles ? tilesBounds(grid, Object.keys(tiles)) : 'all')
    const result = dispatcher ? executeWithStart((next) => dispatcher.execute(next), stored, settingsBoundary.points, command) : undefined
    // "Trace contours" on the first visit opens the contour pen.
    if (result?.success && command.payload.startTool === 'contour-pen') setTool('contour-pen')
    // After an import: every building that is not Fixed follows the ground (its own undo step).
    // It needs the buildings' locks, so it runs only when they are all free.
    if (result?.success && command.id === 'terrain.setup' && command.payload.followGround === true) {
      const zones = document.buildings.map((b) => `building:${encodeURIComponent(b.id)}` as const)
      void ensureZone(zones).then((granted) => {
        if (granted) dispatcher?.execute({ id: 'buildings.follow-ground', label: 'Buildings follow the ground', payload: {} })
      })
    }
    return result
  }, [lock.status, services, document.terrain?.grid, document.buildings, ensureZone, stored, settingsBoundary.points])

  const editing = lock.status === 'held' && Boolean(document.terrain)
  // Browser probes wait for this before painting: a stroke while the lock is still acquiring is ignored.
  useEffect(() => exposeTerrainEditingForProbe(editing), [editing])
  const strokeOptions = {
    document, sampler, tool, settings, enabled: editing && !heightActive, dispatch,
    // The clay preview: start/dab live on the stroke's working tiles, the end hands off to the
    // committed tiles (each map's next idle), cancel cleans at once. No React state per dab.
    onStrokeStart: (tiles: Map<TileId, Int16Array>) => {
      previewRef.current?.start(document, tiles)
    },
    onDab: (rect?: Rect) => {
      previewRef.current?.update(rect)
    },
    onStrokeEnd: () => {
      previewRef.current?.commit()
    },
    onStrokeCancel: () => {
      previewRef.current?.cancel()
    },
    onPick: (heightM: number) => setSettings((current) => ({ ...current, mode: 'set', targetM: heightM })),
  }
  useTerrainStroke(mainMap, strokeOptions)
  useTerrainShortcuts({
    enabled: editing,
    heightMode: heightActive,
    stairsAvailable: Boolean(sampler),
    history: services.get('history') as { undo(): boolean; redo(): boolean } | undefined,
    setTool,
    setSettings,
  })

  const onSave = useCallback(async (): Promise<SaveResult> => {
    if (!session) return { ok: true }
    await save()
    const state = session.getState()
    if (state.status === 'error' || state.status === 'conflict') return { ok: false, message: state.message ?? 'Could not save the terrain.' }
    // Keep the campus settings (map list, NAVI Web campus area) on the same boundary.
    const points = stored.boundary?.points
    if (points && points.length >= 3) {
      try {
        settingsBoundary.save(points)
      } catch (error) {
        console.warn('[terrain] Could not update the campus settings boundary:', error)
      }
    }
    return { ok: true }
  }, [save, session, stored, settingsBoundary])

  return (
    <TerrainWorkspace
      document={document}
      dispatch={dispatch}
      lock={lock}
      onSave={onSave}
      onLeave={() => router.push(`/studio/${encodeURIComponent(mapId)}/edit`)}
      missingBoundary={settingsBoundary.loaded && (document.boundary?.points?.length ?? 0) < 3}
      topBarExtras={(
        <>
          <TerrainViewControls view={view} exaggeration={exaggeration} onView={setView} onExaggeration={setExaggeration} threeD={tilted} onThreeD={toggleThreeD} />
          <button type="button" aria-label="Terrain guide" title="Show the terrain guide" onClick={() => setGuideOpen(true)}
            style={{ marginLeft: 8, width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--navi-border, #d1d5db)', background: 'var(--navi-card, #fff)', fontWeight: 700, cursor: 'pointer' }}>?</button>
        </>
      )}
    >
      <TerrainStage document={document} sampler={sampler} version={version} view={view} exaggeration={exaggeration} onMainMap={setMainMap} layers={layers} cutAboveFloorId={cutAboveFloorId} draft={draft} />
      <TerrainTools
        document={document} sampler={sampler} map={mainMap} editing={editing} dispatch={dispatch}
        tool={tool} onTool={setTool} settings={settings} onSettings={setSettings} layers={layers} onLayers={setLayers}
        cutAboveFloorId={cutAboveFloorId} onCutAbove={setCutAboveFloorId}
        requestedStairId={requestedStairId}
        onDraft={setDraft} onHeightActive={setHeightActive}
      />
      <TerrainGuide open={guideOpen} onClose={closeGuide} />
      {children}
    </TerrainWorkspace>
  )
}
