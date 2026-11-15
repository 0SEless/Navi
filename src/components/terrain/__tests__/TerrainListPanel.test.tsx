import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import { TerrainListPanel } from '../TerrainListPanel'

afterEach(cleanup)
const mesh = (id: string, name: string, hidden = false) => ({ id, name, hidden, outline: [], origin: { x: 0, y: 0 }, angleRad: 0, rowsAt: [0, 1], colsAt: [0, 1], mode: 'keep-bumps', z: [0, 0, 0, 0], edgeWidthM: 3, softM: 6 })
const document = {
  buildings: [{ id: 'b1' }, { id: 'b2' }],
  roads: [{ id: 'r1', name: 'Main drive', groundFit: { mode: 'both', blendMeters: 3 }, grade: { smoothness: 0.5 } }, { id: 'r2', name: 'Path' }],
  terrain: { grid: { originLat: 0, originLng: 0 }, meshes: [mesh('m1', 'Front gate slope'), mesh('m2', 'Court', true)] },
  terrainTiles: { '0_0': 'AAAA' },
} as unknown as CampusDocument

function setup(editing = true) {
  const dispatch = vi.fn(() => ({ success: true }))
  const onOpenMesh = vi.fn()
  const onOpenRoad = vi.fn()
  render(<TerrainListPanel document={document} editing={editing} dispatch={dispatch as never} onOpenMesh={onOpenMesh} onOpenRoad={onOpenRoad} />)
  return { dispatch, onOpenMesh, onOpenRoad }
}
const sent = (d: ReturnType<typeof vi.fn>) => (d.mock.calls.at(-1) as unknown as [{ id: string; payload: unknown }])[0]

describe('Terrain list', () => {
  it('lists the five groups in priority order with their items', () => {
    setup()
    const text = screen.getByRole('region', { name: 'Terrain list' }).textContent!
    const order = ['Buildings (2)', 'Roads (2)', 'Meshes (2)', 'Sculpting', 'Original ground'].map((t) => text.indexOf(t))
    expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]))).toBe(true)
    expect(screen.getByText('Main drive · graded')).toBeTruthy()
    expect(screen.getByText('Front gate slope')).toBeTruthy()
  })

  it('opens a mesh or a road for editing', () => {
    const { onOpenMesh, onOpenRoad } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Front gate slope' }))
    expect(onOpenMesh).toHaveBeenCalledWith('m1')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Main drive' }))
    expect(onOpenRoad).toHaveBeenCalledWith('r1')
  })

  it('each mesh action sends its command', () => {
    const { dispatch } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Front gate slope' }))
    expect(sent(dispatch)).toEqual(expect.objectContaining({ id: 'terrain.set-view', payload: { meshId: 'm1', hidden: true } }))
    fireEvent.click(screen.getByRole('button', { name: 'Show Court' }))
    expect(sent(dispatch).payload).toEqual({ meshId: 'm2', hidden: false })
    fireEvent.click(screen.getByRole('button', { name: 'Move Court up' }))
    expect(sent(dispatch)).toEqual(expect.objectContaining({ id: 'terrain.mesh.reorder', payload: { meshId: 'm2', toIndex: 0 } }))
    fireEvent.click(screen.getByRole('button', { name: 'Merge Court into ground' }))
    expect(sent(dispatch)).toEqual(expect.objectContaining({ id: 'terrain.mesh.merge', payload: { meshId: 'm2' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Court' }))
    expect(sent(dispatch)).toEqual(expect.objectContaining({ id: 'terrain.mesh.remove', payload: { meshId: 'm2' } }))
  })

  it('Sculpting: hide, and clear only after asking', () => {
    const { dispatch } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Hide sculpting' }))
    expect(sent(dispatch).payload).toEqual({ sculptingHidden: true })
    const calls = dispatch.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Clear sculpting' }))
    expect(dispatch.mock.calls.length).toBe(calls)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear' }))
    expect(sent(dispatch).id).toBe('terrain.sculpting.clear')
  })

  it('actions are off when not editing', () => {
    setup(false)
    expect((screen.getByRole('button', { name: 'Delete Court' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Remove spikes (owner 2026-11-15)', () => {
  it('cleans broken sculpting in one step and says how many cells it fixed', async () => {
    const { encodeTile, tileIdOf, TILE_CELLS } = await import('@navi/core')
    const t = new Int16Array(TILE_CELLS * TILE_CELLS)
    for (let i = 0; i < t.length; i++) t[i] = (i % TILE_CELLS) * 10
    t[50 * TILE_CELLS + 50] = 6500
    const id = tileIdOf(0, 0)
    const d = { ...document, terrainTiles: { [id]: encodeTile(t) } } as unknown as CampusDocument
    const dispatch = vi.fn(() => ({ success: true }))
    render(<TerrainListPanel document={d} editing dispatch={dispatch as never} onOpenMesh={vi.fn()} onOpenRoad={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove spikes' }))
    const call = (dispatch.mock.calls.at(-1) as unknown as [{ id: string; payload: { tiles: Record<string, string> } }])[0]
    expect(call.id).toBe('terrain.apply-tiles')
    expect(Object.keys(call.payload.tiles)).toEqual([id])
    expect(screen.getByRole('status').textContent).toMatch(/Fixed 1 cell/)
  })

  it('says so when there is nothing to fix', () => {
    const dispatch = vi.fn(() => ({ success: true }))
    render(<TerrainListPanel document={{ ...document, terrainTiles: {} } as unknown as CampusDocument} editing dispatch={dispatch as never} onOpenMesh={vi.fn()} onOpenRoad={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Remove spikes' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
