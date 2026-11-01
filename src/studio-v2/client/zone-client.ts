// Zone locks on the client (spec §7, §8): strict building / terrain / campus locks,
// a 15 s status poll that doubles as the heartbeat, and the exact owner-agreed copy.
import type { CampusDocument } from '@navi/core'
import { partKey, zoneOf, type PartKey, type ZoneKey } from '../parts/part-keys'
import { splitDocument } from '../parts/split'
import type { CampusRole, ZoneDenial, ZoneLockView } from '../server/types'
import type { StudioApi } from './api-client'

export const ZONE_POLL_MS = 15_000
export const ZONE_IDLE_RELEASE_MS = 30 * 60_000

export interface ZoneClientOptions {
  campusId: string
  api: Pick<StudioApi, 'acquire' | 'release' | 'forceRelease' | 'status'>
  pollMs?: number
  idleMs?: number
  now?: () => number
  /** True when the zone has no unsaved changes; idle self-release only happens for clean zones. */
  isClean?: (zone: ZoneKey) => boolean
}

type Listener<T> = (value: T) => void

class Emitter<T> {
  private listeners = new Set<Listener<T>>()
  on(listener: Listener<T>): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  emit(value: T): void {
    for (const listener of this.listeners) listener(value)
  }
}

export function buildingZone(buildingId: string): ZoneKey {
  return zoneOf(partKey('building', buildingId)) as ZoneKey
}

/** Exact owner-agreed copy (Global Constraints). */
export function denialMessage(denial: Pick<ZoneDenial, 'zoneKey' | 'holderName' | 'sameActor'> & { since?: string | null }): string {
  if (denial.sameActor) return 'You are editing this in another tab.'
  const name = denial.holderName ?? 'Another admin'
  if (denial.zoneKey === 'terrain') return `${name} is using the terrain editor.`
  if (denial.zoneKey === 'campus') return `${name} is editing campus settings.`
  return `${name} is currently editing this building — try editing other buildings.`
}

/** The part keys of `doc` that belong to `zone`. */
export function partsInZone(doc: CampusDocument, zone: ZoneKey): PartKey[] {
  return splitDocument(doc).parts.map((part) => part.key).filter((key) => zoneOf(key) === zone)
}

/** On release, undo history touching the zone is cleared — someone else may edit it next (spec §6.5). */
export function clearHistoryForZone(
  history: { applyRemote(touched: Set<string>, apply: (doc: CampusDocument) => void): 'rebased' | 'cleared' },
  doc: CampusDocument,
  zone: ZoneKey,
): 'rebased' | 'cleared' {
  return history.applyRemote(new Set(partsInZone(doc, zone)), () => {})
}

export class ZoneClient {
  private readonly campusId: string
  private readonly api: ZoneClientOptions['api']
  private readonly pollMs: number
  private readonly idleMs: number
  private readonly now: () => number
  private readonly isClean: (zone: ZoneKey) => boolean
  private readonly heldZones = new Map<ZoneKey, { lastEditAt: number }>()
  private lockViews: ZoneLockView[] = []
  private role: CampusRole | null = null
  private head: number | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  /** Pages sharing this client (map and floor editor); polling runs while any is mounted. */
  private users = 0
  private readonly focusHandler = () => {
    void this.poll()
  }
  private readonly denied = new Emitter<ZoneDenial>()
  private readonly lost = new Emitter<ZoneKey[]>()
  private readonly released = new Emitter<ZoneKey[]>()
  private readonly headMoved = new Emitter<number>()
  private readonly changed = new Emitter<void>()

  constructor(options: ZoneClientOptions) {
    this.campusId = options.campusId
    this.api = options.api
    this.pollMs = options.pollMs ?? ZONE_POLL_MS
    this.idleMs = options.idleMs ?? ZONE_IDLE_RELEASE_MS
    this.now = options.now ?? (() => Date.now())
    this.isClean = options.isClean ?? (() => false)
  }

  start(): void {
    this.users += 1
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), this.pollMs)
    if (typeof window !== 'undefined') window.addEventListener('focus', this.focusHandler)
  }

  stop(): void {
    this.users = Math.max(0, this.users - 1)
    if (this.users > 0) return
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (typeof window !== 'undefined') window.removeEventListener('focus', this.focusHandler)
  }

  held(): ZoneKey[] {
    return [...this.heldZones.keys()]
  }

  locks(): ZoneLockView[] {
    return this.lockViews
  }

  myRole(): CampusRole | null {
    return this.role
  }

  setHeadCommit(headCommit: number): void {
    this.head = headCommit
  }

  async ensure(zones: ZoneKey[]): Promise<boolean> {
    const missing = [...new Set(zones)].filter((zone) => !this.heldZones.has(zone))
    if (missing.length === 0) return true
    let result: { granted: ZoneKey[]; denied: ZoneDenial[] }
    try {
      result = await this.api.acquire(this.campusId, missing)
    } catch {
      return false
    }
    if (result.denied.length > 0) {
      this.denied.emit(result.denied[0])
      return false
    }
    for (const zone of result.granted) this.heldZones.set(zone, { lastEditAt: this.now() })
    this.changed.emit()
    return missing.every((zone) => this.heldZones.has(zone))
  }

  async release(zones: ZoneKey[]): Promise<void> {
    const mine = zones.filter((zone) => this.heldZones.has(zone))
    if (mine.length === 0) return
    try {
      await this.api.release(this.campusId, mine)
    } finally {
      for (const zone of mine) this.heldZones.delete(zone)
      this.released.emit(mine)
      this.changed.emit()
    }
  }

  async forceRelease(zone: ZoneKey): Promise<boolean> {
    const { released } = await this.api.forceRelease(this.campusId, zone)
    await this.poll()
    return released
  }

  markEdited(zone: ZoneKey): void {
    const entry = this.heldZones.get(zone)
    if (entry) entry.lastEditAt = this.now()
  }

  async poll(): Promise<void> {
    const status = await this.api.status(this.campusId, this.held()).catch(() => null)
    if (!status) return
    this.lockViews = status.locks
    this.role = status.myRole
    const lostZones = status.lostZones.filter((zone) => this.heldZones.has(zone))
    if (lostZones.length > 0) {
      for (const zone of lostZones) this.heldZones.delete(zone)
      this.lost.emit(lostZones)
    }
    if (this.head !== null && status.headCommit > this.head) this.headMoved.emit(status.headCommit)
    this.head = status.headCommit
    this.changed.emit()

    const idle = [...this.heldZones].filter(([zone, entry]) => this.now() - entry.lastEditAt > this.idleMs && this.isClean(zone))
    if (idle.length > 0) await this.release(idle.map(([zone]) => zone))
  }

  onDenied(listener: Listener<ZoneDenial>): () => void {
    return this.denied.on(listener)
  }

  onLost(listener: Listener<ZoneKey[]>): () => void {
    return this.lost.on(listener)
  }

  onReleased(listener: Listener<ZoneKey[]>): () => void {
    return this.released.on(listener)
  }

  onHeadMoved(listener: Listener<number>): () => void {
    return this.headMoved.on(listener)
  }

  /** Locks, role or held zones changed (for re-rendering badges). */
  onChange(listener: () => void): () => void {
    return this.changed.on(listener)
  }
}
