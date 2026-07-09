import { NotImplementedError } from './errors'

export class PositionAPI {
  getCurrentFloor(): never {
    throw new NotImplementedError('PositionAPI.getCurrentFloor')
  }
}
