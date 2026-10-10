import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const TEST_CAMPUS_ID = 'navi-persistence-test-1791537831751-m7ckux03'

const mocks = vi.hoisted(() => {
  const document = {
    schemaVersion: 1,
    version: 0,
    metadata: { campusId: 'navi-persistence-test-1791537831751-m7ckux03', name: 'Disposable test' },
    buildings: [],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
  const state = {
    currentMapId: 'navi-persistence-test-1791537831751-m7ckux03',
    campusReady: true,
    syncStatus: 'synced',
    authoredDocument: document,
    setAuthoredDocument: vi.fn(),
    recordAuthoredMutation: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  }
  const dispatcher = { execute: vi.fn() }
  return { state, document, dispatcher, upload: vi.fn(), fetch: vi.fn() }
})

vi.mock('@/store/graph-store', () => ({
  useGraphStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state },
  ),
}))

vi.mock('@/lib/panorama-upload-client', () => ({ uploadPanoramaAsset: mocks.upload }))

vi.mock('@navi/editor', () => ({
  useEditor: () => ({
    document: mocks.state.authoredDocument,
    services: { get: (name: string) => name === 'dispatcher' ? mocks.dispatcher : undefined },
  }),
}))

vi.mock('@/components/tour/TourViewer', () => ({
  TourViewer: ({ panoramas }: { panoramas: Array<{ label: string }> }) => (
    <div data-testid="test-panorama-viewer">{panoramas.map((panorama) => panorama.label).join(', ')}</div>
  ),
}))

import { TestCampusPanoramaAuthoring } from '@/components/studio/TestCampusPanoramaAuthoring'

function jsonResponse(value: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value }
}

describe('test-campus Panorama authoring isolation', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scvgulusmutnzasmgysx.supabase.co')
    localStorage.clear()
    localStorage.setItem('navi-test-studio-campus-opt-in', TEST_CAMPUS_ID)
    mocks.state.currentMapId = TEST_CAMPUS_ID
    mocks.state.authoredDocument = structuredClone(mocks.document)
    mocks.state.setAuthoredDocument.mockReset()
    mocks.state.setAuthoredDocument.mockImplementation((document) => { mocks.state.authoredDocument = document as typeof mocks.document })
    mocks.state.recordAuthoredMutation.mockReset()
    mocks.state.save.mockReset().mockResolvedValue(undefined)
    mocks.dispatcher.execute.mockReset().mockImplementation((command: { id: string; payload: Record<string, unknown> }) => {
      if (command.id !== 'panorama.create') return { success: false, error: 'Unexpected command' }
      const scene = {
        id: command.payload.id as string,
        label: command.payload.label as string,
        position: command.payload.position as { lat: number; lng: number },
        heading: command.payload.heading as number,
        imageAssetId: command.payload.imageAssetId as string,
        hotspots: [],
      }
      mocks.state.setAuthoredDocument({
        ...mocks.state.authoredDocument,
        panoramas: [...mocks.state.authoredDocument.panoramas, scene],
      })
      mocks.state.recordAuthoredMutation('outdoor', null, null)
      return { success: true, entityId: scene.id }
    })
    mocks.upload.mockReset().mockImplementation(async ({ campusId, panoramaId }: { campusId: string; panoramaId: string }) => `panoramas/${campusId}/${panoramaId}/0123456789abcdef0123456789abcdef.jpg`)
    mocks.fetch.mockReset()
    vi.stubGlobal('fetch', mocks.fetch)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is hidden without explicit opt-in and for any non-test campus or project', () => {
    localStorage.removeItem('navi-test-studio-campus-opt-in')
    const optedOut = render(<TestCampusPanoramaAuthoring campusId={TEST_CAMPUS_ID} />)
    expect(screen.queryByRole('region', { name: /test panorama authoring/i })).not.toBeInTheDocument()
    optedOut.unmount()

    localStorage.setItem('navi-test-studio-campus-opt-in', TEST_CAMPUS_ID)
    const wrongCampus = render(<TestCampusPanoramaAuthoring campusId="another-campus" />)
    expect(screen.queryByRole('region', { name: /test panorama authoring/i })).not.toBeInTheDocument()
    wrongCampus.unmount()

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://production-project.supabase.co')
    render(<TestCampusPanoramaAuthoring campusId={TEST_CAMPUS_ID} />)
    expect(screen.queryByRole('region', { name: /test panorama authoring/i })).not.toBeInTheDocument()
  })

  it('is unavailable in production builds even with the browser opt-in', () => {
    vi.stubEnv('NODE_ENV', 'production')
    render(<TestCampusPanoramaAuthoring campusId={TEST_CAMPUS_ID} />)
    expect(screen.queryByRole('region', { name: /test panorama authoring/i })).not.toBeInTheDocument()
  })

  it('creates the scene through the canonical editor command, saves, and requires authoritative GET before success', async () => {
    const user = userEvent.setup()
    mocks.fetch.mockImplementation(async () => {
      const saved = mocks.state.setAuthoredDocument.mock.calls.at(-1)?.[0]
      return jsonResponse({ authoredDocument: saved })
    })

    render(<TestCampusPanoramaAuthoring campusId={TEST_CAMPUS_ID} />)
    await user.type(screen.getByLabelText(/scene name/i), 'Browser smoke scene')
    await user.upload(screen.getByLabelText(/panorama image/i), new File(['fixture'], 'smoke.jpg', { type: 'image/jpeg' }))
    await user.click(screen.getByRole('button', { name: /upload and save scene/i }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/verified on server/i))
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ campusId: TEST_CAMPUS_ID, file: expect.any(File) }))
    const command = mocks.dispatcher.execute.mock.calls.at(-1)?.[0]
    expect(command).toMatchObject({
      id: 'panorama.create',
      payload: expect.objectContaining({ label: 'Browser smoke scene', position: { lat: 0, lng: 0 } }),
    })
    expect(command?.payload.id).toMatch(/^pano_test_/)
    expect(command?.payload.imageAssetId).toBe(`panoramas/${TEST_CAMPUS_ID}/${command?.payload.id}/0123456789abcdef0123456789abcdef.jpg`)
    expect(mocks.state.recordAuthoredMutation).toHaveBeenCalledWith('outdoor', null, null)
    expect(mocks.state.save).toHaveBeenCalledWith({ trigger: 'manual' })
    expect(mocks.fetch).toHaveBeenCalledWith(`/api/graph?campus_id=${encodeURIComponent(TEST_CAMPUS_ID)}`, expect.objectContaining({ credentials: 'include', cache: 'no-store' }))
    expect(mocks.state.setAuthoredDocument.mock.calls.at(-1)?.[0].panoramas).toHaveLength(1)
  })

  it('does not report Saved when authoritative readback omits the uploaded scene', async () => {
    const user = userEvent.setup()
    mocks.fetch.mockResolvedValue(jsonResponse({ authoredDocument: mocks.document }))
    render(<TestCampusPanoramaAuthoring campusId={TEST_CAMPUS_ID} />)
    await user.type(screen.getByLabelText(/scene name/i), 'Not committed')
    await user.upload(screen.getByLabelText(/panorama image/i), new File(['fixture'], 'smoke.jpg', { type: 'image/jpeg' }))
    await user.click(screen.getByRole('button', { name: /upload and save scene/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be confirmed from the server/i))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
