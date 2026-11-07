// Speed budgets on the ASU-IBAJAY copy (spec targets). Timing tests are noisy, so they run only with PERF=1
// (the perf lane: `PERF=1 npx vitest run packages/core/src/terrain/__tests__/perf.test.ts`).
import { describe, expect, it } from 'vitest'
import { createTerrainSampler } from '../compose'
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
})
