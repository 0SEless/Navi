import type { CampusDocument, CoordinateTransformer } from '@navi/core'
import { registerBuildingTransforms } from '@navi/editor'
import { isSaveV2Enabled } from './flag'

interface AdoptableContext {
  document: CampusDocument
  transformer?: CoordinateTransformer
  services: { get(id: string): unknown }
}

/**
 * Under Save v2 the document the session loaded (or the one the other Studio page left
 * behind) is authoritative: the editor adopts it instead of the lossy Graph conversion.
 * Transforms are re-registered from the document too: the Graph drops floor offsets/rotation.
 */
export function adoptV2Document(context: AdoptableContext, state: { authoredDocument: CampusDocument | null; graph?: unknown }): boolean {
  if (!isSaveV2Enabled()) return false
  const snapshot = state.authoredDocument
  const campusId = context.document.metadata?.campusId
  if (!snapshot || !campusId || snapshot.metadata?.campusId !== campusId) return false
  const documentStore = context.services.get('documentStore') as { adoptSnapshot?: (document: CampusDocument) => void } | undefined
  if (typeof documentStore?.adoptSnapshot !== 'function') return false
  if (context.transformer) registerBuildingTransforms(context.transformer, snapshot.buildings, state.graph ?? {})
  documentStore.adoptSnapshot(snapshot)
  return true
}
