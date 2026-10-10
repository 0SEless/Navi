import { StrictMode, Suspense, type ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const mocks = vi.hoisted(() => {
  const contexts: Array<{ initialized: boolean; initialize: Mock<() => Promise<void>> }> = []
  const campusId = 'navi-persistence-test-1791537831751-m7ckux03'
  const state = {
    graph: { setBuildings: vi.fn() },
    currentMapId: campusId,
    serverAdoptionVersion: 0,
    authoredDocument: { metadata: { campusId }, buildings: [], roads: [] },
    pendingAuthoredMutations: [],
    syncStatus: 'synced',
    syncError: null,
    setAuthoredDocument: vi.fn(),
    recordAuthoredMutation: vi.fn(),
    completeCampusHydration: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  }
  return { contexts, state, campusId, createEditorContext: vi.fn() }
})

vi.mock('@/store/graph-store', () => ({
  useGraphStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    {
      getState: () => mocks.state,
      setState: (update: unknown) => {
        if (typeof update === 'function') Object.assign(mocks.state, (update as (state: typeof mocks.state) => object)(mocks.state))
        else Object.assign(mocks.state, update)
      },
      subscribe: () => () => undefined,
    },
  ),
}))

vi.mock('@navi/editor', () => ({
  EditorProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  NavigationCompiler: class {},
  GraphAdapter: class { sync() {} },
  createEditorContext: (...args: unknown[]) => mocks.createEditorContext(...args),
}))

vi.mock('@/components/floor-editor/FloorEditor', () => ({
  FloorEditor: () => <div data-testid="floor-editor" />,
}))
vi.mock('@/components/floor-editor/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/services/compiler-adapter', () => ({ createCompilerAdapter: () => ({}) }))

import FloorEditorPage from './page'

describe('Floor Editor context lifecycle', () => {
  beforeEach(() => {
    mocks.contexts.length = 0
    mocks.createEditorContext.mockReset()
    mocks.createEditorContext.mockImplementation((...args: unknown[]) => {
      const options = args[5] as { deferInitialization?: boolean } | undefined
      const entry: { initialized: boolean; initialize: Mock<() => Promise<void>> } = {
        initialized: false,
        initialize: vi.fn<() => Promise<void>>(),
      }
      let initialization: Promise<void> | undefined
      entry.initialize.mockImplementation(() => {
        initialization ??= Promise.resolve().then(() => { entry.initialized = true })
        return initialization
      })
      const context = {
        transformer: {},
        initialize: entry.initialize,
        services: {
          get: (name: string) => name === 'eventBus'
            ? { on: vi.fn().mockReturnValue(() => undefined), off: vi.fn() }
            : name === 'workflow' ? { isDirty: () => false } : undefined,
          destroy: vi.fn().mockResolvedValue(undefined),
        },
      }
      mocks.contexts.push(entry)
      if (!options?.deferInitialization) void context.initialize()
      return context
    })
  })

  afterEach(() => cleanup())

  it('does not initialize the discarded Strict Mode context or its autosave services', async () => {
    await act(async () => {
      render(
        <StrictMode>
          <Suspense fallback={<div>Loading</div>}>
            <FloorEditorPage params={Promise.resolve({
              id: mocks.campusId,
              buildingId: 'p2-building-m7ckux03',
              floor: '0',
            })} />
          </Suspense>
        </StrictMode>,
      )
    })

    expect(await screen.findByTestId('floor-editor')).toBeInTheDocument()
    await waitFor(() => expect(mocks.contexts.filter((context) => context.initialized)).toHaveLength(1))
    expect(mocks.contexts).toHaveLength(2)
    expect(mocks.contexts.filter((context) => !context.initialized)).toHaveLength(1)
  })
})
