import { fireEvent, render, screen } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import { afterEach, expect, it, vi } from 'vitest'
import { BuildingConnectivityPanel } from '../BuildingConnectivityPanel'

afterEach(() => vi.unstubAllGlobals())

it('checks the current draft from the selected road, filters floors, and invalidates old results', async () => {
  const document = { roads: [{ id: 'road', name: 'Main Road' }], terrainTiles: { tile: 'binary-data' } } as unknown as CampusDocument
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ buildingId: 'building', buildingName: 'Test Hall', origin: { label: 'Main Road', nodeId: 'outside' },
      floorLinks: [{ from: 'ground', to: 'upper', forward: 'outdoor', reverse: 'outdoor' }], floors: [
      { id: 'ground', level: 0, label: 'Ground Floor', groups: [{ total: 2, reachable: 2 }], entrances: [
        { id: 'door', label: 'Main entrance', outdoor: 'connected', indoor: 'connected' },
      ], rooms: [], issues: [], transitions: [] },
      { id: 'upper', level: 1, label: 'Floor 2', groups: [{ total: 1, reachable: 0 }], entrances: [], rooms: [], issues: [], transitions: [] },
    ] }),
  })
  vi.stubGlobal('fetch', mock)
  const props = { document, buildingId: 'building', activeLevel: 0, revision: 4 }
  const view = render(<BuildingConnectivityPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Validate Building' }))
  fireEvent.change(screen.getByLabelText('Outdoor start'), { target: { value: 'road' } })
  fireEvent.click(screen.getByRole('button', { name: 'Check current draft' }))
  expect(await screen.findByText('Outdoor point reachable')).toBeTruthy()
  const request = JSON.parse(mock.mock.calls[0][1].body)
  expect(request).toMatchObject({ buildingId: 'building', roadId: 'road', document: { roads: document.roads } })
  expect(request.document.terrainTiles).toBeUndefined()
  expect(screen.getByText('Building connectivity needs review')).toBeTruthy()
  expect(screen.getByText('Connected via outdoor route')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Floor to inspect'), { target: { value: 'upper' } })
  expect(screen.queryByText('Outdoor point reachable')).toBeNull()
  expect(screen.getByText('0/1 waypoints reachable · 1 route groups')).toBeTruthy()
  view.rerender(<BuildingConnectivityPanel {...props} revision={5} />)
  expect(screen.getByText('Draft or start changed. Run the check again.')).toBeTruthy()
  expect(screen.queryByText('0/1 waypoints reachable · 1 route groups')).toBeNull()
})
