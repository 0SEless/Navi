import { describe, expect, it } from 'vitest'
import type { PanoramaView } from './selectors'
import {
  resolveCampusSelection,
  resolvePanoramaManagementPhase,
  shouldCanonicalizeCampusUrl,
  type ResolvePhaseInput,
} from './state'

function view(id: string): PanoramaView {
  return {
    id,
    label: id,
    scope: 'outdoor',
    buildingId: undefined,
    buildingName: null,
    floor: null,
    floorLabel: null,
    heading: 0,
    imageAssetId: 'asset',
    hasImage: true,
    missingImage: false,
    hotspotCount: 0,
    health: 'ready',
    hasValidationError: false,
    issues: [],
    position: { kind: 'world', display: '0, 0' },
  }
}

const READY: ResolvePhaseInput = {
  campusesLoading: false,
  campusListFailed: false,
  selectedCampusId: 'c-1',
  selectedCampusKnown: true,
  campusAligned: true,
  hasDocument: true,
  syncStatus: 'synced',
  syncError: null,
  inventory: [view('a')],
  filteredCount: 1,
}

describe('resolveCampusSelection (URL campus contract)', () => {
  const known = ['c-1', 'c-2', 'c-3']

  it('A — uses an explicit known campus', () => {
    expect(resolveCampusSelection({ requestedCampusId: 'c-2', knownCampusIds: known, currentMapId: 'c-1' })).toEqual({
      kind: 'selected',
      campusId: 'c-2',
    })
  })

  it('B — an unknown ?campus is NOT silently replaced by currentMapId', () => {
    expect(
      resolveCampusSelection({ requestedCampusId: 'c-ghost', knownCampusIds: known, currentMapId: 'c-1' }),
    ).toEqual({ kind: 'unknown-campus', campusId: 'c-ghost' })
  })

  it('B — an unknown ?campus is NOT replaced even when exactly one campus exists', () => {
    expect(
      resolveCampusSelection({ requestedCampusId: 'c-ghost', knownCampusIds: ['c-1'], currentMapId: null }),
    ).toEqual({ kind: 'unknown-campus', campusId: 'c-ghost' })
  })

  it('C — falls back to currentMapId when no param is present', () => {
    expect(resolveCampusSelection({ requestedCampusId: null, knownCampusIds: known, currentMapId: 'c-3' })).toEqual({
      kind: 'selected',
      campusId: 'c-3',
    })
  })

  it('C — ignores a currentMapId that is not a known campus', () => {
    expect(
      resolveCampusSelection({ requestedCampusId: null, knownCampusIds: known, currentMapId: 'c-ghost' }),
    ).toEqual({ kind: 'no-campus-selected' })
  })

  it('D — selects the only campus when there is exactly one', () => {
    expect(resolveCampusSelection({ requestedCampusId: null, knownCampusIds: ['c-1'], currentMapId: null })).toEqual({
      kind: 'selected',
      campusId: 'c-1',
    })
  })

  it('E — no selection with several campuses and no usable currentMapId', () => {
    expect(resolveCampusSelection({ requestedCampusId: null, knownCampusIds: known, currentMapId: null })).toEqual({
      kind: 'no-campus-selected',
    })
  })

  it('E — selects nothing when there are no campuses at all', () => {
    expect(resolveCampusSelection({ requestedCampusId: null, knownCampusIds: [], currentMapId: 'c-1' })).toEqual({
      kind: 'no-campus-selected',
    })
  })

  it('canonicalises the URL only for an implicit single-campus resolution', () => {
    expect(
      shouldCanonicalizeCampusUrl(null, { kind: 'selected', campusId: 'c-1' }),
    ).toBe(true)
    // Already explicit — nothing to canonicalise.
    expect(
      shouldCanonicalizeCampusUrl('c-1', { kind: 'selected', campusId: 'c-1' }),
    ).toBe(false)
    // Unknown campus must NOT be canonicalised away.
    expect(
      shouldCanonicalizeCampusUrl('c-ghost', { kind: 'unknown-campus', campusId: 'c-ghost' }),
    ).toBe(false)
  })
})

describe('resolvePanoramaManagementPhase (distinct page states)', () => {
  it('A — campus list loading outranks everything', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, campusesLoading: true })).toEqual({
      kind: 'campus-list-loading',
    })
  })

  it('B — campus list failure', () => {
    const phase = resolvePanoramaManagementPhase({ ...READY, campusListFailed: true })
    expect(phase.kind).toBe('campus-list-failed')
  })

  it('C — no campus selected', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, selectedCampusId: null })).toEqual({
      kind: 'no-campus-selected',
    })
  })

  it('D — campus not found', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, selectedCampusKnown: false })).toEqual({
      kind: 'campus-not-found',
    })
  })

  it('stays loading while the loaded document is not the selected campus (ownership guard)', () => {
    // STEP 7: campus A's document is loaded, but B is selected.
    expect(resolvePanoramaManagementPhase({ ...READY, campusAligned: false }).kind).toBe('loading')
  })

  it('ownership guard outranks a loaded document being present', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, campusAligned: false, hasDocument: true }).kind).toBe('loading')
  })

  it('B — load failure with the store message', () => {
    const phase = resolvePanoramaManagementPhase({
      ...READY,
      syncStatus: 'error',
      syncError: 'Campus could not be read.',
    })
    expect(phase).toEqual({ kind: 'load-failed', message: 'Campus could not be read.' })
  })

  it('B — load failure still retries with a truthful default message', () => {
    const phase = resolvePanoramaManagementPhase({ ...READY, syncStatus: 'error', syncError: null })
    expect(phase.kind).toBe('load-failed')
    if (phase.kind === 'load-failed') expect(phase.message).toMatch(/try again/i)
  })

  it('H — conflict is surfaced, not collapsed into an error', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, syncStatus: 'conflict' }).kind).toBe('sync')
  })

  it('treats syncing/checking as loading', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, syncStatus: 'syncing' }).kind).toBe('loading')
    expect(resolvePanoramaManagementPhase({ ...READY, syncStatus: 'checking' }).kind).toBe('loading')
  })

  it('G — document unavailable is distinct from zero panoramas', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, hasDocument: false })).toEqual({
      kind: 'document-unavailable',
    })
  })

  it('E — zero panoramas is ready-with-empty, not a load error', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, inventory: [], filteredCount: 0 })).toEqual({
      kind: 'ready',
      empty: 'none',
    })
  })

  it('F — zero matches differs from zero panoramas', () => {
    expect(resolvePanoramaManagementPhase({ ...READY, inventory: [view('a')], filteredCount: 0 })).toEqual({
      kind: 'ready',
      empty: 'no-matches',
    })
  })

  it('is ready when both inventory and filtered results are non-empty', () => {
    expect(resolvePanoramaManagementPhase({ ...READY }).kind).toBe('ready')
  })

  it('campus-level problems outrank document-level ones', () => {
    expect(
      resolvePanoramaManagementPhase({ ...READY, selectedCampusId: null, syncStatus: 'error' }).kind,
    ).toBe('no-campus-selected')
    expect(resolvePanoramaManagementPhase({ ...READY, selectedCampusKnown: false, hasDocument: false }).kind).toBe(
      'campus-not-found',
    )
  })
})