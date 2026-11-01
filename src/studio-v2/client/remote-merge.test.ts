import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { CommandDispatcher, CommandRegistry, DocumentEventBus, DocumentStore, HistoryStack } from '@navi/editor'
import { fixtureFull } from '../__fixtures__/campus-fixtures'
import { partKey } from '../parts/part-keys'
import { splitDocument } from '../parts/split'
import type { PartRecordWithVersion } from '../server/types'
import { mergeRemoteParts } from './remote-merge'

function contextFor(document: CampusDocument) {
  const eventBus = new DocumentEventBus()
  const store = new DocumentStore(document, eventBus)
  const registry = new CommandRegistry()
  const dispatcher = new CommandDispatcher(registry, document, eventBus)
  const history = new HistoryStack(dispatcher, document, registry, 20, store)
  const services = new Map<string, unknown>([['documentStore', store], ['history', history]])
  return { document, services: { get: (id: string) => services.get(id) }, history }
}

function remoteRoad(doc: CampusDocument, index: number, name: string, versionNo = 2): PartRecordWithVersion {
  const road = doc.roads[index]
  const part = splitDocument(doc).parts.find((candidate) => candidate.key === partKey('map/road', road.id))!
  return { partKey: part.key, versionNo, checksum: 'a'.repeat(64), sortKey: part.sortKey, content: { ...road, name }, contentBase64: null }
}

describe('mergeRemoteParts', () => {
  it('mergeRemoteParts skips locally dirty parts', () => {
    const document = fixtureFull()
    const context = contextFor(document)
    const [first, second] = document.roads
    first.name = 'Local edit'
    const remote = [remoteRoad(fixtureFull(), 0, 'Remote first'), remoteRoad(fixtureFull(), 1, 'Remote second')]
    const result = mergeRemoteParts(context, remote, new Set([partKey('map/road', first.id)]))
    expect(result.applied).toEqual([partKey('map/road', second.id)])
    expect(context.document.roads.find((road) => road.id === first.id)?.name).toBe('Local edit')
    expect(context.document.roads.find((road) => road.id === second.id)?.name).toBe('Remote second')
  })

  it('removes a part another admin deleted and keeps road order', () => {
    const document = fixtureFull()
    const context = contextFor(document)
    const victim = document.roads[1]
    const order = document.roads.map((road) => road.id).filter((id) => id !== victim.id)
    const tombstone: PartRecordWithVersion = {
      partKey: partKey('map/road', victim.id), versionNo: 3, checksum: 'a'.repeat(64), sortKey: null, content: null, contentBase64: null, deleted: true,
    }
    mergeRemoteParts(context, [tombstone], new Set())
    expect(context.document.roads.map((road) => road.id)).toEqual(order)
  })

  it('keeps local floor-plan references and reports history as rebased', () => {
    const document = fixtureFull()
    const context = contextFor(document)
    const floorWithPlan = document.buildings.flatMap((b) => b.floors).find((floor) => floor.planImageId)!
    const result = mergeRemoteParts(context, [remoteRoad(fixtureFull(), 0, 'Remote')], new Set())
    expect(result.history).toBe('rebased')
    const after = context.document.buildings.flatMap((b) => b.floors).find((floor) => floor.id === floorWithPlan.id)!
    expect(after.planImageId).toBe(floorWithPlan.planImageId)
  })

  it('does nothing when every incoming part is locally dirty', () => {
    const document = fixtureFull()
    const context = contextFor(document)
    const remote = remoteRoad(fixtureFull(), 0, 'Remote')
    expect(mergeRemoteParts(context, [remote], new Set([remote.partKey]))).toEqual({ applied: [], history: 'none' })
  })
})
