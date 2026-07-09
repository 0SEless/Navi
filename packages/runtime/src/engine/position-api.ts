import { NotImplementedError } from './search-api'

export class PositionAPI {
  getCurrentFloor(): never {
    throw new NotImplementedError('PositionAPI.getCurrentFloor')
  }
}
