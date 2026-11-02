// Merge parts another admin saved into this editor's document (spec §6.4, §6.5).
// Locally-dirty parts are never overwritten; undo/redo history is rebased (or cleared
// when one of its steps touched a merged part) so undo can't revert their newer work.
import type { CampusDocument } from '@navi/core'
import { joinParts } from '../parts/join'
import type { PartKey } from '../parts/part-keys'
import { clonePlain, splitDocument, type PartRecord } from '../parts/split'
import type { PartRecordWithVersion } from '../server/types'

interface DocumentStoreLike {
  adoptSnapshot(document: CampusDocument): void
}

interface HistoryLike {
  applyRemote(touched: Set<string>, apply: (doc: CampusDocument) => void): 'rebased' | 'cleared'
}

/** The slice of an EditorContext this module needs. */
export interface MergeContext {
  document: CampusDocument
  services: { get(id: string): unknown }
}

export interface MergeResult {
  applied: PartKey[]
  history: 'rebased' | 'cleared' | 'none'
}

/** The document with `incoming` parts replaced (or removed, for tombstones). */
export function withRemoteParts(doc: CampusDocument, incoming: PartRecordWithVersion[]): CampusDocument {
  const { parts, localReferences } = splitDocument(doc)
  const byKey = new Map<PartKey, PartRecord>(parts.map((part) => [part.key, part]))
  for (const part of incoming) {
    if (part.deleted) byKey.delete(part.partKey)
    else if (typeof part.contentBase64 === 'string') byKey.set(part.partKey, { key: part.partKey, content: null, contentBase64: part.contentBase64, sortKey: part.sortKey })
    else byKey.set(part.partKey, { key: part.partKey, content: clonePlain(part.content), sortKey: part.sortKey })
  }
  const joined = joinParts([...byKey.values()], localReferences, {
    lastModified: doc.metadata.lastModified,
    editorVersion: doc.metadata.editorVersion,
  })
  joined.version = doc.version
  return joined
}

function replaceInPlace(target: CampusDocument, next: CampusDocument): void {
  for (const key of Object.keys(target)) Reflect.deleteProperty(target, key)
  Object.assign(target, next)
}

export function mergeRemoteParts(context: MergeContext, parts: PartRecordWithVersion[], skip: Set<PartKey>): MergeResult {
  const incoming = parts.filter((part) => !skip.has(part.partKey))
  if (incoming.length === 0) return { applied: [], history: 'none' }

  const next = withRemoteParts(context.document, incoming)
  const store = context.services.get('documentStore') as DocumentStoreLike | undefined
  if (store) store.adoptSnapshot(next)
  else replaceInPlace(context.document, next)

  const history = context.services.get('history') as HistoryLike | undefined
  const touched = new Set(incoming.map((part) => part.partKey))
  const outcome = history
    ? history.applyRemote(touched, (snapshot) => replaceInPlace(snapshot, withRemoteParts(snapshot, incoming)))
    : 'none'
  return { applied: incoming.map((part) => part.partKey), history: outcome }
}
