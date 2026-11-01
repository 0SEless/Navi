import { describe, expect, it } from 'vitest'
import { partKey } from '../parts/part-keys'
import type { LoadOk } from '../server/types'
import { createDraftStore, planRestore, type V2Draft } from './draft-store'
import { createMemoryStore } from './kv-store'

const CHECKSUM = 'a'.repeat(64)

function load(parts: Array<{ key: string; versionNo: number }>): LoadOk {
  return {
    status: 'ok',
    headCommit: 9,
    parts: parts.map(({ key, versionNo }) => ({ partKey: key, versionNo, checksum: CHECKSUM, sortKey: null, content: {}, contentBase64: null })),
  }
}

function draft(parts: V2Draft['parts']): V2Draft {
  return { campusId: 'c1', userId: 'u1', savedAt: '2026-11-01T00:00:00Z', parts }
}

const floorKey = partKey('floor', 'B1', 'F1')
const buildingKey = partKey('building', 'B1')
const roadKey = partKey('map/road', 'r1')

describe('planRestore', () => {
  it('planRestore applies a part whose baseVersion equals the server version', () => {
    const decisions = planRestore(draft({ [roadKey]: { baseVersion: 2, content: { id: 'r1' }, sortKey: '000000' } }), load([{ key: roadKey, versionNo: 2 }]), () => true)
    expect(decisions).toEqual([{ key: roadKey, action: 'apply' }])
  })

  it('planRestore marks conflict-changed when the server moved on', () => {
    const decisions = planRestore(draft({ [roadKey]: { baseVersion: 2, content: { id: 'r1' }, sortKey: '000000' } }), load([{ key: roadKey, versionNo: 3 }]), () => true)
    expect(decisions).toEqual([{ key: roadKey, action: 'conflict-changed' }])
  })

  it('planRestore marks conflict-deleted when the building no longer exists', () => {
    const decisions = planRestore(
      draft({ [floorKey]: { baseVersion: 4, content: { id: 'F1' }, sortKey: null }, [buildingKey]: { baseVersion: 2, content: {}, sortKey: null } }),
      load([{ key: roadKey, versionNo: 1 }]),
      () => true,
    )
    expect(decisions).toEqual([
      { key: buildingKey, action: 'conflict-deleted' },
      { key: floorKey, action: 'conflict-deleted' },
    ])
  })

  it('planRestore gives needs-zone when another admin holds the building', () => {
    const decisions = planRestore(
      draft({ [floorKey]: { baseVersion: 4, content: { id: 'F1' }, sortKey: null } }),
      load([{ key: buildingKey, versionNo: 2 }, { key: floorKey, versionNo: 4 }]),
      (zone) => zone !== 'building:B1',
    )
    expect(decisions).toEqual([{ key: floorKey, action: 'needs-zone' }])
  })

  it('a new part (baseVersion 0) that nobody else created is applied', () => {
    expect(planRestore(draft({ [roadKey]: { baseVersion: 0, content: { id: 'r1' }, sortKey: '000003' } }), load([]), () => true)).toEqual([
      { key: roadKey, action: 'apply' },
    ])
  })

  it('a drafted deletion of a part that is already gone is applied', () => {
    expect(planRestore(draft({ [roadKey]: { baseVersion: 2, content: null, sortKey: null } }), load([]), () => true)).toEqual([
      { key: roadKey, action: 'apply' },
    ])
  })
})

describe('draftStore', () => {
  it('writes, reads and clears parts per campus and user', async () => {
    const store = createDraftStore(createMemoryStore())
    await store.write(draft({ [roadKey]: { baseVersion: 1, content: { id: 'r1' }, sortKey: '000000' }, [floorKey]: { baseVersion: 1, content: {}, sortKey: null } }))
    expect(Object.keys((await store.read('c1', 'u1'))!.parts).sort()).toEqual([floorKey, roadKey].sort())
    expect(await store.read('c1', 'someone-else')).toBeNull()
    await store.clearParts('c1', 'u1', [roadKey])
    expect(Object.keys((await store.read('c1', 'u1'))!.parts)).toEqual([floorKey])
    await store.clearParts('c1', 'u1', [floorKey])
    expect(await store.read('c1', 'u1')).toBeNull()
  })
})
