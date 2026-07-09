import { describe, it, expect } from 'vitest'
import { ArtifactLoader } from '../artifact-loader'
import { LoadError } from '../types'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function fixtureFetch(base: string): (url: string) => Promise<Response> {
  return async (url: string) => {
    const filename = url.replace(base + '/', '')
    const filePath = resolve(__dirname, '../../../test/fixtures', filename)
    try {
      const body = readFileSync(filePath, 'utf-8')
      return new Response(body, { status: 200 })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  }
}

const baseUrl = 'file:///fixtures'
const fetch = fixtureFetch(baseUrl)

describe('ArtifactLoader', () => {
  it('loads manifest and validates schema version', async () => {
    const loader = new ArtifactLoader({ baseUrl, fetch })
    const manifest = await loader.loadManifest()
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.campusId).toBe('test-campus')
  })

  it('rejects unsupported schema version', async () => {
    const badFetch: (url: string) => Promise<Response> = async () =>
      new Response(JSON.stringify({ ...JSON.parse(readFileSync(resolve(__dirname, '../../../test/fixtures/manifest.json'), 'utf-8')), schemaVersion: 99 }), { status: 200 })
    const loader = new ArtifactLoader({ baseUrl, fetch: badFetch })
    await expect(loader.loadManifest()).rejects.toThrow(LoadError)
  })

  it('loads all artifacts and builds snapshot', async () => {
    const loader = new ArtifactLoader({ baseUrl, fetch })
    const snapshot = await loader.load()
    expect(snapshot.graph.nodes).toHaveLength(1)
    expect(snapshot.searchIndex.entries).toHaveLength(1)
    expect(snapshot.poi.points).toHaveLength(0)
    expect(snapshot.buildings.buildings).toHaveLength(1)
  })

  it('rejects missing files', async () => {
    const missingFetch: (url: string) => Promise<Response> = async () => new Response('Not found', { status: 404 })
    const loader = new ArtifactLoader({ baseUrl, fetch: missingFetch })
    await expect(loader.load()).rejects.toThrow(LoadError)
  })
})
