import { CampusCompiler } from '@navi/compiler'
import { buildSearchIndex, buildPOIData, buildBuildingIndex } from '@navi/compiler'
import type { CampusDocument } from '@navi/core'
import type { CompilerAdapter, CompileResult, CompiledArtifacts } from '@navi/editor'

/**
 * Concrete CompilerAdapter that directly imports @navi/compiler.
 * Lazy-import pattern avoids Node crypto in browser bundles.
 */
export class CampusCompilerAdapter implements CompilerAdapter {
  async compile(document: CampusDocument): Promise<CompileResult> {
    try {
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

/**
 * Create a CompilerAdapter that delegates to the /api/compile endpoint.

/**
 * Create a CompilerAdapter that delegates to the /api/compile endpoint.
 *
 * Compilation happens server-side where @navi/compiler can use Node
 * built-ins (crypto) that are unavailable in browser contexts.
 */
export function createCompilerAdapter(): CompilerAdapter {
  return {
    async compile(document: CampusDocument): Promise<CompileResult> {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => null)
        return {
          status: 'error',
          message: err?.message ?? `Server error: ${response.status}`,
          timestamp: Date.now(),
        }
      }

      const data = await response.json()

      if (data.status === 'error') {
        return {
          status: 'error',
          message: data.message ?? 'Compilation failed',
          timestamp: data.timestamp,
        }
      }

      const artifacts: CompiledArtifacts = {
        navigationGraph: data.artifacts?.navigationGraph ?? null,
        stats: data.artifacts?.stats ?? null,
        searchIndex: null,
        poiData: null,
        buildingIndex: null,
      }

      return {
        status: 'success',
        artifacts,
        timestamp: data.timestamp,
      }
    },
  }
}
