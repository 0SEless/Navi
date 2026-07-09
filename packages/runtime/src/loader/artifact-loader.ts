import type { PublishedManifest } from '@navi/compiler'
import type { RuntimeSnapshot } from '../types'
import { LoadError, type LoaderOptions } from './types'

const SUPPORTED_SCHEMA_VERSION = 1

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function defaultFetch(url: string): Promise<Response> {
  return fetch(url)
}

export class ArtifactLoader {
  private baseUrl: string
  private fetcher: (url: string) => Promise<Response>

  constructor(options: LoaderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetcher = options.fetch ?? defaultFetch
  }

  private async fetchJson<T>(filename: string): Promise<T> {
    const url = `${this.baseUrl}/${filename}`
    const res = await this.fetcher(url)
    if (!res.ok) {
      throw new LoadError(`Failed to load ${filename}: ${res.status}`, 'MISSING_FILE')
    }
    try {
      return await res.json() as T
    } catch {
      throw new LoadError(`Invalid JSON in ${filename}`, 'INVALID_JSON')
    }
  }

  async loadManifest(): Promise<PublishedManifest> {
    const manifest = await this.fetchJson<PublishedManifest>('manifest.json')
    if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      throw new LoadError(
        `Unsupported schema version ${manifest.schemaVersion} (expected ${SUPPORTED_SCHEMA_VERSION})`,
        'UNSUPPORTED_VERSION',
      )
    }
    return manifest
  }

  async loadArtifact<T>(filename: string): Promise<T> {
    return this.fetchJson<T>(filename)
  }

  async verify(data: string, expectedChecksum: string): Promise<boolean> {
    const actual = await sha256(data)
    return actual === expectedChecksum
  }

  async buildSnapshot(manifest: PublishedManifest): Promise<RuntimeSnapshot> {
    const [graph, searchIndex, poi, buildings] = await Promise.all([
      this.loadArtifact<any>(manifest.artifacts.navigationGraph.filename),
      this.loadArtifact<any>(manifest.artifacts.searchIndex.filename),
      this.loadArtifact<any>(manifest.artifacts.poiData.filename),
      this.loadArtifact<any>(manifest.artifacts.buildingIndex.filename),
    ])
    return { graph, searchIndex, poi, buildings, manifest }
  }

  async load(): Promise<RuntimeSnapshot> {
    const manifest = await this.loadManifest()
    return this.buildSnapshot(manifest)
  }
}
