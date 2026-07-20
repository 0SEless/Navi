import type { LoadedPackage } from '../loader'
import { DataAPI } from './data-api'
import { NavigationService } from './navigation-service'
import { SearchService } from './search-service'
import { BuildingService } from './building-service'
import { LocationService } from './location-service'
import { PanoramaService } from './panorama-service'

export class RuntimeEngine {
  readonly data: DataAPI
  readonly search: SearchService
  readonly navigation: NavigationService
  readonly buildings: BuildingService
  readonly location: LocationService
  readonly panoramas: PanoramaService

  constructor(pkg: LoadedPackage) {
    this.data = new DataAPI(pkg)
    this.search = new SearchService(pkg)
    this.navigation = new NavigationService(pkg)
    this.buildings = new BuildingService(pkg)
    this.location = new LocationService(pkg)
    this.panoramas = new PanoramaService(pkg)
  }
}
