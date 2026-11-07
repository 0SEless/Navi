import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { ZoneProvider } from '@/components/studio/v2/ZoneProvider'
import type { ZoneClient } from '@/studio-v2/client/zone-client'
import type { ZoneDenial } from '@/studio-v2/server/types'
import { useTerrainLock, type TerrainLockState } from '../useTerrainLock'

afterEach(cleanup)

const NO_LOCKS: never[] = []

function fakeClient(opts: { sameActor: boolean; role?: 'owner' | 'editor' }) {
  const denied = new Set<(d: ZoneDenial) => void>()
  let free = false
  const client = {
    start: vi.fn(), stop: vi.fn(),
    onChange: () => () => {},
    locks: () => NO_LOCKS,
    myRole: () => opts.role ?? 'owner',
    onDenied: (listener: (d: ZoneDenial) => void) => { denied.add(listener); return () => denied.delete(listener) },
    ensure: vi.fn(async () => {
      if (free) return true
      denied.forEach((l) => l({ zoneKey: 'terrain', holderName: 'Ana', since: '2026-11-07T00:00:00Z', sameActor: opts.sameActor }))
      return false
    }),
    forceRelease: vi.fn(async () => { free = true; return true }),
  }
  return client
}

let state: TerrainLockState | null = null
function Probe() {
  state = useTerrainLock()
  return <div data-testid="status">{state.status}</div>
}

function mount(client: ReturnType<typeof fakeClient>) {
  render(<ZoneProvider campusId="c1" client={client as unknown as ZoneClient} showDenials={false}><Probe /></ZoneProvider>)
}

describe('useTerrainLock', () => {
  it('a same-account denial sets sameActor', async () => {
    mount(fakeClient({ sameActor: true }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('view-only'))
    expect(state?.sameActor).toBe(true)
    expect(state?.canTakeOver).toBe(true)
  })

  it("another admin's lock is not sameActor", async () => {
    mount(fakeClient({ sameActor: false }))
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('view-only'))
    expect(state?.sameActor).toBe(false)
  })

  it('takeOver force-releases then acquires', async () => {
    const client = fakeClient({ sameActor: true })
    mount(client)
    await waitFor(() => expect(state?.sameActor).toBe(true))
    await act(async () => { await state?.takeOver?.() })
    expect(client.forceRelease).toHaveBeenCalledWith('terrain')
    expect(screen.getByTestId('status').textContent).toBe('held')
    expect(state?.sameActor).toBe(false)
  })

  it('only the owner can take over', async () => {
    mount(fakeClient({ sameActor: true, role: 'editor' }))
    await waitFor(() => expect(state?.sameActor).toBe(true))
    expect(state?.canTakeOver).toBe(false)
  })
})
