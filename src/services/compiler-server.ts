import type { CampusDocument } from '@navi/core'
import type { CompilerAdapter, CompileResult } from '@navi/editor'

/**
 * Server-side CompilerAdapter that imports @navi/compiler directly.
 * NOT for client bundles — Node built-ins (crypto/fs) are unavailable there.
 */
export class CampusCompilerAdapter implements CompilerAdapter {
  async compile(document: CampusDocument): Promise<CompileResult> {
    try {
      const { CampusCompiler, buildSearchIndex, buildPOIData, buildBuildingIndex } = await import('@navi/compiler')

      const compiler = new CampusCompiler({
        nodeInterval: 5,
        mergeThreshold: 3,
        optimizationLevel: 'moderate',
        includeAccessibility: false,
      })

      const result = compiler.compile(document)

      if (!result.success || !result.graph) {
        return {
          status: 'error',
          message: result.errors.map(e => e.message).join('; '),
          timestamp: Date.now(),
        }
      }

      const graph = result.graph
      const searchIndex = buildSearchIndex(document, graph)
      const poiData = buildPOIData(graph)
      const buildingIndex = buildBuildingIndex(document, graph)

      return {
        status: 'success',
        timestamp: Date.now(),
        artifacts: {
          navigationGraph: graph,
          searchIndex,
          poiData,
          buildingIndex,
        },
      }
    } catch (err) {
      return {
        status: 'error',
        message: (err as Error).message,
        timestamp: Date.now(),
      }
    }
  }
}
