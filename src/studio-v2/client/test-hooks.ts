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
