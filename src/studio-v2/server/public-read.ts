// Save v2 public reads (spec section 10.6): NAVI Web reads only the current publication.
//
// The public routes (public-campus, published-map, public-qr, campuses GET) keep their
// legacy code path unless the server env NAVI_SAVE_V2_PUBLIC_READ is exactly '1', read
// on every request. Under the flag they read studio.current_publication /
// studio.published_campuses through this module and never reach published_maps or the
// graph_snapshots draft fallback. The response shapes stay the legacy ones.
import type { StudioRepo } from './studio-repo'
import type { PublishedCampusRow } from './types'

export type PublicReadRepo = Pick<StudioRepo, 'currentPublication' | 'publishedCampuses'>

/** True when the public routes must read Save v2 publications. Read at request time. */
export function isSaveV2PublicReadEnabled(): boolean {
  return process.env.NAVI_SAVE_V2_PUBLIC_READ === '1'
}

let testRepo: PublicReadRepo | null = null

/** The repository the public routes read; the real one unless a test installed a fake. */
export async function getPublicReadRepo(): Promise<PublicReadRepo> {
  if (testRepo) return testRepo
  // Loaded only when the flag is on, so the legacy path never loads the pg client.
  const { studioRepo } = await import('./studio-repo')
  return studioRepo
}

/** Tests only: install (or with null, remove) a fake repository. */
export function setPublicReadRepoForTests(repo: PublicReadRepo | null): void {
  testRepo = repo
}

/** The published artifacts of a campus, or null when it does not exist or was never published. */
export async function readCurrentPublication(campusId: string) {
  const repo = await getPublicReadRepo()
  const result = await repo.currentPublication(campusId)
  if (result.status !== 'ok' || result.publication === null) return null
  return result.publication
}

/** Every campus with a current publication, in the legacy campus_id order (byte order). */
export async function readPublishedCampuses(): Promise<PublishedCampusRow[]> {
  const repo = await getPublicReadRepo()
  const result = await repo.publishedCampuses()
  return [...result.campuses].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
