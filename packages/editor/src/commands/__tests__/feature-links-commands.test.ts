import { describe, expect, it } from 'vitest'
import type { CampusDocument, Staircase } from '@navi/core'
import { CommandDispatcher } from '../dispatcher'
import { CommandRegistry } from '../registry'
import { featureCreateHandler, featureDeleteHandler, featureReplaceHandler } from '../feature-handlers'
import { featureLinkHandler, featureUnlinkHandler } from '../feature-link-handlers'
import { DocumentEventBus } from '../../eventbus'
import { HistoryStack } from '../../history'
import { DocumentStore } from '../../context/document-store'

function campus(): CampusDocument {
  return {
    schemaVersion: 1, version: 1, metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: 'test' },
    roads: [], panoramas: [], qrCheckpoints: [], areas: [],
    buildings: [{
      id: 'b', name: 'B', code: 'B', category: 'academic', description: '', baseElevation: 0, height: 10,
      footprint: { points: [] }, verticalConnectors: [], color: '#000', aliases: [], metadata: {},
      floors: [0, 1, 2].map((level) => ({ id: `f${level}`, level, label: `${level + 1}F`, elevation: level * 3, height: 3, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} })),
    }],
  } as unknown as CampusDocument
}

function editor(document: CampusDocument) {
  const eventBus = new DocumentEventBus()
  const store = new DocumentStore(document, eventBus)
  const registry = new CommandRegistry()
  for (const h of [featureCreateHandler, featureDeleteHandler, featureReplaceHandler, featureLinkHandler, featureUnlinkHandler]) registry.register(h)
  const dispatcher = new CommandDispatcher(registry, document, eventBus)
  const history = new HistoryStack(dispatcher, document, registry, 20, store)
  dispatcher.addPreHook(history)
  dispatcher.addPostHook(history)
  const run = (id: string, payload: Record<string, unknown>) => {
    const r = dispatcher.execute({ id, label: id, payload })
    if (!r.success) throw new Error(`${id}: ${r.error}`)
  }
  /** The floor editor's stair tool on a floor. */
  const place = (id: string, floor: number, x = 0) => run('feature.create', { buildingId: 'b', floor, id, featureType: 'staircase', position: { x, y: 0 }, rotation: 0, fromLevel: floor, toLevel: floor })
  return { run, place, history }
}
const stairs = (d: CampusDocument) => d.buildings[0].staircases as Staircase[]
const stair = (d: CampusDocument, id: string) => stairs(d).find((s) => s.id === id)!

describe('stair link commands', () => {
  it('a new stair spans only its own floor', () => {
    const d = campus()
    editor(d).run('feature.create', { buildingId: 'b', floor: 1, id: 's', featureType: 'staircase', position: { x: 0, y: 0 } })
    expect(stair(d, 's')).toMatchObject({ fromLevel: 1, toLevel: 1 })
    expect(Object.keys(stair(d, 's').levels)).toEqual(['1'])
  })

  it('placing a stair on 2F auto-links it to the 1F stair (one undo step removes both)', () => {
    const d = campus()
    const { place, history } = editor(d)
    place('s1', 0)
    place('s2', 1)
    expect(stair(d, 's1').links).toEqual({ above: 's2' })
    expect(stair(d, 's2').links).toEqual({ below: 's1' })
    expect(history.undo()).toBe(true)
    expect(stairs(d).map((s) => s.id)).toEqual(['s1'])
    expect(stair(d, 's1').links).toBeUndefined()
  })

  it('feature.link / feature.unlink change both sides and undo exactly', () => {
    const d = campus()
    const { place, run, history } = editor(d)
    place('s1', 0)
    place('a', 1, 0)
    place('b', 1, 30) // a is nearer: auto-linked to s1; b stays free
    run('feature.link', { buildingId: 'b', featureType: 'staircase', lowerId: 's1', upperId: 'b' })
    expect(stair(d, 's1').links).toEqual({ above: 'b' })
    expect(stair(d, 'a').links).toBeUndefined()
    run('feature.unlink', { buildingId: 'b', featureType: 'staircase', featureId: 'b', side: 'below' })
    expect(stair(d, 's1').links).toBeUndefined()
    expect(history.undo()).toBe(true)
    expect(stair(d, 's1').links).toEqual({ above: 'b' })
    expect(history.undo()).toBe(true)
    expect(stair(d, 's1').links).toEqual({ above: 'a' })
    expect(stair(d, 'b').links).toBeUndefined()
  })

  it('deleting a linked stair clears its partner; undo restores both links and links nothing else', () => {
    const d = campus()
    const { place, run, history } = editor(d)
    place('s1', 0)
    place('s2', 1)
    place('s3', 2)
    run('feature.delete', { featureId: 's2' })
    expect(stair(d, 's1').links).toBeUndefined()
    expect(stair(d, 's3').links).toBeUndefined()
    expect(history.undo()).toBe(true)
    expect(stair(d, 's2')).toMatchObject({ fromLevel: 1, links: { below: 's1', above: 's3' } })
    expect(stair(d, 's1').links).toEqual({ above: 's2' })
    expect(stair(d, 's3').links).toEqual({ below: 's2' })
  })

  it('turning a stair into a lift drops its stair links', () => {
    const d = campus()
    const { place, run } = editor(d)
    place('s1', 0)
    place('s2', 1)
    run('feature.replace', { featureId: 's2', newType: 'elevator' })
    expect(stair(d, 's1').links).toBeUndefined()
  })
})
