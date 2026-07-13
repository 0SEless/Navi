import { DocumentStore } from './document-store'
import { ServiceRegistry } from './service-registry'
import { DocumentEventBus } from '../eventbus'
import { CommandRegistry } from '../commands/registry'
import { CommandDispatcher } from '../commands/dispatcher'
import { HistoryStack } from '../history'
import { entityUpdateHandler } from '../commands/entity-update-handler'
import { roomCreateHandler, roomDeleteHandler } from '../commands/room-handlers'
import { hallwayCreateHandler, hallwayDeleteHandler } from '../commands/hallway-handlers'
import { staircaseCreateHandler, staircaseDeleteHandler } from '../commands/staircase-handlers'
import { elevatorCreateHandler, elevatorDeleteHandler } from '../commands/elevator-handlers'
import { entranceCreateHandler, entranceDeleteHandler } from '../commands/entrance-handlers'
import { buildingCreateHandler, buildingDeleteHandler } from '../commands/building-handlers'
import { roadCreateHandler, roadDeleteHandler } from '../commands/road-handlers'
import { SelectionManager } from '../selection'
import { ToolRegistry } from '../tools/registry'
import { Viewport } from '../viewport'
import { ValidationEngine } from '../validation/validation-engine'
import { AutoFixRegistry, assignUntitledFix, assignFloorLevelFix, clearRoadReferenceFix, clearEntranceReferenceFix, closePolygonFix } from '../validation/fix'
import { disconnectedGraphRule, missingNameRule, zeroAreaPolygonRule } from '../validation/rules/modules/skeleton'
import { polygonClosureRule } from '../validation/rules/modules/polygon-closure'
import { selfIntersectionRule } from '../validation/rules/modules/self-intersection'
import { duplicateIdsRule } from '../validation/rules/modules/duplicate-ids'
import { entranceConnectivityRule } from '../validation/rules/modules/entrance-connectivity'
import { floorMetadataRule } from '../validation/rules/modules/floor-metadata'
import { roadConnectivityRule } from '../validation/rules/modules/road-connectivity'
import { referenceRule } from '../validation/rules/modules/reference'
import { GraphAnalysisPass, GeometryAnalysisPass, MetadataIndexPass } from '../validation/rules/analysis'
import { NavigationCompiler } from '../services/navigation-compiler'
import { PersistenceService } from '../services/persistence-service'
import type { PersistenceAdapter } from '../services/persistence-service'
import { WorkflowStore } from '../services/workflow-store'
import { WorkflowService } from '../services/workflow-service'
import { AutosaveService } from '../services/autosave-service'
import { PublishStore } from '../services/publish-store'
import { PublishService } from '../services/publish-service'
import { EditingContextService } from '../editing-context'
import { CoordinateTransformer } from '@navi/core'
import type { CampusDocument, Room, Hallway, Staircase, Elevator, Entrance, LocalCoord } from '@navi/core'
import type { EditorContext } from './editor-context'

function computeCentroid(points: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  let lat = 0, lng = 0
  for (const p of points) { lat += p.lat; lng += p.lng }
  return { lat: lat / points.length, lng: lng / points.length }
}

function worldPointsToLocal(points: Array<{ lat: number; lng: number }>, buildingId: string, transformer?: CoordinateTransformer): LocalCoord[] {
  if (!transformer) return []
  const result: LocalCoord[] = []
  for (const p of points) {
    const local = transformer.worldToBuildingLocal({ lat: p.lat, lng: p.lng }, buildingId)
    if (local) result.push(local)
  }
  return result
}

function getFloorLevel(f: any): number {
  return typeof f === 'number' ? f : (f.level ?? 0)
}

function createDocument(graph: any, transformer?: CoordinateTransformer): CampusDocument {
  const compsByKey = new Map<string, any[]>()
  for (const c of (graph.components ?? [])) {
    const key = `${c.buildingId}:${c.floor}`
    if (!compsByKey.has(key)) compsByKey.set(key, [])
    compsByKey.get(key)!.push(c)
  }

  return {
    schemaVersion: 1,
    metadata: {
      name: graph.name ?? 'Campus',
      description: '',
      lastModified: new Date().toISOString(),
      editorVersion: '1.0.0',
    },
    buildings: (graph.buildings ?? []).map((b: any) => {
      const rawFloors: any[] = b.floors ?? []
      const floors = rawFloors.map((f: any) => {
        const level = getFloorLevel(f)
        const key = `${b.id}:${level}`
        const comps = compsByKey.get(key) ?? []

        // Start with metadata from legacy floor-level entities (if any)
        const legacyRooms: Room[] = (f.rooms ?? []).map((r: any) => ({
          id: r.id, name: r.name ?? r.id, number: r.number ?? '',
          category: r.category ?? 'classroom', polygon: { points: [] },
          capacity: r.capacity, metadata: r.metadata ?? {},
        }))
        const legacyHallways: Hallway[] = (f.hallways ?? []).map((h: any) => ({
          id: h.id, name: h.name ?? h.id, polyline: { points: [] },
          width: h.width ?? 2, color: h.color,
        }))
        const legacyStaircases: Staircase[] = (f.staircases ?? []).map((s: any) => ({
          id: s.id, name: s.name ?? s.id, position: { x: 0, y: 0 },
          fromLevel: s.fromLevel ?? level, toLevel: s.toLevel ?? level + 1, type: s.type ?? 'open',
        }))
        const legacyElevators: Elevator[] = (f.elevators ?? []).map((e: any) => ({
          id: e.id, name: e.name ?? e.id, position: { x: 0, y: 0 },
          fromLevel: e.fromLevel ?? level, toLevel: e.toLevel ?? level + 1,
        }))
        const legacyEntrances: Entrance[] = (f.entrances ?? []).map((e: any) => ({
          id: e.id, label: e.name ?? e.id,
          position: { lat: e.position?.lat ?? 0, lng: e.position?.lng ?? 0 },
          level, type: e.type ?? 'main', hasQR: e.hasQR ?? false, hasPanorama: e.hasPanorama ?? false,
        }))

        // Overlay geometry from graph.components
        for (const c of comps) {
          switch (c.type) {
            case 'room': {
              const points = c.polygon
                ? worldPointsToLocal(c.polygon, b.id, transformer)
                : []
              const existing = legacyRooms.find(r => r.id === c.id)
              if (existing) {
                if (points.length >= 3) existing.polygon = { points }
              } else if (points.length >= 3) {
                legacyRooms.push({
                  id: c.id, name: c.name ?? c.id, number: c.number ?? '',
                  category: 'classroom', polygon: { points },
                  capacity: c.capacity, metadata: c.metadata ?? {},
                })
              }
              break
            }
            case 'hallway': {
              const points = c.polygon
                ? worldPointsToLocal(c.polygon, b.id, transformer)
                : []
              const existing = legacyHallways.find(h => h.id === c.id)
              if (existing) {
                if (points.length >= 2) existing.polyline = { points }
              } else if (points.length >= 2) {
                legacyHallways.push({
                  id: c.id, name: c.name ?? c.id, polyline: { points },
                  width: c.width ?? 2, color: c.color,
                })
              }
              break
            }
            case 'stair': {
              if (!transformer) continue
              const local = transformer.worldToBuildingLocal({ lat: c.position.lat, lng: c.position.lng }, b.id)
              if (!local) continue
              const existing = legacyStaircases.find(s => s.id === c.id)
              if (existing) {
                existing.position = local
              } else {
                legacyStaircases.push({
                  id: c.id, name: c.name ?? c.id, position: local,
                  fromLevel: c.range?.from ?? level, toLevel: c.range?.to ?? level + 1,
                  type: 'open',
                })
              }
              break
            }
            case 'elevator': {
              if (!transformer) continue
              const local = transformer.worldToBuildingLocal({ lat: c.position.lat, lng: c.position.lng }, b.id)
              if (!local) continue
              const existing = legacyElevators.find(e => e.id === c.id)
              if (existing) {
                existing.position = local
              } else {
                legacyElevators.push({
                  id: c.id, name: c.name ?? c.id, position: local,
                  fromLevel: c.range?.from ?? level, toLevel: c.range?.to ?? level + 1,
                })
              }
              break
            }
            case 'entrance': {
              const existing = legacyEntrances.find(e => e.id === c.id)
              if (!existing) {
                legacyEntrances.push({
                  id: c.id, label: c.name ?? c.id,
                  position: { lat: c.position.lat, lng: c.position.lng },
                  level, type: 'main', hasQR: c.metadata?.hasQR ?? false,
                  hasPanorama: c.metadata?.hasPanorama ?? false,
                })
              }
              break
            }
          }
        }

        return {
          id: f.id ?? `flr-${b.id}-${level}`,
          level,
          label: f.label
            ?? (level === 0 ? 'Ground Floor' : level > 0 ? `Floor ${level}` : `Basement ${Math.abs(level)}`),
          elevation: f.elevation ?? 0,
          planImageId: f.planImageId,
          rooms: legacyRooms,
          hallways: legacyHallways,
          staircases: legacyStaircases,
          elevators: legacyElevators,
          entrances: legacyEntrances,
          metadata: f.metadata ?? {},
        }
      })

      return {
        id: b.id,
        name: b.name ?? b.id,
        code: b.code ?? '',
        category: 'academic',
        description: '',
        floors,
        footprint: { points: (b.footprint?.points ?? []).map((p: any) => ({ lat: p.lat, lng: p.lng })) },
        baseElevation: 0,
        height: 10,
        color: b.color ?? '#1C6BEB',
        aliases: [],
        metadata: {},
      }
    }),
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

export function createEditorContext(
  graph: any,
  persistenceAdapter: PersistenceAdapter,
  navCompiler: NavigationCompiler,
): EditorContext {
  const transformer = new CoordinateTransformer()
  for (const b of (graph.buildings ?? [])) {
    const footprint = b.footprint?.points ?? []
    if (footprint.length > 0) {
      const center = computeCentroid(footprint)
      transformer.registerBuilding({
        buildingId: b.id,
        origin: { lat: center.lat, lng: center.lng },
        rotation: 0,
      })
    }
  }

  const document = createDocument(graph, transformer)
  const documentStore = new DocumentStore(document)

  const registry = new ServiceRegistry()

  const eventBus = new DocumentEventBus()
  registry.register('eventBus', eventBus)

  const registryCmd = new CommandRegistry()
  registryCmd.register(entityUpdateHandler)
  registryCmd.register(roomCreateHandler)
  registryCmd.register(roomDeleteHandler)
  registryCmd.register(hallwayCreateHandler)
  registryCmd.register(hallwayDeleteHandler)
  registryCmd.register(staircaseCreateHandler)
  registryCmd.register(staircaseDeleteHandler)
  registryCmd.register(elevatorCreateHandler)
  registryCmd.register(elevatorDeleteHandler)
  registryCmd.register(entranceCreateHandler)
  registryCmd.register(entranceDeleteHandler)
  registryCmd.register(buildingCreateHandler)
  registryCmd.register(buildingDeleteHandler)
  registryCmd.register(roadCreateHandler)
  registryCmd.register(roadDeleteHandler)

  const dispatcher = new CommandDispatcher(registryCmd, document, eventBus)

  const history = new HistoryStack(dispatcher, document, registryCmd)
  dispatcher.addPreHook(history)
  dispatcher.addPostHook(history)

  const selectionManager = new SelectionManager(document, eventBus)

  registry.register('documentStore', documentStore)
  registry.register('dispatcher', dispatcher)
  registry.register('history', history)
  registry.register('selection', selectionManager)

  const toolRegistry = new ToolRegistry()
  const viewport = new Viewport(eventBus)
  registry.register('toolRegistry', toolRegistry)
  registry.register('viewport', viewport)

  const validationEngine = new ValidationEngine()
  validationEngine.registerRule(disconnectedGraphRule)
  validationEngine.registerRule(missingNameRule)
  validationEngine.registerRule(zeroAreaPolygonRule)
  validationEngine.registerRule(polygonClosureRule)
  validationEngine.registerRule(selfIntersectionRule)
  validationEngine.registerRule(duplicateIdsRule)
  validationEngine.registerRule(entranceConnectivityRule)
  validationEngine.registerRule(floorMetadataRule)
  validationEngine.registerRule(roadConnectivityRule)
  validationEngine.registerRule(referenceRule)
  validationEngine.registerAnalysisPass(new GraphAnalysisPass())
  validationEngine.registerAnalysisPass(new GeometryAnalysisPass())
  validationEngine.registerAnalysisPass(new MetadataIndexPass())
  validationEngine.initialize()
  registry.register('validationEngine', validationEngine)

  eventBus.on('document.changed', () => {
    validationEngine.markDirty()
  })

  const autoFixRegistry = new AutoFixRegistry()
  autoFixRegistry.registerFix(assignUntitledFix)
  autoFixRegistry.registerFix(assignFloorLevelFix)
  autoFixRegistry.registerFix(clearRoadReferenceFix)
  autoFixRegistry.registerFix(clearEntranceReferenceFix)
  autoFixRegistry.registerFix(closePolygonFix)
  autoFixRegistry.initialize()
  registry.register('autoFixRegistry', autoFixRegistry)

  const persistence = new PersistenceService(persistenceAdapter)
  const workflowStore = new WorkflowStore()
  const workflow = new WorkflowService()
  const editingContext = new EditingContextService()

  registry.register('navigationCompiler', navCompiler)
  registry.register('persistence', persistence)
  registry.register('workflowStore', workflowStore)
  registry.register('workflow', workflow)
  const autosave = new AutosaveService()
  registry.register('autosave', autosave)
  const publishStore = new PublishStore()
  const publishService = new PublishService(publishStore)
  registry.register('publishStore', publishStore)
  registry.register('publish', publishService)
  registry.register('editingContext', editingContext)

  void registry.init(document)

  return { document, services: registry, transformer }
}
