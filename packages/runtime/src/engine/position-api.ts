import { PositionEngine, type CurrentPosition } from '../position/position-engine'
import type { LatLng } from '@navi/core'

export class PositionAPI {
  private engine: PositionEngine | null = null

  setEngine(engine: PositionEngine): void {
    this.engine = engine
  }

  updateGps(latlng: LatLng, heading?: number, accuracy?: number): void {
    if (!this.engine) throw new Error('PositionEngine not initialized')
    this.engine.updateGps(latlng, heading, accuracy)
  }

  getCurrentPosition(): CurrentPosition | null {
    return this.engine?.getCurrentPosition() ?? null
  }

  getCurrentFloor(): number | null {
    return this.engine?.getCurrentFloor() ?? null
  }
}
