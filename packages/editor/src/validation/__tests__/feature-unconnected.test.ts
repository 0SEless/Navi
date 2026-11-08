import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { featureUnconnectedRule } from '../rules/modules/feature-rules'

type Item = { id: string; name?: string; levels: number[]; links?: { below?: string; above?: string } }
const item = (it: Item, kind: 'staircase' | 'elevator') => ({
  id: it.id, buildingId: 'b', name: it.name ?? it.id, type: kind === 'staircase' ? 'standard' : 'passenger', accessible: false,
  fromLevel: Math.min(...it.levels), toLevel: Math.max(...it.levels),
  levels: Object.fromEntries(it.levels.map((l) => [l, { position: { x: 0, y: 0 }, rotation: 0 }])),
  ...(it.links ? { links: it.links } : {}),
})

function campus(floors: number, stairs: Item[], lifts: Item[] = []): CampusDocument {
  return {
    buildings: [{
      id: 'b', name: 'B',
      floors: Array.from({ length: floors }, (_, level) => ({ id: `f${level}`, level, label: `${level + 1}F` })),
      staircases: stairs.map((s) => item(s, 'staircase')),
      elevators: lifts.map((l) => item(l, 'elevator')),
    }],
  } as unknown as CampusDocument
}
const messages = (doc: CampusDocument) => featureUnconnectedRule.execute({ document: doc } as never).map((i) => `${i.severity}: ${i.message}`)

describe('feature-unconnected', () => {
  it('warns for an unlinked single-floor stair in a two-floor building', () => {
    expect(messages(campus(2, [{ id: 's', name: 'Stair A', levels: [0] }]))).toEqual(['warning: Stair "Stair A" on 1F isn\'t connected to another floor'])
  })

  it('no warning when linked', () => {
    expect(messages(campus(2, [{ id: 'a', levels: [0], links: { above: 'b' } }, { id: 'b', levels: [1], links: { below: 'a' } }]))).toEqual([])
  })

  it('no warning in a one-floor building', () => {
    expect(messages(campus(1, [{ id: 's', levels: [0] }]))).toEqual([])
  })

  it('no warning for an old multi-level stair', () => {
    expect(messages(campus(2, [{ id: 's', levels: [0, 1] }]))).toEqual([])
  })

  it('lift wording', () => {
    expect(messages(campus(3, [], [{ id: 'l', name: 'Lift 1', levels: [2] }]))).toEqual(['warning: Lift "Lift 1" on 3F isn\'t connected to another floor'])
  })
})
