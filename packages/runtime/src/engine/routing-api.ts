import { NotImplementedError } from './search-api'

export class RoutingAPI {
  findRoute(_from: string, _to: string): never {
    throw new NotImplementedError('RoutingAPI.findRoute')
  }
}
