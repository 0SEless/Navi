/**
 * Dataset Management explorer contracts (Phase 3).
 *
 * A DatasetSelection identifies exactly one browsable scope inside the
 * workspace: the campus root, a building, one floor of a building, or a
 * single outdoor item (POI or area). Selection is transient UI state owned by
 * DatasetWorkspace — it is never persisted (no localStorage, no store).
 *
 * Outdoor items use a composite ref (`poi:{id}` / `area:{id}`) because POI and
 * area identifiers live in separate collections and can collide.
 */

/** The four content types available for every selected location. */
export type DatasetContentType = 'information' | 'images' | 'dataset' | '360'

export type DatasetSelection =
  | { kind: 'campus'; id: string }
  | { kind: 'building'; buildingId: string }
  | { kind: 'floor'; buildingId: string; floorId: string }
  | { kind: 'outdoor'; ref: string }
