import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TerrainLayersPanel, DEFAULT_LAYERS } from '../TerrainLayersPanel'
afterEach(cleanup)

const base = { layers: DEFAULT_LAYERS, onLayers: vi.fn(), hasTracing: false, tracingOpacity: 0.6, onTracingFile: vi.fn(), onTracingOpacity: vi.fn(), onRemoveTracing: vi.fn() }

it('picks the NAVI Web map look for the campus', () => {
  const onMapLook = vi.fn()
  render(<TerrainLayersPanel {...base} mapLook="green" onMapLook={onMapLook} />)
  const select = screen.getByLabelText('Map look on NAVI Web') as HTMLSelectElement
  expect(select.value).toBe('green')
  expect([...select.options].map((o) => o.textContent)).toEqual(['Green terraces', 'Vivid green', 'Neutral', 'Sand heights'])
  fireEvent.change(select, { target: { value: 'sand' } })
  expect(onMapLook).toHaveBeenCalledExactlyOnceWith('sand')
})

it('is disabled with a hint until the terrain is set up or while not editing', () => {
  render(<TerrainLayersPanel {...base} mapLook="green" onMapLook={vi.fn()} mapLookDisabled />)
  expect((screen.getByLabelText('Map look on NAVI Web') as HTMLSelectElement).disabled).toBe(true)
})

it('picks the NAVI Web road style for the campus (five designs)', () => {
  const onRoadStyle = vi.fn()
  render(<TerrainLayersPanel {...base} mapLook="green" onMapLook={vi.fn()} roadStyle="standard" onRoadStyle={onRoadStyle} />)
  const select = screen.getByLabelText('Road style on NAVI Web') as HTMLSelectElement
  expect(select.value).toBe('standard')
  expect([...select.options].map((o) => o.textContent)).toEqual(['Standard', 'Campus drive', 'Night', 'Brick paving', 'Minimal'])
  fireEvent.change(select, { target: { value: 'night' } })
  expect(onRoadStyle).toHaveBeenCalledExactlyOnceWith('night')
})
