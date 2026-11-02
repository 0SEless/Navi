'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import type maplibregl from 'maplibre-gl'
import type { BrushSettings, TileId } from '@navi/core'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDocumentVersion, useEditor, type Command, type MutationResult } from '@navi/editor'
import { isSaveV2Enabled } from '@/studio-v2/client/flag'
import { useEnsureZone, ZoneProvider } from '@/components/studio/v2/ZoneProvider'
import { useExplicitSave, useSaveShortcut, useStudioSession } from '@/components/studio/v2/useStudioSession'
import { TerrainWorkspace, type SaveResult } from './TerrainWorkspace'
import { useTerrainLock } from './useTerrainLock'
import { TerrainStage } from './TerrainStage'
import { TerrainViewControls } from './TerrainViewControls'
import { markTerrainDirty, NO_AREA, tilesBounds, useTerrainSampler } from '@/lib/terrain/use-terrain-sampler'
import type { TerrainView } from '@/lib/terrain/terrain-view'
import type { TerrainTool } from './TerrainToolRail'
import { DEFAULT_BRUSH } from './TerrainToolPanel'
import { TerrainTools } from './TerrainTools'
import { DEFAULT_LAYERS, type TerrainLayers } from './TerrainLayersPanel'
import { useTerrainStroke } from './useTerrainStroke'
import { useTerrainShortcuts } from './useTerrainShortcuts'

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
  const { document, services } = useEditor()
  const documentVersion = useDocumentVersion() // re-render on every document change
  const router = useRouter()
  const popOut = useSearchParams()?.get('view') === '3d'
  const [view, setView] = useState<TerrainView>('heights')
  const [exaggeration, setExaggeration] = useState(1)
  const [tool, setTool] = useState<TerrainTool>('raise-lower')
  const [settings, setSettings] = useState<BrushSettings>(DEFAULT_BRUSH)
  const [working, setWorking] = useState<{ tiles: Map<TileId, Int16Array> | null; tick: number }>({ tiles: null, tick: 0 })
  const [mainMap, setMainMap] = useState<maplibregl.Map | null>(null)
  const [miniMap, setMiniMap] = useState<maplibregl.Map | null>(null)
  const [layers, setLayers] = useState<TerrainLayers>(DEFAULT_LAYERS)
  const [cutAboveFloorId, setCutAboveFloorId] = useState<string | null>(null)
  const ensureZone = useEnsureZone()
  const { sampler, version } = useTerrainSampler(document, documentVersion, working.tiles ? { tilesOverride: working.tiles, overrideVersion: working.tick } : undefined)
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
    const result = dispatcher?.execute(command)
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
  }, [lock.status, services, document.terrain?.grid, document.buildings, ensureZone])

  const editing = lock.status === 'held' && Boolean(document.terrain)
  const workingRef = useRef<Map<TileId, Int16Array> | null>(null)
  const markWorking = () => {
    const grid = document.terrain?.grid
    // A stroke that has not touched a tile yet changes nothing.
    if (grid && workingRef.current) markTerrainDirty(tilesBounds(grid, workingRef.current.keys()) ?? NO_AREA)
    else markTerrainDirty(NO_AREA)
  }
  const strokeOptions = {
    document, sampler, tool, settings, enabled: editing, dispatch,
    onWorking: (tiles: Map<TileId, Int16Array> | null) => {
      markWorking() // the stroke's area, also when the working tiles are dropped at the end
      workingRef.current = tiles
      setWorking((current) => ({ tiles, tick: current.tick + 1 }))
    },
    onTick: () => {
      markWorking()
      setWorking((current) => ({ ...current, tick: current.tick + 1 }))
    },
    onPick: (heightM: number) => setSettings((current) => ({ ...current, mode: 'set', targetM: heightM })),
  }
  useTerrainStroke(mainMap, strokeOptions)
  useTerrainStroke(miniMap, strokeOptions)
  useTerrainShortcuts({
    enabled: editing,
    history: services.get('history') as { undo(): boolean; redo(): boolean } | undefined,
    setTool,
    setSettings,
  })

  const onSave = useCallback(async (): Promise<SaveResult> => {
    if (!session) return { ok: true }
    await save()
    const state = session.getState()
    if (state.status === 'error' || state.status === 'conflict') return { ok: false, message: state.message ?? 'Could not save the terrain.' }
    return { ok: true }
  }, [save, session])

  return (
    <TerrainWorkspace
      document={document}
      dispatch={dispatch}
      lock={lock}
      onSave={onSave}
      onLeave={() => router.push(`/studio/${encodeURIComponent(mapId)}/edit`)}
      topBarExtras={<TerrainViewControls view={view} exaggeration={exaggeration} onView={setView} onExaggeration={setExaggeration} />}
    >
      <TerrainStage document={document} sampler={sampler} version={version} view={view} exaggeration={exaggeration} popOut={popOut} onMainMap={setMainMap} onMiniMap={setMiniMap} layers={layers} cutAboveFloorId={cutAboveFloorId} />
      {!popOut && (
        <TerrainTools
          document={document} sampler={sampler} maps={[mainMap, miniMap]} editing={editing} dispatch={dispatch}
          tool={tool} onTool={setTool} settings={settings} onSettings={setSettings} layers={layers} onLayers={setLayers}
          cutAboveFloorId={cutAboveFloorId} onCutAbove={setCutAboveFloorId}
        />
      )}
      {children}
    </TerrainWorkspace>
  )
}
