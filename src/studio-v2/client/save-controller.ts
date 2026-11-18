// Client side of the one save path (spec §6.1, §6.4).
//
// The controller keeps a baseline (version + content hash per part, as last loaded or
// saved), derives the dirty parts by splitting the editor document and comparing hashes,
// and sends only those parts on an explicit Save. It never saves on its own.
import type { CampusDocument } from '@navi/core'
import { CONNECTIVITY_CONTRACT_VERSION } from '@navi/core'
import { canonicalJson, fastHash } from '../parts/canonical'
import type { PartIssue } from '../parts/content-rules'
import { STUDIO_BODY_MAX_BYTES } from '../parts/limits'
import { zoneOf, type PartKey, type ZoneKey } from '../parts/part-keys'
import { staircaseSaveGroups, stairPartState, type StairPartState, type StairSaveGroup } from './stair-save-groups'
import { splitDocument, type PartRecord } from '../parts/split'
import type { LoadOk, OtherChangedPart, PartRecordWithVersion, StalePart, ZoneNotHeld } from '../server/types'
import type { ClientSaveChange, SaveRequestBody, StudioApi } from './api-client'

export type SaveOutcome =
  | { kind: 'saved'; commitNo: number | null; othersChanged: PartRecordWithVersion[] }
  | { kind: 'stale'; parts: StalePart[] }
  | { kind: 'zone-not-held'; zones: ZoneNotHeld[] }
  | { kind: 'invalid'; issues: PartIssue[] }
  | { kind: 'offline'; message: string }
  | { kind: 'failed'; code: string; message: string }

export type SaveControllerStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

export interface SaveControllerState {
  status: SaveControllerStatus
  message: string | null
  headCommit: number
}

export interface SaveZones {
  held(): ZoneKey[]
  ensure(zones: ZoneKey[]): Promise<boolean>
}

export interface SaveControllerOptions {
  campusId: string
  api: StudioApi
  zones: SaveZones
  /** Upper bound for one save request body; defaults to the server limit minus headroom (R28/R39). */
  maxRequestBytes?: number
}

interface BaselineEntry {
  versionNo: number
  /** fastHash(canonicalJson(content)); null for a tombstone (deleted on the server). */
  hash: string | null
  stairState?: StairPartState
}

type SaveEntry = { key: PartKey; change: ClientSaveChange; hash: string | null; stairState?: StairPartState }

const REQUEST_HEADROOM_BYTES = 64 * 1024
const UUID_PLACEHOLDER = '00000000-0000-4000-8000-000000000000'
const encoder = new TextEncoder()

/**
 * The dirty hash of a part. Two campus-part fields are normalised so that opening a campus
 * never dirties the strictly-locked campus part; both are still sent whenever the campus part
 * is saved for a real change:
 * - `presentCollections` only says whether an empty optional map collection is [] or absent,
 *   and the editor drops empty ones on load (R52);
 * - a missing `connectivitySemanticsVersion` means the current contract: the editor stamps
 *   it on open (GraphAdapter.sync) (R68).
 */
export function partHash(key: PartKey, content: unknown): string {
  if (key === 'campus' && content && typeof content === 'object') {
    const { presentCollections: _ignored, ...rest } = content as Record<string, unknown>
    if (rest.connectivitySemanticsVersion === undefined) rest.connectivitySemanticsVersion = CONNECTIVITY_CONTRACT_VERSION
    return fastHash(canonicalJson(rest))
  }
  return fastHash(canonicalJson(content))
}

/** Hash of a binary part (terrain tile); prefixed so it can never equal a JSON part hash. */
export function binaryPartHash(contentBase64: string): string {
  return `bin:${fastHash(contentBase64)}`
}

/** Hash of a loaded or split part, binary or JSON. */
function hashOfPart(key: PartKey, content: unknown, contentBase64: string | null | undefined): string {
  return typeof contentBase64 === 'string' ? binaryPartHash(contentBase64) : partHash(key, content)
}

function byteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length
}

function toPartRecordWithVersion(part: OtherChangedPart): PartRecordWithVersion {
  return {
    partKey: part.partKey,
    versionNo: part.versionNo,
    checksum: part.checksum,
    sortKey: part.sortKey,
    content: part.content ?? null,
    contentBase64: part.contentBase64 ?? null,
    deleted: part.deleted,
  }
}

export class SaveController {
  private readonly campusId: string
  private readonly api: StudioApi
  private readonly zones: SaveZones
  private readonly maxRequestBytes: number
  private baseline = new Map<PartKey, BaselineEntry>()
  private binaryHashes = new Map<PartKey, { contentBase64: string; hash: string }>()
  private head = 0
  private listeners = new Set<(state: SaveControllerState) => void>()
  private state: SaveControllerState = { status: 'clean', message: null, headCommit: 0 }
  /** The attempt group of the last request that ended offline (R40). */
  private pending: { fingerprint: string; mutationId: string; baseCommit: number } | null = null

  constructor(options: SaveControllerOptions) {
    this.campusId = options.campusId
    this.api = options.api
    this.zones = options.zones
    this.maxRequestBytes = options.maxRequestBytes ?? STUDIO_BODY_MAX_BYTES - REQUEST_HEADROOM_BYTES
  }

  get headCommit(): number {
    return this.head
  }

  adoptBaseline(load: LoadOk): void {
    this.baseline = new Map()
    for (const part of load.parts) {
      if (part.deleted) continue
      this.baseline.set(part.partKey, { versionNo: part.versionNo, hash: hashOfPart(part.partKey, part.content, part.contentBase64), stairState: stairPartState(part.partKey, part.content) })
    }
    this.head = load.headCommit
    this.pending = null
    this.emit({ status: 'clean', message: null })
  }

  dirtyParts(doc: CampusDocument): PartKey[] {
    return this.diff(doc).map((entry) => entry.key)
  }

  isDirty(doc: CampusDocument): boolean {
    return this.diff(doc).length > 0
  }

  /** The changes a save would send now (local drafts store exactly these). */
  changes(doc: CampusDocument): ClientSaveChange[] {
    return this.diff(doc).map((entry) => entry.change)
  }

  /** Recompute dirtiness after an edit/undo/redo and tell subscribers (no network). */
  refresh(doc: CampusDocument): void {
    if (this.state.status === 'saving') return
    const dirty = this.isDirty(doc)
    // A failed save's message stays up while its edits are still unsaved (drafts refresh often).
    if (dirty && (this.state.status === 'conflict' || this.state.status === 'error')) return
    this.emit({ status: dirty ? 'dirty' : 'clean', message: null })
  }

  async save(doc: CampusDocument, message?: string): Promise<SaveOutcome> {
    const { parts } = splitDocument(doc)
    const dirty = this.diff(doc, parts)
    if (dirty.length === 0) {
      this.emit({ status: 'clean', message: null })
      return { kind: 'saved', commitNo: null, othersChanged: [] }
    }

    const groups = this.stairGroups(parts, new Map(dirty.map(entry => [entry.key, entry])))
    const problem = groups.find(group => group.problem)?.problem
    if (problem) {
      const outcome = { kind: 'failed' as const, code: 'stair-save-inconsistent', message: problem }
      this.emit(this.stateFor(outcome))
      return outcome
    }
    const batches = this.batches(dirty, parts, groups, message)
    if (!batches) {
      const outcome = { kind: 'failed' as const, code: 'stair-save-too-large',
        message: 'This staircase and its connected floors exceed the save limit. Reduce the connected floor data before saving.' }
      this.emit(this.stateFor(outcome))
      return outcome
    }

    const needed = [...new Set(dirty.map((entry) => zoneOf(entry.key)).filter((zone): zone is ZoneKey => zone !== null))]
    const held = new Set(this.zones.held())
    const missing = needed.filter((zone) => !held.has(zone))
    if (missing.length > 0 && !(await this.zones.ensure(missing))) {
      const zones = missing.map((zoneKey) => ({ zoneKey, holderName: null }))
      this.emit({ status: 'conflict', message: 'Locked by another admin.' })
      return { kind: 'zone-not-held', zones }
    }

    this.emit({ status: 'saving', message: null })
    const othersChanged: PartRecordWithVersion[] = []
    let commitNo: number | null = null
    const baseCommit = this.head
    for (const batch of batches) {
      const outcome = await this.send(batch, baseCommit, message)
      if (outcome.kind !== 'saved') {
        this.emit(this.stateFor(outcome))
        return outcome
      }
      if (outcome.commitNo !== null) commitNo = outcome.commitNo
      othersChanged.push(...outcome.othersChanged)
    }
    this.emit({ status: 'saved', message: null })
    return { kind: 'saved', commitNo, othersChanged }
  }

  /** Baseline update for parts another admin saved and that were merged into the document. */
  applyRemote(parts: PartRecordWithVersion[], headCommit?: number): void {
    for (const part of parts) {
      this.baseline.set(part.partKey, { versionNo: part.versionNo, hash: part.deleted ? null : hashOfPart(part.partKey, part.content, part.contentBase64), stairState: part.deleted ? undefined : stairPartState(part.partKey, part.content) })
    }
    if (headCommit !== undefined && headCommit > this.head) this.head = headCommit
  }

  resolveStale(choice: 'theirs' | 'mine', parts: StalePart[], latest: PartRecordWithVersion[]): { reload: PartRecordWithVersion[] } {
    const staleKeys = new Set(parts.map((part) => part.partKey))
    const relevant = latest.filter((part) => staleKeys.has(part.partKey))
    if (choice === 'theirs') {
      this.applyRemote(relevant)
      return { reload: relevant }
    }
    // 'mine': adopt their version numbers but keep the local content dirty, so the next
    // save overwrites on top of their version (the UI confirms first — spec D7).
    for (const part of relevant) {
      this.baseline.set(part.partKey, { versionNo: part.versionNo, hash: part.deleted ? null : hashOfPart(part.partKey, part.content, part.contentBase64), stairState: part.deleted ? undefined : stairPartState(part.partKey, part.content) })
    }
    return { reload: [] }
  }

  subscribe(listener: (state: SaveControllerState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private diff(doc: CampusDocument, parts = splitDocument(doc).parts): SaveEntry[] {
    const seen = new Set<PartKey>()
    const out: SaveEntry[] = []
    for (const part of parts) {
      seen.add(part.key)
      const base = this.baseline.get(part.key)
      const hash = part.contentBase64 !== undefined ? this.binaryHash(part.key, part.contentBase64) : partHash(part.key, part.content)
      if (base && base.hash === hash) continue
      out.push({ key: part.key, change: this.putChange(part, base), hash, stairState: stairPartState(part.key, part.content) })
    }
    for (const [key, base] of this.baseline) {
      if (seen.has(key) || base.hash === null) continue
      out.push({ key, change: { partKey: key, expectedVersion: base.versionNo, op: 'delete' }, hash: null })
    }
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  /** Tiles are large and rarely change: reuse the hash while the tile string is the same. */
  private binaryHash(key: PartKey, contentBase64: string): string {
    const cached = this.binaryHashes.get(key)
    if (cached && cached.contentBase64 === contentBase64) return cached.hash
    const hash = binaryPartHash(contentBase64)
    this.binaryHashes.set(key, { contentBase64, hash })
    return hash
  }

  private putChange(part: PartRecord, base: BaselineEntry | undefined): ClientSaveChange {
    if (part.contentBase64 !== undefined) {
      return { partKey: part.key, expectedVersion: base?.versionNo ?? 0, op: 'put-bin', contentBase64: part.contentBase64 }
    }
    const change: Extract<ClientSaveChange, { op: 'put' }> = {
      partKey: part.key,
      expectedVersion: base?.versionNo ?? 0,
      op: 'put',
      content: part.content,
    }
    if (part.sortKey !== null) change.sortKey = part.sortKey
    return change
  }

  private stairGroups(parts: PartRecord[], byKey: ReadonlyMap<PartKey, SaveEntry>): StairSaveGroup[] {
    const before = new Map<PartKey, StairPartState>()
    const after = new Map<PartKey, StairPartState>()
    for (const [key, entry] of this.baseline) if (entry.stairState) before.set(key, entry.stairState)
    for (const part of parts) {
      const entry = byKey.get(part.key)
      const state = entry ? entry.stairState : this.baseline.get(part.key)?.stairState
      if (state) after.set(part.key, state)
    }
    return staircaseSaveGroups(before, after, new Set(byKey.keys()))
  }

  /** Do not merge a remote floor over part of an unsaved staircase relationship. */
  protectedParts(doc: CampusDocument): Set<PartKey> {
    const { parts } = splitDocument(doc)
    const dirty = this.diff(doc, parts)
    return new Set([...dirty.map(entry => entry.key), ...this.stairGroups(parts, new Map(dirty.map(entry => [entry.key, entry]))).flatMap(group => group.keys)])
  }

  /** Preflight every staircase unit before sending any request. Other changes can still be split. */
  private batches(dirty: SaveEntry[], parts: PartRecord[], groups: StairSaveGroup[], message?: string): SaveEntry[][] | undefined {
    const byKey = new Map(dirty.map(entry => [entry.key, entry]))
    const current = new Map(parts.map(part => [part.key, part]))
    const coupled = groups.map(group => new Set(group.keys))
    // A stair-foot road can be shared by two stairs. Merge units that have such a common part.
    const units: Set<PartKey>[] = []
    for (const group of coupled) {
      const overlapping = units.filter(unit => [...group].some(key => unit.has(key)))
      for (const unit of overlapping) {
        for (const key of unit) group.add(key)
        units.splice(units.indexOf(unit), 1)
      }
      units.push(group)
    }
    for (const key of units.flatMap(unit => [...unit])) {
      const part = current.get(key), base = this.baseline.get(key)
      // An unchanged dependency is a version guard. The server checks it, then drops the no-op.
      if (!byKey.has(key) && part && base) byKey.set(key, { key, change: this.putChange(part, base), hash: base.hash, stairState: base.stairState })
    }
    const body = { campusId: this.campusId, mutationId: UUID_PLACEHOLDER, baseCommit: this.head, ...(message ? { message } : {}), changes: [] as ClientSaveChange[] }
    const size = (entries: SaveEntry[]) => byteLength({ ...body, changes: entries.map(entry => entry.change) })
    const all = [...byKey.values()]
    if (size(all) <= this.maxRequestBytes) return [all]

    const batches: SaveEntry[][] = units.map(unit => [...unit].flatMap(key => {
      const entry = byKey.get(key)
      return entry ? [entry] : []
    }))
    if (batches.some(batch => size(batch) > this.maxRequestBytes)) return undefined
    const grouped = new Set(units.flatMap(unit => [...unit]))
    const independent = new Map<string, SaveEntry[]>()
    for (const entry of dirty) {
      if (grouped.has(entry.key)) continue
      const zone = zoneOf(entry.key) ?? '~free'
      const group = independent.get(zone) ?? []
      group.push(entry)
      independent.set(zone, group)
    }
    let batch: SaveEntry[] = []
    let bytes = byteLength(body)
    const overhead = bytes
    for (const entry of [...independent.values()].flat()) {
      const entryBytes = byteLength(entry.change)
      if (batch.length && bytes + entryBytes + 1 > this.maxRequestBytes) {
        batches.push(batch)
        batch = []
        bytes = overhead
      }
      bytes += entryBytes + (batch.length ? 1 : 0)
      batch.push(entry)
    }
    if (batch.length) batches.push(batch)
    return batches
  }

  private async send(
    batch: SaveEntry[],
    baseCommit: number,
    message: string | undefined,
  ): Promise<SaveOutcome> {
    const changes = batch.map((entry) => entry.change)
    const fingerprint = canonicalJson({ changes, message: message ?? null })
    const retry = this.pending?.fingerprint === fingerprint ? this.pending : null
    const mutationId = retry?.mutationId ?? crypto.randomUUID()
    baseCommit = retry?.baseCommit ?? baseCommit
    const body: SaveRequestBody = { campusId: this.campusId, mutationId, baseCommit, changes }
    if (message) body.message = message

    const reply = await this.api.save(body)
    if (reply.status === 'offline') {
      this.pending = { fingerprint, mutationId, baseCommit }
      return { kind: 'offline', message: reply.message }
    }
    this.pending = null
    switch (reply.status) {
      case 'ok':
      case 'replay': {
        const written = new Map(reply.parts.map((part) => [part.partKey, part.versionNo]))
        for (const entry of batch) {
          if (entry.change.op === 'delete') {
            const versionNo = written.get(entry.key)
            if (versionNo !== undefined) this.baseline.set(entry.key, { versionNo, hash: null })
            else this.baseline.delete(entry.key)
            continue
          }
          const previous = this.baseline.get(entry.key)
          this.baseline.set(entry.key, { versionNo: written.get(entry.key) ?? previous?.versionNo ?? 0, hash: entry.hash, stairState: entry.stairState })
        }
        if (reply.commitNo !== null && reply.commitNo > this.head) this.head = reply.commitNo
        return { kind: 'saved', commitNo: reply.commitNo, othersChanged: reply.othersChanged.map(toPartRecordWithVersion) }
      }
      case 'stale':
        return { kind: 'stale', parts: reply.parts }
      case 'zone_not_held':
        return { kind: 'zone-not-held', zones: reply.zones }
      case 'invalid':
        return { kind: 'invalid', issues: reply.issues }
      case 'failed':
        return { kind: 'failed', code: reply.code, message: reply.message }
    }
  }

  private stateFor(outcome: SaveOutcome): Omit<SaveControllerState, 'headCommit'> {
    switch (outcome.kind) {
      case 'stale':
        return { status: 'conflict', message: 'Changed by another admin.' }
      case 'zone-not-held':
        return { status: 'conflict', message: 'Locked by another admin.' }
      case 'offline':
        return { status: 'error', message: 'Not saved — your work is kept on this computer' }
      case 'invalid':
        return { status: 'error', message: outcome.issues[0]?.message ?? 'Some changes are not allowed.' }
      case 'failed':
        return { status: 'error', message: outcome.message }
      default:
        return { status: 'saved', message: null }
    }
  }

  private emit(next: Omit<SaveControllerState, 'headCommit'>): void {
    this.state = { ...next, headCommit: this.head }
    for (const listener of this.listeners) listener(this.state)
  }
}
