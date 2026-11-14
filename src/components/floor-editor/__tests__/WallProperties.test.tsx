import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Wall } from '@navi/core'
import { WallProperties } from '../WallProperties'
const wall: Wall = { id: 'wall-1', start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, height: 3.5, thickness: 0.15 }
afterEach(cleanup)
describe('wall properties', () => {
  it('applies height and thickness as one explicit working-draft edit', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<WallProperties wall={wall} floorHeight={3.5} onUpdate={update} />)
    fireEvent.change(screen.getByLabelText('Wall height (m)'), { target: { value: '1.1' } })
    fireEvent.change(screen.getByLabelText('Wall thickness (m)'), { target: { value: '0.2' } })
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply wall changes' }))
    expect(update).toHaveBeenCalledExactlyOnceWith({ height: 1.1, thickness: 0.2 })
  })
  it('copies floor height into the draft without silently saving', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<WallProperties wall={{ ...wall, height: 1 }} floorHeight={4} onUpdate={update} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use floor height' }))
    expect((screen.getByLabelText('Wall height (m)') as HTMLInputElement).value).toBe('4')
    expect(update).not.toHaveBeenCalled()
  })
  it('shows a refused command and keeps the chosen values', () => {
    render(<WallProperties wall={wall} floorHeight={3.5} onUpdate={() => ({ success: false, error: 'Window win exceeds the wall' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply wall changes' }))
    expect(screen.getByRole('alert').textContent).toContain('Window win')
  })
  it('prevents editing or applying in read-only mode', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<WallProperties wall={wall} floorHeight={3.5} disabled onUpdate={update} />)
    expect((screen.getByLabelText('Wall height (m)') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Apply wall changes' }))
    expect(update).not.toHaveBeenCalled()
  })
})
