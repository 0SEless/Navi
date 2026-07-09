import { describe, it, expect, beforeEach } from 'vitest'
import { SelectionManager } from './selection'
import { DocumentEventBus } from './eventbus'
import type { CampusDocument } from '@navi/core'

function createDoc(): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: { name: 'test', description: '', lastModified: '', editorVersion: '0.1.0' },
    buildings: [
      { id: 'bld-1', name: 'A', code: 'A', category: 'academic', description: '', footprint: { points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] }, baseElevation: 0, height: 10, floors: [], color: '#000', aliases: [], metadata: {} },
    ],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

describe('SelectionManager', () => {
  let selection: SelectionManager
  let eventBus: DocumentEventBus
  let document: CampusDocument

  beforeEach(() => {
    document = createDoc()
    eventBus = new DocumentEventBus()
    selection = new SelectionManager(document, eventBus)
  })

  it('starts empty', () => {
    expect(selection.count).toBe(0)
    expect(selection.lastSelectedId).toBeNull()
  })

  it('selects an entity', () => {
    selection.select('bld-1')
    expect(selection.isSelected('bld-1')).toBe(true)
    expect(selection.count).toBe(1)
    expect(selection.lastSelectedId).toBe('bld-1')
  })

  it('select replaces previous selection', () => {
    selection.select('bld-1')
    selection.select('bld-2')
    expect(selection.isSelected('bld-1')).toBe(false)
    expect(selection.isSelected('bld-2')).toBe(true)
    expect(selection.count).toBe(1)
  })

  it('toggle adds to selection', () => {
    selection.toggle('bld-1')
    selection.toggle('bld-2')
    expect(selection.count).toBe(2)
  })

  it('toggle removes if already selected', () => {
    selection.toggle('bld-1')
    selection.toggle('bld-2')
    selection.toggle('bld-1')
    expect(selection.count).toBe(1)
    expect(selection.isSelected('bld-2')).toBe(true)
  })

  it('clear empties selection', () => {
    selection.select('bld-1')
    selection.clear()
    expect(selection.count).toBe(0)
    expect(selection.lastSelectedId).toBeNull()
  })

  it('resetOnToolChange clears everything', () => {
    selection.select('bld-1')
    selection.setHover('bld-2')
    selection.resetOnToolChange()
    expect(selection.count).toBe(0)
    expect(selection.hoveredEntityId).toBeNull()
  })

  it('emits selection.changed event', () => {
    let emitted: any = null
    eventBus.on('selection.changed', (s) => { emitted = s })
    selection.select('bld-1')
    expect(emitted).not.toBeNull()
    expect(emitted.entityIds).toEqual(['bld-1'])
  })

  it('boundingBox returns null when empty', () => {
    expect(selection.boundingBox).toBeNull()
  })
})
