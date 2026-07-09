import type {
  NavigationGraph,
  SearchIndex,
  POIData,
  BuildingIndex,
  PublishedManifest,
} from '@navi/compiler'

export interface RuntimeSnapshot {
  graph: NavigationGraph
  searchIndex: SearchIndex
  poi: POIData
  buildings: BuildingIndex
  manifest: PublishedManifest
}
