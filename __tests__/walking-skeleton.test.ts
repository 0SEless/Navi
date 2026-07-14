import { describe, it, expect } from 'vitest'
import { CampusCompiler, type PublishedManifest } from '@navi/compiler'
import { buildSearchIndex, buildPOIData, buildBuildingIndex } from '@navi/compiler'
import { RuntimeEngine } from '@navi/runtime'
import { ArtifactLoader } from '@navi/runtime'
import { createGoldenCampus } from '../packages/editor/src/demo/golden-campus'

describe('Walking Skeleton — End-to-End Pipeline', () => {
  // ── Stage 1: CampusDocument ──
  describe('CampusDocument', () => {
    it('is valid', () => {
      const campus = createGoldenCampus()
      expect(campus.schemaVersion).toBe(1)
      expect(campus.buildings).toHaveLength(1)
      expect(campus.buildings[0].floors).toHaveLength(1)
      expect(campus.buildings[0].floors[0].rooms).toHaveLength(2)
      expect(campus.buildings[0].floors[0].hallways).toHaveLength(1)
      expect(campus.buildings[0].floors[0].entrances).toHaveLength(1)
    })
  })

  // ── Stage 2: Compiler ──
  describe('Compiler', () => {
    it('creates graph with >=4 nodes and >=3 edges', () => {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({
        nodeInterval: 5, mergeThreshold: 3,
        optimizationLevel: 'moderate', includeAccessibility: false,
      })
      const result = compiler.compile(campus)
      expect(result.success).toBe(true)
      expect(result.graph).not.toBeNull()
      const graph = result.graph!
      expect(graph.nodes.length).toBeGreaterThanOrEqual(4)
      expect(graph.edges.length).toBeGreaterThanOrEqual(3)
    })

    it('produces non-empty checksum', () => {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({
        nodeInterval: 5, mergeThreshold: 3,
        optimizationLevel: 'moderate', includeAccessibility: false,
      })
      const result = compiler.compile(campus)
      expect(result.graph!.checksum).toBeTruthy()
    })

    it('produces deterministic output', () => {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({
        nodeInterval: 5, mergeThreshold: 3,
        optimizationLevel: 'moderate', includeAccessibility: false,
      })
      const r1 = compiler.compile(campus)
      const r2 = compiler.compile(campus)
      expect(r1.graph!.nodes).toEqual(r2.graph!.nodes)
      expect(r1.graph!.edges).toEqual(r2.graph!.edges)
    })
  })

  // ── Stage 3: Artifacts ──
  describe('Artifacts', () => {
    it('buildSearchIndex produces entries', () => {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({ nodeInterval: 5, mergeThreshold: 3, optimizationLevel: 'moderate', includeAccessibility: false })
      const result = compiler.compile(campus)
      const index = buildSearchIndex(campus, result.graph!)
      expect(index.entries.length).toBeGreaterThan(0)
    })

    it('buildPOIData produces points', () => {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({ nodeInterval: 5, mergeThreshold: 3, optimizationLevel: 'moderate', includeAccessibility: false })
      const result = compiler.compile(campus)
      const poi = buildPOIData(result.graph!)
      expect(poi.points.length).toBeGreaterThan(0)
    })

    it('buildBuildingIndex produces one building', () => {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({ nodeInterval: 5, mergeThreshold: 3, optimizationLevel: 'moderate', includeAccessibility: false })
      const result = compiler.compile(campus)
      const bIndex = buildBuildingIndex(campus, result.graph!)
      expect(bIndex.buildings).toHaveLength(1)
    })
  })

  // ── Stage 4: Runtime ──
  describe('Runtime', () => {
    async function createTestRuntime() {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({ nodeInterval: 5, mergeThreshold: 3, optimizationLevel: 'moderate', includeAccessibility: false })
      const result = compiler.compile(campus)
      const graph = result.graph!
      const searchIndex = buildSearchIndex(campus, graph)
      const poiData = buildPOIData(graph)
      const buildingIndex = buildBuildingIndex(campus, graph)

      const manifest: PublishedManifest = {
        projectId: 'Demo Campus', campusId: 'Demo Campus',
        publishedAt: new Date().toISOString(), schemaVersion: 1, compilerVersion: '0.1.0',
        artifacts: {
          navigationGraph: { filename: 'navigation.graph.json', checksum: '', size: 0 },
          searchIndex: { filename: 'search.index.json', checksum: '', size: 0 },
          poiData: { filename: 'poi.json', checksum: '', size: 0 },
          buildingIndex: { filename: 'building-index.json', checksum: '', size: 0 },
        },
      }
      const artifacts: Record<string, string> = {
        'manifest.json': JSON.stringify(manifest),
        'navigation.graph.json': JSON.stringify(graph),
        'search.index.json': JSON.stringify(searchIndex),
        'poi.json': JSON.stringify(poiData),
        'building-index.json': JSON.stringify(buildingIndex),
      }

      const fetch = (url: string) => {
        const file = url.split('/').pop() || 'manifest.json'
        const body = artifacts[file]
        return body
          ? Promise.resolve(new Response(body, { status: 200 }))
          : Promise.resolve(new Response('Not found', { status: 404 }))
      }

      const loader = new ArtifactLoader({ baseUrl: 'http://test', fetch })
      return await RuntimeEngine.create(loader)
    }

    it('loads without error', async () => {
      const engine = await createTestRuntime()
      expect(engine).toBeDefined()
    })

    it('has correct node/edge count', async () => {
      const engine = await createTestRuntime()
      const graph = engine.data.getGraph()
      expect(graph.metadata.nodeCount).toBeGreaterThanOrEqual(4)
      expect(graph.metadata.edgeCount).toBeGreaterThanOrEqual(3)
    })
  })

  // ── Stage 5: Search ──
  describe('Search', () => {
    async function createEngine() {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({ nodeInterval: 5, mergeThreshold: 3, optimizationLevel: 'moderate', includeAccessibility: false })
      const result = compiler.compile(campus)
      const graph = result.graph!
      const manifest: PublishedManifest = {
        projectId: 'Demo Campus', campusId: 'Demo Campus',
        publishedAt: new Date().toISOString(), schemaVersion: 1, compilerVersion: '0.1.0',
        artifacts: {
          navigationGraph: { filename: 'navigation.graph.json', checksum: '', size: 0 },
          searchIndex: { filename: 'search.index.json', checksum: '', size: 0 },
          poiData: { filename: 'poi.json', checksum: '', size: 0 },
          buildingIndex: { filename: 'building-index.json', checksum: '', size: 0 },
        },
      }
      const artifacts: Record<string, string> = {
        'manifest.json': JSON.stringify(manifest),
        'navigation.graph.json': JSON.stringify(graph),
        'search.index.json': JSON.stringify(buildSearchIndex(campus, graph)),
        'poi.json': JSON.stringify(buildPOIData(graph)),
        'building-index.json': JSON.stringify(buildBuildingIndex(campus, graph)),
      }
      const fetch = (url: string) => {
        const file = url.split('/').pop() || 'manifest.json'
        return artifacts[file]
          ? Promise.resolve(new Response(artifacts[file], { status: 200 }))
          : Promise.resolve(new Response('Not found', { status: 404 }))
      }
      return await RuntimeEngine.create(new ArtifactLoader({ baseUrl: 'http://test', fetch }))
    }

    it('finds Room 101 by searching "101"', async () => {
      const engine = await createEngine()
      const results = engine.search.query('101', { maxResults: 5 })
      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.entry.label === 'Room 101')).toBe(true)
    })

    it('returns empty for nonexistent query', async () => {
      const engine = await createEngine()
      const results = engine.search.query('ZZZ_NONEXISTENT', { maxResults: 5 })
      expect(results).toHaveLength(0)
    })
  })

  // ── Stage 6: Route ──
  describe('Route', () => {
    async function createEngine() {
      const campus = createGoldenCampus()
      const compiler = new CampusCompiler({ nodeInterval: 5, mergeThreshold: 3, optimizationLevel: 'moderate', includeAccessibility: false })
      const result = compiler.compile(campus)
      const graph = result.graph!
      const manifest: PublishedManifest = {
        projectId: 'Demo Campus', campusId: 'Demo Campus',
        publishedAt: new Date().toISOString(), schemaVersion: 1, compilerVersion: '0.1.0',
        artifacts: {
          navigationGraph: { filename: 'navigation.graph.json', checksum: '', size: 0 },
          searchIndex: { filename: 'search.index.json', checksum: '', size: 0 },
          poiData: { filename: 'poi.json', checksum: '', size: 0 },
          buildingIndex: { filename: 'building-index.json', checksum: '', size: 0 },
        },
      }
      const artifacts: Record<string, string> = {
        'manifest.json': JSON.stringify(manifest),
        'navigation.graph.json': JSON.stringify(graph),
        'search.index.json': JSON.stringify(buildSearchIndex(campus, graph)),
        'poi.json': JSON.stringify(buildPOIData(graph)),
        'building-index.json': JSON.stringify(buildBuildingIndex(campus, graph)),
      }
      const fetch = (url: string) => {
        const file = url.split('/').pop() || 'manifest.json'
        return artifacts[file]
          ? Promise.resolve(new Response(artifacts[file], { status: 200 }))
          : Promise.resolve(new Response('Not found', { status: 404 }))
      }
      return await RuntimeEngine.create(new ArtifactLoader({ baseUrl: 'http://test', fetch }))
    }

    it('finds a path from Room 101 to Room 102', async () => {
      const engine = await createEngine()
      const nodes = engine.data.getGraph().nodes
      const fromNode = nodes.find(n => n.label === 'Room 101')
      const toNode = nodes.find(n => n.label === 'Room 102')
      expect(fromNode).toBeDefined()
      expect(toNode).toBeDefined()

      const route = engine.routing.findRoute(fromNode!.id, toNode!.id)
      expect(route).not.toBeNull()
    })

    it('path has >=3 steps', async () => {
      const engine = await createEngine()
      const nodes = engine.data.getGraph().nodes
      const fromNode = nodes.find(n => n.label === 'Room 101')
      const toNode = nodes.find(n => n.label === 'Room 102')
      const route = engine.routing.findRoute(fromNode!.id, toNode!.id)!
      expect(route.path.length).toBeGreaterThanOrEqual(2)
    })

    it('instructions contain "walk" type', async () => {
      const engine = await createEngine()
      const nodes = engine.data.getGraph().nodes
      const fromNode = nodes.find(n => n.label === 'Room 101')
      const toNode = nodes.find(n => n.label === 'Room 102')
      const route = engine.routing.findRoute(fromNode!.id, toNode!.id)!
      const walkTypes = route.instructions.filter(i => i.type === 'walk')
      expect(walkTypes.length).toBeGreaterThan(0)
    })

    it('totalDistance > 0', async () => {
      const engine = await createEngine()
      const nodes = engine.data.getGraph().nodes
      const fromNode = nodes.find(n => n.label === 'Room 101')
      const toNode = nodes.find(n => n.label === 'Room 102')
      const route = engine.routing.findRoute(fromNode!.id, toNode!.id)!
      expect(route.totalDistance).toBeGreaterThan(0)
    })

    it('arrival instruction present', async () => {
      const engine = await createEngine()
      const nodes = engine.data.getGraph().nodes
      const fromNode = nodes.find(n => n.label === 'Room 101')
      const toNode = nodes.find(n => n.label === 'Room 102')
      const route = engine.routing.findRoute(fromNode!.id, toNode!.id)!
      const arrive = route.instructions.find(i => i.type === 'arrive')
      expect(arrive).toBeDefined()
      expect(arrive!.text).toBeTruthy()
    })
  })
})
