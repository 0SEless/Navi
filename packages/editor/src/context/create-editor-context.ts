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
import { floorCreateHandler, floorRenameHandler, floorDeleteHandler, floorDuplicateHandler, floorReorderHandler } from '../commands/floor-handlers'
import { floorManageHandler, buildingEditInteriorHandler, buildingAdjustPositionHandler } from '../commands/ui-action-handlers'
import { SelectionManager } from '../selection'
import { CurrentToolStore } from '../tools/CurrentToolStore'
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
import { missingFootprintRule } from '../validation/rules/modules/missing-footprint'
import { orphanReferenceRule } from '../validation/rules/modules/orphan-reference'
import { connectorConnectivityRule } from '../validation/rules/modules/connector-connectivity'
import { roomDoorConnectivityRule } from '../validation/rules/modules/room-door-connectivity'
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

function computeFallbackBuildingOrigin(buildingId: string, graph: any): { lat: number; lng: number } {
  const comps: any[] = graph.components ?? []
  const allPoints: Array<{ lat: number; lng: number }> = []
  for (const c of comps) {
    if (c.buildingId !== buildingId) continue
    if (c.type === 'room' || c.type === 'hallway') {
      const poly = c.polygon ?? c.polyline
      if (poly?.points?.length) {
        allPoints.push(...poly.points)
      }
    }
  }
  if (allPoints.length > 0) return computeCentroid(allPoints)
  return { lat: 0, lng: 0 }
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

function nodePosition(n: any): { lat: number; lng: number } {
  if (n.position) return n.position
  return { lat: n.lat ?? 0, lng: n.lng ?? 0 }
}

export function createDocument(graph: any, transformer?: CoordinateTransformer): CampusDocument {
  const compsByKey = new Map<string, any[]>()
  for (const c of (graph.components ?? [])) {
    const key = `${c.buildingId}:${c.floor}`
    if (!compsByKey.has(key)) compsByKey.set(key, [])
    compsByKey.get(key)!.push(c)
  }

  return {
    schemaVersion: 1,
    version: 1,
    metadata: {
      name: graph.name ?? 'Campus',
      description: graph.description ?? '',
      lastModified: graph.updatedAt ?? new Date().toISOString(),
      editorVersion: '1.0.0',
    },
    buildings: (graph.buildings ?? []).map((b: any) => {
      const rawFloors: any[] = b.floors ?? []
      // Footprint is stored inconsistently across the graph model:
      // either a direct LatLng[] array OR an object { points: LatLng[] }.
      // Normalize both into { points: LatLng[] } for the document model.
      const rawFootprint: any = b.footprint
      const rawFootprintPoints: Array<{ lat: number; lng: number }> = Array.isArray(rawFootprint)
        ? rawFootprint
        : (rawFootprint?.points ?? [])
    // Build a floor metadata lookup from floorData (stored by GraphAdapter)
    const floorByLevel = new Map<number, any>()
    if (Array.isArray(b.floorData)) {
      for (const fd of b.floorData) {
        floorByLevel.set(fd.level as number, fd)
      }
    }

    const floors = rawFloors.map((f: any) => {
      const level = getFloorLevel(f)
      const key = `${b.id}:${level}`
      const comps = compsByKey.get(key) ?? []
      const fd = floorByLevel.get(level) ?? {}

      // Start with metadata from legacy floor-level entities (if any)
      const legacyRooms: Room[] = (f.rooms ?? []).map((r: any) => ({
        id: r.id, name: r.name ?? r.id, number: r.number ?? '',
        category: r.category ?? 'classroom', polygon: { points: [] },
        capacity: r.capacity, roomDoors: [], metadata: r.metadata ?? {},
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
                if (c.metadata?.number) existing.number = c.metadata.number as string
                if (c.metadata?.capacity != null) existing.capacity = c.metadata.capacity as number
                if (c.metadata?.roomMetadata) existing.metadata = { ...existing.metadata, ...c.metadata.roomMetadata as Record<string, unknown> }
              } else if (points.length >= 3) {
                legacyRooms.push({
                  id: c.id, name: c.name ?? c.id,
                  number: (c.metadata?.number as string) ?? c.number ?? '',
                  category: 'classroom', polygon: { points },
                  capacity: (c.metadata?.capacity as number) ?? c.capacity,
                  roomDoors: [],
                  metadata: (c.metadata?.roomMetadata as Record<string, unknown>) ?? c.metadata ?? {},
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
                if (c.metadata?.width != null) existing.width = c.metadata.width as number
                if (c.metadata?.color) existing.color = c.metadata.color as string
              } else if (points.length >= 2) {
                legacyHallways.push({
                  id: c.id, name: c.name ?? c.id, polyline: { points },
                  width: (c.metadata?.width as number) ?? c.width ?? 2,
                  color: (c.metadata?.color as string) ?? c.color,
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
                if (c.metadata?.type) existing.type = c.metadata.type as any
              } else {
                legacyStaircases.push({
                  id: c.id, name: c.name ?? c.id, position: local,
                  fromLevel: c.range?.from ?? level, toLevel: c.range?.to ?? level + 1,
                  type: (c.metadata?.type as any) ?? 'open',
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
          id: (fd.id as string) ?? f.id ?? `flr-${b.id}-${level}`,
          level,
          label: (fd.label as string) ?? f.label
            ?? (level === 0 ? 'Ground Floor' : level > 0 ? `Floor ${level}` : `Basement ${Math.abs(level)}`),
          elevation: (fd.elevation as number) ?? f.elevation ?? 0,
          planImageId: (fd.planImageId as string) ?? f.planImageId,
          textureId: (fd.textureId as string) ?? f.textureId,
          svgOverlayId: (fd.svgOverlayId as string) ?? f.svgOverlayId,
          rooms: legacyRooms,
          hallways: legacyHallways,
          staircases: legacyStaircases,
          elevators: legacyElevators,
          entrances: legacyEntrances,
          connectorStops: [],
          metadata: (fd.metadata as Record<string, unknown>) ?? f.metadata ?? {},
        }
      })

      return {
        id: b.id,
        name: b.name ?? b.id,
        code: b.code ?? '',
        category: b.category ?? 'academic',
        description: b.description ?? '',
        department: b.department ?? '',
        floors,
        footprint: { points: rawFootprintPoints.map((p: any) => ({ lat: p.lat, lng: p.lng })) },
        baseElevation: b.baseElevation ?? 0,
        height: b.height ?? 10,
        verticalConnectors: [],
        color: b.color ?? '#1C6BEB',
        aliases: (b.aliases as string[]) ?? [],
        metadata: (b.metadata as Record<string, unknown>) ?? {},
      }
    }),
    // Reverse-map graph entities that live outside the building/floor hierarchy.
    // GraphAdapter.sync() converts Road→Trace, Panorama→Node(hasPanorama),
    // QRCheckpoint→Node(hasQr). We reconstruct the document entities here so the
    // round-trip is lossless (best-effort: surface, heading, hotspots use defaults
    // since the graph doesn't store them).
    roads: (graph.traces ?? []).map((t: any) => ({
      id: t.id,
      name: t.name ?? '',
      polyline: { points: t.points ?? [] },
      width: t.width ?? 3,
      surface: (t.metadata?.surface ?? 'paved') as any,
      type: (t.type === 'connector' ? 'service' : 'arterial') as any,
      metadata: t.metadata ?? {},
    })),
    panoramas: (graph.nodes ?? [])
      .filter((n: any) => n.hasPanorama && n.metadata?.panoramaId)
      .map((n: any) => ({
        id: n.metadata.panoramaId as string,
        label: (n.label ?? '').replace('Panorama: ', ''),
        position: nodePosition(n),
        heading: 0,
        imageAssetId: '',
        buildingId: n.buildingId || undefined,
        floor: n.floor ?? undefined,
        hotspots: [],
      })),
    qrCheckpoints: (graph.nodes ?? [])
      .filter((n: any) => n.type === 'qr_marker' || (n.hasQr && n.metadata?.qrCode))
      .map((n: any) => ({
        id: (n.metadata?.qrId as string) ?? n.id,
        label: (n.label ?? '').replace(/^QR:\s*/, ''),
        position: nodePosition(n),
        floor: n.floor,
        buildingId: n.buildingId,
        code: (n.metadata?.qrCode ?? n.metadata?.code ?? '') as string,
        metadata: (n.metadata?.qrMetadata as Record<string, unknown>) ?? {},
      })),
  }
}

export function createEditorContext(
  graph: any,
  persistenceAdapter: PersistenceAdapter,
  navCompiler: NavigationCompiler,
): EditorContext {
  const transformer = new CoordinateTransformer()
  for (const b of (graph.buildings ?? [])) {
    // Building.footprint may be either LatLng[] (post-sync format) or
    // { points: LatLng[] } (legacy WorldPolygon format). Handle both.
    const rawFootprint: any = b.footprint
    const footprintPoints: Array<{ lat: number; lng: number }> = Array.isArray(rawFootprint)
      ? rawFootprint
      : (rawFootprint?.points ?? [])
    const center = footprintPoints.length > 0
      ? computeCentroid(footprintPoints)
      : computeFallbackBuildingOrigin(b.id, graph)
    transformer.registerBuilding({
      buildingId: b.id,
      origin: { lat: center.lat, lng: center.lng },
      rotation: 0,
    })
  }

  const document = createDocument(graph, transformer)

  const registry = new ServiceRegistry()

  const eventBus = new DocumentEventBus()
  registry.register('eventBus', eventBus)

  const documentStore = new DocumentStore(document, eventBus)

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
  registryCmd.register(floorCreateHandler)
  registryCmd.register(floorRenameHandler)
  registryCmd.register(floorDeleteHandler)
  registryCmd.register(floorDuplicateHandler)
  registryCmd.register(floorReorderHandler)
  registryCmd.register(floorManageHandler)
  registryCmd.register(buildingEditInteriorHandler)
  registryCmd.register(buildingAdjustPositionHandler)

  const dispatcher = new CommandDispatcher(registryCmd, document, eventBus)

  const history = new HistoryStack(dispatcher, document, registryCmd, 200, documentStore)
  dispatcher.addPreHook(history)
  dispatcher.addPostHook(history)

  const selectionManager = new SelectionManager(document, eventBus)

  registry.register('documentStore', documentStore)
  registry.register('dispatcher', dispatcher)
  registry.register('history', history)
  registry.register('selection', selectionManager)

  const toolRegistry = new CurrentToolStore()
  const viewport = new Viewport(eventBus)
  registry.register('toolRegistry', toolRegistry)
  registry.register('viewport', viewport)

  const validationEngine = new ValidationEngine()
  validationEngine.registerRule(disconnectedGraphRule)
  validationEngine.registerRule(missingFootprintRule)
  validationEngine.registerRule(orphanReferenceRule)
  validationEngine.registerRule(missingNameRule)
  validationEngine.registerRule(zeroAreaPolygonRule)
  validationEngine.registerRule(polygonClosureRule)
  validationEngine.registerRule(selfIntersectionRule)
  validationEngine.registerRule(duplicateIdsRule)
  validationEngine.registerRule(entranceConnectivityRule)
  validationEngine.registerRule(floorMetadataRule)
  validationEngine.registerRule(roadConnectivityRule)
  validationEngine.registerRule(referenceRule)
  validationEngine.registerRule(connectorConnectivityRule)
  validationEngine.registerRule(roomDoorConnectivityRule)
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
