// The page's side of the terrain worker: sends it the height field (whole, then changed rectangles) and asks for
// tiles and contour lines. A request returns null when there is no working worker (no Worker support, a failed
// start, a crash, or no field sent yet); the caller then does the work on the main thread, as before.
import type { HeightField, Rect } from '@navi/core'
import type { WorkerMessage, WorkerReply } from './terrain-worker-core'

/** The part of Worker the client uses (tests pass a fake). */
export interface WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null
  onerror: ((e?: unknown) => void) | null
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void
  terminate(): void
}

type FieldCopy = Pick<HeightField, 'grid' | 'area' | 'heights' | 'changes' | 'snapshot'>
type Request = { kind: 'tile'; scheme: 'heights' | 'changes'; z: number; x: number; y: number } | { kind: 'contours'; bbox: Rect }

export function createTerrainWorkerClient(make: () => WorkerLike | null) {
  let worker: WorkerLike | null = null
  let broken = false
  let ready = false
  let nextId = 1
  const waiting = new Map<number, (reply: WorkerReply | null) => void>()

  const fail = () => {
    broken = true
    ready = false
    try {
      worker?.terminate()
    } catch {
      // already gone
    }
    worker = null
    for (const done of waiting.values()) done(null)
    waiting.clear()
  }
  const get = (): WorkerLike | null => {
    if (broken) return null
    if (worker) return worker
    try {
      worker = make()
    } catch {
      worker = null
    }
    if (!worker) {
      broken = true
      return null
    }
    worker.onmessage = (event) => {
      const reply = event.data as WorkerReply
      const done = waiting.get(reply.id)
      if (!done) return
      waiting.delete(reply.id)
      done(reply.error ? null : reply)
    }
    worker.onerror = fail
    return worker
  }
  const ask = (message: Request): Promise<WorkerReply | null> | null => {
    const w = ready ? get() : null
    if (!w) return null
    const id = nextId++
    return new Promise((resolve) => {
      waiting.set(id, resolve)
      try {
        w.postMessage({ ...message, id } as WorkerMessage)
      } catch {
        fail()
      }
    })
  }

  return {
    /** The whole field (after a rebuild), or only `rect` of it (after a marked change). */
    send(field: FieldCopy, rect?: Rect): void {
      const w = get()
      if (!w) return
      try {
        if (!rect || !ready) {
          const heights = field.heights.slice()
          const changes = field.changes.slice()
          w.postMessage({ kind: 'init', grid: field.grid, area: field.area, heights, changes }, [heights.buffer, changes.buffer])
          ready = true
          return
        }
        const snap = field.snapshot(rect)
        w.postMessage({ kind: 'patch', rect: snap.rect, heights: snap.heights, changes: snap.changes }, [snap.heights.buffer, snap.changes.buffer])
      } catch {
        fail()
      }
    },
    /** The page's ground no longer matches the worker's copy: requests go to the main thread until the next send. */
    forget(): void {
      ready = false
    },
    tile(scheme: 'heights' | 'changes', z: number, x: number, y: number): Promise<Uint8ClampedArray<ArrayBuffer> | null> | null {
      const reply = ask({ kind: 'tile', scheme, z, x, y })
      return reply ? reply.then((r) => r?.pixels ?? null) : null
    },
    contours(bbox: Rect): Promise<GeoJSON.FeatureCollection | null> | null {
      const reply = ask({ kind: 'contours', bbox })
      return reply ? reply.then((r) => r?.geojson ?? null) : null
    },
  }
}

export type TerrainWorkerClient = ReturnType<typeof createTerrainWorkerClient>
