import type { CampusDocument } from '@navi/core'

type ScopedSaveBoundary = (document: CampusDocument) => Promise<unknown>
let activeBoundary: ScopedSaveBoundary | null = null

export function registerScopedSaveBoundary(boundary: ScopedSaveBoundary): () => void {
  activeBoundary = boundary
  return () => { if (activeBoundary === boundary) activeBoundary = null }
}

export async function flushScopedSaveBoundary(document: CampusDocument): Promise<void> {
  if (!activeBoundary) throw new Error('The local E5 scoped save session is not ready.')
  await activeBoundary(document)
}
