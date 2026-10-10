import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import { Dataset360View } from '../dataset/Dataset360View'
import { resolveSelection } from '../dataset/dataset-selectors'
import type { DatasetSelection } from '../dataset/types'
import { makeCampusDocument } from './dataset-fixture'

const routerPush = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}))

/**
 * Focused 360-view tests against real panorama shapes from `makeCampusDocument`:
 *   pan-out-1 "Main Gate View" — outdoor (no buildingId), LatLng position,
 *                                heading 90, imageAssetId 'asset-out-1'
 *   pan-in-1  "CS Lobby"        — buildingId 'bld-cs', floor 1, LocalCoord
 *                                position, heading 0, imageAssetId 'asset-in-1'
 *
 * The view must stay a read-only LIST: no viewer, no hotspot data, no image
 * resolution, no writes. The only controls are navigation actions: the campus-level
 * "Edit Scenes in Studio" button, which pushes `/studio/{id}/edit`, and one
 * per-row "Open in Virtual Tour" button, which pushes the same URL with `&pano=<id>`.
 */

const CAMPUS_SELECTION: DatasetSelection = { kind: 'campus', id: 'map-ds-1' }

function renderView(options: {
  document?: CampusDocument | null
  selection?: DatasetSelection
}) {
  const campus = {
    id: 'map-ds-1',
    name: 'ASU Ibajay',
    schoolName: 'ASU',
    campusName: 'Ibajay Campus',
    center: { lat: 10, lng: 20 },
    boundary: [] as { lat: number; lng: number }[],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    stats: { buildings: 8, nodes: 100, edges: 148 },
  }
  const document = options.document === undefined ? makeCampusDocument() : options.document
  const selection = options.selection ?? CAMPUS_SELECTION
  const resolved = resolveSelection(campus, document, selection)
  return render(
    <Dataset360View
      campus={campus}
      document={document}
      selection={selection}
      resolved={resolved}
    />,
  )
}

describe('Dataset360View — real panorama records', () => {
  it('lists the outdoor panorama at campus scope with its authored fields', () => {
    renderView({})

    expect(screen.getByText('Main Gate View')).toBeDefined()
    expect(screen.getByText('CS Lobby')).toBeDefined()
    expect(screen.getByText('Context: Outdoor')).toBeDefined()
    expect(screen.getByText('Position: world 10.50000, 120.50000')).toBeDefined()
    expect(screen.getByText('Heading: 90°')).toBeDefined()
    expect(screen.getByText('Image: asset-out-1')).toBeDefined()
    expect(screen.getByText('outdoor')).toBeDefined()
  })

  it('lists the indoor panorama with building and floor context at building scope', () => {
    renderView({ selection: { kind: 'building', buildingId: 'bld-cs' } })

    expect(screen.getByText('CS Lobby')).toBeDefined()
    expect(screen.queryByText('Main Gate View')).toBeNull()
    expect(screen.getByText('Context: Computer Science Building / Second Floor')).toBeDefined()
    expect(screen.getByText('Position: building-local 0.00, 0.00 m')).toBeDefined()
    expect(screen.getByText('Heading: 0°')).toBeDefined()
    expect(screen.getByText('Image: asset-in-1')).toBeDefined()
    expect(screen.getByText('floor 1')).toBeDefined()
  })
})

describe('Dataset360View — selection filtering', () => {
  it('matches panoramas to floors by level', () => {
    renderView({ selection: { kind: 'floor', buildingId: 'bld-cs', floorId: 'flr-cs-0' } })
    expect(screen.getByText('No Virtual Tour scenes for this selection')).toBeDefined()
    expect(screen.queryByText('CS Lobby')).toBeNull()
  })

  it('shows the panorama only on the floor level it was authored on', () => {
    renderView({ selection: { kind: 'floor', buildingId: 'bld-cs', floorId: 'flr-cs-1' } })
    expect(screen.getByText('CS Lobby')).toBeDefined()
    expect(screen.queryByText('Main Gate View')).toBeNull()
  })

  it('shows no panorama association for an outdoor item', () => {
    renderView({ selection: { kind: 'outdoor', ref: 'poi:poi-out-1' } })
    expect(screen.getByText('No Virtual Tour scenes for this selection')).toBeDefined()
    expect(screen.queryByText('Main Gate View')).toBeNull()
    expect(screen.queryByText('CS Lobby')).toBeNull()
  })

  it('shows an honest empty state when the document has no panoramas', () => {
    renderView({ document: makeCampusDocument({ panoramas: [] }) })
    expect(screen.getByText('No Virtual Tour scenes for this selection')).toBeDefined()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('Dataset360View — honest unavailable states', () => {
  it('reports an empty image reference as unavailable instead of inventing one', () => {
    const doc = makeCampusDocument()
    doc.panoramas[0].imageAssetId = ''
    renderView({ document: doc })

    expect(screen.getByText('Main Gate View')).toBeDefined()
    expect(screen.getByText('Image: Not available')).toBeDefined()
    expect(screen.queryByText('Image: asset-out-1')).toBeNull()
  })

  it('drops the floor segment of the context when a panorama has no floor', () => {
    const doc = makeCampusDocument()
    doc.panoramas[1].floor = undefined
    renderView({ document: doc, selection: { kind: 'building', buildingId: 'bld-cs' } })

    expect(screen.getByText('Context: Computer Science Building')).toBeDefined()
    expect(screen.queryByText('Context: Computer Science Building / Second Floor')).toBeNull()
    expect(screen.getByText('building')).toBeDefined()
  })

  it('falls back to the raw floor level when that level is not authored on the building', () => {
    const doc = makeCampusDocument()
    doc.panoramas[1].floor = 99
    renderView({ document: doc, selection: { kind: 'building', buildingId: 'bld-cs' } })

    expect(screen.getByText('Context: Computer Science Building / Floor 99')).toBeDefined()
    expect(screen.queryByText('Context: Computer Science Building / Second Floor')).toBeNull()
  })

  it('degrades to an explicit unavailable state when the document is unavailable', () => {
    renderView({ document: null })

    expect(screen.getByText('Virtual Tour dataset unavailable')).toBeDefined()
    expect(screen.queryByText('Main Gate View')).toBeNull()
  })

  it('renders nothing for a deleted selection', () => {
    renderView({ selection: { kind: 'building', buildingId: 'bld-deleted' } })
    expect(screen.queryByText('360 Scenes')).toBeNull()
  })
})

describe('Dataset360View — read-only guarantees', () => {
  it('is a list only: every control is a navigation action', () => {
    renderView({})

    expect(screen.getByText('Main Gate View')).toBeDefined()
    // One header action plus one action per visible panorama row (one row at campus scope).
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Edit Scenes in Studio' })).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Open Main Gate View in Virtual Tour' }),
    ).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(
      screen.getByText(
        'Read-only dataset list — panorama playback, upload, and hotspot editing are not part of Dataset Management.',
      ),
    ).toBeDefined()
  })

  it('performs navigation only: no playback, upload, or hotspot controls appear', () => {
    renderView({ selection: { kind: 'building', buildingId: 'bld-cs' } })

    expect(screen.getByText('CS Lobby')).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})

describe('Dataset360View — Edit Scenes in Studio navigation', () => {
  beforeEach(() => routerPush.mockClear())

  it('opens the existing campus Studio editor from campus scope', () => {
    renderView({})
    expect(routerPush).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith('/studio/map-ds-1/edit')
  })

  it('is available at building scope and still targets the campus editor', () => {
    renderView({ selection: { kind: 'building', buildingId: 'bld-cs' } })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenCalledWith('/studio/map-ds-1/edit')
  })

  it('is available at floor scope', () => {
    renderView({ selection: { kind: 'floor', buildingId: 'bld-cs', floorId: 'flr-cs-1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenCalledWith('/studio/map-ds-1/edit')
  })

  it('is available at outdoor scope', () => {
    renderView({ selection: { kind: 'outdoor', ref: 'poi:poi-out-1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenCalledWith('/studio/map-ds-1/edit')
  })

  it('stays available when no document is loaded', () => {
    renderView({ document: null })

    expect(screen.getByRole('button', { name: 'Edit Scenes in Studio' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenCalledWith('/studio/map-ds-1/edit')
  })

  it('is not rendered for a deleted selection, which renders nothing', () => {
    renderView({ selection: { kind: 'building', buildingId: 'bld-deleted' } })

    expect(screen.queryByRole('button', { name: 'Edit Scenes in Studio' })).toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
  })
})

describe('Dataset360View - per-panorama row navigation', () => {
  const panoPath = (panoramaId: string) =>
    `/panoramas?campus=map-ds-1&pano=${panoramaId}`

  beforeEach(() => routerPush.mockClear())

  it('opens the outdoor panorama from campus scope', () => {
    renderView({})

    fireEvent.click(screen.getByRole('button', { name: 'Open Main Gate View in Virtual Tour' }))
    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith(panoPath('pan-out-1'))
  })

  it('opens the indoor panorama from building scope', () => {
    renderView({ selection: { kind: 'building', buildingId: 'bld-cs' } })

    fireEvent.click(screen.getByRole('button', { name: 'Open CS Lobby in Virtual Tour' }))
    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith(panoPath('pan-in-1'))
  })

  it('opens the panorama authored on that floor from floor scope', () => {
    renderView({ selection: { kind: 'floor', buildingId: 'bld-cs', floorId: 'flr-cs-1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Open CS Lobby in Virtual Tour' }))
    expect(routerPush).toHaveBeenCalledWith(panoPath('pan-in-1'))
    // The campus-scope panorama is not part of this floor's scope, so it must not be offered.
    expect(screen.queryByRole('button', { name: 'Open Main Gate View in Virtual Tour' })).toBeNull()
  })

  it('offers no row action at outdoor scope, where no panorama rows are visible', () => {
    renderView({ selection: { kind: 'outdoor', ref: 'poi:poi-out-1' } })

    expect(
      screen.getByText('No Virtual Tour scenes for this selection'),
    ).toBeDefined()
    expect(screen.queryByRole('button', { name: /^Open .* in Virtual Tour$/ })).toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
    // The header action is unaffected by the empty row list.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenCalledWith('/studio/map-ds-1/edit')
  })

  it('keeps the header action target separate from the row action target', () => {
    renderView({})

    fireEvent.click(screen.getByRole('button', { name: 'Edit Scenes in Studio' }))
    expect(routerPush).toHaveBeenLastCalledWith('/studio/map-ds-1/edit')

    fireEvent.click(screen.getByRole('button', { name: 'Open Main Gate View in Virtual Tour' }))
    expect(routerPush).toHaveBeenLastCalledWith(panoPath('pan-out-1'))
    expect(routerPush).toHaveBeenCalledTimes(2)
  })

  it('renders no row action when the document is unavailable', () => {
    renderView({ document: null })

    expect(screen.queryByRole('button', { name: /^Open .* in Virtual Tour$/ })).toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
  })
})

it('encodes scene identifiers for the dedicated Tour route', () => {
  const document = makeCampusDocument()
  document.panoramas[0].id = 'scene /?&'
  renderView({ document })
  fireEvent.click(screen.getByRole('button', { name: 'Open Main Gate View in Virtual Tour' }))
  expect(routerPush).toHaveBeenLastCalledWith('/panoramas?campus=map-ds-1&pano=scene%20%2F%3F%26')
})
