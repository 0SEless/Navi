import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import type { CampusDocument } from '@navi/core'
import type { CompileResult, PublishedManifest } from '../types'
import type { ArtifactSet } from '../artifacts'

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

export interface PublisherOptions {
  outDir: string
  compilerVersion?: string
}

export function publish(campus: CampusDocument, result: CompileResult, options: PublisherOptions): PublishedManifest {
  const { outDir, compilerVersion = '0.1.0' } = options

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const artifacts: ArtifactSet = {
    navigationGraph: result.graph,
    searchIndex: { version: '1.0.0', entries: [] },
    poiData: { version: '1.0.0', points: result.graph.nodes.map(n => ({
      id: `poi-${n.id}`, label: n.label, category: n.type,
      position: n.position, buildingId: n.buildingId, floor: n.floor, nodeId: n.id, properties: n.properties,
    }))},
    buildingIndex: { version: '1.0.0', buildings: [] },
  }

  // Write files first, then compute checksums from actual content
  const files: Record<string, string> = {
    'navigation.graph.json': JSON.stringify(artifacts.navigationGraph, null, 2),
    'search.index.json': JSON.stringify(artifacts.searchIndex, null, 2),
    'poi.json': JSON.stringify(artifacts.poiData, null, 2),
    'building-index.json': JSON.stringify(artifacts.buildingIndex, null, 2),
  }

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(outDir, filename), content)
  }

  const manifest: PublishedManifest = {
    projectId: campus.metadata.name,
    campusId: campus.metadata.name,
    publishedAt: new Date().toISOString(),
    schemaVersion: 1,
    compilerVersion,
    artifacts: {
      navigationGraph: { filename: 'navigation.graph.json', checksum: sha256(files['navigation.graph.json']), size: Buffer.byteLength(files['navigation.graph.json'], 'utf-8') },
      searchIndex: { filename: 'search.index.json', checksum: sha256(files['search.index.json']), size: Buffer.byteLength(files['search.index.json'], 'utf-8') },
      poiData: { filename: 'poi.json', checksum: sha256(files['poi.json']), size: Buffer.byteLength(files['poi.json'], 'utf-8') },
      buildingIndex: { filename: 'building-index.json', checksum: sha256(files['building-index.json']), size: Buffer.byteLength(files['building-index.json'], 'utf-8') },
    },
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  return manifest
}
