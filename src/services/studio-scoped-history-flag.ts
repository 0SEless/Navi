export interface StudioScopedHistoryFlagEnvironment {
  nodeEnv?: string
  scopedFlag?: string
  draftFlag?: string
  durableFlag?: string
}

/** Durable saving is nested under both existing local gates and remains opt-in. */
export function isStudioDurableScopedSaveEnabled(
  env: StudioScopedHistoryFlagEnvironment & { durableFlag?: string } = {
    nodeEnv: process.env.NODE_ENV,
    scopedFlag: process.env.NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY,
    draftFlag: process.env.NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS,
    durableFlag: process.env.NEXT_PUBLIC_NAVI_STUDIO_DURABLE_SCOPED_SAVE,
  },
): boolean {
  return isStudioScopedHistoryEnabled(env) && env.durableFlag === 'true'
}

/**
 * Scoped history is an additional Development-only opt-in layered on top of
 * the existing IndexedDB draft gate. It is deliberately off by default.
 */
export function isStudioScopedHistoryEnabled(
  env: StudioScopedHistoryFlagEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    scopedFlag: process.env.NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY,
    draftFlag: process.env.NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS,
  },
): boolean {
  return env.nodeEnv === 'development' && env.scopedFlag === 'true' && env.draftFlag === 'true'
}
