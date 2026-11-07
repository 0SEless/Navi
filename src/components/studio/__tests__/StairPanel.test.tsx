import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { suggestStairConnection, toLatLng, type CampusDocument } from '@navi/core'
import { stairConnectCommands } from '@navi/editor'
import { stairCampus, stairEditor } from '../../../../packages/editor/src/commands/__tests__/stair-fixture'
import { StairPanel } from '../StairPanel'

afterEach(cleanup)

const grid = { originLat: 11.8, originLng: 122.1 }
const toWorld = (_b: string, _l: number, p: { x: number; y: number }) => toLatLng(grid, p)

function panel(document: CampusDocument, opts: { lock?: boolean } = {}) {
  const ensureZone = vi.fn(async () => opts.lock ?? true)
  const editor = stairEditor(document)
  const executeBatch = vi.fn((commands: never[]) => editor.dispatcher.executeBatch(commands))
  const view = render(
    <StairPanel document={document} structureId="s1" mapId="m1" toWorld={toWorld} pickedBottom={null}
      onChoosingChange={() => {}} ensureZone={ensureZone} executeBatch={executeBatch} onClose={() => {}} />,
  )
  return { ensureZone, executeBatch, view }
}

describe('StairPanel', () => {
  it('shows not connected and the suggested road and entrance', () => {
    panel(stairCampus())
    expect(screen.getByText('Not connected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Connect to route' }))
    expect(screen.getByText('Bottom: Lower road')).toBeTruthy()
    expect(screen.getByText('Top: East door (2F)')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the missing entrance message with Confirm disabled', () => {
    const document = stairCampus()
    document.buildings[0].floors[1].entrances = []
    panel(document)
    fireEvent.click(screen.getByRole('button', { name: 'Connect to route' }))
    expect(screen.getByText('Add an entrance on 2F here first')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open 2F in the floor editor' }).getAttribute('href')).toBe('/studio/m1/edit/building/hall/floor/1')
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('warns when the entrance is linked to another road', () => {
    panel(stairCampus({ linkedTo: 'r2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Connect to route' }))
    expect(screen.getByText('This entrance is linked to Upper road; it will be linked to the stair instead.')).toBeTruthy()
  })

  it('Confirm asks for the building lock then runs one batch', async () => {
    const document = stairCampus()
    const { ensureZone, executeBatch } = panel(document)
    fireEvent.click(screen.getByRole('button', { name: 'Connect to route' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })) })
    expect(ensureZone).toHaveBeenCalledWith(['building:hall'])
    expect(executeBatch).toHaveBeenCalledTimes(1)
    expect(executeBatch.mock.calls[0][0]).toHaveLength(2)
    expect(document.roads.some((r) => r.routing?.structureId === 's1')).toBe(true)
  })

  it('a refused lock writes nothing', async () => {
    const document = stairCampus()
    const { executeBatch } = panel(document, { lock: false })
    fireEvent.click(screen.getByRole('button', { name: 'Connect to route' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })) })
    expect(executeBatch).not.toHaveBeenCalled()
    expect(screen.getByText('Hall is being edited by someone else. Try again when they are done.')).toBeTruthy()
  })

  it('connected stairs offer Disconnect', async () => {
    const document = stairCampus()
    const commands = stairConnectCommands(document, suggestStairConnection(document, 's1', { toWorld })!)
    stairEditor(document).dispatcher.executeBatch(commands as never)
    const { executeBatch } = panel(document)
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit in terrain editor' }).getAttribute('href')).toBe('/studio/m1/edit/terrain?stair=s1')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Disconnect' })) })
    expect(executeBatch).toHaveBeenCalledTimes(1)
    expect(document.roads.some((r) => r.routing?.structureId === 's1')).toBe(false)
  })
})
