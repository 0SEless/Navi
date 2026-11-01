// Under Save v2 the legacy Graph is render-only (spec §6.1): it is rebuilt from the saved
// document and never saved. The transforms are registered exactly as createEditorContext does.
import type { CampusDocument } from '@navi/core'
import { CoordinateTransformer } from '@navi/core'
import { GraphAdapter, registerBuildingTransforms } from '@navi/editor'
import { Graph } from '@/engine/graph'

export function buildGraphFromDocument(doc: CampusDocument): Graph {
  const graph = new Graph()
  graph.campusId = doc.metadata.campusId
  const transformer = new CoordinateTransformer()
  registerBuildingTransforms(transformer, doc.buildings, graph)
  new GraphAdapter(graph, transformer).sync(doc)
  return graph
}
