import { describe, it, expect } from 'vitest'
import { isSafeArtifactName, GET } from '../route'

describe('isSafeArtifactName', () => {
  it('accepts valid artifact file names', () => {
    expect(isSafeArtifactName('navigation.graph.json')).toBe(true)
    expect(isSafeArtifactName('manifest.json')).toBe(true)
    expect(isSafeArtifactName('search.index.json')).toBe(true)
    expect(isSafeArtifactName('building-index.json')).toBe(true)
    expect(isSafeArtifactName('poi.json')).toBe(true)
  })

  it('rejects path traversal attempts', () => {
    expect(isSafeArtifactName('../secret')).toBe(false)
    expect(isSafeArtifactName('..%2Fetc')).toBe(false)
    expect(isSafeArtifactName('/etc/passwd')).toBe(false)
    expect(isSafeArtifactName('a/b')).toBe(false)
    expect(isSafeArtifactName('a\\b')).toBe(false)
    expect(isSafeArtifactName(' x')).toBe(false)
    expect(isSafeArtifactName('.hidden')).toBe(false)
    expect(isSafeArtifactName('')).toBe(false)
    expect(isSafeArtifactName('..')).toBe(false)
    expect(isSafeArtifactName('x..')).toBe(false)
    expect(isSafeArtifactName('manifest.json/../secret')).toBe(false)
    expect(isSafeArtifactName('a..b')).toBe(false)
  })
})

describe('GET /api/demo/artifacts', () => {
  it('rejects path traversal with 400 before touching the filesystem', async () => {
    const res = await GET(new Request('http://localhost/api/demo/artifacts?file=../secret'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid file name' })
  })
})
