import type { StudioSession } from './studio-session'

interface HookedContext {
  services: { get(id: string): unknown }
}

/**
 * Browser-probe hook (Task 18): exposes the mounted editor context and its Save v2 session
 * as `window.__naviStudioV2`. Only when the build sets NEXT_PUBLIC_NAVI_SAVE_V2_TEST_HOOKS=1
 * outside production; returns a cleanup function.
 */
export function exposeForBrowserProbe(context: HookedContext, session: StudioSession): () => void {
  if (process.env.NEXT_PUBLIC_NAVI_SAVE_V2_TEST_HOOKS !== '1' || process.env.NODE_ENV === 'production') return () => {}
  if (typeof window === 'undefined') return () => {}
  const target = window as Window & { __naviStudioV2?: { context: HookedContext; session: StudioSession } }
  const value = { context, session }
  target.__naviStudioV2 = value
  return () => {
    if (target.__naviStudioV2 === value) delete target.__naviStudioV2
  }
}

/** Browser-probe hook for the terrain workspace: its MapLibre maps by role, under the same build flag. */
export function exposeTerrainMapForProbe(role: string, map: unknown): () => void {
  if (process.env.NEXT_PUBLIC_NAVI_SAVE_V2_TEST_HOOKS !== '1' || process.env.NODE_ENV === 'production') return () => {}
  if (typeof window === 'undefined') return () => {}
  const target = window as Window & { __naviTerrainMaps?: Record<string, unknown> }
  const maps = (target.__naviTerrainMaps ??= {})
  maps[role] = map
  return () => {
    if (maps[role] === map) delete maps[role]
  }
}

/** Browser-probe hook for the terrain workspace: whether painting is enabled (lock held + terrain). */
export function exposeTerrainEditingForProbe(editing: boolean): () => void {
  if (process.env.NEXT_PUBLIC_NAVI_SAVE_V2_TEST_HOOKS !== '1' || process.env.NODE_ENV === 'production') return () => {}
  if (typeof window === 'undefined') return () => {}
  const target = window as Window & { __naviTerrainEditing?: boolean }
  target.__naviTerrainEditing = editing
  return () => {
    if (target.__naviTerrainEditing === editing) delete target.__naviTerrainEditing
  }
}
