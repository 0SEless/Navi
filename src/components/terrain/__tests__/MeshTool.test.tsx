import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { toLatLng, type CampusDocument } from '@navi/core'
import { MeshTool } from '../tools/MeshTool'
import { TERRAIN_TOOLS } from '../TerrainToolRail'

afterEach(cleanup)
const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const lasso = [ll(0, 0), ll(30, 0), ll(30, 30), ll(0, 30)]
const document = { terrain: { grid, reference: { name: 'T', zeroMeaning: 'Sea' }, colorRange: { minM: 0, maxM: 40 } }, buildings: [], roads: [] } as unknown as CampusDocument
const sampler = { grid, groundAt: () => 2, heightAt: () => 2, sculptedAt: () => 2, baseAt: () => 2, changeAt: () => 0, fitAt: () => 0 }

function fakeMap() {
  const layers = new Map<string, unknown>()
  const sources = new Map<string, { setData: (d: unknown) => void; data?: unknown }>()
  return {
    layers, sources, alive: true,
    on: vi.fn(), off: vi.fn(), isStyleLoaded: () => true, getStyle: () => ({}),
    getLayer(id: string) { if (!this.alive) throw new TypeError('gone'); return layers.get(id) },
    getSource(id: string) { if (!this.alive) throw new TypeError('gone'); return sources.get(id) },
    addSource(id: string, spec: { data: unknown }) { sources.set(id, { data: spec.data, setData(d) { this.data = d } }) },
    addLayer(layer: { id: string }) { layers.set(layer.id, layer) },
    removeLayer(id: string) { if (!this.alive) throw new TypeError('gone'); layers.delete(id) },
    removeSource(id: string) { if (!this.alive) throw new TypeError('gone'); sources.delete(id) },
  }
}

function setup(over: Partial<Parameters<typeof MeshTool>[0]> = {}) {
  const map = fakeMap()
  const dispatch = vi.fn(() => ({ success: true }))
  const onDraft = vi.fn()
  const onLassoReset = vi.fn()
  const view = render(<MeshTool map={map as never} document={document} sampler={sampler as never} active lassoPoints={lasso} onLassoReset={onLassoReset} dispatch={dispatch as never} onDraft={onDraft} {...over} />)
  return { map, dispatch, onDraft, onLassoReset, view }
}

describe('Mesh tool', () => {
  it('the tool rail offers Mesh (M) and Grade (G)', () => {
    expect(TERRAIN_TOOLS.find((t) => t.id === 'mesh')?.key).toBe('m')
    expect(TERRAIN_TOOLS.find((t) => t.id === 'grade')?.key).toBe('g')
  })

  it('switching selection modes keeps button styles consistent (no border/borderColor mix)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Make mesh' }))
    for (const name of ['Row', 'Point', 'Smooth out', 'Keep bumps']) fireEvent.click(screen.getByRole('button', { name }))
    const mixed = error.mock.calls.filter((c) => String(c[0]).includes('style property during rerender'))
    error.mockRestore()
    expect(mixed).toEqual([])
  })

  it('makes a mesh from the lasso and shows its controls; the draft feeds the live preview', () => {
    const { onDraft, onLassoReset } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Make mesh' }))
    expect(onLassoReset).toHaveBeenCalled()
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ rowsAt: expect.any(Array), mode: 'keep-bumps' }))
    for (const name of ['Point', 'Row', 'Column', 'Box', 'Keep bumps', 'Smooth out', 'Raise selected', 'Lower selected', '+ Row', '+ Column', 'Level all', 'Pick from map', 'Confirm', 'Cancel']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.getByLabelText('Soft (m)')).toBeTruthy()
    expect(screen.getByLabelText('Edge width (m)')).toBeTruthy()
    expect(screen.getByLabelText('Height (m)')).toBeTruthy()
  })

  it('Row mode then a point selects the whole row; raising it changes the draft', () => {
    const { onDraft } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Make mesh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Row' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select point 2, 3' }))
    expect(screen.getByText('Selected: 4 points')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Raise selected' }))
    const draft = onDraft.mock.calls.at(-1)![0]
    expect(draft.z.slice(4, 8).every((v: number) => v > 0)).toBe(true)
    expect(draft.z.slice(0, 4).every((v: number) => v === 0)).toBe(true)
  })

  it('Confirm adds the mesh once and closes; Cancel adds nothing and clears the preview', () => {
    const first = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Make mesh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(first.dispatch).toHaveBeenCalledTimes(1)
    expect((first.dispatch.mock.calls[0] as unknown as [{ id: string }])[0].id).toBe('terrain.mesh.add')
    expect(first.onDraft).toHaveBeenLastCalledWith(null)
    cleanup()
    const second = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Make mesh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(second.dispatch).not.toHaveBeenCalled()
    expect(second.onDraft).toHaveBeenLastCalledWith(null)
  })

  it('leaving the Mesh tool cancels the open edit and clears the preview', () => {
    const { onDraft, view, dispatch, map } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Make mesh' }))
    view.rerender(<MeshTool map={map as never} document={document} sampler={sampler as never} active={false} lassoPoints={[]} onLassoReset={vi.fn()} dispatch={dispatch as never} onDraft={onDraft} />)
    expect(onDraft).toHaveBeenLastCalledWith(null)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('draws the sheet on the map and cleans up without throwing when the map is already gone', () => {
    const { map, view } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Make mesh' }))
    expect(map.sources.has('mesh-sheet')).toBe(true)
    map.alive = false
    expect(() => view.unmount()).not.toThrow()
  })
})
