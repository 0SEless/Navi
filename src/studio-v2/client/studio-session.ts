// One Studio session per campus and browser tab (spec §6.1–§6.5): the loaded baseline, the
// explicit Save, local drafts, publish, and merging other admins' saved parts. The map page
// and the floor editor share it, so a page change never loses the baseline or the locks.
import type { CampusDocument } from '@navi/core'
import { joinParts } from '../parts/join'
import { parsePartKey, zoneOf, type PartKey, type ZoneKey } from '../parts/part-keys'
import { splitDocument, type PartRecord } from '../parts/split'
import type { LoadOk, PartRecordWithVersion, StalePart } from '../server/types'
import { createStudioApi, type StudioApi } from './api-client'
import { draftStore as defaultDrafts, planRestore, type DraftStore, type V2DraftPart } from './draft-store'
import { localReferenceStore as defaultReferences, type LocalReferenceStore } from './local-reference-store'
import { mergeRemoteParts, withRemoteParts, type MergeContext } from './remote-merge'
import { SaveController, partHash, type SaveControllerState, type SaveOutcome } from './save-controller'
import { clearHistoryForZone, denialMessage, type ZoneClient } from './zone-client'
import { getZoneClient } from './zone-registry'

/** Drafts are per browser profile; the server identity is not known before the first save. */
export const DRAFT_USER_ID = 'local-browser'

export const SAVE_FIRST = 'Save first'
export const NOT_SAVED = 'Not saved — your work is kept on this computer'

/** What the status line shows (spec §6.4); `message` holds the exact owner copy. */
export interface StudioSessionState {
  status: SaveControllerState['status']
  message: string | null
  headCommit: number
  dirty: boolean
}

interface HistoryLike {
  setTouchedPartsResolver?(fn: ((before: CampusDocument, after: CampusDocument) => string[]) | null): void
  applyRemote(touched: Set<string>, apply: (doc: CampusDocument) => void): 'rebased' | 'cleared'
}

interface EventBusLike {
  emit?(event: string, payload?: unknown): void
}

export interface StudioSessionOptions {
  campusId: string
  api: StudioApi
  zones: ZoneClient
  drafts?: DraftStore
  references?: LocalReferenceStore
  /** Asks the admin a yes/no question (restore a draft); defaults to window.confirm. */
  confirm?: (question: string) => boolean
}

const THING_BY_KIND: Record<string, string> = {
  campus: 'campus',
  building: 'building',
  floor: 'floor',
  terrain: 'terrain',
  'terrain-tile': 'terrain',
  'map/road': 'road',
  'map/junction': 'junction',
  'map/crossing': 'crossing',
  'map/area': 'area',
  'map/poi': 'place',
}

/** "This road was changed by Ana" (spec §6.4). */
export function staleMessage(parts: StalePart[]): string {
  const first = parts[0]
  if (!first) return 'Changed by another admin.'
  const thing = THING_BY_KIND[parsePartKey(first.partKey).kind] ?? 'item'
  return `This ${thing} was changed by ${first.savedBy ?? 'another admin'}`
}

/** The exact copy for a save that did not land. */
export function outcomeMessage(outcome: SaveOutcome): string | null {
  switch (outcome.kind) {
    case 'saved':
      return null
    case 'stale':
      return staleMessage(outcome.parts)
    case 'zone-not-held': {
      const zone = outcome.zones[0]
      return zone ? denialMessage({ zoneKey: zone.zoneKey, holderName: zone.holderName ?? 'Another admin', sameActor: false }) : 'Locked by another admin.'
    }
    case 'offline':
      return NOT_SAVED
    case 'invalid':
      return outcome.issues[0]?.message ?? 'Some changes are not allowed.'
    case 'failed':
      return outcome.message
  }
}

function hashParts(doc: CampusDocument): Map<PartKey, string> {
  return new Map(splitDocument(doc).parts.map((part) => [part.key, partHash(part.key, part.content)]))
}

/** Part keys whose content differs between two documents (the undo history's touched parts). */
export function touchedParts(before: CampusDocument, after: CampusDocument): PartKey[] {
  const a = hashParts(before)
  const b = hashParts(after)
  const keys = new Set([...a.keys(), ...b.keys()])
  return [...keys].filter((key) => a.get(key) !== b.get(key))
}

function asRecord(part: PartRecordWithVersion): PartRecord {
  return { key: part.partKey, content: part.content, sortKey: part.sortKey }
}

function draftPartsOf(doc: CampusDocument, controller: SaveController): Record<PartKey, V2DraftPart> {
  const parts: Record<PartKey, V2DraftPart> = {}
  for (const change of controller.changes(doc)) {
    parts[change.partKey] = {
      baseVersion: change.expectedVersion,
      content: change.op === 'put' ? change.content : null,
      sortKey: change.op === 'put' ? change.sortKey ?? null : null,
    }
  }
  return parts
}

export class StudioSession {
  readonly campusId: string
  readonly controller: SaveController
  readonly zones: ZoneClient
  private readonly api: StudioApi
  private readonly drafts: DraftStore
  private readonly references: LocalReferenceStore
  private readonly confirm: (question: string) => boolean
  private context: MergeContext | null = null
  private explicitSave = false
  private message: string | null = null
  private listeners = new Set<(state: StudioSessionState) => void>()
  private state: StudioSessionState = { status: 'clean', message: null, headCommit: 0, dirty: false }

  constructor(options: StudioSessionOptions) {
    this.campusId = options.campusId
    this.api = options.api
    this.zones = options.zones
    this.drafts = options.drafts ?? defaultDrafts
    this.references = options.references ?? defaultReferences
    this.confirm = options.confirm ?? ((question) => typeof window !== 'undefined' && window.confirm(question))
    this.controller = new SaveController({ campusId: options.campusId, api: options.api, zones: options.zones })
    this.zones.setCleanCheck((zone) => !this.dirtyZones().has(zone))
    this.controller.subscribe((next) => this.publishState(next))
  }

  /** Load the saved campus; returns null for a campus with no saved parts yet (a new campus). */
  async load(): Promise<CampusDocument | null> {
    const load = await this.api.load(this.campusId)
    this.controller.adoptBaseline(load)
    this.zones.setHeadCommit(load.headCommit)
    const live = load.parts.filter((part) => !part.deleted && parsePartKey(part.partKey).kind !== 'terrain-tile')
    if (live.length === 0) return null
    let doc = joinParts(live.map(asRecord))
    doc = await this.restoreDraft(doc, load)
    await this.references.attach(doc, this.campusId).catch((error: unknown) => {
      console.warn('Save v2: floor-plan references are unavailable on this computer:', error)
    })
    this.controller.refresh(doc)
    return doc
  }

  /** Connect the editor context: undo history, idle-release checks, remote merges. */
  attach(context: MergeContext): () => void {
    this.context = context
    const history = context.services.get('history') as HistoryLike | undefined
    history?.setTouchedPartsResolver?.(touchedParts)
    const offReleased = this.zones.onReleased((zones) => {
      if (!history || !this.context) return
      for (const zone of zones) clearHistoryForZone(history, this.context.document, zone)
    })
    const offHead = this.zones.onHeadMoved(() => {
      void this.pullRemote().catch((error: unknown) => console.warn('Save v2: could not merge saved changes:', error))
    })
    return () => {
      offReleased()
      offHead()
      history?.setTouchedPartsResolver?.(null)
      if (this.context === context) this.context = null
    }
  }

  document(): CampusDocument | null {
    return this.context?.document ?? null
  }

  isDirty(doc: CampusDocument | null = this.document()): boolean {
    return doc ? this.controller.isDirty(doc) : false
  }

  /** Recompute the status after an edit, undo or redo (no network). */
  refresh(doc: CampusDocument | null = this.document()): void {
    if (doc) this.controller.refresh(doc)
  }

  /** The next persistence save is the admin's explicit Save (button or Ctrl+S). */
  markExplicitSave(): void {
    this.explicitSave = true
  }

  consumeExplicitSave(): boolean {
    const explicit = this.explicitSave
    this.explicitSave = false
    return explicit
  }

  /** Keep unsaved parts and floor-plan alignment on this computer only (spec §6.3, §6.6). */
  async writeDraft(doc: CampusDocument | null = this.document()): Promise<void> {
    if (!doc) return
    const parts = draftPartsOf(doc, this.controller)
    try {
      const existing = await this.drafts.read(this.campusId, DRAFT_USER_ID)
      if (Object.keys(parts).length === 0) {
        if (existing) await this.drafts.clearParts(this.campusId, DRAFT_USER_ID, Object.keys(existing.parts))
      } else {
        await this.drafts.write({ campusId: this.campusId, userId: DRAFT_USER_ID, savedAt: new Date().toISOString(), parts })
      }
      await this.references.syncFrom(splitDocument(doc).localReferences, this.campusId)
    } catch (error) {
      // A draft is a safety copy; without browser storage the unsaved-changes prompt still guards the tab.
      console.warn('Save v2: the local draft could not be written:', error)
    }
    this.controller.refresh(doc)
  }

  /** The one network save: dirty parts only, then other admins' parts are merged in. */
  async save(doc: CampusDocument | null = this.document(), message?: string): Promise<SaveOutcome> {
    if (!doc) return { kind: 'failed', code: 'NO_DOCUMENT', message: 'Nothing to save yet.' }
    const outcome = await this.controller.save(doc, message)
    this.message = outcomeMessage(outcome)
    if (outcome.kind === 'saved') {
      if (outcome.othersChanged.length > 0) this.merge(outcome.othersChanged)
      await this.writeDraft(doc)
    }
    this.publishState()
    return outcome
  }

  /** Publish the latest saved commit; refuses while this tab has unsaved changes (spec §9). */
  async publish(doc: CampusDocument | null = this.document()): Promise<{ success: boolean; message?: string; version?: string }> {
    if (this.isDirty(doc)) return { success: false, message: SAVE_FIRST }
    try {
      const result = await this.api.publish(this.campusId, this.controller.headCommit)
      return { success: true, version: `#${result.commitNo}`, message: `Published · #${result.commitNo}` }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Publish failed' }
    }
  }

  /** Bring in parts other admins saved since our head; local unsaved parts are kept. */
  async pullRemote(): Promise<void> {
    if (!this.context) return
    const changes = await this.api.changesSince(this.campusId, this.controller.headCommit)
    const applied = this.merge(changes.parts)
    this.controller.applyRemote([], changes.headCommit)
    this.zones.setHeadCommit(changes.headCommit)
    if (applied) this.refresh()
  }

  subscribe(listener: (state: StudioSessionState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState(): StudioSessionState {
    return this.state
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private merge(parts: PartRecordWithVersion[]): boolean {
    const context = this.context
    if (!context || parts.length === 0) return false
    const skip = new Set(this.controller.dirtyParts(context.document))
    const result = mergeRemoteParts(context, parts, skip)
    this.controller.applyRemote(parts.filter((part) => !skip.has(part.partKey)))
    if (result.applied.length === 0) return false
    const eventBus = context.services.get('eventBus') as EventBusLike | undefined
    eventBus?.emit?.('document.changed', { entityType: 'remote', entityIds: result.applied })
    return true
  }

  private dirtyZones(): Set<ZoneKey> {
    const doc = this.document()
    if (!doc) return new Set()
    return new Set(this.controller.dirtyParts(doc).map(zoneOf).filter((zone): zone is ZoneKey => zone !== null))
  }

  /** Offer the local draft back (spec §6.3, R41); only parts that are safe to apply come back. */
  private async restoreDraft(doc: CampusDocument, load: LoadOk): Promise<CampusDocument> {
    const draft = await this.drafts.read(this.campusId, DRAFT_USER_ID).catch(() => null)
    if (!draft || Object.keys(draft.parts).length === 0) return doc
    if (!this.confirm(`You have unsaved work on this computer from ${new Date(draft.savedAt).toLocaleString()}. Restore it?`)) {
      await this.drafts.clearParts(this.campusId, DRAFT_USER_ID, Object.keys(draft.parts))
      return doc
    }
    await this.zones.poll()
    const foreign = new Set(this.zones.locks().filter((lock) => !lock.holderIsMe).map((lock) => lock.zoneKey))
    const decisions = planRestore(draft, load, (zone) => !foreign.has(zone))
    const changed = decisions.filter((decision) => decision.action === 'conflict-changed')
    const useMine = changed.length > 0
      && this.confirm(`${changed.length} of these were also changed by another admin. Use your version for them?`)
    const restore = decisions.filter((decision) => decision.action === 'apply' || (useMine && decision.action === 'conflict-changed'))
    const incoming: PartRecordWithVersion[] = restore.map(({ key }) => {
      const part = draft.parts[key]
      return { partKey: key, versionNo: 0, checksum: '', sortKey: part.sortKey, content: part.content, contentBase64: null, deleted: part.content === null }
    })
    return incoming.length > 0 ? withRemoteParts(doc, incoming) : doc
  }

  private publishState(controllerState?: SaveControllerState): void {
    const doc = this.document()
    const dirty = doc ? this.controller.isDirty(doc) : this.state.dirty
    const status = controllerState?.status ?? this.state.status
    const failed = status === 'error' || status === 'conflict'
    // The specific copy of the outcome that caused an error stays until the state moves on.
    if (!failed) this.message = null
    const message = failed ? this.message ?? controllerState?.message ?? this.state.message : null
    this.state = { status, message, headCommit: this.controller.headCommit, dirty }
    for (const listener of this.listeners) listener(this.state)
  }
}

const sessions = new Map<string, StudioSession>()
let current: StudioSession | null = null

/** The tab-wide session for a campus (created with the real API and zone client). */
export function getStudioSession(campusId: string): StudioSession {
  let session = sessions.get(campusId)
  if (!session) {
    session = new StudioSession({ campusId, api: createStudioApi(), zones: getZoneClient(campusId) })
    sessions.set(campusId, session)
  }
  return session
}

/** Make `session` the one Studio pages use for its campus (load does this; tests too). */
export function registerStudioSession(session: StudioSession): void {
  sessions.set(session.campusId, session)
  current = session
}

/** The session of the campus currently open in Studio, if Save v2 loaded one. */
export function currentStudioSession(campusId?: string | null): StudioSession | null {
  if (campusId) return sessions.get(campusId) ?? null
  return current
}

export function __resetStudioSessionsForTests(): void {
  sessions.clear()
  current = null
}
