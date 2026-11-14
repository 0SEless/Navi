import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OpeningProperties } from '../OpeningProperties'
import type { Opening } from '@navi/core'
const opening: Opening = { id: 'window-1', type: 'window', wallId: 'wall-1', offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9 }
afterEach(cleanup)
describe('window opening properties', () => {
  it('offers door styles without materializing an unchanged default', () => {
    const update=vi.fn(()=>({success:true}))
    render(<OpeningProperties opening={{id:'door-opening',type:'door',wallId:'w',offset:1,width:1}} wallHeight={3.5} onUpdate={update}/>)
    expect((screen.getByLabelText('Door appearance') as HTMLSelectElement).value).toBe('solid')
    fireEvent.click(screen.getByRole('button',{name:'Apply opening changes'}));expect(update).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Door appearance'),{target:{value:'glass'}})
    fireEvent.click(screen.getByRole('button',{name:'Apply opening changes'}));expect(update).toHaveBeenCalledExactlyOnceWith({doorAppearance:'glass'})
  })
  it('applies one explicit edit with height above floor and aperture dimensions', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<OpeningProperties opening={opening} wallHeight={3.5} onUpdate={update} />)
    fireEvent.change(screen.getByLabelText('Window sill height (m)'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply opening changes' }))
    expect(update).toHaveBeenCalledExactlyOnceWith({ sillHeight: 1 })
  })
  it('rejects a window above the wall and does not call the command', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<OpeningProperties opening={opening} wallHeight={1.5} onUpdate={update} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply opening changes' }))
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/wall/i)
  })
  it('preserves values and exposes refused commands', () => {
    render(<OpeningProperties opening={opening} wallHeight={3.5} onUpdate={() => ({ success: false, error: 'Opening overlaps window-2' })} />)
    fireEvent.change(screen.getByLabelText('Window width (m)'), { target: { value: '1.4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply opening changes' }))
    expect(screen.getByRole('alert').textContent).toContain('window-2')
  })
  it('shows readable values without writing rounded geometry or legacy defaults', () => {
    const update = vi.fn(() => ({ success: true }))
    const legacy: Opening = { id: 'legacy', type: 'window', wallId: 'wall-1', width: 1.234567891, offset: 0.123456789 }
    render(<OpeningProperties opening={legacy} wallHeight={3.5} onUpdate={update} />)
    expect((screen.getByLabelText('Window width (m)') as HTMLInputElement).value).toBe('1.2346')
    expect(screen.getByRole('button', { name: 'Use Open window' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Apply opening changes' }))
    expect(update).not.toHaveBeenCalled()
  })
  it('validates edits against exact authored values rather than rounded display values', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<OpeningProperties opening={{ ...opening, height: 1.23456789, sillHeight: 0.9 }} wallHeight={2.13458} onUpdate={update} />)
    fireEvent.change(screen.getByLabelText('Window width (m)'), { target: { value: '1.3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply opening changes' }))
    expect(update).toHaveBeenCalledExactlyOnceWith({ width: 1.3 })
  })
  it('treats restoring the displayed initial values as unchanged', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<OpeningProperties opening={{ ...opening, width: 1.23456789 }} wallHeight={3.5} onUpdate={update} />)
    fireEvent.change(screen.getByLabelText('Window width (m)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Window width (m)'), { target: { value: '1.2346' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply opening changes' }))
    expect(update).not.toHaveBeenCalled()
  })
  it('explains wall coordinates and protects every control when disabled', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<OpeningProperties opening={opening} wallHeight={3.5} disabled onUpdate={update} />)
    expect(screen.getByText(/Wall X/)).toBeTruthy()
    expect(screen.getByText(/Floor Z/)).toBeTruthy()
    const wallY = screen.getByLabelText('Wall Y (m)') as HTMLInputElement
    expect(wallY.value).toBe('0')
    expect(wallY.readOnly).toBe(true)
    for (const control of [...screen.getAllByRole('spinbutton'), ...screen.getAllByRole('button')]) {
      expect((control as HTMLInputElement).disabled).toBe(true)
    }
    fireEvent.submit(screen.getByRole('form', { name: 'Opening properties' }))
    expect(update).not.toHaveBeenCalled()
  })
  it('window panel shows 9 thumbnails, applies on click, shows Position only for casement/awning/jalousie', () => {
    const update = vi.fn(() => ({ success: true }))
    const view = render(<OpeningProperties opening={opening} wallHeight={3.5} onUpdate={update} />)
    expect(screen.getAllByRole('button', { name: /^Use / })).toHaveLength(9)
    expect(screen.queryByLabelText('Window position')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Use Jalousie (louvre)' }))
    expect(update).toHaveBeenCalledExactlyOnceWith({ assetPreset: 'window.jalousie' })
    view.rerender(<OpeningProperties opening={{ ...opening, assetPreset: 'window.casement' }} wallHeight={3.5} onUpdate={update} />)
    fireEvent.change(screen.getByLabelText('Window position'), { target: { value: 'open' } })
    expect(update).toHaveBeenLastCalledWith({ windowPose: 'open' })
    fireEvent.click(screen.getByRole('button', { name: 'Material wood' }))
    expect(update).toHaveBeenLastCalledWith({ material: 'wood' })
  })
  it('shows a refused window look change', () => {
    render(<OpeningProperties opening={opening} wallHeight={3.5} onUpdate={() => ({ success: false, error: 'Window changed' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use Fixed window' }))
    expect(screen.getByRole('alert').textContent).toContain('Window changed')
  })
  it('switching an open casement to a fixed preset also clears its position', () => {
    const update = vi.fn(() => ({ success: true }))
    render(<OpeningProperties opening={{ ...opening, assetPreset: 'window.casement', windowPose: 'open' }} wallHeight={3.5} onUpdate={update} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use Fixed window' }))
    expect(update).toHaveBeenCalledExactlyOnceWith({ assetPreset: 'window.fixed', windowPose: undefined })
  })
})
