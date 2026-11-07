import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { addPickedFiles, missingTerrainFile, TerrainImportPanel } from '../TerrainImportPanel'

afterEach(cleanup)

const file = (name: string) => new File(['x'], name)

function setup() {
  const props = { hasChanges: false, onImport: vi.fn(), onCancel: vi.fn() }
  render(<TerrainImportPanel {...props} />)
  return props
}

const pick = (...names: string[]) => fireEvent.change(screen.getByLabelText('Terrain files'), { target: { files: names.map(file) } })
const chosen = () => screen.queryAllByRole('listitem').map((item) => item.getAttribute('data-file'))

describe('addPickedFiles', () => {
  it('adds a second pick to the first instead of replacing it', () => {
    expect(addPickedFiles([file('ground.glb')], [file('frame.geojson')]).map((f) => f.name)).toEqual(['ground.glb', 'frame.geojson'])
  })

  it('a new .glb replaces the old .glb', () => {
    expect(addPickedFiles([file('old.glb'), file('frame.geojson')], [file('new.glb')]).map((f) => f.name)).toEqual(['frame.geojson', 'new.glb'])
  })

  it('the same file picked twice is kept once', () => {
    expect(addPickedFiles([file('frame.geojson')], [file('frame.geojson')]).map((f) => f.name)).toEqual(['frame.geojson'])
  })

  it('ignores files that are not .glb or GeoJSON', () => {
    expect(addPickedFiles([], [file('photo.png'), file('lines.json')]).map((f) => f.name)).toEqual(['lines.json'])
  })
})

describe('missingTerrainFile', () => {
  it('a .glb alone still needs its frame file', () => {
    expect(missingTerrainFile([file('ground.glb')])).toBe('frame.geojson')
  })

  it('a frame file alone still needs the .glb', () => {
    expect(missingTerrainFile([file('frame.geojson')])).toBe('the TopoExport .glb')
  })

  it('a .glb with its frame, or one contour file, needs nothing more', () => {
    expect(missingTerrainFile([file('ground.glb'), file('frame.geojson')])).toBeNull()
    expect(missingTerrainFile([file('contours.geojson')])).toBeNull()
  })
})

describe('TerrainImportPanel', () => {
  it('picking the .glb and then the frame file in two goes keeps both and allows Import', () => {
    setup()
    pick('ground.glb')
    expect(screen.getByText(/Still needed: frame\.geojson/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true)
    pick('frame.geojson')
    expect(chosen()).toEqual(['ground.glb', 'frame.geojson'])
    expect(screen.queryByText(/Still needed/)).toBeNull()
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('the remove button takes a file off the list', () => {
    setup()
    pick('ground.glb', 'frame.geojson')
    fireEvent.click(screen.getByRole('button', { name: 'Remove ground.glb' }))
    expect(chosen()).toEqual(['frame.geojson'])
  })

  it('files dropped on the panel are added to the list', () => {
    setup()
    fireEvent.drop(screen.getByTestId('terrain-drop'), { dataTransfer: { files: [file('ground.glb'), file('frame.geojson')] } })
    expect(chosen()).toEqual(['ground.glb', 'frame.geojson'])
  })

  it('shows why the import was refused (for example, no campus boundary yet)', async () => {
    const onImport = vi.fn(() => ({ success: false, error: 'Draw the campus boundary first' }))
    render(<TerrainImportPanel hasChanges={false} onImport={onImport} onCancel={vi.fn()} />)
    const contours = readFileSync(join(__dirname, '../../../../packages/core/src/terrain/__tests__/fixtures/topoexport-contours-edtm-30m.geojson'), 'utf-8')
    fireEvent.change(screen.getByLabelText('Terrain files'), { target: { files: [new File([contours], 'contours.geojson')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Draw the campus boundary first')
    expect(onImport).toHaveBeenCalledTimes(1)
  })
})
