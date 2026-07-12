import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ValidationRegistry, ValidationEngine, polygonClosureValidator, duplicateIdsValidator, selfIntersectionValidator } from '../../validation'
import { entranceConnectivityValidator, floorMetadataValidator, roadConnectivityValidator } from '../../validation/validators'
import { ValidationStore } from '../validation-store'
import { ValidationService } from '../validation-service'
import { DocumentEventBus } from '../../eventbus'
import type { EditorServiceContext } from '../../context/service-registry'
import type { CampusDocument } from '@navi/core'

function createValidDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: { name: 'Campus', description: '', lastModified: '', editorVersion: '1' },
    buildings: [{
      id: 'bld-1', name: 'Main', code: '', category: 'academic', description: '',
      footprint: { points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }, { lat: 1, lng: 1 }, { lat: 0, lng: 1 }, { lat: 0, lng: 0 }] },
      baseElevation: 0, height: 10, color: '#000', aliases: [], metadata: {},
      floors: [{
        id: 'flr-1', level: 0, label: 'Ground', elevation: 0,
        rooms: [{
          id: 'rm-1', name: 'Room 101', number: '101', category: 'classroom',
          polygon: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }] },
          capacity: undefined, metadata: {},
        }],
        hallways: [], staircases: [], elevators: [], entrances: [], metadata: {},
      }],
    }],
    roads: [{ id: 'road-1', polyline: { points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] } }],
    panoramas: [], qrCheckpoints: [],
  }
}

describe('Validation Integration', () => {
  let eventBus: DocumentEventBus
  let registry: ValidationRegistry
  let engine: ValidationEngine
  let store: ValidationStore
  let service: ValidationService
  let documentStore: { version: number; document: CampusDocument }

  beforeEach(async () => {
    vi.useFakeTimers()
    eventBus = new DocumentEventBus()
    await eventBus.init({ get: () => {}, document: {} } as unknown as EditorServiceContext)
    registry = new ValidationRegistry()
    registry.register(polygonClosureValidator)
    registry.register(selfIntersectionValidator)
    registry.register(duplicateIdsValidator)
    registry.register(entranceConnectivityValidator)
    registry.register(floorMetadataValidator)
    registry.register(roadConnectivityValidator)
    engine = new ValidationEngine(registry)
    store = new ValidationStore()
    documentStore = { version: 1, document: createValidDocument() }
    service = new ValidationService(engine, store, { debounceMs: 100 })
    await service.init({
      get: (id: string) => {
        const map: Record<string, any> = { eventBus, documentStore }
        return map[id]
      },
      document: documentStore.document,
    } as unknown as EditorServiceContext)
  })

  afterEach(() => {
    service.destroy()
    vi.useRealTimers()
  })

  it('valid document produces no issues', async () => {
    await service.validateNow()
    const snap = service.getSnapshot()
    expect(snap.issues).toHaveLength(0)
    expect(snap.isValid).toBe(true)
  })

  it('invalid polygon produces errors', async () => {
    (documentStore.document as CampusDocument).buildings[0].footprint.points =
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }]
    documentStore.version++
    await service.validateNow()
    const snap = service.getSnapshot()
    expect(snap.issues.length).toBeGreaterThan(0)
    expect(snap.summary.errors).toBeGreaterThan(0)
    expect(snap.isValid).toBe(false)
  })

  it('duplicate IDs across entity types are detected', async () => {
    const doc = documentStore.document as CampusDocument
    doc.buildings[0].floors[0].rooms[0].id = 'bld-1'
    documentStore.version++
    await service.validateNow()
    const snap = service.getSnapshot()
    const dupIssues = snap.issues.filter(i => i.category === 'duplicate')
    expect(dupIssues.length).toBeGreaterThan(0)
  })

  it('creates issues categorized by severity', async () => {
    const doc = documentStore.document as CampusDocument
    doc.buildings[0].footprint.points = [{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }]
    documentStore.version++
    await service.validateNow()
    const snap = service.getSnapshot()
    expect(snap.summary.errors).toBeGreaterThan(0)
  })

  it('reacts to document.changed events', async () => {
    eventBus.emit('document.changed')
    vi.advanceTimersByTime(100)
    await vi.waitFor(() => {
      expect(store.getSnapshot().lastValidatedRevision).toBe(1)
    })
  })
})
