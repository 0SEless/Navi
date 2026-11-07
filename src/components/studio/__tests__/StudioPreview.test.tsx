import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/components/public/ExploreMap', () => ({
  default: ({ bundle, route }: { bundle: { buildings: unknown[] }; route: { path: string[] } | null }) => (
    <div data-testid="visitor-map">buildings {bundle.buildings.length}; route {route ? route.path.join(',') : 'none'}</div>
  ),
}))

import { parsePublicCampus } from '@/store/public-store'
import { PreviewButton, StudioPreview, type PreviewLoad } from '../StudioPreview'

afterEach(cleanup)

const node = (id: string, lng: number) => ({ id, type: 'junction', position: { lat: 11.8, lng }, floor: 0, buildingId: '', label: id })
const campus = {
  campusId: 'c1', campusName: 'Campus', source: 'published_maps', revision: 7,
  buildings: [{ id: 'b1', name: 'Hall', footprint: [{ lat: 11.8, lng: 122.1 }, { lat: 11.8, lng: 122.1001 }, { lat: 11.8001, lng: 122.1001 }] }],
  components: [], doors: [], traces: [], pois: [], boundary: null,
  nodes: [node('n1', 122.1), node('n2', 122.1002)],
  edges: [{ id: 'e1', from: 'n1', to: 'n2', type: 'stairs', distance: 20, bidirectional: true }],
  artifacts: { searchIndex: [
    { id: 's1', label: 'Lower road', type: 'facility', nodeId: 'n1' },
    { id: 's2', label: '2F lobby', type: 'room', nodeId: 'n2' },
  ] },
}

const loaded = (): PreviewLoad => vi.fn(async () => ({ ok: true as const, campus }))

describe('parsePublicCampus', () => {
  it('turns the preview campus into the same bundle NAVI Web builds', () => {
    const result = parsePublicCampus(campus, 'c1')!
    expect(result.bundle.buildings.map((b) => b.id)).toEqual(['b1'])
    expect(result.bundle.nodes).toHaveLength(2)
    expect(result.bundle.searchEntries.map((e) => e.label)).toEqual(['Lower road', '2F lobby'])
    expect(parsePublicCampus({ ...campus, campusId: 'other' }, 'c1')).toBeNull()
  })
})

describe('StudioPreview', () => {
  it('the banner names the save', async () => {
    await act(async () => { render(<StudioPreview campusId="c1" commitNo={7} load={loaded()} />) })
    expect(screen.getByText('Preview — not published. Showing save #7.')).toBeTruthy()
    expect(screen.getByTestId('visitor-map').textContent).toContain('buildings 1')
  })

  it('a failed build lists the problems', async () => {
    const load: PreviewLoad = vi.fn(async () => ({ ok: false as const, code: 'ROUTE_INVALID', problems: ['Stair route out of step: the stair was deleted'] }))
    await act(async () => { render(<StudioPreview campusId="c1" commitNo={7} load={load} />) })
    expect(screen.getByText('Publish would be refused. Fix these first:')).toBeTruthy()
    expect(screen.getByText('Stair route out of step: the stair was deleted')).toBeTruthy()
  })

  it('the route test draws the route found between A and B', async () => {
    await act(async () => { render(<StudioPreview campusId="c1" commitNo={7} load={loaded()} />) })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'n1' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'n2' } })
    expect(screen.getByTestId('visitor-map').textContent).toContain('route n1,n2')
    expect(screen.getByText(/20 m, with stairs/)).toBeTruthy()
  })
})

describe('PreviewButton', () => {
  it('Preview with unsaved changes asks Save first?', () => {
    render(<PreviewButton mapId="c1" dirty headCommit={4} save={vi.fn()} open={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByText('Save first?')).toBeTruthy()
  })

  it('Save and preview saves then opens the new save', async () => {
    const save = vi.fn(async () => 5)
    const open = vi.fn()
    render(<PreviewButton mapId="c1" dirty headCommit={4} save={save} open={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save and preview' })) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('/studio/c1/preview?commit=5')
  })

  it('Preview last save opens without saving', () => {
    const save = vi.fn()
    const open = vi.fn()
    render(<PreviewButton mapId="c1" dirty headCommit={4} save={save} open={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview last save' }))
    expect(save).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('/studio/c1/preview?commit=4')
  })

  it('with everything saved it opens at once', () => {
    const open = vi.fn()
    render(<PreviewButton mapId="c1" dirty={false} headCommit={4} save={vi.fn()} open={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(open).toHaveBeenCalledWith('/studio/c1/preview?commit=4')
  })
})
