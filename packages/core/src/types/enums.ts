// ── Entity category enums ──

export type BuildingCategory =
  | 'academic'
  | 'residential'
  | 'administrative'
  | 'facility'
  | 'library'
  | 'dining'
  | 'sports'
  | 'parking'
  | 'health'
  | 'other'

export type RoomCategory =
  | 'classroom'
  | 'office'
  | 'lab'
  | 'restroom'
  | 'stairwell'
  | 'elevator_lobby'
  | 'lobby'
  | 'storage'
  | 'meeting'
  | 'auditorium'
  | 'server'
  | 'utility'
  | 'other'

export type EntranceType = 'main' | 'side' | 'service' | 'emergency'

export type StaircaseType = 'open' | 'enclosed' | 'emergency'

export type RoadSurface =
  | 'paved'
  | 'concrete'
  | 'brick'
  | 'gravel'
  | 'grass'
  | 'unpaved'

export type RoadType = 'arterial' | 'connector' | 'service'
