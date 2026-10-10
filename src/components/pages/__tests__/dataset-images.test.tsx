import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import { DatasetImagesView } from '../dataset/DatasetImagesView'
import { resolveSelection } from '../dataset/dataset-selectors'
import type { DatasetSelection } from '../dataset/types'
import { makeCampusDocument } from './dataset-fixture'

/**
 * Focused Images-view tests against real existing data shapes only:
 *   CampusMap.imageUrl, building.metadata.imageUrl|photoUrl|image, and the
 *   same three metadata keys on outdoor/indoor POIs.
 *
 * The fixture's panoramas (`imageAssetId`) and floor plans (`planImageId`) are
 * asserted to stay OUT of the view — those belong to other systems.
 */

const mockMap = (overrides: Partial<CampusMap> = {}): CampusMap => ({
  id: 'map-ds-1',
  name: 'ASU Ibajay',
  schoolName: 'ASU',
  campusName: 'Ibajay Campus',
  center: { lat: 10, lng: 20 },
  boundary: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  stats: { buildings: 8, nodes: 100, edges: 148 },
  ...overrides,
})

/** The fixture document with all three supported reference kinds populated. */
function documentWithImages(): CampusDocument {
  const doc = makeCampusDocument()
  doc.buildings[0].metadata = { imageUrl: '/campus/cs-building.jpg' }
  doc.buildings[1].metadata = { photoUrl: 'asset-annex-photo' }
  const groundFloor = doc.buildings[0].floors[0]
  if (groundFloor.pois?.[0]) {
    groundFloor.pois[0].metadata = { imageUrl: '/campus/help-desk.jpg' }
  }
  if (doc.pois?.[0]) {
    doc.pois[0].metadata = { image: '/campus/main-gate.jpg' }
  }
  return doc
}

function renderImages(options: {
  campus?: CampusMap
  document?: CampusDocument | null
  selection?: DatasetSelection
}) {
  const campus = options.campus ?? mockMap()
  const document = options.document === undefined ? makeCampusDocument() : options.document
  const selection: DatasetSelection = options.selection ?? { kind: 'campus', id: campus.id }
  const resolved = resolveSelection(campus, document, selection)
  return render(
    <DatasetImagesView
      campus={campus}
      document={document}
      selection={selection}
      resolved={resolved}
    />,
  )
}

describe('DatasetImagesView — existing image sources', () => {
  it('shows a primary building image, use locations, and stable failure state', () => {
    renderImages({ document: documentWithImages(), selection: { kind: 'building', buildingId: 'bld-cs' } })
    expect(screen.getByRole('heading', { name: 'Primary Building Image' })).toBeDefined()
    expect(screen.getByText(/Explore Campus cards/)).toBeDefined()
    const image = screen.getByRole('img', { name: 'Front view of Computer Science Building' })
    expect(image.getAttribute('src')).toBe('/campus/cs-building.jpg')
    fireEvent.error(image)
    expect(screen.getByText('Building image unavailable')).toBeDefined()
  })
  it('lists campus, building, and POI image references with their context at campus scope', () => {
    renderImages({
      campus: mockMap({ imageUrl: '/campus/asu-ibajay.jpg' }),
      document: documentWithImages(),
    })

    // Owners, by display label
    expect(screen.getByText('ASU Ibajay')).toBeDefined()
    expect(screen.getByText('Computer Science Building')).toBeDefined()
    expect(screen.getByText('Storage Annex')).toBeDefined()
    expect(screen.getByText('Main Gate')).toBeDefined()
    expect(screen.getByText('Help Desk')).toBeDefined()

    // Sources named verbatim so the origin of each reference is auditable
    expect(screen.getByText('Source: CampusMap.imageUrl')).toBeDefined()
    expect(screen.getAllByText('Source: metadata.imageUrl').length).toBe(2)
    expect(screen.getByText('Source: metadata.photoUrl')).toBeDefined()
    expect(screen.getByText('Source: metadata.image')).toBeDefined()

    // Context breadcrumbs
    expect(screen.getByText('Campus')).toBeDefined()
    expect(screen.getByText('ASU Ibajay / Computer Science Building')).toBeDefined()
    expect(screen.getByText('ASU Ibajay / Computer Science Building / Ground Floor')).toBeDefined()
    expect(screen.getByText('ASU Ibajay / Main Gate')).toBeDefined()
  })

  it('renders a renderable reference as an image with the owner as alt text', () => {
    renderImages({
      campus: mockMap({ imageUrl: '/campus/asu-ibajay.jpg' }),
      document: makeCampusDocument({ buildings: [] }),
    })

    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('/campus/asu-ibajay.jpg')
    expect(img.getAttribute('alt')).toBe('ASU Ibajay')
    expect(screen.getByText('/campus/asu-ibajay.jpg')).toBeDefined()
  })

  it('shows an opaque asset id as a reference instead of a broken image request', () => {
    renderImages({
      campus: mockMap({ imageUrl: 'asset-campus-preview' }),
      document: makeCampusDocument({ buildings: [] }),
    })

    expect(screen.getByText('Reference only')).toBeDefined()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('asset-campus-preview')).toBeDefined()
    expect(screen.queryByText('Unavailable')).toBeNull()
  })
})

describe('DatasetImagesView — selection scoping', () => {
  it('shows only the selected building and its indoor POIs', () => {
    renderImages({
      document: documentWithImages(),
      selection: { kind: 'building', buildingId: 'bld-cs' },
    })

    expect(screen.getByText('Computer Science Building')).toBeDefined()
    expect(screen.getByText('Help Desk')).toBeDefined()
    expect(screen.queryByText('Storage Annex')).toBeNull()
    expect(screen.queryByText('Main Gate')).toBeNull()
    expect(screen.queryByText('ASU Ibajay')).toBeNull()
  })

  it('shows only the selected floor\'s indoor POI references', () => {
    renderImages({
      document: documentWithImages(),
      selection: { kind: 'floor', buildingId: 'bld-cs', floorId: 'flr-cs-0' },
    })

    expect(screen.getByText('Help Desk')).toBeDefined()
    expect(screen.getByText('ASU Ibajay / Computer Science Building / Ground Floor')).toBeDefined()
    expect(screen.queryByText('Computer Science Building')).toBeNull()
  })

  it('shows the selected outdoor POI reference only', () => {
    renderImages({
      document: documentWithImages(),
      selection: { kind: 'outdoor', ref: 'poi:poi-out-1' },
    })

    expect(screen.getByText('Main Gate')).toBeDefined()
    expect(screen.queryByText('Help Desk')).toBeNull()
    expect(screen.queryByText('Computer Science Building')).toBeNull()
  })

  it('shows an honest empty state for a floor with no authored POI images', () => {
    renderImages({
      document: makeCampusDocument(),
      selection: { kind: 'floor', buildingId: 'bld-cs', floorId: 'flr-cs-1' },
    })

    expect(screen.getByText('No image references for this selection')).toBeDefined()
    expect(screen.queryByText('Main Gate View')).toBeNull()
    expect(screen.queryByText('CS Lobby')).toBeNull()
  })

  it('shows an honest empty state for an outdoor area, which owns no image field', () => {
    renderImages({
      document: makeCampusDocument(),
      selection: { kind: 'outdoor', ref: 'area:area-1' },
    })

    expect(screen.getByText('No image references for this selection')).toBeDefined()
  })

  it('shows an honest empty state when no reference is authored anywhere', () => {
    renderImages({ document: makeCampusDocument() })

    expect(screen.getByText('No image references for this selection')).toBeDefined()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText(/none are authored in this scope/i)).toBeDefined()
  })
})

describe('DatasetImagesView — excluded image systems stay excluded', () => {
  it('never lists floor-plan or panorama images as general images', () => {
    const doc = documentWithImages()
    const groundFloor = doc.buildings[0].floors[0]
    groundFloor.planImageId = '/plans/ground-floor.png'
    groundFloor.floorPlanState = 'active'

    renderImages({ campus: mockMap({ imageUrl: '/campus/asu-ibajay.jpg' }), document: doc })

    // Floor plan (Floor.planImageId) — belongs to the floor-plan system.
    expect(screen.queryByText(/ground-floor\.png/)).toBeNull()
    // Panoramas (Panorama.imageAssetId) — belong to the 360/R2 pipeline.
    expect(screen.queryByText('Main Gate View')).toBeNull()
    expect(screen.queryByText('CS Lobby')).toBeNull()
    expect(screen.queryByText('asset-out-1')).toBeNull()
    expect(screen.queryByText('asset-in-1')).toBeNull()
    // The supported references are still listed.
    expect(screen.getByText('Source: CampusMap.imageUrl')).toBeDefined()
    expect(screen.getByText('Help Desk')).toBeDefined()
  })
})

describe('DatasetImagesView — degradation and read-only guarantees', () => {
  it('degrades to campus-level only when the authored document is unavailable', () => {
    renderImages({
      campus: mockMap({ imageUrl: '/campus/asu-ibajay.jpg' }),
      document: null,
    })

    expect(screen.getByText(/authored document is not available for this campus/)).toBeDefined()
    expect(screen.getByText('ASU Ibajay')).toBeDefined()
    expect(screen.queryByText('Computer Science Building')).toBeNull()
    expect(screen.queryByText('No image references for this selection')).toBeNull()
  })

  it('renders nothing for a deleted selection', () => {
    renderImages({
      document: makeCampusDocument(),
      selection: { kind: 'building', buildingId: 'bld-deleted' },
    })

    expect(screen.queryByText('Images')).toBeNull()
  })

  it('keeps campus-scope inventory free of building upload controls', () => {
    renderImages({
      campus: mockMap({ imageUrl: '/campus/asu-ibajay.jpg' }),
      document: documentWithImages(),
    })

    expect(screen.getByText(/Uploading, replacing, or deleting images is not available/)).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
