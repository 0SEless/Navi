import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { CommandDispatcher } from '../commands/dispatcher'
import { CommandRegistry } from '../commands/registry'
import { DocumentEventBus } from '../eventbus'
import { DocumentStore } from '../context/document-store'
import { HistoryStack } from '../history'

function createDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: { campusId: 'map', name: 'Map', description: '', lastModified: '', editorVersion: '1' },
    buildings: [],
    roads: [
      { id: 'r1', name: 'A', polyline: { points: [] }, width: 4, surface: 'paved', type: 'path', metadata: {} },
      { id: 'r2', name: 'B', polyline: { points: [] }, width: 4, surface: 'paved', type: 'path', metadata: {} },
    ],
    panoramas: [],
    qrCheckpoints: [],
  } as unknown as CampusDocument
}

/** Road-level part keys whose JSON differs between two documents. */
function roadsTouched(before: CampusDocument, after: CampusDocument): string[] {
  const keys: string[] = []
  const ids = new Set([...before.roads, ...after.roads].map((road) => road.id))
  for (const id of ids) {
    const a = JSON.stringify(before.roads.find((road) => road.id === id))
    const b = JSON.stringify(after.roads.find((road) => road.id === id))
    if (a !== b) keys.push(`map/road:${id}`)
  }
  return keys
}

function setup(withResolver = true) {
  const document = createDocument()
  const eventBus = new DocumentEventBus()
  const store = new DocumentStore(document, eventBus)
  const registry = new CommandRegistry()
  const dispatcher = new CommandDispatcher(registry, document, eventBus)
  const history = new HistoryStack(dispatcher, document, registry, 20, store)
  if (withResolver) history.setTouchedPartsResolver(roadsTouched)
  return { document, history }
}

/** Record a local edit as a snapshot-based history entry (the risky kind). */
function editLocally(document: CampusDocument, history: HistoryStack, edit: (doc: CampusDocument) => void) {
  const before = structuredClone(document)
  edit(document)
  history.afterBatch([{ id: 'test.edit', label: 'Edit', payload: {} }], [{ success: true }], document, before)
}

const renameR2 = (doc: CampusDocument) => {
  const road = doc.roads.find((candidate) => candidate.id === 'r2')
  if (road) road.name = 'B-remote'
}

describe('HistoryStack.applyRemote', () => {
  it('snapshot entry is rebased so undo does not revert a merged remote road', () => {
    const { document, history } = setup()
    editLocally(document, history, (doc) => { doc.roads[0].name = 'A2' })
    renameR2(document) // the merged remote change, applied to the live document by the caller
    expect(history.applyRemote(new Set(['map/road:r2']), renameR2)).toBe('rebased')
    expect(history.undo()).toBe(true)
    expect(document.roads.map((road) => road.name)).toEqual(['A', 'B-remote'])
    expect(history.redo()).toBe(true)
    expect(document.roads.map((road) => road.name)).toEqual(['A2', 'B-remote'])
  })

  it('entry that touched the same road gives history cleared', () => {
    const { document, history } = setup()
    editLocally(document, history, (doc) => { doc.roads[1].name = 'B-local' })
    expect(history.applyRemote(new Set(['map/road:r2']), renameR2)).toBe('cleared')
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })

  it('a future (redo) entry touching the remote part also clears history', () => {
    const { document, history } = setup()
    editLocally(document, history, (doc) => { doc.roads[1].name = 'B-local' })
    history.undo()
    expect(history.applyRemote(new Set(['map/road:r2']), renameR2)).toBe('cleared')
    expect(history.canRedo).toBe(false)
  })

  it('without resolver, push behaves exactly as before and applyRemote clears conservatively', () => {
    const { document, history } = setup(false)
    editLocally(document, history, (doc) => { doc.roads[0].name = 'A2' })
    expect(history.undoCount).toBe(1)
    expect(history.undo()).toBe(true)
    expect(document.roads[0].name).toBe('A')
    expect(history.redo()).toBe(true)
    expect(document.roads[0].name).toBe('A2')
    expect(history.applyRemote(new Set(['map/road:r2']), renameR2)).toBe('cleared')
    expect(history.undoCount).toBe(0)
  })
})
