import { describe, it, expect } from 'vitest'
import { CampusCompilerAdapter } from '../compiler-adapter'
import { createGoldenCampus } from '../../../packages/editor/src/demo/golden-campus'

describe('CampusCompilerAdapter', () => {
  it('compiles a valid campus document', async () => {
    const adapter = new CampusCompilerAdapter()
    const doc = createGoldenCampus()
    const result = await adapter.compile(doc)
    expect(result.status).toBe('success')
  })

  it('returns artifacts with navigationGraph', async () => {
    const adapter = new CampusCompilerAdapter()
    const doc = createGoldenCampus()
    const result = await adapter.compile(doc)
    expect(result.artifacts?.navigationGraph).toBeDefined()
    expect(result.artifacts?.searchIndex).toBeDefined()
    expect(result.artifacts?.poiData).toBeDefined()
    expect(result.artifacts?.buildingIndex).toBeDefined()
  })

  it('returns node count > 0', async () => {
    const adapter = new CampusCompilerAdapter()
    const doc = createGoldenCampus()
    const result = await adapter.compile(doc)
    const graph = result.artifacts?.navigationGraph as any
    expect(graph.nodes.length).toBeGreaterThan(0)
  })

  it('fails gracefully with null doc', async () => {
    const adapter = new CampusCompilerAdapter()
    const result = await adapter.compile(null as any)
    expect(result.status).toBe('error')
    expect(result.message).toBeDefined()
  })
})
