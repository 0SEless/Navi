import type { CampusDocument, LatLng as CoreLatLng } from '@navi/core'
import { CoordinateTransformer } from '@navi/core'
import { Graph } from '@/engine/graph'
import { compileComponent } from '@/engine/component-compiler'
import type { CompileContext } from '@/engine/component-compiler'
import type { Component, ComponentType, TracePath, Building as LegacyBuilding, NavNode, NavEdge, LatLng as LegacyLatLng } from '@/types/nav-types'

let _adapterId = 0
function genId(prefix: string): string {
  _adapterId++
  return `${prefix}${String(_adapterId).padStart(4, '0')}`
}

function coreLatLngToLegacy(p: CoreLatLng): LegacyLatLng {
  return { lat: p.lat, lng: p.lng }
}

function computeCentroid(points: LegacyLatLng[]): LegacyLatLng {
  let lat = 0, lng = 0
  for (const p of points) { lat += p.lat; lng += p.lng }
  return { lat: lat / points.length, lng: lng / points.length }
}

function computeBBox(points: LegacyLatLng[]): { width: number; height: number } {
  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  const R = 6371000
  const dLat = ((maxLat - minLat) * Math.PI) / 180
  const dLng = ((maxLng - minLng) * Math.PI) / 180
  const avgLat = ((minLat + maxLat) / 2) * Math.PI / 180
  const height = R * Math.abs(dLat)
  const width = R * Math.cos(avgLat) * Math.abs(dLng)
  return { width, height }
}

export class GraphAdapter {
  private graph: Graph
  private transformer?: CoordinateTransformer

  constructor(graph: Graph, transformer?: CoordinateTransformer) {
    this.graph = graph
    this.transformer = transformer
  }

  sync(document: CampusDocument): void {
    this.graph.setBuildings([])
    this.graph.setComponents([])
    this.graph.setNodes([])
    this.graph.setEdges([])
    this.graph.setTraces([])
    const allCompiledNodes: NavNode[] = []
    const allCompiledEdges: NavEdge[] = []

    // 1. Buildings
    for (const docBuilding of document.buildings) {
      const footprint: LegacyLatLng[] = docBuilding.footprint.points.map(coreLatLngToLegacy)
      const center = footprint.length > 0 ? computeCentroid(footprint) : { lat: 0, lng: 0 }
      const legacyBuilding: LegacyBuilding = {
        id: docBuilding.id,
        name: docBuilding.name,
        campusId: this.graph.campusId,
        floors: docBuilding.floors.map(f => f.level),
        footprint,
        baseElevation: docBuilding.baseElevation,
        height: docBuilding.height,
        center,
        code: docBuilding.code,
        description: docBuilding.description,
        color: docBuilding.color,
      }
      this.graph.addBuilding(legacyBuilding)

      // 2. Floor entities → Components
      for (const floor of docBuilding.floors) {
        const floorComponents: Component[] = []

        // Rooms
        for (const room of floor.rooms) {
          if (!this.transformer) continue
          const worldPoints: LegacyLatLng[] = []
          for (const p of room.polygon.points) {
            const world = this.transformer.buildingLocalToWorld(p, docBuilding.id)
            if (!world) continue
            worldPoints.push(coreLatLngToLegacy(world))
          }
          if (worldPoints.length < 3) continue
          const centerPos = computeCentroid(worldPoints)
          const dims = computeBBox(worldPoints)
          floorComponents.push({
            id: room.id,
            type: 'room',
            name: room.name,
            buildingId: docBuilding.id,
            campusId: this.graph.campusId,
            floor: floor.level,
            position: centerPos,
            polygon: worldPoints,
            dimensions: { width: Math.round(dims.width), height: Math.round(dims.height) },
          })
        }

        // Hallways
        for (const hw of floor.hallways) {
          if (!this.transformer) continue
          const worldPoints: LegacyLatLng[] = []
          for (const p of hw.polyline.points) {
            const world = this.transformer.buildingLocalToWorld(p, docBuilding.id)
            if (!world) continue
            worldPoints.push(coreLatLngToLegacy(world))
          }
          if (worldPoints.length < 2) continue
          const centerPos = computeCentroid(worldPoints)
          floorComponents.push({
            id: hw.id,
            type: 'hallway',
            name: hw.name,
            buildingId: docBuilding.id,
            campusId: this.graph.campusId,
            floor: floor.level,
            position: centerPos,
            polygon: worldPoints,
          })
        }

        // Staircases
        for (const st of floor.staircases) {
          if (!this.transformer) continue
          const world = this.transformer.buildingLocalToWorld(st.position, docBuilding.id)
          if (!world) continue
          floorComponents.push({
            id: st.id,
            type: 'stair',
            name: st.name,
            buildingId: docBuilding.id,
            campusId: this.graph.campusId,
            floor: floor.level,
            position: coreLatLngToLegacy(world),
            range: { from: st.fromLevel, to: st.toLevel },
          })
        }

        // Elevators
        for (const el of floor.elevators) {
          if (!this.transformer) continue
          const world = this.transformer.buildingLocalToWorld(el.position, docBuilding.id)
          if (!world) continue
          floorComponents.push({
            id: el.id,
            type: 'elevator',
            name: el.name,
            buildingId: docBuilding.id,
            campusId: this.graph.campusId,
            floor: floor.level,
            position: coreLatLngToLegacy(world),
            range: { from: el.fromLevel, to: el.toLevel },
          })
        }

        // Entrances
        for (const ent of floor.entrances) {
          floorComponents.push({
            id: ent.id,
            type: 'entrance',
            name: ent.label,
            buildingId: docBuilding.id,
            campusId: this.graph.campusId,
            floor: ent.level,
            position: coreLatLngToLegacy(ent.position),
            metadata: { hasQR: ent.hasQR, hasPanorama: ent.hasPanorama },
          })
        }

        // Add all components to graph
        for (const comp of floorComponents) {
          this.graph.addComponent(comp)
        }

        // Compile components in dependency order: hallways first, then rooms, stairs, elevators, entrances
        const compileOrder: ComponentType[] = ['hallway', 'room', 'stair', 'elevator', 'entrance']
        const buildingMap = new Map(this.graph.buildings.map(b => [b.id, b]))

        for (const ctype of compileOrder) {
          for (const comp of floorComponents.filter(c => c.type === ctype)) {
            const context: CompileContext = {
              buildings: buildingMap,
              existingNodes: allCompiledNodes,
              existingEdges: allCompiledEdges,
              componentId: comp.id,
              campusId: this.graph.campusId,
            }
            const result = compileComponent(comp, context)
            for (const node of result.nodes) {
              this.graph.addNode(node)
              allCompiledNodes.push(node)
            }
            for (const edge of result.edges) {
              this.graph.addEdge(edge)
              allCompiledEdges.push(edge)
            }
          }
        }
      }
    }

    // 9. Roads → Traces
    const roomNodes = allCompiledNodes.filter((n: NavNode) => n.type === 'room')
    for (const road of document.roads) {
      const trace: TracePath = {
        id: road.id,
        name: road.name,
        buildingId: '',
        campusId: this.graph.campusId,
        floor: 0,
        points: road.polyline.points.map(coreLatLngToLegacy),
        type: road.type === 'service' ? 'connector' : 'arterial',
        width: road.width,
      }
      this.graph.addTraceWithCompile(trace, roomNodes)
    }

    // 10. Panoramas → Nodes
    for (const pano of document.panoramas) {
      const node: NavNode = {
        id: genId('N'),
        label: `Panorama: ${pano.label}`,
        name: `Panorama: ${pano.label}`,
        type: 'intersection',
        buildingId: pano.buildingId ?? '',
        campusId: this.graph.campusId,
        floor: pano.floor ?? 0,
        position: coreLatLngToLegacy(pano.position),
        hasPanorama: true,
        metadata: { panoramaId: pano.id },
      }
      this.graph.addNode(node)
    }

    // 11. QR Checkpoints → Nodes
    for (const qr of document.qrCheckpoints) {
      const node: NavNode = {
        id: genId('N'),
        label: `QR: ${qr.label}`,
        name: `QR: ${qr.label}`,
        type: 'qr_marker',
        buildingId: qr.buildingId,
        campusId: this.graph.campusId,
        floor: qr.floor,
        position: coreLatLngToLegacy(qr.position),
        hasQr: true,
        metadata: { qrCode: qr.code },
      }
      this.graph.addNode(node)
    }
  }

  syncEntity(entityId: string, document: CampusDocument): void {
    this.sync(document)
  }
}
