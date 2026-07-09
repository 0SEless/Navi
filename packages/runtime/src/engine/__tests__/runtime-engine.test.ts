import { describe, it, expect } from 'vitest'
import { RuntimeEngine } from '../runtime-engine'
import { ArtifactLoader } from '../../loader/artifact-loader'
import { LoadError } from '../../loader/types'
import { NotImplementedError } from '../errors'
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

describe('RuntimeEngine', () => {
  it('create returns a ready engine', async () => {
    const loader = new ArtifactLoader({ baseUrl, fetch })
    const engine = await RuntimeEngine.create(loader)
    expect(engine).toBeDefined()
  })

  it('data API returns correct values', async () => {
    const loader = new ArtifactLoader({ baseUrl, fetch })
    const engine = await RuntimeEngine.create(loader)
    expect(engine.data.getCampusId()).toBe('test-campus')
    expect(engine.data.getBuilding('b1')?.name).toBe('Building A')
    expect(engine.data.getBoundingBox().minLng).toBe(121.0)
  })

  it('future APIs throw NotImplementedError', async () => {
    const loader = new ArtifactLoader({ baseUrl, fetch })
    const engine = await RuntimeEngine.create(loader)
    expect(() => engine.position.getCurrentFloor()).toThrow(NotImplementedError)
  })

  it('rejects on loader failure', async () => {
    const badFetch = fixtureFetch(baseUrl)
    const loader = new ArtifactLoader({ baseUrl: '/nonexistent', fetch: badFetch })
    await expect(RuntimeEngine.create(loader)).rejects.toThrow()
  })
})
