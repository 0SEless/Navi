import { SearchEngine, type SearchResult, type SearchConfig } from '../search/search-engine'

export class SearchAPI {
  private engine: SearchEngine | null = null

  setEngine(engine: SearchEngine): void {
    this.engine = engine
  }

  query(text: string, config?: SearchConfig): SearchResult[] {
    if (!this.engine) throw new Error('SearchEngine not initialized')
    return this.engine.query(text, config)
  }
}
