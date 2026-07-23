import type maplibregl from 'maplibre-gl'
import type { CampusDocument } from '@navi/core'
import { CoordinateTransformer } from '@navi/core'
import type { DocumentEventBus } from '../eventbus'
import type { SelectionManager } from '../selection'
import type { Viewport } from '../viewport'
import { documentToGeoJSON, toPreviewFeature } from './geojson'
import {
  LAYER_IDS, SOURCE_IDS,
  buildingFillPaint, buildingOutlinePaint, buildingExtrusionPaint,
  roomFillPaint, roomOutlinePaint,
  hallwayLinePaint, roadOutlinePaint, roadFillPaint,
  entityCirclePaint, ENTITY_ICON_COLORS,
  selectionPaint, hoverPaint, previewPaint, validationPaint,
} from './layers'
import type { LayerId } from './layers'

export interface RendererOptions {
  map: maplibregl.Map
  document: CampusDocument
  eventBus: DocumentEventBus
  selection: SelectionManager
  viewport: Viewport
  transformer?: CoordinateTransformer
}

const ENTITY_SOURCE_MAP: Record<string, string> = {
  buildings: SOURCE_IDS.BUILDINGS,
  rooms: SOURCE_IDS.ROOMS,
  hallways: SOURCE_IDS.HALLWAYS,
  roads: SOURCE_IDS.ROADS,
  entrances: SOURCE_IDS.ENTRANCES,
  staircases: SOURCE_IDS.STAIRCASES,
  elevators: SOURCE_IDS.ELEVATORS,
  panoramas: SOURCE_IDS.PANORAMAS,
  qr: SOURCE_IDS.QR,
}

export class EntityRenderer {
  private map: maplibregl.Map
  private document: CampusDocument
  private eventBus: DocumentEventBus
  private selection: SelectionManager
  private viewport: Viewport
  private transformer?: CoordinateTransformer
  private initialized = false

  constructor(opts: RendererOptions) {
    this.map = opts.map
    this.document = opts.document
    this.eventBus = opts.eventBus
    this.selection = opts.selection
    this.viewport = opts.viewport
    this.transformer = opts.transformer
  }

  init(): void {
    if (this.initialized) return
    this.initialized = true

    this.map.on('load', () => {
      this.addSources()
      this.addLayers()
      this.syncAll()
      this.listenToEvents()
    })

    if (this.map.loaded()) {
      this.addSources()
      this.addLayers()
      this.syncAll()
      this.listenToEvents()
    }
  }

  destroy(): void {
    if (!this.initialized) return
    for (const id of Object.values(LAYER_IDS)) {
      try { this.map.removeLayer(id) } catch { /* ok */ }
    }
    for (const id of Object.values(SOURCE_IDS)) {
      try { this.map.removeSource(id) } catch { /* ok */ }
    }
    this.initialized = false
  }

  setTransformer(t: CoordinateTransformer): void {
    this.transformer = t
    this.syncAll()
  }

  syncAll(): void {
    const sources = documentToGeoJSON(this.document, { transformer: this.transformer })
    for (const [key, sourceId] of Object.entries(SOURCE_IDS)) {
      const keyLower = key.toLowerCase()
      const match = Object.entries(ENTITY_SOURCE_MAP).find(([_, v]) => v === sourceId)
      const sourceKey = match ? match[0] : null
      if (sourceKey && sources[sourceKey]) {
        this.updateSource(sourceId, sources[sourceKey])
      } else if (keyLower === 'buildings' && sources.buildings) {
        this.updateSource(sourceId, sources.buildings)
      } else if (keyLower === 'preview' || keyLower === 'selection') {
        continue
      }
    }
  }

  // ── Preview layer ──

  setPreview(geometry: GeoJSON.Geometry | null): void {
    if (!this.sourceExists(SOURCE_IDS.PREVIEW)) return
    const fc: GeoJSON.FeatureCollection = geometry
      ? { type: 'FeatureCollection', features: [toPreviewFeature(geometry)] }
      : { type: 'FeatureCollection', features: [] }
    this.updateSource(SOURCE_IDS.PREVIEW, fc)
  }

  clearPreview(): void {
    this.setPreview(null)
  }

  // ── Selection overlay ──

  updateSelection(coords: [number, number][][]): void {
    if (!this.sourceExists(SOURCE_IDS.SELECTION)) return
    const features: GeoJSON.Feature[] = coords.map(ring => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: ring },
    }))
    this.updateSource(SOURCE_IDS.SELECTION, { type: 'FeatureCollection', features })
  }

  clearSelection(): void {
    this.updateSelection([])
  }

  // ── Private ──

  private addSources(): void {
    this.addGeoJSONSource(SOURCE_IDS.BUILDINGS)
    this.addGeoJSONSource(SOURCE_IDS.ROOMS)
    this.addGeoJSONSource(SOURCE_IDS.HALLWAYS)
    this.addGeoJSONSource(SOURCE_IDS.ROADS)
    this.addGeoJSONSource(SOURCE_IDS.ENTRANCES)
    this.addGeoJSONSource(SOURCE_IDS.STAIRCASES)
    this.addGeoJSONSource(SOURCE_IDS.ELEVATORS)
    this.addGeoJSONSource(SOURCE_IDS.PANORAMAS)
    this.addGeoJSONSource(SOURCE_IDS.QR)
    this.addGeoJSONSource(SOURCE_IDS.PREVIEW)
    this.addGeoJSONSource(SOURCE_IDS.SELECTION)
  }

  private addGeoJSONSource(id: string): void {
    if (this.map.getSource(id)) return
    this.map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  }

  private addLayers(): void {
    const layerDefs: Array<{ id: LayerId; source: string; type: string; paint: any; filter?: any[] }> = [
      { id: LAYER_IDS.BUILDING_EXTRUSION, source: SOURCE_IDS.BUILDINGS, type: 'fill-extrusion', paint: buildingExtrusionPaint() },
      { id: LAYER_IDS.BUILDING_FILL, source: SOURCE_IDS.BUILDINGS, type: 'fill', paint: buildingFillPaint() },
      { id: LAYER_IDS.BUILDING_OUTLINE, source: SOURCE_IDS.BUILDINGS, type: 'line', paint: buildingOutlinePaint() },
      { id: LAYER_IDS.ROOM_FILL, source: SOURCE_IDS.ROOMS, type: 'fill', paint: roomFillPaint() },
      { id: LAYER_IDS.ROOM_OUTLINE, source: SOURCE_IDS.ROOMS, type: 'line', paint: roomOutlinePaint() },
      { id: LAYER_IDS.HALLWAY_LINE, source: SOURCE_IDS.HALLWAYS, type: 'line', paint: hallwayLinePaint() },
      { id: LAYER_IDS.ROAD_OUTLINE, source: SOURCE_IDS.ROADS, type: 'line', paint: roadOutlinePaint() },
      { id: LAYER_IDS.ROAD_FILL, source: SOURCE_IDS.ROADS, type: 'line', paint: roadFillPaint() },
      { id: LAYER_IDS.ENTRANCE_ICON, source: SOURCE_IDS.ENTRANCES, type: 'circle', paint: entityCirclePaint('entrance') },
      { id: LAYER_IDS.STAIRCASE_ICON, source: SOURCE_IDS.STAIRCASES, type: 'circle', paint: entityCirclePaint('staircase') },
      { id: LAYER_IDS.ELEVATOR_ICON, source: SOURCE_IDS.ELEVATORS, type: 'circle', paint: entityCirclePaint('elevator') },
      { id: LAYER_IDS.PANORAMA_ICON, source: SOURCE_IDS.PANORAMAS, type: 'circle', paint: entityCirclePaint('panorama') },
      { id: LAYER_IDS.QR_ICON, source: SOURCE_IDS.QR, type: 'circle', paint: entityCirclePaint('qr') },
      { id: LAYER_IDS.SELECTION_OVERLAY, source: SOURCE_IDS.SELECTION, type: 'line', paint: selectionPaint() },
      { id: LAYER_IDS.HOVER_HIGHLIGHT, source: SOURCE_IDS.SELECTION, type: 'line', paint: hoverPaint() },
      { id: LAYER_IDS.PREVIEW, source: SOURCE_IDS.PREVIEW, type: 'line', paint: previewPaint() },
      { id: LAYER_IDS.VALIDATION_OVERLAY, source: SOURCE_IDS.SELECTION, type: 'line', paint: validationPaint() },
    ]

    for (const def of layerDefs) {
      if (this.map.getLayer(def.id)) continue
      this.map.addLayer(def as any)
    }
  }

  private listenToEvents(): void {
    this.eventBus.on('entity.created', (e) => { this.syncAll() })
    this.eventBus.on('entity.deleted', (e) => { this.syncAll() })
    this.eventBus.on('entity.updated', (e) => { this.syncAll() })
  }

  private updateSource(sourceId: string, data: GeoJSON.FeatureCollection): void {
    try {
      const source = this.map.getSource(sourceId) as any
      if (source?.setData) source.setData(data)
    } catch {
      // source may not be ready
    }
  }

  private sourceExists(id: string): boolean {
    return !!this.map.getSource(id)
  }
}
