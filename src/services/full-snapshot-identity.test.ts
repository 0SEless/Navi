import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { fullSnapshotFingerprint } from './full-snapshot-identity'
import { snapshotSha256 } from './snapshot-sha256'
import { serializeSnapshot } from './graph-snapshot-serializer'

const graph = { campusId: 'identity-campus', buildings: [], nodes: [], edges: [], components: [] }
const doc = { schemaVersion: 1, version: 0, metadata: { campusId: 'identity-campus', name: 'A', description: '', lastModified: '', editorVersion: '' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [] }
describe('canonical full snapshot identity', () => {
  it('hashes UTF-8 and multi-block input using SHA-256 known implementation', () => {
    for (const text of ['', 'abc', 'authored 🗺️'.repeat(200)]) expect(snapshotSha256(text)).toBe(createHash('sha256').update(text).digest('hex'))
  })
  it('distinguishes authored-only changes and explicit null', () => {
    const a = fullSnapshotFingerprint({ ...graph, authoredDocument: doc })
    expect(a).not.toBe(fullSnapshotFingerprint({ ...graph, authoredDocument: { ...doc, metadata: { ...doc.metadata, name: 'B' } } }))
    expect(a).not.toBe(fullSnapshotFingerprint(graph))
    expect(fullSnapshotFingerprint(graph)).toBe(fullSnapshotFingerprint({ ...graph, authoredDocument: null }))
  })
  it('ignores JSONB key order and volatile Graph/authored session values', () => {
    const a = fullSnapshotFingerprint({ ...graph, updatedAt: 'R1', authoredDocument: doc })
    const shuffled = Object.fromEntries(Object.entries({ ...graph, updatedAt: 'R2', authoredDocument: { ...doc, version: 20, metadata: { ...doc.metadata, lastModified: 'later', editorVersion: 'other' } } }).reverse())
    expect(fullSnapshotFingerprint(shuffled)).toBe(a)
  })
  it('binds boundary/connectivity and preserves them through the transport serializer', () => {
    const rich = { ...graph, boundary: { points: [{ lat: 1, lng: 2 }] }, connectivitySemanticsVersion: '1' }
    expect(fullSnapshotFingerprint(rich)).not.toBe(fullSnapshotFingerprint(graph))
    expect(serializeSnapshot(rich)).toMatchObject({ boundary: rich.boundary, connectivitySemanticsVersion: '1' })
  })
})
