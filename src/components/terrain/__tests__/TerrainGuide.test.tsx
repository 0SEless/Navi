import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { guideSeen, markGuideSeen, TerrainGuide } from '../TerrainGuide'

afterEach(cleanup)

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key) },
    setItem: (key, value) => { data.set(key, value) },
  }
}

const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage

describe('TerrainGuide', () => {
  it('shows step 1 first and walks to step 4', () => {
    render(<TerrainGuide open onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Terrain guide' })
    expect(dialog.textContent).toContain('Layers — turn the street map, ground, buildings and more on or off on the left.')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(dialog.textContent).toContain('Tools — shape the ground with the dock at the bottom. Each tool has a letter key.')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(dialog.textContent).toContain('Import terrain — bring in a TopoExport .glb with its frame.geojson for real heights.')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(dialog.textContent).toContain('Tools — shape the ground')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(dialog.textContent).toContain('Done — saves your terrain and goes back to the editor.')
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it('Done closes', () => {
    const onClose = vi.fn()
    render(<TerrainGuide open onClose={onClose} />)
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when closed', () => {
    render(<TerrainGuide open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('guideSeen is false until markGuideSeen', () => {
    const storage = memoryStorage()
    expect(guideSeen(storage)).toBe(false)
    markGuideSeen(storage)
    expect(guideSeen(storage)).toBe(true)
  })

  it('guideSeen with a throwing storage is false (the guide shows)', () => {
    expect(guideSeen(throwing)).toBe(false)
    expect(() => markGuideSeen(throwing)).not.toThrow()
  })
})
