import { describe, expect, it } from 'vitest'
import { fixtureTerrain } from '@/studio-v2/__fixtures__/campus-fixtures'
import { splitDocument } from '@/studio-v2/parts/split'
import { tracingKey } from '../tracing-store'

describe('tracing image', () => {
  it('tracing image never enters the document or parts', () => {
    const doc = fixtureTerrain()
    // The tracing image lives in its own browser store under this key, never on the document.
    expect(tracingKey(doc.metadata.campusId)).toBe(`terrain-tracing:${doc.metadata.campusId}`)
    const parts = splitDocument(doc).parts
    expect(JSON.stringify(parts.map((part) => [part.key, part.content]))).not.toMatch(/tracing/i)
    expect(Object.keys(doc)).not.toContain('tracing')
  })
})
