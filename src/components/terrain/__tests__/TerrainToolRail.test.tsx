import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TerrainToolRail } from '../TerrainToolRail'

afterEach(cleanup)

describe('TerrainToolRail (the bottom dock)', () => {
  it('the dock is a horizontal toolbar at the bottom centre', () => {
    render(<TerrainToolRail tool="raise-lower" disabled={false} onTool={vi.fn()} />)
    const dock = screen.getByRole('toolbar', { name: 'Terrain tools' })
    expect(dock.getAttribute('aria-orientation')).toBe('horizontal')
    expect(dock.style.bottom).toBe('12px')
    // Centred on the map right of the 240 px layers panel; scrolls instead of hiding under it when narrow.
    expect(dock.style.left).toBe('calc(50% + 120px)')
    expect(dock.style.maxWidth).toBe('calc(100% - 264px)')
    expect(dock.style.overflowX).toBe('auto')
    expect(screen.getByRole('button', { name: 'Raise / Lower' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Raise / Lower' }).getAttribute('title')).toBe('Raise / Lower: Hold Shift to do the opposite (B)')
  })

  it('Import terrain calls onImport', () => {
    const onImport = vi.fn()
    render(<TerrainToolRail tool="pan" disabled={false} onTool={vi.fn()} onImport={onImport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Import terrain' }))
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('Import terrain is disabled when importDisabled', () => {
    render(<TerrainToolRail tool="pan" disabled={false} onTool={vi.fn()} onImport={vi.fn()} importDisabled />)
    expect((screen.getByRole('button', { name: 'Import terrain' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('tools without the lock are disabled except alwaysOn', () => {
    render(<TerrainToolRail tool="pan" disabled alwaysOn={['pan', 'stairs']} onTool={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Smooth' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Move' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Stairs' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
