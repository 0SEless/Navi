// Client side of the one save path (spec §6.1, §6.4).
//
// The controller keeps a baseline (version + content hash per part, as last loaded or
// saved), derives the dirty parts by splitting the editor document and comparing hashes,
// and sends only those parts on an explicit Save. It never saves on its own.
import type { CampusDocument } from '@navi/core'
import { canonicalJson, fastHash } from '../parts/canonical'
import type { PartIssue } from '../parts/content-rules'
import { STUDIO_BODY_MAX_BYTES } from '../parts/limits'
import { zoneOf, type PartKey, type ZoneKey } from '../parts/part-keys'
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
}

const REQUEST_HEADROOM_BYTES = 64 * 1024
const UUID_PLACEHOLDER = '00000000-0000-4000-8000-000000000000'
const encoder = new TextEncoder()

function hashOf(content: unknown): string {
  return fastHash(canonicalJson(content))
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
  private head = 0
  private listeners = new Set<(state: SaveControllerState) => void>()
  private state: SaveControllerState = { status: 'clean', message: null, headCommit: 0 }
  /** The attempt group of the last request that ended offline (R40). */
  private pending: { fingerprint: string; mutationId: string } | null = null

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
      this.baseline.set(part.partKey, { versionNo: part.versionNo, hash: hashOf(part.content) })
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

  /** Recompute dirtiness after an edit/undo/redo and tell subscribers (no network). */
  refresh(doc: CampusDocument): void {
    if (this.state.status === 'saving') return
    this.emit({ status: this.isDirty(doc) ? 'dirty' : 'clean', message: null })
  }

  async save(doc: CampusDocument, message?: string): Promise<SaveOutcome> {
    const dirty = this.diff(doc)
    if (dirty.length === 0) {
      this.emit({ status: 'clean', message: null })
      return { kind: 'saved', commitNo: null, othersChanged: [] }
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
    for (const batch of this.batches(dirty)) {
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
      this.baseline.set(part.partKey, { versionNo: part.versionNo, hash: part.deleted ? null : hashOf(part.content) })
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
      this.baseline.set(part.partKey, { versionNo: part.versionNo, hash: part.deleted ? null : hashOf(part.content) })
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

  private diff(doc: CampusDocument): Array<{ key: PartKey; change: ClientSaveChange; hash: string | null }> {
    const { parts } = splitDocument(doc)
    const seen = new Set<PartKey>()
    const out: Array<{ key: PartKey; change: ClientSaveChange; hash: string | null }> = []
    for (const part of parts) {
      seen.add(part.key)
      const base = this.baseline.get(part.key)
      const hash = hashOf(part.content)
      if (base && base.hash === hash) continue
      out.push({ key: part.key, change: this.putChange(part, base), hash })
    }
    for (const [key, base] of this.baseline) {
      if (seen.has(key) || base.hash === null) continue
      out.push({ key, change: { partKey: key, expectedVersion: base.versionNo, op: 'delete' }, hash: null })
    }
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  private putChange(part: PartRecord, base: BaselineEntry | undefined): ClientSaveChange {
    const change: Extract<ClientSaveChange, { op: 'put' }> = {
      partKey: part.key,
      expectedVersion: base?.versionNo ?? 0,
      op: 'put',
      content: part.content,
    }
    if (part.sortKey !== null) change.sortKey = part.sortKey
    return change
  }

  /** R28/R39: keep every request under the limit; group strict parts per zone first. */
  private batches(dirty: Array<{ key: PartKey; change: ClientSaveChange; hash: string | null }>) {
    // A placeholder of the same length as a real UUID keeps the size estimate exact.
    const all = { campusId: this.campusId, mutationId: UUID_PLACEHOLDER, baseCommit: this.head, changes: dirty.map((d) => d.change) }
    if (byteLength(all) <= this.maxRequestBytes) return [dirty]
    const groups = new Map<string, typeof dirty>()
    for (const entry of dirty) {
      const group = zoneOf(entry.key) ?? '~free'
      groups.set(group, [...(groups.get(group) ?? []), entry])
    }
    const batches: Array<typeof dirty> = []
    let current: typeof dirty = []
    let currentBytes = 0
    const overhead = byteLength({ ...all, changes: [] })
    for (const group of groups.values()) {
      for (const entry of group) {
        const size = byteLength(entry.change) + 1
        if (current.length > 0 && overhead + currentBytes + size > this.maxRequestBytes) {
          batches.push(current)
          current = []
          currentBytes = 0
        }
        current.push(entry)
        currentBytes += size
      }
    }
    if (current.length > 0) batches.push(current)
    return batches
  }

  private async send(
    batch: Array<{ key: PartKey; change: ClientSaveChange; hash: string | null }>,
    baseCommit: number,
    message: string | undefined,
  ): Promise<SaveOutcome> {
    const changes = batch.map((entry) => entry.change)
    const fingerprint = canonicalJson({ baseCommit, changes })
    const mutationId = this.pending?.fingerprint === fingerprint ? this.pending.mutationId : crypto.randomUUID()
    const body: SaveRequestBody = { campusId: this.campusId, mutationId, baseCommit, changes }
    if (message) body.message = message

    const reply = await this.api.save(body)
    if (reply.status === 'offline') {
      this.pending = { fingerprint, mutationId }
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
          this.baseline.set(entry.key, { versionNo: written.get(entry.key) ?? previous?.versionNo ?? 0, hash: entry.hash })
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
