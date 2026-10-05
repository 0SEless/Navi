import { canonicalizeAuthoredDocument } from '@navi/core'
import { Graph } from '../engine/graph'
import type { GraphSnapshot } from '../types/nav-types'
import { parseAuthoredGraphPayload } from './authored-snapshot-persistence'
import { serializeSnapshot, type GraphSnapshotLike } from './graph-snapshot-serializer'
import { snapshotSha256 } from './snapshot-sha256'

export const SNAPSHOT_IDENTITY_VERSION = 2 as const

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).filter(k => record[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`
}

/** Shared client/server identity. Transport aliases/defaults normalize through
 * the existing Graph serializer; authored fields use the core canonicalizer.
 * Object order and session timestamps are ignored; authored array order stays.
 * NULL is explicit, so legacy Graph-only content cannot equal modern content. */
export function fullSnapshotFingerprint(value: unknown): string {
  const parsed = parseAuthoredGraphPayload(value)
  const input = parsed.graphPayload
  const graph = Graph.fromJSON({ ...input, buildings: input.buildings ?? [], nodes: input.nodes ?? [], edges: input.edges ?? [] } as unknown as GraphSnapshot)
  const normalized = serializeSnapshot(graph.toJSON() as unknown as GraphSnapshotLike) as unknown as Record<string, unknown>
  delete normalized.updatedAt
  return `v2:sha256:${snapshotSha256(stableStringify({
    graph: normalized,
    authoredDocument: parsed.authoredDocument ? canonicalizeAuthoredDocument(parsed.authoredDocument) : null,
  }))}`
}
