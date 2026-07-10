import type { CampusDocument } from '@navi/core'
import type {
  CompilerStagePlugin,
  CompilerStageInput,
  CompilerStageOutput,
  CompileStageId,
  CompileResultV2,
  CompilerConfig,
  ParsedDocument,
  NavNode,
  NavEdge,
  CompileWarning,
  CompileError,
  CompileStats,
  CompileStage,
} from '../types'
import { ParseStage, parseDocument } from './stages/parse-stage'
import { BuildNodesStage, buildNodes } from './stages/build-nodes-stage'
import { BuildEdgesStage, buildEdges } from './stages/build-edges-stage'
import { CampusConnectorStage, connectCampuses } from './stages/connect-campuses-stage'
import { OptimizeStage, optimizeGraph } from './stages/optimize-stage'
import { ValidateStage, validateGraph } from './stages/validate-stage'
import { createHash } from 'crypto'

const DEFAULT_STAGES: Record<CompileStageId, CompilerStagePlugin> = {
  'parse': new ParseStage(),
  'build-nodes': new BuildNodesStage(),
  'build-edges': new BuildEdgesStage(),
  'connect-campuses': new CampusConnectorStage(),
  'optimize': new OptimizeStage(),
  'validate': new ValidateStage(),
}

const STAGE_NAMES: Record<CompileStageId, string> = {
  'parse': 'Parsing document',
  'build-nodes': 'Building nodes',
  'build-edges': 'Building edges',
  'connect-campuses': 'Connecting campuses',
  'optimize': 'Optimizing graph',
  'validate': 'Validating graph',
}

const STAGE_ORDER: CompileStageId[] = [
  'parse',
  'build-nodes',
  'build-edges',
  'connect-campuses',
  'optimize',
  'validate',
]

export class CampusCompiler {
  private stagePlugins = new Map<CompileStageId, CompilerStagePlugin[]>()
  private stageOverrides = new Map<CompileStageId, CompilerStagePlugin>()

  constructor(private config: CompilerConfig = {} as CompilerConfig) {
    this.registerPlugins(config.plugins || [])
    this.applyStageOverrides(config.stages)
  }

  // ── Plugin Registration ──

  registerPlugin(plugin: CompilerStagePlugin): void {
    if (!plugin.id.startsWith('compiler-')) {
      throw new Error(`Plugin ID must start with "compiler-": ${plugin.id}`)
    }
    if (!this.stagePlugins.has(plugin.targetStage)) {
      this.stagePlugins.set(plugin.targetStage, [])
    }
    this.stagePlugins.get(plugin.targetStage)!.push(plugin)
  }

  registerPlugins(plugins: CompilerStagePlugin[]): void {
    for (const plugin of plugins) {
      this.registerPlugin(plugin)
    }
  }

  private applyStageOverrides(stages?: CompilerConfig['stages']): void {
    if (!stages) return
    const stageMap: [CompileStageId, string][] = [
      ['parse', 'parse'],
      ['build-nodes', 'build-nodes'],
      ['build-edges', 'build-edges'],
      ['connect-campuses', 'connect-campuses'],
      ['optimize', 'optimize'],
      ['validate', 'validate'],
    ]
    for (const [id, key] of stageMap) {
      const OverrideClass = (stages as any)[key]
      if (OverrideClass) {
        this.stageOverrides.set(id, new OverrideClass())
      }
    }
  }

  // ── Main Compilation ──

  compile(document: CampusDocument): CompileResultV2 {
    return this.compileWithProgress(document, () => {})
  }

  compileWithProgress(
    document: CampusDocument,
    onProgress: (stage: CompileStage, progress: number) => void,
  ): CompileResultV2 {
    const startTime = performance.now()
    const allWarnings: CompileWarning[] = []
    const allErrors: CompileError[] = []

    // Shared state passed through stages
    const ctx: Record<string, unknown> = {}
    let nodes: NavNode[] | undefined
    let edges: NavEdge[] | undefined
    let parsed: import('../types').ParsedDocument | undefined

    try {
      for (let i = 0; i < STAGE_ORDER.length; i++) {
        const stageId = STAGE_ORDER[i]
        const progress = (i + 1) / STAGE_ORDER.length
        onProgress({ name: STAGE_NAMES[stageId], progress }, progress)

        const input: CompilerStageInput = {
          document,
          context: ctx,
          parsed,
          nodes,
          edges,
        }

        const output = this.executeStage(stageId, input)

        // Collect warnings and errors
        if (output.warnings) allWarnings.push(...output.warnings)
        if (output.errors) {
          allErrors.push(...output.errors)
          // Errors halt the pipeline
          if (output.errors.length > 0) break
        }

        // Update shared state (stages may return empty arrays — that's valid)
        if (output.nodes !== undefined) nodes = output.nodes
        if (output.edges !== undefined) edges = output.edges
        if (output.context) Object.assign(ctx, output.context)

        // Extract parsed document from context after parse stage
        if (ctx.parsed) {
          parsed = ctx.parsed as ParsedDocument
        }
      }

      // Build the NavigationGraph
      const safeNodes = nodes || []
      const safeEdges = edges || []
      const graph = this.buildGraph(document, safeNodes, safeEdges)

      // Get stats from context (set by validate stage) or compute them
      const stats: CompileStats = (ctx.stats as CompileStats) || {
        totalNodes: safeNodes.length,
        totalEdges: safeEdges.length,
        buildingsProcessed: new Set(safeNodes.map(n => n.buildingId).filter(Boolean)).size,
        floorsProcessed: new Set(safeNodes.map(n => `${n.buildingId}:${n.floor}`)).size,
        roomsProcessed: safeNodes.filter(n => n.type === 'space').length,
        hallwaysProcessed: safeNodes.filter(n => n.type === 'corridor').length,
        totalRouteLength: Math.round(safeEdges.reduce((s, e) => s + e.distance, 0)),
        connectivityScore: 1,
      }

      return {
        success: allErrors.length === 0,
        graph,
        stats,
        warnings: allWarnings,
        errors: allErrors,
        duration: performance.now() - startTime,
      }
    } catch (err) {
      return {
        success: false,
        graph: null,
        stats: {
          totalNodes: 0, totalEdges: 0,
          buildingsProcessed: 0, floorsProcessed: 0,
          roomsProcessed: 0, hallwaysProcessed: 0,
          totalRouteLength: 0, connectivityScore: 0,
        },
        warnings: allWarnings,
        errors: [...allErrors, { code: 'COMPILE_ERROR', message: (err as Error).message }],
        duration: performance.now() - startTime,
      }
    }
  }

  // ── Stage Execution with Plugin Chaining ──

  private executeStage(stageId: CompileStageId, input: CompilerStageInput): CompilerStageOutput {
    const plugins = this.stagePlugins.get(stageId) || []
    const defaultImpl = this.stageOverrides.get(stageId) || DEFAULT_STAGES[stageId]

    if (plugins.length === 0) {
      // No plugins → use default implementation
      return defaultImpl.execute(input, () => ({ context: {} }))
    }

    // Chain plugins: first 'replace' wins, 'augment' plugins wrap
    const replacePlugin = plugins.find(p => p.mode === 'replace')
    const augmentPlugins = plugins.filter(p => p.mode === 'augment')

    if (replacePlugin) {
      // Replace mode: plugin takes full control, receives `next` as fallback
      return replacePlugin.execute(input, () => defaultImpl.execute(input, () => ({ context: {} })))
    }

    // Augment mode: chain plugins around default
    // Last registered augment plugin runs closest to the default
    let chain = (inp: CompilerStageInput) => defaultImpl.execute(inp, () => ({ context: {} }))
    for (const plugin of augmentPlugins.reverse()) {
      const next = chain
      chain = (inp: CompilerStageInput) => plugin.execute(inp, next)
    }
    return chain(input)
  }

  // ── Graph Construction ──

  private buildGraph(document: CampusDocument, nodes: NavNode[], edges: NavEdge[]) {
    // Bounding box
    const bbox = nodes.length > 0
      ? nodes.reduce((bb, n) => ({
          minLng: Math.min(bb.minLng, n.position.lng),
          maxLng: Math.max(bb.maxLng, n.position.lng),
          minLat: Math.min(bb.minLat, n.position.lat),
          maxLat: Math.max(bb.maxLat, n.position.lat),
        }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity })
      : { minLng: 0, maxLng: 0, minLat: 0, maxLat: 0 }

    const buildingSet = new Set(nodes.map(n => n.buildingId).filter(Boolean))
    const floorSet = new Set(nodes.map(n => `${n.buildingId}:${n.floor}`))

    // Compute checksum from content only (exclude timestamps)
    const { createdAt: _, checksum: __, ...contentOnly } = {
      nodes,
      edges,
      version: '1.0.0',
      campusId: document.metadata.name,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        buildings: buildingSet.size,
        floors: floorSet.size,
        boundingBox: bbox,
      },
    }

    return {
      version: '1.0.0',
      campusId: document.metadata.name,
      createdAt: new Date().toISOString(),
      checksum: createHash('sha256').update(JSON.stringify(contentOnly)).digest('hex'),
      nodes,
      edges,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        buildings: buildingSet.size,
        floors: floorSet.size,
        boundingBox: bbox,
      },
    }
  }
}
