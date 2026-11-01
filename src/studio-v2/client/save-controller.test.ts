import { describe, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { fixtureFull, fixtureMinimal } from '../__fixtures__/campus-fixtures'
import { splitDocument } from '../parts/split'
import { partKey, type ZoneKey } from '../parts/part-keys'
import type { LoadOk, PartRecordWithVersion } from '../server/types'
import { SaveController } from './save-controller'
import { createStudioApi, type SaveHttpResult, type SaveRequestBody, type StudioApi } from './api-client'

const CHECKSUM = 'a'.repeat(64)

function loadOf(doc: CampusDocument, headCommit = 1, versionNo = 1): LoadOk {
  const { parts } = splitDocument(doc)
  return {
    status: 'ok',
    headCommit,
    parts: parts.map((part) => ({
      partKey: part.key,
      versionNo,
      checksum: CHECKSUM,
      sortKey: part.sortKey,
      content: part.content,
      contentBase64: null,
    })),
  }
}

function okReply(body: SaveRequestBody, commitNo = 2): SaveHttpResult {
  return {
    status: 'ok',
    commitNo,
    parts: body.changes.map((change) => ({ partKey: change.partKey, versionNo: change.expectedVersion + 1, checksum: CHECKSUM })),
    othersChanged: [],
  }
}

function fakeApi(save: (body: SaveRequestBody) => Promise<SaveHttpResult>): StudioApi & { save: ReturnType<typeof vi.fn> } {
  return { save: vi.fn(save) } as unknown as StudioApi & { save: ReturnType<typeof vi.fn> }
}

function zonesHolding(held: ZoneKey[] = [], ensureResult = true) {
  const heldSet = new Set<ZoneKey>(held)
  return {
    held: () => [...heldSet],
    ensure: vi.fn(async (zones: ZoneKey[]) => {
      if (!ensureResult) return false
      zones.forEach((zone) => heldSet.add(zone))
      return true
    }),
  }
}

function controllerFor(doc: CampusDocument, api: StudioApi, zones = zonesHolding()) {
  const controller = new SaveController({ campusId: doc.metadata.campusId, api, zones })
  controller.adoptBaseline(loadOf(doc))
  return controller
}

function firstBuildingFloor(doc: CampusDocument) {
  const building = doc.buildings[0]
  return { building, floor: building.floors[0] }
}

describe('SaveController dirty tracking', () => {
  it('clean document gives no dirty parts', () => {
    const doc = fixtureFull()
    const controller = controllerFor(doc, fakeApi(async (b) => okReply(b)))
    expect(controller.dirtyParts(doc)).toEqual([])
    expect(controller.isDirty(doc)).toBe(false)
  })

  it('edit then undo back gives clean', () => {
    const doc = fixtureFull()
    const controller = controllerFor(doc, fakeApi(async (b) => okReply(b)))
    const { building, floor } = firstBuildingFloor(doc)
    const original = floor.label
    floor.label = 'Renamed floor'
    expect(controller.dirtyParts(doc)).toEqual([partKey('floor', building.id, floor.id)])
    floor.label = original
    expect(controller.isDirty(doc)).toBe(false)
  })

  it('deleting a building marks building and all its floor parts dirty', () => {
    const doc = fixtureFull()
    const controller = controllerFor(doc, fakeApi(async (b) => okReply(b)))
    const building = doc.buildings[0]
    doc.buildings = doc.buildings.filter((candidate) => candidate.id !== building.id)
    const dirty = controller.dirtyParts(doc)
    expect(dirty).toContain(partKey('building', building.id))
    for (const floor of building.floors) expect(dirty).toContain(partKey('floor', building.id, floor.id))
  })
})

describe('SaveController.save', () => {
  it('save sends only dirty parts', async () => {
    const doc = fixtureFull()
    const { building, floor } = firstBuildingFloor(doc)
    const api = fakeApi(async (b) => okReply(b))
    const controller = controllerFor(doc, api, zonesHolding([`building:${encodeURIComponent(building.id)}` as ZoneKey]))
    floor.label = 'Edited'
    const outcome = await controller.save(doc)
    expect(outcome.kind).toBe('saved')
    const body = api.save.mock.calls[0][0] as SaveRequestBody
    expect(body.changes).toHaveLength(1)
    expect(body.changes[0]).toMatchObject({ partKey: partKey('floor', building.id, floor.id), op: 'put', expectedVersion: 1 })
    expect(body.baseCommit).toBe(1)
    expect(controller.isDirty(doc)).toBe(false)
    expect(controller.headCommit).toBe(2)
  })

  it('a clean document saves without a network call', async () => {
    const doc = fixtureMinimal()
    const api = fakeApi(async (b) => okReply(b))
    const controller = controllerFor(doc, api)
    expect(await controller.save(doc)).toEqual({ kind: 'saved', commitNo: null, othersChanged: [] })
    expect(api.save).not.toHaveBeenCalled()
  })

  it('offline then retry reuses mutationId', async () => {
    const doc = fixtureFull()
    const road = doc.roads[0]
    let calls = 0
    const api = fakeApi(async (b) => (++calls === 1 ? { status: 'offline', message: 'network down' } : okReply(b)))
    const controller = controllerFor(doc, api)
    road.name = 'Renamed road'
    expect((await controller.save(doc)).kind).toBe('offline')
    expect(controller.isDirty(doc)).toBe(true)
    expect((await controller.save(doc)).kind).toBe('saved')
    const first = api.save.mock.calls[0][0] as SaveRequestBody
    const second = api.save.mock.calls[1][0] as SaveRequestBody
    expect(second.mutationId).toBe(first.mutationId)
  })

  it('a retry after further edits starts a new mutationId', async () => {
    const doc = fixtureFull()
    const road = doc.roads[0]
    let calls = 0
    const api = fakeApi(async (b) => (++calls === 1 ? { status: 'offline', message: 'network down' } : okReply(b)))
    const controller = controllerFor(doc, api)
    road.name = 'First'
    await controller.save(doc)
    road.name = 'Second'
    await controller.save(doc)
    const [first, second] = api.save.mock.calls.map((call) => call[0] as SaveRequestBody)
    expect(second.mutationId).not.toBe(first.mutationId)
  })

  it('409 maps to stale with the part list', async () => {
    const doc = fixtureFull()
    const road = doc.roads[0]
    const stale = [{ partKey: partKey('map/road', road.id), yourVersion: 1, currentVersion: 2, savedBy: 'ana', savedAt: '2026-11-01T00:00:00Z' }]
    const controller = controllerFor(doc, fakeApi(async () => ({ status: 'stale', parts: stale })))
    road.name = 'Mine'
    expect(await controller.save(doc)).toEqual({ kind: 'stale', parts: stale })
  })

  it('map-item puts always carry their sortKey', async () => {
    const doc = fixtureFull()
    const road = doc.roads[0]
    const api = fakeApi(async (b) => okReply(b))
    const controller = controllerFor(doc, api)
    road.name = 'Sorted'
    await controller.save(doc)
    const body = api.save.mock.calls[0][0] as SaveRequestBody
    expect(body.changes[0]).toMatchObject({ partKey: partKey('map/road', road.id), sortKey: expect.any(String) })
  })

  it('new building auto-acquires its zone before save', async () => {
    const doc = fixtureMinimal()
    const api = fakeApi(async (b) => okReply(b))
    const zones = zonesHolding()
    const controller = controllerFor(doc, api, zones)
    const copy = structuredClone(doc.buildings[0])
    copy.id = 'new-building'
    copy.floors = copy.floors.map((floor) => ({ ...floor }))
    doc.buildings.push(copy)
    const outcome = await controller.save(doc)
    expect(zones.ensure).toHaveBeenCalledWith(expect.arrayContaining(['building:new-building']))
    expect(outcome.kind).toBe('saved')
    expect(zones.ensure.mock.invocationCallOrder[0]).toBeLessThan(api.save.mock.invocationCallOrder[0])
  })

  it('a refused zone stops the save before any request', async () => {
    const doc = fixtureFull()
    const { floor } = firstBuildingFloor(doc)
    const api = fakeApi(async (b) => okReply(b))
    const controller = controllerFor(doc, api, zonesHolding([], false))
    floor.label = 'Blocked'
    const outcome = await controller.save(doc)
    expect(outcome.kind).toBe('zone-not-held')
    expect(api.save).not.toHaveBeenCalled()
  })

  it('local-only fields never appear in the request body', async () => {
    const doc = fixtureFull()
    const { building, floor } = firstBuildingFloor(doc)
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as SaveRequestBody
      return new Response(JSON.stringify(okReply(body)), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const api = createStudioApi({ fetch: fetchSpy as unknown as typeof fetch, sessionId: () => '00000000-0000-4000-8000-000000000000' })
    const controller = controllerFor(doc, api, zonesHolding([`building:${encodeURIComponent(building.id)}` as ZoneKey]))
    floor.planImageId = 'blob:local-image'
    floor.label = 'Traced over a plan'
    await controller.save(doc)
    const sent = String(fetchSpy.mock.calls[0][1]?.body)
    expect(sent).not.toContain('planImageId')
    expect(sent).not.toContain('planAlignment')
    expect(sent).not.toContain('floorPlanState')
    expect(sent).not.toContain('blob:local-image')
  })

  it('splits a save larger than the body limit into several requests', async () => {
    const doc = fixtureFull()
    const api = fakeApi(async (b) => okReply(b))
    const controller = new SaveController({ campusId: doc.metadata.campusId, api, zones: zonesHolding(), maxRequestBytes: 4096 })
    controller.adoptBaseline(loadOf(doc))
    doc.roads.forEach((road, index) => { road.name = `Road ${index} ${'x'.repeat(2000)}` })
    const outcome = await controller.save(doc)
    expect(outcome.kind).toBe('saved')
    expect(api.save.mock.calls.length).toBeGreaterThan(1)
    for (const [body] of api.save.mock.calls) {
      expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(4096)
    }
    expect(controller.isDirty(doc)).toBe(false)
  })
})

describe('SaveController.resolveStale', () => {
  function latestFor(doc: CampusDocument, key: string, versionNo: number, mutate: (content: Record<string, unknown>) => void): PartRecordWithVersion {
    const part = splitDocument(doc).parts.find((candidate) => candidate.key === key)!
    const content = structuredClone(part.content) as Record<string, unknown>
    mutate(content)
    return { partKey: key, versionNo, checksum: CHECKSUM, sortKey: part.sortKey, content, contentBase64: null }
  }

  it('resolveStale theirs returns latest and marks the parts clean', () => {
    const doc = fixtureFull()
    const road = doc.roads[0]
    const key = partKey('map/road', road.id)
    const controller = controllerFor(doc, fakeApi(async (b) => okReply(b)))
    const latest = latestFor(doc, key, 3, (content) => { content.name = 'Theirs' })
    road.name = 'Mine'
    const stale = [{ partKey: key, yourVersion: 1, currentVersion: 3, savedBy: 'ana', savedAt: null }]
    const { reload } = controller.resolveStale('theirs', stale, [latest])
    expect(reload).toEqual([latest])
    road.name = 'Theirs'
    expect(controller.dirtyParts(doc)).not.toContain(key)
  })

  it('resolveStale mine makes the next save send expectedVersion = latest versionNo', async () => {
    const doc = fixtureFull()
    const road = doc.roads[0]
    const key = partKey('map/road', road.id)
    const api = fakeApi(async (b) => okReply(b))
    const controller = controllerFor(doc, api)
    const latest = latestFor(doc, key, 3, (content) => { content.name = 'Theirs' })
    road.name = 'Mine'
    const stale = [{ partKey: key, yourVersion: 1, currentVersion: 3, savedBy: 'ana', savedAt: null }]
    expect(controller.resolveStale('mine', stale, [latest]).reload).toEqual([])
    expect(controller.dirtyParts(doc)).toContain(key)
    await controller.save(doc)
    const body = api.save.mock.calls[0][0] as SaveRequestBody
    expect(body.changes.find((change) => change.partKey === key)).toMatchObject({ expectedVersion: 3, op: 'put' })
  })
})

describe('SaveController state', () => {
  it('notifies subscribers of dirty, saving and saved', async () => {
    const doc = fixtureFull()
    const controller = controllerFor(doc, fakeApi(async (b) => okReply(b)))
    const statuses: string[] = []
    controller.subscribe((state) => statuses.push(state.status))
    doc.roads[0].name = 'Changed'
    controller.refresh(doc)
    await controller.save(doc)
    expect(statuses).toEqual(['dirty', 'saving', 'saved'])
  })
})
