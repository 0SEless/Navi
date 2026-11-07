// @vitest-environment node
// The route network end to end (2026-11-08): a fully authored campus (two buildings, rooms, a stair, a lift, an
// old-style and a new-style entrance, a QR anchor) through the compiler and read exactly as NAVI Web reads it.
import { describe, expect, it } from 'vitest'
import { CampusCompiler } from '@navi/compiler'
import type { CampusDocument } from '@navi/core'
import { fixtureFull } from './__fixtures__/campus-fixtures'
import { buildArtifactsBlob } from './server/artifacts-blob'
import { publicCampusPayload } from './server/public-campus-payload'
import { parsePublicCampus } from '@/store/public-store'
import { findNavRoute } from '@/lib/findRoute'
import { resolveNearestNode } from '@/lib/location-resolver'
import { resolveQrCheckpointLocation } from '@/lib/qr-location'
import type { CampusBundle } from '@/types/nav-types'

function visitorCampus(doc: CampusDocument = fixtureFull()): { bundle: CampusBundle; graphIds: string[] } {
  const compiled = new CampusCompiler().compileV2(doc)
  if (!compiled.success || !compiled.graph) throw new Error(JSON.stringify(compiled.errors))
  const blob = buildArtifactsBlob({ ...(compiled.artifacts as unknown as Record<string, unknown>), navigationGraph: compiled.graph } as never, doc.metadata.campusId, 1, 1)
  const parsed = parsePublicCampus(publicCampusPayload(doc.metadata.campusId, blob as Record<string, unknown>), doc.metadata.campusId)
  if (!parsed) throw new Error('NAVI Web could not read the campus')
  return { bundle: parsed.bundle, graphIds: compiled.graph.nodes.map((n) => n.id) }
}

const destinations = (b: CampusBundle) => b.searchEntries.filter((e) => e.nodeId)
const connected = (b: CampusBundle, id: string) => b.edges.some((e) => e.from === id || e.to === id)
/** The fixture's one room with neither a door nor a room link: Validate warns about it; nothing can reach it. */
const UNLINKED = new Set(['Study Hall', 'Study Hall (201)'])

describe('the route network from Studio to NAVI Web', () => {
  it('compiling the same campus twice gives the same graph (no ids carried over between compiles)', () => {
    expect(visitorCampus().graphIds).toEqual(visitorCampus().graphIds)
  })

  it('every searchable place is reachable from every other, except rooms with no door or room link', () => {
    const { bundle } = visitorCampus()
    const places = destinations(bundle).filter((e) => !UNLINKED.has(e.label))
    expect(places.length).toBeGreaterThanOrEqual(5)
    const missing: string[] = []
    for (const a of places) {
      for (const z of places) {
        if (a.nodeId === z.nodeId) continue
        if (!findNavRoute(bundle.nodes, bundle.edges, a.nodeId!, z.nodeId!)) missing.push(`${a.label} → ${z.label}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('a building linked with a new-style entrance link can be routed to', () => {
    const { bundle } = visitorCampus()
    const library = destinations(bundle).find((e) => e.type === 'building' && e.label.startsWith('Biblioteca'))!
    const lab = destinations(bundle).find((e) => e.label === 'Chemistry Lab (S101)')!
    expect(connected(bundle, library.nodeId!)).toBe(true)
    expect(findNavRoute(bundle.nodes, bundle.edges, lab.nodeId!, library.nodeId!)).not.toBeNull()
  })

  it('a room with a door drawn in the floor editor (a floor-level door record) is reachable', () => {
    const { bundle } = visitorCampus()
    const archive = destinations(bundle).find((e) => e.label === 'Archive (102)')!
    expect(connected(bundle, archive.nodeId!)).toBe(true)
  })

  it('a QR checkpoint starts on a connected point', () => {
    const { bundle } = visitorCampus()
    // Floor anchors (QR / panorama markers) join the floor's route.
    const anchors = bundle.nodes.filter((n) => n.metadata?.entityType === 'anchor')
    expect(anchors.length).toBeGreaterThan(0)
    for (const anchor of anchors) expect(connected(bundle, anchor.id), anchor.label).toBe(true)
    expect(anchors.every((n) => n.type === 'qr_marker')).toBe(true)
    const doc = fixtureFull()
    for (const checkpoint of doc.qrCheckpoints ?? []) {
      const entry = { id: checkpoint.id, label: checkpoint.label, buildingId: checkpoint.buildingId, floor: checkpoint.floor, position: checkpoint.position, code: '' }
      const start = resolveQrCheckpointLocation(entry as never, bundle, doc.metadata.campusId)
      if (start.nodeId) expect(connected(bundle, start.nodeId)).toBe(true)
    }
  })

  it('a GPS start snaps to a connected point', () => {
    const { bundle } = visitorCampus()
    for (const node of bundle.nodes) {
      const start = resolveNearestNode(bundle.nodes, node.position, 50, bundle.edges)
      expect(start && connected(bundle, start.node.id), `start near ${node.id}`).toBe(true)
    }
  })

  it('NAVI Web reads the point types the compiler writes, and a climb says stairs or lift', () => {
    const { bundle } = visitorCampus()
    // Route points are walkways, not rooms; stair/lift points are not building entrances.
    const types = new Set(bundle.nodes.map((n) => n.type))
    expect(types.has('walkway')).toBe(true)
    const climbers = bundle.nodes.filter((n) => n.metadata?.entityType === 'staircase' || n.metadata?.entityType === 'elevator')
    for (const n of climbers) expect(['stair', 'elevator', 'staircase']).toContain(n.type)
    const reading = destinations(bundle).find((e) => e.label === 'Reading Room (101)')!
    const upstairs = bundle.nodes.find((n) => n.floor === 1 && connected(bundle, n.id) && n.buildingId === 'osm:way/123')!
    const route = findNavRoute(bundle.nodes, bundle.edges, reading.nodeId!, upstairs.id)!
    expect(route).not.toBeNull()
    expect(route.steps.some((s) => s.type === 'stairs' || s.type === 'elevator')).toBe(true)
    expect(route.steps.filter((s) => s.type === 'entrance').length).toBeLessThanOrEqual(1)
  })
})
