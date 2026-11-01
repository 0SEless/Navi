import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SelectionOrigin } from '@navi/editor'
import type { ExplorerNode } from '@navi/editor'
import { useStudioStore } from '@/store/studio-store'
import { ZoneClient, buildingZone } from '@/studio-v2/client/zone-client'
import type { StatusReply } from '@/studio-v2/client/api-client'
import type { ZoneDenial } from '@/studio-v2/server/types'
import type { ZoneKey } from '@/studio-v2/parts/part-keys'
import { ZoneProvider } from '../ZoneProvider'
import { ExplorerItem } from '../../ExplorerItem'

function clientWith(options: { denied?: ZoneDenial[]; locks?: StatusReply['locks']; myRole?: StatusReply['myRole'] } = {}) {
  const api = {
    acquire: vi.fn(async (_c: string, zones: ZoneKey[]) => (options.denied?.length ? { granted: [], denied: options.denied } : { granted: zones, denied: [] })),
    release: vi.fn(async (_c: string, zones: ZoneKey[]) => ({ released: zones })),
    forceRelease: vi.fn(async () => ({ released: true })),
    status: vi.fn(async (): Promise<StatusReply> => ({ headCommit: 1, locks: options.locks ?? [], lostZones: [], myRole: options.myRole ?? 'editor' })),
  }
  return { client: new ZoneClient({ campusId: 'c1', api }), api }
}

const anaDenial: ZoneDenial = { zoneKey: 'building:B1', holderName: 'Ana', since: '2026-11-01T00:00:00Z', sameActor: false }

afterEach(() => {
  cleanup()
  useStudioStore.getState().setActiveBuilding(null)
})

describe('ZoneProvider building guard', () => {
  it('opening a held building shows "Ana is currently editing this building — try editing other buildings." and does not enter the building', async () => {
    const { client } = clientWith({ denied: [anaDenial] })
    render(<ZoneProvider campusId="c1" client={client}><div>studio</div></ZoneProvider>)
    act(() => useStudioStore.getState().setActiveBuilding('B1'))
    expect(await screen.findByText('Ana is currently editing this building — try editing other buildings.')).toBeTruthy()
    await waitFor(() => expect(useStudioStore.getState().activeBuildingId).toBeNull())
  })

  it('entering a free building acquires its zone and stays in the building', async () => {
    const { client, api } = clientWith()
    render(<ZoneProvider campusId="c1" client={client}><div>studio</div></ZoneProvider>)
    act(() => useStudioStore.getState().setActiveBuilding('B1'))
    await waitFor(() => expect(api.acquire).toHaveBeenCalledWith('c1', [buildingZone('B1')]))
    expect(useStudioStore.getState().activeBuildingId).toBe('B1')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('Release lock button shown only when myRole is owner', async () => {
    const editor = clientWith({ denied: [anaDenial], myRole: 'editor' })
    await editor.client.poll()
    const { unmount } = render(<ZoneProvider campusId="c1" client={editor.client}><div /></ZoneProvider>)
    act(() => useStudioStore.getState().setActiveBuilding('B1'))
    await screen.findByText(/Ana is currently editing/)
    expect(screen.queryByRole('button', { name: 'Release lock' })).toBeNull()
    unmount()
    act(() => useStudioStore.getState().setActiveBuilding(null))

    const owner = clientWith({ denied: [anaDenial], myRole: 'owner' })
    await owner.client.poll()
    render(<ZoneProvider campusId="c1" client={owner.client}><div /></ZoneProvider>)
    act(() => useStudioStore.getState().setActiveBuilding('B1'))
    await screen.findByText(/Ana is currently editing/)
    const release = screen.getByRole('button', { name: 'Release lock' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(release)
    await waitFor(() => expect(owner.api.forceRelease).toHaveBeenCalledWith('c1', 'building:B1'))
  })
})

describe('Explorer lock badge', () => {
  const node: ExplorerNode = {
    id: 'B1' as ExplorerNode['id'],
    label: 'Library',
    type: 'building',
    entitySelector: { kind: 'building', id: 'B1' } as unknown as ExplorerNode['entitySelector'],
  }

  it('Explorer delete disabled for a building held by another admin', async () => {
    const { client } = clientWith({ locks: [{ zoneKey: 'building:B1', holderName: 'Ana', holderIsMe: false, since: '2026-11-01T00:00:00Z' }] })
    await client.poll()
    const onDelete = vi.fn()
    render(
      <ZoneProvider campusId="c1" client={client}>
        <ExplorerItem node={node} depth={0} expanded={false} selected={false} searchQuery="" onToggle={vi.fn()} onSelect={vi.fn()} onDelete={onDelete} />
      </ZoneProvider>,
    )
    expect(await screen.findByText('🔒 Ana')).toBeTruthy()
    fireEvent.contextMenu(screen.getByRole('treeitem'))
    expect(screen.queryByText('Delete')).toBeNull()
  })

  it('Explorer keeps delete for a building nobody else holds', async () => {
    const { client } = clientWith()
    await client.poll()
    render(
      <ZoneProvider campusId="c1" client={client}>
        <ExplorerItem node={node} depth={0} expanded={false} selected={false} searchQuery="" onToggle={vi.fn()} onSelect={vi.fn()} onDelete={vi.fn()} />
      </ZoneProvider>,
    )
    fireEvent.contextMenu(screen.getByRole('treeitem'))
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(SelectionOrigin.Explorer).toBeDefined()
  })
})

const back = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ back }) }))

describe('FloorZoneGate', () => {
  it('a held building keeps the floor editor closed and offers Back', async () => {
    const { FloorZoneGate } = await import('../FloorZoneGate')
    const { client } = clientWith({ denied: [anaDenial] })
    render(
      <ZoneProvider campusId="c1" client={client} showDenials={false}>
        <FloorZoneGate buildingId="B1"><div>floor editor</div></FloorZoneGate>
      </ZoneProvider>,
    )
    expect(await screen.findByText('Ana is currently editing this building — try editing other buildings.')).toBeTruthy()
    expect(screen.queryByText('floor editor')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(back).toHaveBeenCalled()
  })

  it('a free building opens the floor editor', async () => {
    const { FloorZoneGate } = await import('../FloorZoneGate')
    const { client } = clientWith()
    render(
      <ZoneProvider campusId="c1" client={client} showDenials={false}>
        <FloorZoneGate buildingId="B1"><div>floor editor</div></FloorZoneGate>
      </ZoneProvider>,
    )
    expect(await screen.findByText('floor editor')).toBeTruthy()
  })
})
