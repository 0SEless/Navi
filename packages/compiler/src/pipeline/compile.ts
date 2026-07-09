import type { CampusDocument } from '@navi/core'
import type { CompilerConfig, CompileResult } from '../types'
import { ExtractionCoordinator } from '../extractors/coordinator'
import type { ExtractionContext } from '../extractors/types'
import { buildGraph, buildSearchIndex } from '../artifacts'

export function compile(document: CampusDocument, config: CompilerConfig): CompileResult {
  const start = performance.now()
  const coordinator = new ExtractionCoordinator()
  const campusId = document.metadata.name
  const context: ExtractionContext = { campusId, campusDocument: document, projectId: '' }
  const extraction = coordinator.extractAll(document, context)

  // Build graph from extraction results
  const graph = buildGraph(document, extraction)

  // Count buildings/floors from the campus document
  const bldSet = new Set(document.buildings.map(b => b.id))
  const flrSet = new Set<string>()
  for (const b of document.buildings) {
    for (const f of b.floors) flrSet.add(`${b.id}-${f.level}`)
  }

  return {
    graph: {
      ...graph,
      checksum: require('crypto').createHash('sha256').update(JSON.stringify(graph)).digest('hex'),
      metadata: {
        ...graph.metadata,
        buildings: bldSet.size,
        floors: flrSet.size,
      },
    },
    report: {
      spacesExtracted: extraction.spaces.length,
      transitionsExtracted: extraction.transitions.length,
      corridorsExtracted: extraction.corridors.length,
      nodesGenerated: graph.nodes.length,
      edgesGenerated: graph.edges.length,
      warnings: [],
      errors: [],
      validation: [],
    },
    duration: performance.now() - start,
  }
}
