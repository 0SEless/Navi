import { createIndexedDbStore, type KeyValueStore } from '@/studio-v2/client/kv-store'

/** A tracing image placed over the campus. Kept on this computer only: never saved to the campus. */
export interface TracingImage {
  blob: Blob
  west: number
  east: number
  south: number
  north: number
  opacity: number
}

let store: KeyValueStore<TracingImage> | null = null

export function tracingStore(): KeyValueStore<TracingImage> {
  store ??= createIndexedDbStore<TracingImage>('navi-terrain-tracing', 'images')
  return store
}

export function tracingKey(campusId: string): string {
  return `terrain-tracing:${campusId}`
}
