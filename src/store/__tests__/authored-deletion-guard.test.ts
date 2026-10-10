/**
 * The save guard must still FAIL CLOSED once authored deletions are actually visible to it.
 *
 * Before the authoritative-document fix, `GraphAdapter.sync` restored deleted entities, so
 * `evaluateAuthoredSave` saw no removals and approved the save — the guard silently blessed
 * a deletion that never happened. Now that a deletion reaches the canonical collections, the
 * guard has to block it unless a pending authored intent covers it. That is the safety
 * property this file pins.
 *
 * Adapter-side contract coverage lives in
 * `packages/editor/src/__tests__/graph-adapter-authoritative-deletion.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import type { Building, CampusDocument } from '@navi/core'
import { Graph } from '@/engine/graph'
// Import the candidate's source directly so an incomplete isolated node_modules
// cannot resolve this integration test through the protected parent worktree's
// @navi/editor workspace junction.
import { GraphAdapter } from '../../../packages/editor/src/graph-adapter'
import { evaluateAuthoredSave, type AuthoredMutationIntent } from '../authored-mutation-intent'
import type { GuardCollections } from '../../lib/save-safety-guard'

function makeBuilding(buildingId: string): Building {
  const floors = [0, 1].map((i) => ({
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
      { id: `cs-${buildingId}-${i}`, connectorId: `conn-${buildingId}`, position: { x: i, y: i }, anchors: [], accessible: true, metadata: {} },
    ],
    metadata: {},
  }))
  return {
    id: buildingId,
    name: buildingId,
    code: 'SB',
    category: 'academic',
    description: '',
    footprint: {
      points: [
        { lat: 33.43, lng: -111.92 },
        { lat: 33.431, lng: -111.92 },
        { lat: 33.431, lng: -111.919 },
        { lat: 33.43, lng: -111.919 },
        { lat: 33.43, lng: -111.92 },
      ],
    },
    baseElevation: 0,
    height: 12,
    floors,
    aliases: [],
    verticalConnectors: [
      { id: `conn-${buildingId}`, type: 'staircase', name: `Stair ${buildingId}`, stopIds: floors.map((f) => `cs-${buildingId}-${f.level}`), accessible: true, metadata: {} },
    ],
    color: '#00ff00',
    metadata: {},
  } as unknown as Building
}

function baseDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: { campusId: 'guard-campus', name: 'Guard Campus', description: '', lastModified: '2026-07-08T00:00:00Z', editorVersion: '1.0.0' },
    buildings: [makeBuilding('bld-1'), makeBuilding('bld-2')],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  } as unknown as CampusDocument
}

/** Mirrors `collectionsOf` in src/store/graph-store.ts. */
const asEntityList = (items: unknown): GuardCollections['buildings'] =>
  (Array.isArray(items) ? items : []).map((raw) => {
    const e = raw as { id?: string; buildingId?: string | null; floor?: number | null; from?: string; to?: string }
    return { id: String(e.id ?? ''), buildingId: e.buildingId ?? null, floor: e.floor ?? null, from: e.from, to: e.to }
  })

function collectionsOf(graph: Graph): GuardCollections {
  return {
    buildings: asEntityList(graph.buildings),
    components: asEntityList(graph.components),
    nodes: asEntityList(graph.nodes),
    edges: asEntityList(graph.edges),
    traces: asEntityList(graph.traces),
    doors: asEntityList((graph as unknown as { doors?: unknown }).doors),
  }
}

describe('save guard vs authoritative authored deletion', () => {
  it('BLOCKS a cross-scope building deletion that no pending intent covers', () => {
    const doc = baseDocument()
    const graph = new Graph()
    const adapter = new GraphAdapter(graph)

    adapter.sync(doc, { authoritative: true })
    const previous = collectionsOf(graph)

    // Author deletes bld-2, which is outside the authored intent recorded below.
    doc.buildings = doc.buildings.filter((b) => b.id !== 'bld-2')
    adapter.sync(doc, { kind: 'building', buildingId: 'bld-1', floor: null, authoritative: true })
    const candidate = collectionsOf(graph)
    const removedBuildingIds = previous.buildings
      .filter(({ id }) => !candidate.buildings.some((building) => building.id === id))
      .map(({ id }) => id)
    const pending = [
      { kind: 'building', buildingId: 'bld-1', floor: null, seq: 1 },
    ] satisfies AuthoredMutationIntent[]

    expect(previous.buildings.map(({ id }) => id).sort()).toEqual(['bld-1', 'bld-2'])
    expect(candidate.buildings.map(({ id }) => id)).toEqual(['bld-1'])
    expect(removedBuildingIds).toEqual(['bld-2'])
    expect(pending.map(({ kind, buildingId }) => ({ kind, buildingId }))).toEqual([
      { kind: 'building', buildingId: 'bld-1' },
    ])

    const verdict = evaluateAuthoredSave(previous, candidate, pending)

    expect(verdict.allowed).toBe(false)
  })

  it('ALLOWS the same deletion when a pending intent covers it', () => {
    const doc = baseDocument()
    const graph = new Graph()
    const adapter = new GraphAdapter(graph)

    adapter.sync(doc, { authoritative: true })
    const previous = collectionsOf(graph)

    doc.buildings = doc.buildings.filter((b) => b.id !== 'bld-2')
    adapter.sync(doc, { kind: 'authoring', authoritative: true })
    const candidate = collectionsOf(graph)

    const verdict = evaluateAuthoredSave(previous, candidate, [
      { kind: 'building', buildingId: 'bld-2', floor: null, seq: 1 },
    ] satisfies AuthoredMutationIntent[])

    expect(verdict.allowed).toBe(true)
  })

  it('ALLOWS an additive floor creation, so the mislabelled intent cannot block a save', () => {
    const doc = baseDocument()
    const graph = new Graph()
    const adapter = new GraphAdapter(graph)

    adapter.sync(doc, { authoritative: true })
    const previous = collectionsOf(graph)

    const newFloorId = 'flr-bld-1-NEW'
    doc.buildings[0].floors.push({
      id: newFloorId,
      level: 2,
      label: 'Level 2',
      elevation: 8,
      rooms: [],
      hallways: [],
      staircases: [],
      elevators: [],
      entrances: [],
      connectorStops: [
        { id: 'cs-bld-1-new', connectorId: 'conn-bld-1', position: { x: 9, y: 9 }, anchors: [], accessible: true, metadata: {} },
      ],
      metadata: {},
    } as never)

    // EditorBridge records a floor event with the FLOOR id in the buildingId slot when no
    // building is active. An additive change removes nothing, so that mislabel is harmless.
    adapter.sync(doc, { kind: 'authoring', authoritative: true })
    const candidate = collectionsOf(graph)

    const verdict = evaluateAuthoredSave(previous, candidate, [
      { kind: 'building', buildingId: newFloorId, floor: null, seq: 1 },
    ] satisfies AuthoredMutationIntent[])

    expect(candidate.nodes.length).toBeGreaterThan(previous.nodes.length)
    expect(verdict.allowed).toBe(true)
  })
})
