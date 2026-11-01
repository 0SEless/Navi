const SESSION_STORAGE_KEY = 'navi-studio-session-id'

let memoSessionId: string | null = null

/** Save v2 is on only when the build sets NEXT_PUBLIC_NAVI_SAVE_V2=1. */
export function isSaveV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_NAVI_SAVE_V2 === '1'
}

/**
 * One id per browser tab: lock ownership is per (admin, tab), so a second tab of the
 * same admin is a different session. Kept in sessionStorage so a reload keeps it.
 */
export function studioSessionId(): string {
  if (memoSessionId) return memoSessionId
  try {
    const stored = globalThis.sessionStorage?.getItem(SESSION_STORAGE_KEY)
    if (stored) return (memoSessionId = stored)
  } catch {
    // Storage blocked (private mode, sandbox): fall back to a per-page id.
  }
  const id = globalThis.crypto.randomUUID()
  try {
    globalThis.sessionStorage?.setItem(SESSION_STORAGE_KEY, id)
  } catch {
    // Ignore: the in-memory id still identifies this page.
  }
  return (memoSessionId = id)
}
