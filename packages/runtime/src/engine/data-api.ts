import type { RuntimeSnapshot } from '../types'
import type { NavigationGraph, SearchIndex, POIData, BuildingIndex, PublishedManifest, BuildingEntry, BoundingBox } from '@navi/compiler'

export class DataAPI {
  constructor(private snapshot: RuntimeSnapshot) {}

  getGraph(): NavigationGraph { return this.snapshot.graph }
  getSearchIndex(): SearchIndex { return this.snapshot.searchIndex }
  getPOI(): POIData { return this.snapshot.poi }
  getBuildings(): BuildingIndex { return this.snapshot.buildings }
  getManifest(): PublishedManifest { return this.snapshot.manifest }
  getBuilding(id: string): BuildingEntry | undefined {
    return this.snapshot.buildings.buildings.find(b => b.id === id)
  }
  getCampusId(): string { return this.snapshot.manifest.campusId }
  getBoundingBox(): BoundingBox { return this.snapshot.graph.metadata.boundingBox }
}
