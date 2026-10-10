import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { CampusDocument } from '@navi/core'
import type { CampusMap } from '@/types/campus-map'
import { DatasetImagesView } from '../dataset/DatasetImagesView'
import { resolveSelection } from '../dataset/dataset-selectors'
import type { DatasetSelection } from '../dataset/types'
import { makeCampusDocument } from './dataset-fixture'

const uploadBuildingCover = vi.hoisted(() => vi.fn())
vi.mock('@/services/building-cover-upload', () => ({ uploadBuildingCover }))

const STABLE_REFERENCE = '/api/building-cover?key=building-covers/map-ds-1/bld-cs/123e4567-e89b-42d3-a456-426614174000.webp'

const campus: CampusMap = {
  id: 'map-ds-1', name: 'ASU Ibajay', schoolName: 'ASU', campusName: 'Ibajay Campus',
  center: { lat: 10, lng: 20 }, boundary: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
  stats: { buildings: 8, nodes: 100, edges: 148 },
}

function renderBuilding(options: {
  metadata?: Record<string, unknown>
  onSaveCover?: (buildingId: string, reference: string | null) => Promise<void>
} = {}) {
  const document: CampusDocument = makeCampusDocument()
  document.buildings[0].metadata = options.metadata ?? {}
  const selection: DatasetSelection = { kind: 'building', buildingId: 'bld-cs' }
  const resolved = resolveSelection(campus, document, selection)
  const result = render(
    <DatasetImagesView
      campus={campus}
      document={document}
      selection={selection}
      resolved={resolved}
      onSaveCover={options.onSaveCover}
    />,
  )
  return { ...result, document }
}

function selectPng() {
  fireEvent.change(screen.getByLabelText('Select building cover image'), {
    target: { files: [new File(['png'], 'new-cover.png', { type: 'image/png' })] },
  })
}

describe('DatasetImagesView building cover controls', () => {
  beforeEach(() => uploadBuildingCover.mockReset())
  afterEach(() => vi.restoreAllMocks())

  it('keeps the controls unavailable without an authored-save callback', () => {
    renderBuilding()

    const uploadButton = screen.getByRole('button', { name: 'Upload cover image' })
    expect(uploadButton.hasAttribute('disabled')).toBe(true)
    expect(uploadButton.tagName).toBe('BUTTON')
    expect(uploadButton.getAttribute('type')).toBe('button')
    expect((uploadButton as HTMLButtonElement).style.minHeight).toBe('44px')
    expect(uploadButton.parentElement?.style.flexWrap).toBe('wrap')
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
    expect(screen.getByText(/authored document is not ready for cover changes/i)).toBeDefined()
  })

  it('keeps the previous image visible until the authored save is acknowledged', async () => {
    uploadBuildingCover.mockResolvedValue({ reference: STABLE_REFERENCE })
    let acknowledgeSave!: () => void
    const onSaveCover = vi.fn(() => new Promise<void>((resolve) => { acknowledgeSave = resolve }))
    renderBuilding({ metadata: { imageUrl: 'https://images.example.test/old-cover.jpg' }, onSaveCover })

    expect(screen.getByRole('img', { name: 'Front view of Computer Science Building' }).getAttribute('src'))
      .toBe('https://images.example.test/old-cover.jpg')
    selectPng()

    expect(await screen.findByText('Saving building cover…')).toBeDefined()
    expect(screen.getByRole('img', { name: 'Front view of Computer Science Building' }).getAttribute('src'))
      .toBe('https://images.example.test/old-cover.jpg')
    expect(onSaveCover).toHaveBeenCalledWith('bld-cs', STABLE_REFERENCE)
    expect((screen.getByRole('button', { name: 'Replace cover image' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Remove cover image' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Select building cover image') as HTMLInputElement).disabled).toBe(true)

    acknowledgeSave()
    expect(await screen.findByText('Building cover saved.')).toBeDefined()
    expect(screen.getByRole('img', { name: 'Front view of Computer Science Building' }).getAttribute('src'))
      .toBe(STABLE_REFERENCE)
  })

  it('preserves all existing cover aliases when authored persistence rejects a replacement', async () => {
    uploadBuildingCover.mockResolvedValue({ reference: STABLE_REFERENCE })
    const onSaveCover = vi.fn().mockRejectedValue(new Error('The building cover save was not confirmed by the server.'))
    renderBuilding({ metadata: { imageUrl: 'https://images.example.test/old.jpg', photoUrl: 'legacy-alias', image: 'older-alias' }, onSaveCover })

    selectPng()

    expect(await screen.findByRole('alert')).toHaveTextContent('The building cover save was not confirmed by the server.')
    expect(screen.getByRole('img', { name: 'Front view of Computer Science Building' }).getAttribute('src'))
      .toBe('https://images.example.test/old.jpg')
    expect(onSaveCover).toHaveBeenCalledWith('bld-cs', STABLE_REFERENCE)
  })

  it('asks before removing, clears the cover through authored persistence, and keeps the preview until success', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    let acknowledgeSave!: () => void
    const onSaveCover = vi.fn(() => new Promise<void>((resolve) => { acknowledgeSave = resolve }))
    renderBuilding({ metadata: { photoUrl: 'https://images.example.test/old.jpg', image: 'legacy-alias' }, onSaveCover })

    fireEvent.click(screen.getByRole('button', { name: 'Remove cover image' }))

    expect(confirm).toHaveBeenCalled()
    const removalPrompt = confirm.mock.calls[0]?.[0] ?? ''
    expect(removalPrompt).toMatch(/building.*default placeholder/i)
    expect(removalPrompt).not.toMatch(/permanent(?:ly)?\s+delet/i)
    expect(onSaveCover).toHaveBeenCalledWith('bld-cs', null)
    expect(await screen.findByText('Saving building cover…')).toBeDefined()
    expect(screen.getByRole('img', { name: 'Front view of Computer Science Building' }).getAttribute('src'))
      .toBe('https://images.example.test/old.jpg')

    acknowledgeSave()
    expect(await screen.findByText('Building cover removed.')).toBeDefined()
    expect(screen.queryByRole('img', { name: 'Front view of Computer Science Building' })).toBeNull()
    expect(screen.getByText('No building image')).toBeDefined()
  })

  it('restores keyboard focus to the remove action after authored removal fails', async () => {
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      return true
    })
    const onSaveCover = vi.fn().mockRejectedValue(new Error('The building cover save was not confirmed by the server.'))
    renderBuilding({ metadata: { imageUrl: 'https://images.example.test/old.jpg' }, onSaveCover })

    const removeButton = screen.getByRole('button', { name: 'Remove cover image' })
    removeButton.focus()
    fireEvent.click(removeButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('The building cover save was not confirmed by the server.')
    expect(document.activeElement).toBe(removeButton)
  })
})
