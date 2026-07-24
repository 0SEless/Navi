export interface LatLng {
  lat: number;
  lng: number;
  elevation?: number;
}

export interface NavNode {
  id: string;
  label: string;
  name?: string;
  position: LatLng;
  floor: number;
  buildingId: string;
  campusId: string;
  type: 'room' | 'walkway' | 'stair' | 'elevator' | 'entrance' | 'qr_marker' | 'corner' | 'staircase' | 'intersection' | 'building_entrance' | 'outdoor' | 'hallway' | 'connector_stop';
  componentId?: string;
  metadata?: Record<string, unknown>;
  svgOffset?: { x: number; y: number };
  hasQr?: boolean;
  hasPanorama?: boolean;
}

export interface NavEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  weight?: number;
  type: 'walkway' | 'stair' | 'elevator' | 'hallway' | 'outdoor' | 'corridor' | 'stairs' | 'transition' | 'walk' | 'wall' | 'door';
  campusId?: string;
}

export interface BuildingEntrance {
  id: string;
  position: LatLng;
  floor: number;
  label?: string;
  connectorTraceId?: string;
}

export interface Building {
  id: string;
  name: string;
  campusId: string;
  floors: number[];
  footprint: LatLng[];
  baseElevation: number;
  height: number;
  color?: string;
  center?: LatLng;
  code?: string;
  description?: string;
  outline?: LatLng[];
  floorPlanUrl?: string;
  floorPlanUrls?: Record<number, string>;
  entrances?: BuildingEntrance[];
  department?: string;
  category?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
  floorData?: Record<string, unknown>[];
}

export interface FloorInfo {
  level: number;
  label: string;
  buildingId: string;
}

export interface MapComponent {
  id: string;
  type: ComponentType;
  label: string;
  name?: string;
  buildingId: string;
  campusId: string;
  floor: number;
  geometry: LatLng[];
  polygon?: LatLng[];
  metadata?: Record<string, unknown>;
  dimensions?: {
    width: number;
    height: number;
    rotation?: number;
  };
  connections?: string[];
}

export interface GraphSnapshot {
  id: string;
  campusId: string;
  version: string;
  updatedAt: string;
  buildings: Building[];
  components: Component[];
  nodes: NavNode[];
  edges: NavEdge[];
  traces?: TracePath[];
  boundary?: { points: LatLng[] };
}

export interface PathResult {
  path: string[];
  cost: number;
  steps: PathStep[];
}

export interface PathStep {
  nodeId: string;
  instruction: string;
  distance: number;
}

export interface ValidationResult {
  category: string;
  status: 'pass' | 'fail' | 'warn' | 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  edgeId?: string;
  affectedIds?: string[];
}

// ---- Legacy types (used by existing committed code, to be migrated) ----

export type NodeType =
  | 'building_entrance'
  | 'intersection'
  | 'staircase'
  | 'elevator'
  | 'room'
  | 'outdoor'
  | 'corner'
  | 'waypoint';

export type EdgeType =
  | 'walk'
  | 'transition'
  | 'restricted'
  | 'walkway'
  | 'stairs'
  | 'corridor'
  | 'elevator'
  | 'ramp'
  | 'wall';

export type ComponentType =
  | 'room'
  | 'stair'
  | 'elevator'
  | 'hallway'
  | 'entrance'
  | 'restroom';

export interface Component {
  id: string;
  type: ComponentType;
  name: string;
  buildingId: string;
  campusId?: string;
  floor: number;
  position: LatLng;
  polygon?: LatLng[];
  dimensions?: {
    width: number;
    height: number;
    rotation?: number;
  };
  connections?: string[];
  range?: { from: number; to: number };
  metadata?: Record<string, unknown>;
}

export interface TracePath {
  id: string;
  name?: string;
  buildingId?: string;
  campusId?: string;
  floor: number;
  points: LatLng[];
  type: 'arterial' | 'connector';
  color?: string;
  width?: number;
  connectorToBuildingId?: string;
  connectorToEntranceId?: string;
  metadata?: Record<string, unknown>;
}

export interface FloorPlan {
  buildingId: string;
  floor: number;
  imageUrl: string;
  uploadedAt: string;
}

export interface DirEntry {
  id: string;
  label: string;
  type: 'building' | 'floor' | 'room' | 'entrance' | 'facility';
  nodeId?: string;
  children?: DirEntry[];
}
