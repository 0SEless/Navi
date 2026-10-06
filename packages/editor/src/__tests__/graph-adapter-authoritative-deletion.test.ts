/**
 * Authored-deletion contract for `GraphAdapter.sync`.
 *
 * Regression cover for the deletion-resurrection defect (errors/ERRORS.md, 2026-10-06):
 * `reconcileCanonicalCollections` inferred coverage from the incoming document, so an
 * entity the author DELETED was indistinguishable from one merely OUT OF SCOPE and was
 * silently merged back from the previous snapshot. The save guard then approved the save,
 * because nothing appeared to have been removed.
 *
 * `GraphAdapterScope.authoritative` resolves this: the caller declares that it holds the
 * COMPLETE campus document, so absence means deleted. This file pins both halves of that
 * contract:
 *
 *  - when the flag IS set, authored deletions of buildings, floors and roads persist under
 *    every scope `EditorBridge` can pass;
 *  - when the flag is NOT set, partial-document callers keep the old preserving behaviour,
 *    so the opt-in cannot silently start deleting unrelated canonical content.
 *
 * Scope selection in `EditorBridge` (src/components/studio/EditorBridge.tsx) gives
 * `activeBuildingId` precedence over the road branch, so a road edit made while a building
 * is selected is synced with a building scope. That path is covered explicitly here.
 *
 * Identity-stability and scoped-preservation behaviour is covered separately by
 * `sync-reconciliation.test.ts` and is not duplicated.
 */
import { describe, it, expect } from 'vitest'
import type { Building, CampusDocument } from '@navi/core'
import { Graph } from '@/engine/graph'
import { GraphAdapter } from '../graph-adapter'
import { createDocument } from '../context/create-editor-context'

type Scope = {
  kind?: string
  buildingId?: string | null
  floor?: number | null
  authoritative?: boolean
}

function footprint(lat: number, lng: number) {
  return {
    points: [
      { lat, lng },
      { lat: lat + 0.001, lng },
      { lat: lat + 0.001, lng: lng + 0.001 },
      { lat, lng: lng + 0.001 },
      { lat, lng },
    ],
  }
}

/** A building whose floors each carry a connector stop, so sync mints building-scoped nodes. */
function makeBuilding(buildingId: string, floorCount: number, latOffset = 0): Building {
  const floors = Array.from({ length: floorCount }, (_, i) => ({
    id: `flr-${buildingId}-${i}`,
    level: i,
    label: `Level ${i}`,
    elevation: i * 4,
    rooms: [],
    hallways: [],
    staircases: [],
    elevators: [],
    entrances: [],
    connectorStops: [
      {
        id: `cs-${buildingId}-${i}`,
        connectorId: `conn-${buildingId}`,
        position: { x: i + 1, y: i + 1 },
        anchors: [],
        accessible: true,
        metadata: {},
      },
    ],
    metadata: {},
  }))
  return {
    id: buildingId,
    name: `Building ${buildingId}`,
    code: 'SB',
    category: 'academic',
    description: '',
    footprint: footprint(33.43 + latOffset, -111.92),
    baseElevation: 0,
    height: 12,
    floors,
    aliases: [],
    verticalConnectors: [
      {
        id: `conn-${buildingId}`,
        type: 'staircase',
        name: `Stair ${buildingId}`,
        stopIds: floors.map((f) => `cs-${buildingId}-${f.level}`),
        accessible: true,
        metadata: {},
      },
    ],
    color: '#00ff00',
    metadata: {},
  } as unknown as Building
}

function baseDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: {
      campusId: 'authoritative-deletion-campus',
      name: 'Authoritative Deletion Campus',
      description: '',
      lastModified: '2026-07-08T00:00:00Z',
      editorVersion: '1.0.0',
    },
    buildings: [makeBuilding('bld-1', 2, 0), makeBuilding('bld-2', 2, 0.002)],
    roads: [
      {
        id: 'road-1',
        name: 'Road One',
        polyline: { points: [{ lat: 33.42, lng: -111.93 }, { lat: 33.421, lng: -111.929 }] },
        width: 5,
        surface: 'paved',
        type: 'arterial',
        metadata: {},
      },
      {
        id: 'road-2',
        name: 'Road Two',
        polyline: { points: [{ lat: 33.423, lng: -111.925 }, { lat: 33.424, lng: -111.924 }] },
        width: 5,
        surface: 'paved',
        type: 'arterial',
        metadata: {},
      },
    ],
    panoramas: [],
    qrCheckpoints: [],
  } as unknown as CampusDocument
}

/** Every scope `EditorBridge` can pass, all carrying the production flag. */
const AUTHORITATIVE_SCOPES: Array<{ label: string; scope: Scope }> = [
  { label: 'authoring scope', scope: { kind: 'authoring', authoritative: true } },
  { label: 'no-kind scope (building inactive, non-road edit)', scope: { authoritative: true } },
  { label: 'building scope for a DIFFERENT building', scope: { kind: 'building', buildingId: 'bld-1', floor: null, authoritative: true } },
  { label: 'building scope for the DELETED building', scope: { kind: 'building', buildingId: 'bld-2', floor: null, authoritative: true } },
]

function syncAfter(mutate: (doc: CampusDocument) => void, scope: Scope) {
  const doc = baseDocument()
  const graph = new Graph()
  const adapter = new GraphAdapter(graph)
  adapter.sync(doc)
  mutate(doc)
  adapter.sync(doc, scope)
  return { graph, doc }
}

const nodeIdsOfBuilding = (graph: Graph, buildingId: string) =>
  graph.nodes.filter((n) => (n as { buildingId?: string | null }).buildingId === buildingId).map((n) => n.id).sort()

const traceIds = (graph: Graph) => (graph.traces ?? []).map((t) => t.id).sort()

describe('GraphAdapter.sync — authored deletions under an authoritative document', () => {
  describe('building deletion', () => {
    for (const { label, scope } of AUTHORITATIVE_SCOPES) {
      it(`removes the building and its canonical nodes (${label})`, () => {
        const { graph } = syncAfter((doc) => {
          doc.buildings = doc.buildings.filter((b) => b.id !== 'bld-2')
        }, scope)

        expect(graph.buildings.map((b) => b.id)).not.toContain('bld-2')
        expect(nodeIdsOfBuilding(graph, 'bld-2')).toEqual([])
      })
    }
  })

  describe('floor deletion', () => {
    for (const { label, scope } of AUTHORITATIVE_SCOPES) {
      it(`removes the deleted floor's canonical nodes (${label})`, () => {
        const { graph } = syncAfter((doc) => {
          const target = doc.buildings.find((b) => b.id === 'bld-1')
          target.floors = target.floors.filter((f: { id: string }) => f.id !== 'flr-bld-1-1')
        }, scope)

        expect(nodeIdsOfBuilding(graph, 'bld-1')).not.toContain('N-cstop-cs-bld-1-1')
        // The surviving floor of the same building must be untouched.
        expect(nodeIdsOfBuilding(graph, 'bld-1')).toContain('N-cstop-cs-bld-1-0')
      })
    }
  })

  describe('road deletion', () => {
    for (const { label, scope } of AUTHORITATIVE_SCOPES) {
      it(`removes the authored road trace (${label})`, () => {
        const { graph } = syncAfter((doc) => {
          doc.roads = doc.roads.filter((r) => r.id !== 'road-2')
        }, scope)

        expect(traceIds(graph)).not.toContain('road-2')
        // The surviving road must be untouched.
        expect(traceIds(graph)).toContain('road-1')
      })
    }
  })

  it('does not resurrect a deleted building when the document is rebuilt from the graph', () => {
    const { graph } = syncAfter((doc) => {
      doc.buildings = doc.buildings.filter((b) => b.id !== 'bld-2')
    }, { kind: 'authoring', authoritative: true })

    const roundTripped = createDocument(graph)
    expect(roundTripped.buildings.map((b) => b.id).sort()).toEqual(['bld-1'])
  })

  it('leaves no dangling edges after a building is deleted', () => {
    const { graph } = syncAfter((doc) => {
      doc.buildings = doc.buildings.filter((b) => b.id !== 'bld-2')
    }, { kind: 'authoring', authoritative: true })

    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    expect(graph.edges.filter((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to))).toEqual([])
  })

  describe('OPT-IN SAFETY — behaviour without the flag must be unchanged', () => {
    it('still preserves an out-of-scope entity for a partial-document caller (no flag)', () => {
      const doc = baseDocument()
      const graph = new Graph()
      const adapter = new GraphAdapter(graph)
      adapter.sync(doc)

      // A caller holding only part of the campus: bld-2 is simply absent from its document.
      const partial = baseDocument()
      partial.buildings = partial.buildings.filter((b) => b.id !== 'bld-2')
      adapter.sync(partial, { kind: 'authoring' })

      // Without `authoritative` the entity is preserved, which is the contract that keeps
      // partial-document callers from destroying unrelated canonical content.
      expect(graph.buildings.map((b) => b.id)).toContain('bld-2')
      expect(nodeIdsOfBuilding(graph, 'bld-2').length).toBeGreaterThan(0)
    })

    it('still preserves out-of-scope buildings under an unscoped sync (no flag)', () => {
      const doc = baseDocument()
      const graph = new Graph()
      const adapter = new GraphAdapter(graph)
      adapter.sync(doc)

      const partial = baseDocument()
      partial.buildings = partial.buildings.filter((b) => b.id !== 'bld-2')
      adapter.sync(partial)

      expect(graph.buildings.map((b) => b.id)).toContain('bld-2')
    })
  })
})
