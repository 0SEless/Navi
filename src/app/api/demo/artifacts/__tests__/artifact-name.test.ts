import { describe, it, expect } from 'vitest'
import { isSafeArtifactName } from '../route'

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
    expect(isSafeArtifactName('.hidden')).toBe(false)
    expect(isSafeArtifactName('')).toBe(false)
    expect(isSafeArtifactName('..')).toBe(false)
    expect(isSafeArtifactName('manifest.json/../secret')).toBe(false)
    expect(isSafeArtifactName('a..b')).toBe(false)
  })
})
