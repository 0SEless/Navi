import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Building } from '@navi/core'
import { StairClimbProperties } from '../StairClimbProperties'

afterEach(cleanup)

const drawing = (preset: string) => ({ definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset } })
function building(toLevel: number, preset = 'ushape'): Building {
  return {
    id: 'b', name: 'B',
    floors: [0, 1, 2].map((level) => ({ id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5 })),
    staircases: [{ id: 's', buildingId: 'b', name: 'S', type: 'standard', accessible: false, fromLevel: 0, toLevel,
      levels: { 0: { position: { x: 0, y: 0 }, rotation: 0, drawing: drawing(preset) }, ...(toLevel > 0 ? { [toLevel]: { role: 'top', position: { x: 0, y: 0 }, rotation: 0 } } : {}) } }],
  } as unknown as Building
}
function show(b: Building) {
  const onSetTo = vi.fn()
  const onDrawing = vi.fn()
  render(<StairClimbProperties building={b} featureId="s" onSetTo={onSetTo} onDrawing={onDrawing} />)
  return { onSetTo, onDrawing }
}

describe('StairClimbProperties', () => {
  it('shows the climb from Floor 1 to Floor 2 with its steps', () => {
    show(building(1))
    expect(screen.getByTestId('stair-climb').textContent).toBe('Climbs 3.50 m — Floor 1 (0.00 m) → Floor 2 (3.50 m) · 20 × 0.175 m')
  })

  it('To lists only this floor (no climb) and the floors above; choosing one sets it, the same one does nothing', () => {
    const { onSetTo } = show(building(1))
    const select = screen.getByLabelText('To') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['— stays on Floor 1 —', 'Floor 2', 'Floor 3'])
    fireEvent.change(select, { target: { value: '2' } })
    expect(onSetTo).toHaveBeenCalledWith(2)
    onSetTo.mockClear()
    fireEvent.change(select, { target: { value: '1' } })
    expect(onSetTo).not.toHaveBeenCalled()
  })

  it('Turn is offered for U-Shape only; Railings and Railing style for both (owner 2026-11-17)', () => {
    show(building(1, 'straight'))
    expect(screen.queryByLabelText('Turn')).toBeNull()
    expect(screen.queryByLabelText('Sides')).toBeNull()
    expect([...(screen.getByLabelText('Railings') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['None', 'Left', 'Right', 'Both'])
    expect([...(screen.getByLabelText('Railing style') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Posts and rails', 'Bars', 'Glass', 'Solid wall'])
    cleanup()
    const { onDrawing } = show(building(1))
    fireEvent.change(screen.getByLabelText('Turn'), { target: { value: 'left' } })
    expect(onDrawing).toHaveBeenCalledWith({ turn: 'left' })
    fireEvent.change(screen.getByLabelText('Railings'), { target: { value: 'left' } })
    expect(onDrawing).toHaveBeenCalledWith({ railings: 'left' })
    fireEvent.change(screen.getByLabelText('Railing style'), { target: { value: 'wall' } })
    expect(onDrawing).toHaveBeenCalledWith({ railingStyle: 'wall' })
  })

  it('an older stair shows its Sides setting as railings: open = None, wall = Both + Solid wall', () => {
    const b = building(1, 'straight')
    ;(b.staircases![0].levels[0].drawing!.properties as Record<string, unknown>).sides = 'wall'
    show(b)
    expect((screen.getByLabelText('Railings') as HTMLSelectElement).value).toBe('both')
    expect((screen.getByLabelText('Railing style') as HTMLSelectElement).value).toBe('wall')
  })

  it('a one-floor stair shows no climb line', () => {
    show(building(0))
    expect(screen.queryByTestId('stair-climb')).toBeNull()
  })

  it('a stair that names a floor above but has no top (older data) shows no climb and stays on its floor', () => {
    const b = building(1)
    delete (b.staircases![0].levels as Record<number, unknown>)[1]
    show(b)
    expect(screen.queryByTestId('stair-climb')).toBeNull()
    expect((screen.getByLabelText('To') as HTMLSelectElement).value).toBe('0')
  })

  it('Type chooses Straight or U-Shape (owner 2026-11-17: "how can I add what I want")', () => {
    const { onDrawing } = show(building(1, 'straight'))
    const type = screen.getByLabelText('Type') as HTMLSelectElement
    expect([...type.options].map((o) => o.textContent)).toEqual(['Straight', 'U-Shape'])
    expect(type.value).toBe('straight')
    fireEvent.change(type, { target: { value: 'ushape' } })
    expect(onDrawing).toHaveBeenCalledWith({ preset: 'ushape' })
  })

  it('terrain shape controls: Underneath, Steepness, Landings (add, move, remove) and Landing length', () => {
    const b = building(1, 'straight')
    ;(b.staircases![0].levels[0].drawing!.properties as Record<string, unknown>).landings = [0.5]
    const { onDrawing } = show(b)
    fireEvent.change(screen.getByLabelText('Underneath'), { target: { value: 'open' } })
    expect(onDrawing).toHaveBeenCalledWith({ underneath: 'open' })
    fireEvent.change(screen.getByLabelText('Steepness'), { target: { value: 'gentle' } })
    expect(onDrawing).toHaveBeenCalledWith({ steepness: 'gentle' })
    const pos = screen.getByLabelText('Landing 1 position (%)') as HTMLInputElement
    expect(pos.value).toBe('50')
    fireEvent.change(pos, { target: { value: '40' } })
    fireEvent.blur(pos)
    expect(onDrawing).toHaveBeenCalledWith({ landings: [0.4] })
    fireEvent.click(screen.getByRole('button', { name: 'Add landing' }))
    expect(onDrawing).toHaveBeenCalledWith({ landings: [0.5, 0.75] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove landing 1' }))
    expect(onDrawing).toHaveBeenCalledWith({ landings: [] })
    const len = screen.getByLabelText('Landing length (m)') as HTMLInputElement
    fireEvent.change(len, { target: { value: '2' } })
    fireEvent.blur(len)
    expect(onDrawing).toHaveBeenCalledWith({ landingLengthM: 2 })
  })

  it('a U-Shape stair has no Steepness or Landings (it has its own half-landing)', () => {
    show(building(1))
    expect(screen.queryByLabelText('Steepness')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add landing' })).toBeNull()
    expect(screen.getByLabelText('Underneath')).toBeTruthy()
  })
})

