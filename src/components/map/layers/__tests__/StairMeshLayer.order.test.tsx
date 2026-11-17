import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/lib/three-d/mesh-layer', () => ({ createMeshLayer: (id: string) => ({ id, type: 'custom', setMesh: () => {} }) }))
vi.mock('@/lib/terrain/style-ready', () => ({ styleReady: () => true }))

import { StairMeshLayer } from '../StairMeshLayer'

// Owner 2026-11-18: white pieces over the Computer Science stair on 2F. The floor's flat room fills were drawn
// after the stair mesh and painted over it. In NAVI Web the mesh goes after the flat indoor layers, just before the
// floor's own 3D blocks.

function fakeMap(order: Array<[string, string]>) {
  const added: Array<[string, string | undefined]> = []
  return {
    added,
    getLayersOrder: () => order.map(([id]) => id),
    getLayer: (id: string) => { const hit = order.find(([lid]) => lid === id); return hit ? { id, type: hit[1] } : undefined },
    addLayer: (layer: { id: string }, before?: string) => { added.push([layer.id, before]); order.splice(before ? order.findIndex(([lid]) => lid === before) : order.length, 0, [layer.id, 'custom']) },
    moveLayer: (lid: string, before: string) => { const [item] = order.splice(order.findIndex(([x]) => x === lid), 1); order.splice(order.findIndex(([x]) => x === before), 0, item); added.push([lid, `moved:${before}`]) },
    handlers: [] as Array<() => void>,
    removeLayer: () => {}, off: () => {}, triggerRepaint: () => {},
    on(_: string, fn: () => void) { this.handlers.push(fn) },
  }
}
const mesh = [{ origin: { lat: 11, lng: 122 }, mesh: new Float32Array(9) }]
const base: Array<[string, string]> = [['buildings-fill', 'fill'], ['buildings-extrusion', 'fill-extrusion'], ['rooms-fill', 'fill'], ['floor-architecture-floor', 'fill-extrusion']]

describe('StairMeshLayer order', () => {
  it('by default it goes before the first 3D block layer (the floor editor)', () => {
    const map = fakeMap(base.map((x) => [...x] as [string, string]))
    render(<StairMeshLayer map={map as never} id="m" meshes={mesh} />)
    expect(map.added[0]).toEqual(['m-0', 'buildings-extrusion'])
  })

  it('given a layer prefix, before the first 3D block layer with that prefix (after the flat room fills)', () => {
    const map = fakeMap(base.map((x) => [...x] as [string, string]))
    render(<StairMeshLayer map={map as never} id="m" meshes={mesh} beforePrefix="floor-architecture-" />)
    expect(map.added[0]).toEqual(['m-0', 'floor-architecture-floor'])
  })

  it("added before the floor's blocks exist, it moves in front of them when they appear", () => {
    const order = base.slice(0, 3).map((x) => [...x] as [string, string])
    const map = fakeMap(order)
    render(<StairMeshLayer map={map as never} id="m" meshes={mesh} beforePrefix="floor-architecture-" />)
    expect(map.added[0]).toEqual(['m-0', 'buildings-extrusion'])
    order.push(['floor-architecture-floor', 'fill-extrusion'])
    for (const fn of map.handlers) fn()
    expect(order.map(([id]) => id)).toEqual(['buildings-fill', 'buildings-extrusion', 'rooms-fill', 'm-0', 'floor-architecture-floor'])
  })
})
