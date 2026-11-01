import { describe, expect, it, vi } from 'vitest'
import { fixtureFull } from '../__fixtures__/campus-fixtures'
import { splitDocument } from '../parts/split'
import { createMemoryStore } from './kv-store'
import { createLocalReferenceStore } from './local-reference-store'

describe('localReferenceStore', () => {
  it('attach restores planImageId only for floors with a stored reference', async () => {
    const doc = fixtureFull()
    for (const building of doc.buildings) for (const floor of building.floors) {
      delete floor.planImageId
      delete floor.planAlignment
      delete floor.floorPlanState
    }
    const urls: Blob[] = []
    const store = createLocalReferenceStore(createMemoryStore(), (blob) => {
      urls.push(blob)
      return `blob:test-${urls.length}`
    })
    const building = doc.buildings[0]
    const [traced, other] = building.floors
    await store.put('campus-1', building.id, traced.id, {
      blob: new Blob(['png-bytes'], { type: 'image/png' }),
      planAlignment: { scale: 2 },
      floorPlanState: 'active',
    })
    await store.attach(doc, 'campus-1')
    expect(traced.planImageId).toBe('blob:test-1')
    expect(traced.planAlignment).toEqual({ scale: 2 })
    expect(traced.floorPlanState).toBe('active')
    expect(other?.planImageId).toBeUndefined()
    expect(urls).toHaveLength(1)
  })

  it('syncFrom stores alignment updates without touching the database api', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const doc = fixtureFull()
      const { localReferences } = splitDocument(doc)
      expect(localReferences.length).toBeGreaterThan(0)
      const store = createLocalReferenceStore(createMemoryStore(), () => 'blob:unused')
      const [first] = localReferences
      await store.put('campus-1', first.buildingId, first.floorId, { blob: new Blob(['x']), planAlignment: { scale: 1 }, floorPlanState: 'active' })
      await store.syncFrom([{ ...first, planAlignment: { scale: 3 }, floorPlanState: 'locked' }], 'campus-1')
      const entry = await store.get('campus-1', first.buildingId, first.floorId)
      expect(entry?.planAlignment).toEqual({ scale: 3 })
      expect(entry?.floorPlanState).toBe('locked')
      expect(entry?.blob).toBeInstanceOf(Blob)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('remove deletes a floor reference', async () => {
    const store = createLocalReferenceStore(createMemoryStore(), () => 'blob:x')
    await store.put('c', 'b', 'f', { blob: new Blob(['x']) })
    await store.remove('c', 'b', 'f')
    expect(await store.get('c', 'b', 'f')).toBeNull()
  })
})
