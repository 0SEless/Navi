import type { CampusDocument } from '@navi/core'
import type { CompilerAdapter, CompileResult, CompiledArtifacts } from '@navi/editor'

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
