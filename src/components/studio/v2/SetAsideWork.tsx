'use client'

import { useEffect, useState } from 'react'
import type { StudioSession } from '@/studio-v2/client/studio-session'

/**
 * Unsaved work set aside on this computer (Cancel on "Restore it?", or a browser that blocks that question):
 * a Restore button that keeps the current edits, reloads, and brings everything back (owner 2026-11-15).
 */
export function SetAsideWork({ session, reload = () => window.location.reload() }: {
  session: Pick<StudioSession, 'setAsideSince' | 'restoreOnNextOpen'> | null
  reload?: () => void
}) {
  const [since, setSince] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    session?.setAsideSince().then((at) => { if (live) setSince(at) }).catch(() => undefined)
    return () => { live = false }
  }, [session])
  if (!session || !since) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 8px' }}>
      Unsaved work from {new Date(since).toLocaleString()} was set aside
      <button type="button" aria-label="Restore set-aside work" disabled={busy}
        style={{ fontSize: 12, padding: '1px 8px', borderRadius: 4, border: '1px solid #d97706', background: '#fff', cursor: 'pointer' }}
        onClick={async () => { setBusy(true); await session.restoreOnNextOpen(); reload() }}>Restore</button>
    </span>
  )
}
