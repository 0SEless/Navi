import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import { DocumentStore } from './document-store'
import { EditorProvider } from './editor-context'
import { ServiceRegistry } from './service-registry'
import { useBuildingFloors, useDocumentSelector, useFloor } from './index'
import { SelectionManager } from '../selection'
import { DocumentEventBus } from '../eventbus'
import { asEntityId } from './entity-id'
import { Viewport } from '../viewport'

function createDoc(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: { campusId: 'test', name: 'test', description: '', lastModified: '', editorVersion: '0.1.0' },
    buildings: [{
      id: 'bld-1', name: 'Before', code: 'B', category: 'academic', description: '',
      footprint: { points: [] }, baseElevation: 0, height: 10, color: '#000', aliases: [],
      floors: [
        {
          id: 'floor-gf', level: 0, label: 'Ground Floor', elevation: 0, height: 3.5,
          rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [],
          parametricComponents: [], metadata: {},
        },
        {
          id: 'floor-1f', level: 1, label: 'First Floor', elevation: 3.5, height: 3.5,
          rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [],
          parametricComponents: [], metadata: {},
        },
      ], verticalConnectors: [], metadata: {},
    }],
    roads: [], panoramas: [], qrCheckpoints: [],
  }
}

const selectBuildingName = (doc: CampusDocument) => doc.buildings[0]?.name ?? ''

describe('useDocumentSelector', () => {
  it('recomputes after an in-place DocumentStore commit', () => {
    const document = createDoc()
    const documentStore = new DocumentStore(document)
    const services = new ServiceRegistry()
    services.register('documentStore', documentStore)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EditorProvider context={{ document, services }}>{children}</EditorProvider>
    )

    const { result } = renderHook(() => useDocumentSelector(selectBuildingName), { wrapper })
    expect(result.current).toBe('Before')

    act(() => {
      document.buildings[0].name = 'After'
      documentStore.commit()
    })

    expect(result.current).toBe('After')
  })

  it('recomputes after adopting a server snapshot without emitting an edit revision', () => {
    const document = createDoc()
    const eventBus = new DocumentEventBus()
    const documentStore = new DocumentStore(document, eventBus)
    const services = new ServiceRegistry()
    services.register('documentStore', documentStore)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EditorProvider context={{ document, services }}>{children}</EditorProvider>
    )
    let committedRevisions = 0
    eventBus.on('revision.committed', () => { committedRevisions++ })

    const { result } = renderHook(() => useDocumentSelector(selectBuildingName), { wrapper })
    act(() => {
      documentStore.adoptSnapshot({
        ...createDoc(),
        buildings: [{ ...createDoc().buildings[0], name: 'Recovered baseline' }],
      })
    })

    expect(result.current).toBe('Recovered baseline')
    expect(documentStore.version).toBe(1)
    expect(committedRevisions).toBe(0)
  })

  it('returns floors for the active building through the public context API', () => {
    const document = createDoc()
    const eventBus = new DocumentEventBus()
    const selection = new SelectionManager(document, eventBus)
    const services = new ServiceRegistry()
    services.register('documentStore', new DocumentStore(document))
    services.register('selection', selection)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EditorProvider context={{ document, services }}>{children}</EditorProvider>
    )

    act(() => selection.select('bld-1'))
    const { result } = renderHook(() => useBuildingFloors(), { wrapper })

    expect(result.current.map((floor) => floor.id)).toEqual(['floor-gf', 'floor-1f'])
  })

  it('returns the selected floor only from its active building', () => {
    const document = createDoc()
    const eventBus = new DocumentEventBus()
    const selection = new SelectionManager(document, eventBus)
    const viewport = new Viewport(eventBus)
    const services = new ServiceRegistry()
    services.register('documentStore', new DocumentStore(document))
    services.register('selection', selection)
    services.register('viewport', viewport)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EditorProvider context={{ document, services }}>{children}</EditorProvider>
    )

    act(() => selection.select({ type: 'floor', id: asEntityId('floor-1f'), buildingId: asEntityId('bld-1') }))
    const { result } = renderHook(() => useFloor(), { wrapper })

    expect(result.current?.id).toBe('floor-1f')
  })
})
