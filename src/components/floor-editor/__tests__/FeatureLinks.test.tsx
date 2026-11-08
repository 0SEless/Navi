import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Building } from '@navi/core'
import { FeatureLinks } from '../FeatureLinks'

afterEach(cleanup)

const item = (id: string, name: string, level: number, links?: { below?: string; above?: string }) => ({
  id, buildingId: 'b', name, type: 'standard', accessible: false, fromLevel: level, toLevel: level,
  levels: { [level]: { position: { x: 0, y: 0 }, rotation: 0 } }, ...(links ? { links } : {}),
})

function building(): Building {
  return {
    id: 'b', name: 'B',
    floors: [0, 1, 2].map((level) => ({ id: `f${level}`, level, label: `${level + 1}F` })),
    staircases: [item('a', 'Stair A', 0, { above: 'b' }), item('b', 'Stair B', 1, { below: 'a' }), item('b2', 'Stair B2', 1), item('c', 'Stair C', 2)],
    elevators: [{ ...item('l0', 'Lift 0', 0), type: 'passenger' }, { ...item('l1', 'Lift 1', 1), type: 'passenger' }],
  } as unknown as Building
}

function show(featureId: string, featureType: 'staircase' | 'elevator' = 'staircase') {
  const onLink = vi.fn()
  const onUnlink = vi.fn()
  render(<FeatureLinks building={building()} featureType={featureType} featureId={featureId} onLink={onLink} onUnlink={onUnlink} />)
  return { onLink, onUnlink }
}

describe('FeatureLinks', () => {
  it('shows Connects down to 1F · Stair A and Connects up to — not connected —', () => {
    show('b')
    expect((screen.getByLabelText('Connects down to') as HTMLSelectElement).selectedOptions[0].textContent).toBe('1F · Stair A')
    expect((screen.getByLabelText('Connects up to') as HTMLSelectElement).selectedOptions[0].textContent).toBe('— not connected —')
  })

  it("the dropdown lists only the adjacent floor's stairs", () => {
    show('b')
    const up = screen.getByLabelText('Connects up to') as HTMLSelectElement
    expect([...up.options].map((o) => o.textContent)).toEqual(['— not connected —', '3F · Stair C'])
  })

  it('choosing one dispatches a link (lower, upper)', () => {
    const { onLink } = show('b')
    fireEvent.change(screen.getByLabelText('Connects up to'), { target: { value: 'c' } })
    expect(onLink).toHaveBeenCalledWith('b', 'c')
  })

  it('Disconnect dispatches an unlink of that side', () => {
    const { onUnlink } = show('b')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect down' }))
    expect(onUnlink).toHaveBeenCalledWith('below')
  })

  it('No floor above on the top floor, No floor below on the ground floor', () => {
    show('c')
    expect(screen.getByText('No floor above')).toBeTruthy()
    cleanup()
    show('a')
    expect(screen.getByText('No floor below')).toBeTruthy()
  })

  it('a lift lists lifts only', () => {
    show('l1', 'elevator')
    const down = screen.getByLabelText('Connects down to') as HTMLSelectElement
    expect([...down.options].map((o) => o.textContent)).toEqual(['— not connected —', '1F · Lift 0'])
  })
})
