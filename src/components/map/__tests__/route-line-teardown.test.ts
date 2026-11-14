import { expect, it, vi } from 'vitest'
import { removeRouteLayers } from '../RouteLine'

it('cleanup after the map was removed (style gone) does not throw', () => {
  // A removed MapLibre map has no style; getLayer then throws "reading 'getLayer'".
  const removed = { getLayer: () => { throw new TypeError("Cannot read properties of undefined (reading 'getLayer')") }, getSource: vi.fn(), removeLayer: vi.fn(), removeSource: vi.fn() }
  expect(() => removeRouteLayers(removed as never)).not.toThrow()
})

it('still removes route layers from a live map', () => {
  const layers = new Set(['route-line']), live = { style: {}, getLayer: (id: string) => layers.has(id) || undefined, removeLayer: vi.fn((id: string) => layers.delete(id)), getSource: () => ({}), removeSource: vi.fn() }
  removeRouteLayers(live as never)
  expect(live.removeSource).toHaveBeenCalled()
})
