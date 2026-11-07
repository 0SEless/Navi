// Speed budgets on the ASU-IBAJAY copy (spec targets). Timing tests are noisy, so they run only with PERF=1
// (the perf lane: `PERF=1 npx vitest run packages/core/src/terrain/__tests__/perf.test.ts`).
import { describe, expect, it } from 'vitest'
import { createTerrainSampler } from '../compose'
import { tileIdOf, TILE_CELLS } from '../grid'
import { createHeightField } from '../height-field'
import { ibajayDoc } from './ibajay-fixture'

const perf = process.env.PERF ? describe : describe.skip

function microsecondsPerCall(f: (i: number) => void, n = 200_000): number {
  for (let i = 0; i < 20_000; i++) f(i) // warm-up
  const t = performance.now()
  for (let i = 0; i < n; i++) f(i)
  return ((performance.now() - t) * 1000) / n
}

perf('terrain speed budgets (ASU-IBAJAY copy)', () => {
  it('heightAt with the 29 ASU-IBAJAY pads costs ≤ 1 µs', () => {
    const s = createTerrainSampler(ibajayDoc())!
    expect(microsecondsPerCall((i) => s.heightAt(i % 600, (i * 7) % 320))).toBeLessThanOrEqual(1)
  })

  it('the height field builds in ≤ 400 ms', () => {
    const doc = ibajayDoc()
    createHeightField(doc) // warm-up
    const t = performance.now()
    createHeightField(doc)
    expect(performance.now() - t).toBeLessThanOrEqual(400)
  })

  it('a 30 m brush update (with pad ripple) takes ≤ 2 ms', () => {
    const doc = ibajayDoc()
    const field = createHeightField(doc)!
    const working = new Map([[tileIdOf(Math.floor(300 / TILE_CELLS), 0), new Int16Array(TILE_CELLS * TILE_CELLS)]])
    const rect = { minX: 285, minY: 105, maxX: 315, maxY: 135 }
    for (let i = 0; i < 5; i++) field.update(doc, rect, working)
    const t = performance.now()
    for (let i = 0; i < 20; i++) field.update(doc, rect, working)
    expect((performance.now() - t) / 20).toBeLessThanOrEqual(2)
  })
})

