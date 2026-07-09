/**
 * Wave 5 — Pipeline/Recovery
 *
 * Verifies the full compile→publish→load→route pipeline end-to-end,
 * and tests error recovery for all failure modes.
 */

import { describe, it, expect } from 'vitest'
import { ArtifactLoader } from '../../loader/artifact-loader'
import { LoadError } from '../../loader/types'
import type { CampusDocument, Building, Floor, Room, Entrance } from '@navi/core'

// ── Fixture ──

function pipelineDoc(): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: { name: 'PipelineTest', description: 'E2E test', lastModified: '', editorVersion: '1.0.0' },
    buildings: [{
      id: 'b1', name: 'Main', code: 'M', category: 'academic', description: '',
      footprint: { points: [{ lat: 14.0, lng: 121.0 }, { lat: 14.0, lng: 121.001 }, { lat: 14.001, lng: 121.001 }, { lat: 14.001, lng: 121.0 }, { lat: 14.0, lng: 121.0 }] },
      baseElevation: 0, height: 10,
      floors: [{
        id: 'f1', level: 0, label: 'Ground', elevation: 0,
        rooms: [
          { id: 'r1', name: 'Room 1', number: '101', category: 'classroom',
            polygon: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 0 }] },
            capacity: 30, metadata: {} },
          { id: 'r2', name: 'Room 2', number: '102', category: 'classroom',
            polygon: { points: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 8 }, { x: 20, y: 8 }, { x: 20, y: 0 }] },
            capacity: 25, metadata: {} },
        ],
        hallways: [], staircases: [], elevators: [],
        entrances: [{ id: 'e1', label: 'Main Entrance', position: { lat: 14.0005, lng: 121.0005 }, level: 0, type: 'main', hasQR: true, hasPanorama: false }],
        metadata: {},
      }],
      color: '#336699', aliases: [], metadata: {},
    }],
    roads: [{
      id: 'road1', name: 'Campus Road', polyline: { points: [{ lat: 14.0005, lng: 121.0005 }, { lat: 14.001, lng: 121.001 }] },
      width: 4, surface: 'paved', type: 'connector', metadata: {},
    }],
    panoramas: [], qrCheckpoints: [],
  }
}

function serialize(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

function makeFetch(files: Record<string, string>): (url: string) => Promise<Response> {
  return async (url: string) => {
    const filename = url.split('/').pop() ?? ''
    const content = files[filename]
    if (content === undefined) return new Response('Not found', { status: 404 })
    return new Response(content, { status: 200 })
  }
}

describe('Wave 5 | Pipeline / Recovery', () => {

  describe('Full pipeline: compile → publish → load → route', () => {
    it('compiles, publishes, loads, and routes end-to-end', async () => {
      // 1. Compile using @navi/compiler
      const { compile, generateArtifacts } = await import('@navi/compiler')
      const doc = pipelineDoc()
      const result = compile(doc, {
        nodeInterval: 10, mergeThreshold: 5, optimizationLevel: 'none', includeAccessibility: false,
      })
      expect(result.report.spacesExtracted).toBe(2)
      expect(result.graph.nodes.length).toBeGreaterThanOrEqual(3)

      // 2. Generate all four artifacts from the extraction embedded in compile result
      const artifacts = generateArtifacts(doc, result.extraction!)
      expect(artifacts.navigationGraph.nodes.length).toBeGreaterThan(0)
      expect(artifacts.searchIndex.entries.length).toBeGreaterThan(0)
      expect(artifacts.poiData.points.length).toBeGreaterThan(0)
      expect(artifacts.buildingIndex.buildings.length).toBeGreaterThan(0)

      // 3. Publish (serialize to strings, create manifest)
      const graphChecksum = await sha256(serialize(artifacts.navigationGraph))
      const files: Record<string, string> = {
        'manifest.json': serialize({
          projectId: doc.metadata.name, campusId: doc.metadata.name,
          publishedAt: new Date().toISOString(), schemaVersion: 1, compilerVersion: '1.0.0',
          artifacts: {
            navigationGraph: { filename: 'navigation.graph.json', checksum: graphChecksum, size: serialize(artifacts.navigationGraph).length },
            searchIndex: { filename: 'search.index.json', checksum: '', size: 0 },
            poiData: { filename: 'poi.json', checksum: '', size: 0 },
            buildingIndex: { filename: 'building-index.json', checksum: '', size: 0 },
          },
        }),
        'navigation.graph.json': serialize(artifacts.navigationGraph),
        'search.index.json': serialize(artifacts.searchIndex),
        'poi.json': serialize(artifacts.poiData),
        'building-index.json': serialize(artifacts.buildingIndex),
      }

      // 4. Load via ArtifactLoader
      const loader = new ArtifactLoader({ baseUrl: 'http://test', fetch: makeFetch(files) })
      const manifest = await loader.loadManifest()
      expect(manifest.schemaVersion).toBe(1)
      const snapshot = await loader.buildSnapshot(manifest)
      expect(snapshot.graph.nodes.length).toBe(artifacts.navigationGraph.nodes.length)

      // 5. Route
      const { RoutingEngine } = await import('../../routing/routing-engine')
      const engine = new RoutingEngine(snapshot.graph)
      const fromNode = snapshot.graph.nodes.find(n => n.type === 'transition')
      const toNode = snapshot.graph.nodes.find(n => n.type === 'space')
      if (fromNode && toNode) {
        const route = engine.findRoute(fromNode.id, toNode.id)
        expect(route).not.toBeNull()
        expect(route!.totalDistance).toBeGreaterThan(0)
      }
    })
  })

  describe('Error recovery', () => {
    it('rejects missing manifest file with LoadError', async () => {
      const loader = new ArtifactLoader({ baseUrl: 'http://test', fetch: makeFetch({}) })
      await expect(loader.load()).rejects.toThrow(LoadError)
    })

    it('rejects invalid JSON with LoadError', async () => {
      const loader = new ArtifactLoader({ baseUrl: 'http://test', fetch: makeFetch({ 'manifest.json': 'not valid json{' }) })
      await expect(loader.loadManifest()).rejects.toThrow(LoadError)
    })

    it('rejects unsupported schema version with LoadError', async () => {
      const files: Record<string, string> = {
        'manifest.json': serialize({
          projectId: 'test', campusId: 'test', publishedAt: '', schemaVersion: 99, compilerVersion: '1.0.0',
          artifacts: { navigationGraph: { filename: 'nav.json', checksum: '', size: 0 }, searchIndex: { filename: 'si.json', checksum: '', size: 0 }, poiData: { filename: 'poi.json', checksum: '', size: 0 }, buildingIndex: { filename: 'bi.json', checksum: '', size: 0 } },
        }),
      }
      const loader = new ArtifactLoader({ baseUrl: 'http://test', fetch: makeFetch(files) })
      await expect(loader.loadManifest()).rejects.toThrow(LoadError)
    })

    it('rejects missing artifact file with LoadError', async () => {
      const files: Record<string, string> = {
        'manifest.json': serialize({
          projectId: 'test', campusId: 'test', publishedAt: '', schemaVersion: 1, compilerVersion: '1.0.0',
          artifacts: { navigationGraph: { filename: 'nonexistent.json', checksum: '', size: 0 }, searchIndex: { filename: 'si.json', checksum: '', size: 0 }, poiData: { filename: 'poi.json', checksum: '', size: 0 }, buildingIndex: { filename: 'bi.json', checksum: '', size: 0 } },
        }),
      }
      const loader = new ArtifactLoader({ baseUrl: 'http://test', fetch: makeFetch(files) })
      const manifest = await loader.loadManifest()
      await expect(loader.buildSnapshot(manifest)).rejects.toThrow(LoadError)
    })
  })
})

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
