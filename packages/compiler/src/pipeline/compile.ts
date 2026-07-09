import type { CampusDocument } from '@navi/core'
import type { CompilerConfig, CompileResult } from '../types'
import { ExtractionCoordinator } from '../extractors/coordinator'
import type { ExtractionContext } from '../extractors/types'

export function compile(document: CampusDocument, config: CompilerConfig): CompileResult {
  const start = performance.now()
  const coordinator = new ExtractionCoordinator()
  const campusId = document.metadata.name
  const context: ExtractionContext = { campusId, campusDocument: document, projectId: '' }
  const extraction = coordinator.extractAll(document, context)
  return {
    graph: {
      version: '1.0.0',
      campusId,
      createdAt: new Date().toISOString(),
      checksum: '',
      nodes: [],
      edges: [],
      metadata: { nodeCount: 0, edgeCount: 0, buildings: 0, floors: 0, boundingBox: { minLng: 0, maxLng: 0, minLat: 0, maxLat: 0 } },
    },
    report: {
      spacesExtracted: extraction.spaces.length,
      transitionsExtracted: extraction.transitions.length,
      corridorsExtracted: extraction.corridors.length,
      nodesGenerated: 0,
      edgesGenerated: 0,
      warnings: [],
      errors: [],
      validation: [],
    },
    duration: performance.now() - start,
  }
}
