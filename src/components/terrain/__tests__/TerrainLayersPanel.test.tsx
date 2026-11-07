import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_LAYERS } from '@/lib/terrain/terrain-layers'
import { TerrainLayersPanel } from '../TerrainLayersPanel'

afterEach(cleanup)

function setup() {
  const onLayers = vi.fn()
  render(
    <TerrainLayersPanel
      layers={DEFAULT_LAYERS} onLayers={onLayers} hasTracing={false} tracingOpacity={0.6}
      onTracingFile={vi.fn()} onTracingOpacity={vi.fn()} onRemoveTracing={vi.fn()}
    />,
  )
  return onLayers
}

describe('TerrainLayersPanel', () => {
  it('each layer has an eye that toggles it', () => {
    const onLayers = setup()
    for (const name of ['Street map', 'Ground', 'Contour lines', 'Buildings', 'Roads and paths', 'Stairs and ramps', 'Boundary', 'Tracing image']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Street map' }))
    expect(onLayers).toHaveBeenCalledWith({ ...DEFAULT_LAYERS, streetMap: false })
  })

  it('the ground opacity slider reports 0..1', () => {
    const onLayers = setup()
    fireEvent.change(screen.getByLabelText('Ground opacity'), { target: { value: '80' } })
    expect(onLayers).toHaveBeenCalledWith({ ...DEFAULT_LAYERS, groundOpacity: 0.8 })
  })

  it('the street map opacity slider reports 0..1', () => {
    const onLayers = setup()
    fireEvent.change(screen.getByLabelText('Street map opacity'), { target: { value: '30' } })
    expect(onLayers).toHaveBeenCalledWith({ ...DEFAULT_LAYERS, streetMapOpacity: 0.3 })
  })

  it('sits on the left as a full-height panel', () => {
    setup()
    const panel = screen.getByRole('region', { name: 'Layers' })
    expect(panel.style.left).toBe('0px')
    expect(panel.style.top).toBe('0px')
    expect(panel.style.bottom).toBe('0px')
  })
})
