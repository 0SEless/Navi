import type { ArtifactLoader } from '../loader'
import type { RuntimeSnapshot } from '../types'
import { DataAPI } from './data-api'
import { SearchAPI } from './search-api'
import { RoutingAPI } from './routing-api'
import { PositionAPI } from './position-api'
import { SearchEngine } from '../search/search-engine'

export class RuntimeEngine {
  readonly data: DataAPI
  readonly search: SearchAPI
  readonly routing: RoutingAPI
  readonly position: PositionAPI

  private constructor(snapshot: RuntimeSnapshot) {
    this.data = new DataAPI(snapshot)
    this.search = new SearchAPI()
    this.search.setEngine(new SearchEngine(snapshot.searchIndex))
    this.routing = new RoutingAPI()
    this.position = new PositionAPI()
  }

  static async create(loader: ArtifactLoader): Promise<RuntimeEngine> {
    const snapshot = await loader.load()
    return new RuntimeEngine(snapshot)
  }
}
