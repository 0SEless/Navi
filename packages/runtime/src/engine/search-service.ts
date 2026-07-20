import type { SearchEntry, SearchIndex } from '@navi/core'
import type { LoadedPackage } from '../loader'
import { SearchEngine } from '../search/search-engine'

export type SearchCategory = SearchEntry['type']

export interface SearchResult {
  readonly id: string
  readonly title: string
  readonly category: SearchCategory
  readonly nodeId: string
  readonly score?: number
  readonly buildingId?: string
  readonly floor?: number
}

export class SearchService {
  private engine: SearchEngine | null
  private entries: SearchEntry[]

  constructor(pkg: LoadedPackage) {
    if (pkg.searchIndex) {
      this.engine = new SearchEngine(pkg.searchIndex)
      this.entries = pkg.searchIndex.entries
    } else {
      this.engine = null
      this.entries = []
    }
  }

  search(query: string): SearchResult[] {
    if (!this.engine) return []
    return this.engine.query(query).map(r => this.mapEntry(r.entry, r.score))
  }

  autocomplete(prefix: string): SearchResult[] {
    if (!this.engine) return []
    const lower = prefix.toLowerCase()
    if (!lower) return []
    return this.entries
      .filter(e => e.label.toLowerCase().startsWith(lower))
      .map(e => this.mapEntry(e))
  }

  findById(id: string): SearchResult | undefined {
    const entry = this.entries.find(e => e.id === id)
    return entry ? this.mapEntry(entry) : undefined
  }

  findByCategory(category: SearchCategory): SearchResult[] {
    return this.entries
      .filter(e => e.type === category)
      .map(e => this.mapEntry(e))
      .sort((a, b) => a.title.localeCompare(b.title))
  }

  private mapEntry(entry: SearchEntry, score?: number): SearchResult {
    return {
      id: entry.id,
      title: entry.label,
      category: entry.type,
      nodeId: entry.nodeId,
      score,
      buildingId: entry.buildingId,
      floor: entry.floor,
    }
  }
}
