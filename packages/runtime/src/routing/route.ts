import type { LatLng } from '@navi/core'

export type InstructionType = 'walk' | 'stairs' | 'elevator' | 'turn_left' | 'turn_right' | 'arrive'

export interface RouteStep {
  nodeId: string
  label: string
  position: LatLng
  floor: number
  buildingId: string
}

export interface Instruction {
  type: InstructionType
  text: string
  distance: number
  fromNode: string
  toNode: string
}

export interface Route {
  path: RouteStep[]
  instructions: Instruction[]
  totalDistance: number
  totalDuration: number
  fromLabel: string
  toLabel: string
}
