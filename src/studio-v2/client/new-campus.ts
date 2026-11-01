// The campus wizard under Save v2: the imported OSM buildings become the campus's first
// commit. (The legacy wizard put them in the graph store and its localStorage/`/api/graph`
// save; under Save v2 that save is a draft-only no-op for a campus with no session yet.)
import { CONNECTIVITY_CONTRACT_VERSION, CoordinateTransformer } from '@navi/core'
import { createDocument, registerBuildingTransforms } from '@navi/editor'
import type { Graph } from '@/engine/graph'
import { outcomeMessage, type StudioSession } from './studio-session'

export interface NewCampusDeps {
  session: StudioSession
  /** Resolves once the campus row exists on the server (campus-map-store sync). */
  ensureCampus(): Promise<void>
}

export async function saveNewCampus(campusId: string, graph: Graph, deps: NewCampusDeps): Promise<void> {
  await deps.ensureCampus()
  await deps.session.load()
  const transformer = new CoordinateTransformer()
  registerBuildingTransforms(transformer, graph.buildings ?? [], graph)
  const document = createDocument(graph, transformer)
  document.metadata.campusId = campusId
  // The editor stamps this on open (GraphAdapter.sync); save it so the campus opens clean (R68).
  document.connectivitySemanticsVersion ??= CONNECTIVITY_CONTRACT_VERSION
  try {
    const outcome = await deps.session.save(document, 'Created with the campus wizard')
    if (outcome.kind !== 'saved') throw new Error(outcomeMessage(outcome) ?? 'The new campus could not be saved.')
  } finally {
    await deps.session.zones.release(deps.session.zones.held()).catch(() => undefined)
  }
}
