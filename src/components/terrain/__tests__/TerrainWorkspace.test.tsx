import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import { TerrainWorkspace, type TerrainWorkspaceProps } from '../TerrainWorkspace'

afterEach(cleanup)

function doc(withTerrain: boolean): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c1' }, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: [{ lat: 11.816, lng: 122.169 }, { lat: 11.8195, lng: 122.1735 }, { lat: 11.817, lng: 122.172 }] },
    ...(withTerrain ? { terrain: { reference: { name: 'Sea level', zeroMeaning: 'Mean sea level' }, grid: { originLat: 11.8158, originLng: 122.1688 }, colorRange: { minM: 0, maxM: 40 } } } : {}),
  } as unknown as CampusDocument
}

function setup(overrides: Partial<TerrainWorkspaceProps> = {}) {
  const props: TerrainWorkspaceProps = {
    document: doc(true),
    dispatch: vi.fn(() => ({ success: true })),
    lock: { status: 'held', holderName: null },
    onSave: vi.fn(async () => ({ ok: true as const })),
    onLeave: vi.fn(),
    ...overrides,
  }
  render(<TerrainWorkspace {...props} />)
  return props
}

describe('TerrainWorkspace', () => {
  it('shows first-visit choices when doc.terrain is absent', () => {
    setup({ document: doc(false) })
    expect(screen.getByRole('button', { name: 'Import ground' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Trace contours' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start flat' })).toBeTruthy()
  })

  it('Start flat sets up the terrain with the named reference', () => {
    const props = setup({ document: doc(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Start flat' }))
    fireEvent.change(screen.getByLabelText('Reference name'), { target: { value: 'Gate road' } })
    fireEvent.change(screen.getByLabelText('0 m means'), { target: { value: 'The main gate road' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create terrain' }))
    expect(props.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      id: 'terrain.setup',
      payload: { reference: { name: 'Gate road', zeroMeaning: 'The main gate road' } },
    }))
  })

  it('first visit shows why setting up was refused (for example, no campus boundary yet)', () => {
    setup({ document: doc(false), dispatch: vi.fn(() => ({ success: false, error: 'Draw the campus boundary first' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Start flat' }))
    fireEvent.change(screen.getByLabelText('Reference name'), { target: { value: 'Gate road' } })
    fireEvent.change(screen.getByLabelText('0 m means'), { target: { value: 'The main gate road' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create terrain' }))
    expect(screen.getByRole('alert').textContent).toBe('Draw the campus boundary first')
  })

  it('shows the height reference in the top bar', () => {
    setup()
    expect(screen.getByText(/Sea level/)).toBeTruthy()
    expect(screen.getByText(/0 m = Mean sea level/)).toBeTruthy()
  })

  it('view-only banner names the holder when the lock is held by another admin', () => {
    setup({ lock: { status: 'view-only', holderName: 'Ana' } })
    expect(screen.getByRole('status').textContent).toBe('Ana is editing the terrain. You can look, but not change it.')
  })

  it('Done saves then navigates back', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(props.onLeave).toHaveBeenCalledTimes(1))
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('a failed save keeps the user here with the message', async () => {
    const props = setup({ onSave: vi.fn(async () => ({ ok: false as const, message: 'Locked by another admin.' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Locked by another admin.'))
    expect(props.onLeave).not.toHaveBeenCalled()
  })
})
