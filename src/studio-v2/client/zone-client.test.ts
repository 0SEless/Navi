import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandDispatcher, CommandRegistry, DocumentEventBus, DocumentStore, HistoryStack } from '@navi/editor'
import { fixtureFull } from '../__fixtures__/campus-fixtures'
import type { ZoneKey } from '../parts/part-keys'
import type { StudioApi, StatusReply } from './api-client'
import { buildingZone, clearHistoryForZone, denialMessage, partsInZone, ZoneClient } from './zone-client'

function fakeApi(overrides: Partial<StudioApi> = {}) {
  const status: StatusReply = { headCommit: 1, locks: [], lostZones: [], myRole: 'editor' }
  return {
    acquire: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ granted: zones, denied: [] })),
    release: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ released: zones })),
    forceRelease: vi.fn(async () => ({ released: true })),
    status: vi.fn(async () => status),
    ...overrides,
  } as unknown as StudioApi & Record<string, ReturnType<typeof vi.fn>>
}

describe('ZoneClient', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('poll interval 15000 and on focus', async () => {
    const api = fakeApi()
    const client = new ZoneClient({ campusId: 'c1', api })
    client.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.status).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(api.status).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(api.status).toHaveBeenCalledTimes(3)
    client.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.status).toHaveBeenCalledTimes(3)
  })

  it('start/stop are reference-counted so a page change cannot stop the heartbeat', async () => {
    const api = fakeApi()
    const client = new ZoneClient({ campusId: 'c1', api })
    client.start() // map page
    client.start() // floor page mounts before the map page unmounts
    client.stop() // map page unmounts
    await vi.advanceTimersByTimeAsync(15_000)
    expect(api.status).toHaveBeenCalledTimes(2)
    client.stop()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(api.status).toHaveBeenCalledTimes(2)
  })

  it('sends held zones with every poll (the heartbeat)', async () => {
    const api = fakeApi()
    const client = new ZoneClient({ campusId: 'c1', api })
    await client.ensure(['building:B1'])
    await client.poll()
    expect(api.status).toHaveBeenLastCalledWith('c1', ['building:B1'])
  })

  it('ensure denied emits denial with holderName', async () => {
    const denial = { zoneKey: 'building:B1' as ZoneKey, holderName: 'Ana', since: '2026-11-01T00:00:00Z', sameActor: false }
    const api = fakeApi({ acquire: vi.fn(async () => ({ granted: [], denied: [denial] })) })
    const client = new ZoneClient({ campusId: 'c1', api })
    const seen = vi.fn()
    client.onDenied(seen)
    expect(await client.ensure(['building:B1'])).toBe(false)
    expect(seen).toHaveBeenCalledWith(denial)
    expect(client.held()).toEqual([])
    expect(denialMessage(denial)).toBe('Ana is currently editing this building — try editing other buildings.')
  })

  it('sameActor denial uses "You are editing this in another tab."', () => {
    expect(denialMessage({ zoneKey: 'building:B1', holderName: 'Ana', since: null, sameActor: true })).toBe('You are editing this in another tab.')
    expect(denialMessage({ zoneKey: 'terrain', holderName: 'Ben', since: null, sameActor: false })).toBe('Ben is using the terrain editor.')
    expect(denialMessage({ zoneKey: 'campus', holderName: 'Ana', since: null, sameActor: false })).toBe('Ana is editing campus settings.')
  })

  it('ensure skips the network for zones already held', async () => {
    const api = fakeApi()
    const client = new ZoneClient({ campusId: 'c1', api })
    expect(await client.ensure(['terrain'])).toBe(true)
    expect(await client.ensure(['terrain'])).toBe(true)
    expect(api.acquire).toHaveBeenCalledTimes(1)
  })

  it('lost zone fires onLost', async () => {
    const api = fakeApi({ status: vi.fn(async (): Promise<StatusReply> => ({ headCommit: 1, locks: [], lostZones: ['building:B1'], myRole: 'editor' })) })
    const client = new ZoneClient({ campusId: 'c1', api })
    await client.ensure(['building:B1'])
    const lost = vi.fn()
    client.onLost(lost)
    await client.poll()
    expect(lost).toHaveBeenCalledWith(['building:B1'])
    expect(client.held()).toEqual([])
  })

  it('reports head moves after the baseline is known', async () => {
    let head = 4
    const api = fakeApi({ status: vi.fn(async (): Promise<StatusReply> => ({ headCommit: head, locks: [], lostZones: [], myRole: 'owner' })) })
    const client = new ZoneClient({ campusId: 'c1', api })
    client.setHeadCommit(4)
    const moved = vi.fn()
    client.onHeadMoved(moved)
    await client.poll()
    expect(moved).not.toHaveBeenCalled()
    head = 6
    await client.poll()
    expect(moved).toHaveBeenCalledWith(6)
    expect(client.myRole()).toBe('owner')
  })

  it('clean zone idle 30 min is released', async () => {
    const api = fakeApi()
    const client = new ZoneClient({ campusId: 'c1', api, isClean: () => true })
    await client.ensure(['building:B1'])
    vi.advanceTimersByTime(30 * 60_000 + 1)
    await client.poll()
    expect(api.release).toHaveBeenCalledWith('c1', ['building:B1'])
    expect(client.held()).toEqual([])
  })

  it('dirty zone idle 30 min is kept', async () => {
    const api = fakeApi()
    const client = new ZoneClient({ campusId: 'c1', api, isClean: () => false })
    await client.ensure(['building:B1'])
    vi.advanceTimersByTime(31 * 60_000)
    await client.poll()
    expect(api.release).not.toHaveBeenCalled()
    expect(client.held()).toEqual(['building:B1'])
  })

  it('markEdited postpones the idle release', async () => {
    const api = fakeApi()
    const client = new ZoneClient({ campusId: 'c1', api, isClean: () => true })
    await client.ensure(['building:B1'])
    vi.advanceTimersByTime(20 * 60_000)
    client.markEdited('building:B1')
    vi.advanceTimersByTime(20 * 60_000)
    await client.poll()
    expect(api.release).not.toHaveBeenCalled()
  })

  it('release notifies onReleased listeners', async () => {
    const api = fakeApi()
    const client = new ZoneClient({ campusId: 'c1', api })
    await client.ensure(['terrain'])
    const released = vi.fn()
    client.onReleased(released)
    await client.release(['terrain'])
    expect(released).toHaveBeenCalledWith(['terrain'])
  })
})

describe('zone helpers', () => {
  it('buildingZone encodes the id like part keys do', () => {
    expect(buildingZone('osm:way/123')).toBe('building:osm%3Away%2F123')
  })

  it('releasing a zone whose parts an undo step touched clears history', () => {
    const document = fixtureFull()
    const eventBus = new DocumentEventBus()
    const store = new DocumentStore(document, eventBus)
    const registry = new CommandRegistry()
    const dispatcher = new CommandDispatcher(registry, document, eventBus)
    const history = new HistoryStack(dispatcher, document, registry, 20, store)
    const zone = buildingZone(document.buildings[0].id)
    history.setTouchedPartsResolver(() => partsInZone(document, zone))
    const before = structuredClone(document)
    document.buildings[0].name = 'Edited'
    history.afterBatch([{ id: 'test', label: 'Edit', payload: {} }], [{ success: true }], document, before)
    expect(partsInZone(document, zone).length).toBeGreaterThan(1)
    expect(clearHistoryForZone(history, document, zone)).toBe('cleared')
    expect(history.canUndo).toBe(false)
  })
})
